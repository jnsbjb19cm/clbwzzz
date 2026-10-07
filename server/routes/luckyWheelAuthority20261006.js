/**
 * 幸运大转盘 · 服务端权威（2026-10-06）
 *
 * 为什么放服务端：奖池权重和随机数都必须在这里，客户端只负责画转盘和播动画。
 * 客户端就算改了本地代码，也只能请求"我要抽一次"，中什么由服务端决定。
 *
 * 次数：
 *   · 每天免费 1 次
 *   · 转盘任务每个 +1 次（任务 id 白名单，每个每天只能领一次）
 *   · 服务端硬上限 = 免费 + 任务总数（改客户端也刷不出第 8 次）
 *
 * 发奖：道具 → player_items；卡 → player_cards（star/craft_quality 一起写）；货币 → player_profiles
 */
import { Router } from 'express';
import { createRequire } from 'node:module';
import { pickExactTierCard } from '../../src/core/CardEgg.js';
import { config } from '../config.js';
import { db, withTransaction } from '../database.js';
import { requireAuth } from '../middleware/auth.js';
import {
  DAILY_FREE_SPINS, WHEEL_TASKS, WEIGHT_TOTAL,
  pickWheelPrize, resolveWheelPrize,
} from '../../src/data/LuckyWheelPrizes.js';

const require = createRequire(import.meta.url);
const cardRows = require('../../src/data/card.json');
// 只从"可收藏"的卡里抽，避免抽到商店/教具类的特殊卡
const COLLECTIBLE_CARDS = cardRows.filter((row) => Number(row?.show_card) === 1 && Number(row?.card_id) > 0 && Number(row?.card_id) < 1000);

export const luckyWheelAuthorityRouter20261006 = Router();
luckyWheelAuthorityRouter20261006.use(requireAuth);

const MAX_SPINS_PER_DAY = DAILY_FREE_SPINS + WHEEL_TASKS.reduce((sum, task) => sum + Number(task.spins || 1), 0);
const TASK_BY_ID = new Map(WHEEL_TASKS.map((task) => [task.id, task]));
let readyPromise = null;

function todayKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * 建表语句按方言生成。
 *
 * 2026-10-07 修复"抽奖失败"：MySQL 不允许 TEXT/BLOB/JSON 列带 DEFAULT ——
 * 原来的 `claimed_tasks TEXT NOT NULL DEFAULT '[]'` 会让建表直接报
 *   "BLOB, TEXT, GEOMETRY or JSON column 'claimed_tasks' can't have a default value"
 * → ensureTable() 抛错 → 整个转盘接口 500（客户端显示"抽奖失败"）。
 * MySQL 版因此不写默认值（claimed_tasks 一律由下面的 INSERT 显式写入），
 * 时间列也从 TEXT 换成 DATETIME（MySQL 的 TEXT 同样不能 DEFAULT CURRENT_TIMESTAMP）。
 */
export function luckyWheelSchemaSql(client = config.db.client) {
  if (client === 'mysql') {
    return `CREATE TABLE IF NOT EXISTS player_lucky_wheel_20261006 (
      user_id BIGINT NOT NULL PRIMARY KEY,
      date_key VARCHAR(16) NOT NULL,
      used_today INT NOT NULL DEFAULT 0,
      extra_spins INT NOT NULL DEFAULT 0,
      claimed_tasks TEXT NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
  }
  return `CREATE TABLE IF NOT EXISTS player_lucky_wheel_20261006 (
    user_id INTEGER PRIMARY KEY,
    date_key TEXT NOT NULL,
    used_today INTEGER NOT NULL DEFAULT 0,
    extra_spins INTEGER NOT NULL DEFAULT 0,
    claimed_tasks TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`;
}

/**
 * "第一次 / 新的一天"把当天次数归零的落库语句。
 * SQLite 用 `ON CONFLICT ... DO UPDATE`，MySQL 用 `ON DUPLICATE KEY UPDATE`
 * （原代码只写了 SQLite 那套 → MySQL 上语法错误）。
 * MySQL 版把参数重复传一次，避免用到已废弃的 VALUES() 函数。
 */
export function luckyWheelResetSql(client = config.db.client) {
  const head = `INSERT INTO player_lucky_wheel_20261006(user_id,date_key,used_today,extra_spins,claimed_tasks,updated_at)
       VALUES(?,?,0,0,?,CURRENT_TIMESTAMP)`;
  if (client === 'mysql') {
    return `${head}
       ON DUPLICATE KEY UPDATE date_key=?, used_today=0, extra_spins=0, claimed_tasks=?, updated_at=CURRENT_TIMESTAMP`;
  }
  return `${head}
       ON CONFLICT(user_id) DO UPDATE SET date_key=excluded.date_key, used_today=0, extra_spins=0, claimed_tasks=excluded.claimed_tasks, updated_at=CURRENT_TIMESTAMP`;
}

async function ensureTable() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await db.run(luckyWheelSchemaSql());
    })().catch((error) => { readyPromise = null; throw error; });
  }
  return readyPromise;
}

async function readState(userId) {
  await ensureTable();
  const today = todayKey();
  const row = await db.get('SELECT * FROM player_lucky_wheel_20261006 WHERE user_id=?', [userId]);
  if (!row || row.date_key !== today) {
    await db.run(
      luckyWheelResetSql(),
      config.db.client === 'mysql' ? [userId, today, '[]', today, '[]'] : [userId, today, '[]'],
    );
    return { dateKey: today, usedToday: 0, extraSpins: 0, claimedTasks: [] };
  }
  let claimed = [];
  try { claimed = JSON.parse(row.claimed_tasks || '[]'); } catch { claimed = []; }
  return {
    dateKey: row.date_key,
    usedToday: Math.max(0, Number(row.used_today) || 0),
    extraSpins: Math.max(0, Number(row.extra_spins) || 0),
    claimedTasks: Array.isArray(claimed) ? claimed.map(String) : [],
  };
}

function spinsLeftOf(state) {
  return Math.max(0, DAILY_FREE_SPINS + state.extraSpins - state.usedToday);
}

async function grantItem(conn, userId, itemId, count) {
  const id = Number(itemId);
  const amount = Math.max(0, Math.floor(Number(count) || 0));
  if (!Number.isInteger(id) || id <= 0 || !amount) return;
  const row = await conn.get('SELECT count FROM player_items WHERE user_id=? AND item_id=? AND is_bound=0', [userId, id]);
  if (row) await conn.run('UPDATE player_items SET count=count+? WHERE user_id=? AND item_id=? AND is_bound=0', [amount, userId, id]);
  else await conn.run('INSERT INTO player_items(user_id,item_id,count,is_bound) VALUES(?,?,?,0)', [userId, id, amount]);
}

async function grantCard(conn, userId, cardId, star, craftQuality) {
  const bag = await conn.get('SELECT slot_count AS slotCount FROM player_card_bags WHERE user_id=?', [userId]);
  const slotCount = Math.max(1, Math.min(500, Number(bag?.slotCount) || 200));
  const rows = await conn.all('SELECT slot_index AS slotIndex FROM player_cards WHERE user_id=?', [userId]);
  const occupied = new Set(rows.map((row) => Number(row.slotIndex)));
  let slotIndex = -1;
  for (let index = 0; index < slotCount; index += 1) {
    if (!occupied.has(index)) { slotIndex = index; break; }
  }
  if (slotIndex < 0) throw new Error('卡牌背包已满，先清理再来抽');
  await conn.run(
    'INSERT INTO player_cards(user_id,slot_index,card_id,star,craft_quality) VALUES(?,?,?,?,?)',
    [userId, slotIndex, Number(cardId), Math.max(0, Number(star) || 0), Math.max(1, Math.min(5, Number(craftQuality) || 1))],
  );
}

/** 从卡池里挑一张指定品质的卡（复用卡蛋那套规则，保证抽到的是真卡） */
function pickCardOfQuality(quality) {
  try {
    const card = pickExactTierCard(COLLECTIBLE_CARDS.length ? COLLECTIBLE_CARDS : cardRows, Number(quality));
    return Number(card?.card_id) || null;
  } catch {
    return null;
  }
}

luckyWheelAuthorityRouter20261006.get('/lucky-wheel/state', async (req, res) => {
  try {
    const state = await readState(req.user.id);
    return res.json({
      dateKey: state.dateKey,
      spinsLeft: spinsLeftOf(state),
      usedToday: state.usedToday,
      extraSpins: state.extraSpins,
      claimedTasks: state.claimedTasks,
      maxSpinsPerDay: MAX_SPINS_PER_DAY,
      tasks: WHEEL_TASKS.map((task) => ({ id: task.id, label: task.label, spins: Number(task.spins || 1), claimed: state.claimedTasks.includes(task.id) })),
    });
  } catch (error) {
    return res.status(500).json({ message: error?.message || '读取转盘状态失败' });
  }
});

luckyWheelAuthorityRouter20261006.post('/lucky-wheel/claim-task', async (req, res) => {
  const taskId = String(req.body?.taskId || '');
  const task = TASK_BY_ID.get(taskId);
  if (!task) return res.status(400).json({ message: '没有这个转盘任务' });
  try {
    const result = await withTransaction(async (conn) => {
      const state = await readState(req.user.id);
      if (state.claimedTasks.includes(taskId)) return { already: true, ...state };
      const claimed = [...state.claimedTasks, taskId];
      // 服务端硬上限：不管客户端怎么说，总次数不会超过 免费 + 任务总数
      const extra = Math.min(Number(state.extraSpins || 0) + Number(task.spins || 1), MAX_SPINS_PER_DAY - DAILY_FREE_SPINS);
      await conn.run(
        'UPDATE player_lucky_wheel_20261006 SET extra_spins=?, claimed_tasks=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?',
        [extra, JSON.stringify(claimed), req.user.id],
      );
      return { ...state, extraSpins: extra, claimedTasks: claimed };
    });
    return res.json({
      already: Boolean(result.already),
      spinsLeft: spinsLeftOf(result),
      extraSpins: result.extraSpins,
      claimedTasks: result.claimedTasks,
      maxSpinsPerDay: MAX_SPINS_PER_DAY,
    });
  } catch (error) {
    return res.status(400).json({ message: error?.message || '领取次数失败' });
  }
});

luckyWheelAuthorityRouter20261006.post('/lucky-wheel/spin', async (req, res) => {
  try {
    const outcome = await withTransaction(async (conn) => {
      const state = await readState(req.user.id);
      if (spinsLeftOf(state) <= 0) throw new Error('今天没有抽奖次数了，做转盘任务可以加次数');

      // 服务端抽奖：权重在服务端，客户端改不了
      const sector = pickWheelPrize();
      const prize = resolveWheelPrize(sector);
      if (!prize) throw new Error('奖池配置异常');

      let granted = null;
      if (prize.kind === 'item') {
        await grantItem(conn, req.user.id, prize.itemId, prize.count);
        granted = { type: 'item', itemId: Number(prize.itemId), count: Number(prize.count) };
      } else if (prize.kind === 'currency') {
        const column = prize.currency === 'gem' ? 'diamond' : prize.currency === 'honor' ? 'honor' : 'gold';
        await conn.run(`UPDATE player_profiles SET ${column}=${column}+?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?`, [Number(prize.amount) || 0, req.user.id]);
        granted = { type: 'currency', currency: prize.currency, amount: Number(prize.amount) || 0 };
      } else if (prize.kind === 'card') {
        const cardId = pickCardOfQuality(prize.cardQuality);
        if (!cardId) throw new Error('该等级卡池为空，抽奖已取消（次数没有消耗）');
        await grantCard(conn, req.user.id, cardId, prize.star, 5);
        granted = { type: 'card', cardId: Number(cardId), star: Number(prize.star) || 0, craftQuality: 5 };
      }

      await conn.run('UPDATE player_lucky_wheel_20261006 SET used_today=used_today+1, updated_at=CURRENT_TIMESTAMP WHERE user_id=?', [req.user.id]);
      return { state, sector, prize, granted };
    });

    const state = await readState(req.user.id);
    return res.json({
      sectorId: outcome.sector.id,
      label: outcome.prize.label,
      desc: outcome.prize.desc ?? '',
      tier: outcome.prize.tier ?? outcome.sector.tier,
      tierName: outcome.prize.tierName ?? null,
      granted: outcome.granted,
      spinsLeft: spinsLeftOf(state),
      usedToday: state.usedToday,
    });
  } catch (error) {
    return res.status(400).json({ message: error?.message || '抽奖失败' });
  }
});

export const LUCKY_WHEEL_META_20261006 = Object.freeze({ MAX_SPINS_PER_DAY, WEIGHT_TOTAL });
