import { Router } from 'express';
import { createRequire } from 'node:module';
import { db, withTransaction } from '../database.js';
import { requireAuth } from '../middleware/auth.js';
import { getBattleRewards, grantPlayerExp } from '../../src/core/PlayerProgression.js';
import { readPlayerItems20260908 } from '../domain/playerInventoryAuthority20260908.js';

const require = createRequire(import.meta.url);
const stageInfo = require('../../src/data/stageInfo.json');
const STAGE_BY_ID = new Map(stageInfo.map((stage) => [String(stage.id ?? stage.stage_id), stage]));

export const stageResultAuthorityRouter20260908 = Router();
stageResultAuthorityRouter20260908.use(requireAuth);

const MAX_BATTLE_DROPS_PER_RESULT = 40;
const BATTLE_DROP_ITEM_IDS = new Set([
  10001, 10002, 10003, 10004, 10005, // 强化粉
  50001, 50002, 50003, 50004,        // 羊皮纸
  50011, 50012, 50013, 50014,        // 宝石
  50031, 50032, 50033, 50034,        // 卡牌DNA
  50021, 50022, 50023, 50024,        // 保护符，与实际战斗材料掉落表一致
]);

function clampInt(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export function normalizeBattleDrops20260908(rawDrops) {
  if (!Array.isArray(rawDrops)) return [];
  const out = [];
  for (const raw of rawDrops) {
    if (out.length >= MAX_BATTLE_DROPS_PER_RESULT) break;
    const itemId = Number(raw?.itemId);
    if (!Number.isInteger(itemId) || !BATTLE_DROP_ITEM_IDS.has(itemId)) continue;
    // BattleEngine 每个死亡单位最多产生一个掉落。服务端不接受浏览器放大的 count，
    // 只允许真实战斗掉落表中的单件材料进入数据库。
    out.push({ itemId, count: 1 });
  }
  return out;
}

function parseFirstClearRewards(stage) {
  if (!stage?.reward) return [];
  return String(stage.reward).split(',').map((part) => {
    const [type, , amount] = part.split('|').map(Number);
    return { type, amount };
  }).filter((entry) => Number.isFinite(entry.type) && Number.isFinite(entry.amount) && entry.amount > 0);
}

async function addItem(conn, userId, itemId, count, bound = 0) {
  const id = Number(itemId);
  const amount = clampInt(count, 1, 9999);
  if (!Number.isInteger(id) || id <= 0) return;
  const isBound = bound ? 1 : 0;
  const row = await conn.get(
    'SELECT count FROM player_items WHERE user_id=? AND item_id=? AND is_bound=?',
    [userId, id, isBound],
  );
  if (row) {
    await conn.run(
      'UPDATE player_items SET count=count+? WHERE user_id=? AND item_id=? AND is_bound=?',
      [amount, userId, id, isBound],
    );
  } else {
    await conn.run(
      'INSERT INTO player_items(user_id,item_id,count,is_bound) VALUES(?,?,?,?)',
      [userId, id, amount, isBound],
    );
  }
}

async function addCard(conn, userId, cardId) {
  const id = Number(cardId);
  if (!Number.isInteger(id) || id <= 0) return false;
  const bag = await conn.get('SELECT slot_count AS slotCount FROM player_card_bags WHERE user_id=?', [userId]);
  const slotCount = Math.max(1, Math.min(500, Number(bag?.slotCount) || 200));
  const rows = await conn.all('SELECT slot_index AS slotIndex FROM player_cards WHERE user_id=? ORDER BY slot_index', [userId]);
  const used = new Set(rows.map((row) => Number(row.slotIndex)));
  let slotIndex = -1;
  for (let index = 0; index < slotCount; index += 1) {
    if (!used.has(index)) { slotIndex = index; break; }
  }
  if (slotIndex < 0) return false;
  await conn.run(
    'INSERT INTO player_cards(user_id,slot_index,card_id,star,craft_quality) VALUES(?,?,?,?,?)',
    [userId, slotIndex, id, 0, 1],
  );
  return true;
}

stageResultAuthorityRouter20260908.post('/stage-result', async (req, res) => {
  const userId = Number(req.user.id);
  const won = Boolean(req.body?.won);
  const stageId = String(req.body?.stageId ?? '').trim();
  const stage = STAGE_BY_ID.get(stageId) ?? null;
  const drops = won ? normalizeBattleDrops20260908(req.body?.drops) : [];

  const result = await withTransaction(async (conn) => {
    const profile = await conn.get(
      'SELECT level, exp, gold, honor FROM player_profiles WHERE user_id=?',
      [userId],
    );
    if (!profile) throw new Error('玩家数据不存在');

    let clearCount = 0;
    let bestTimeMs = 0;
    let honorGain = 0;
    let firstClear = false;

    if (won && stageId) {
      const durationMs = clampInt(req.body?.durationMs, 0, 3_600_000);
      const bestStars = clampInt(req.body?.bestStars ?? 1, 0, 3);
      const existing = await conn.get(
        'SELECT * FROM player_stage_progress WHERE user_id=? AND stage_id=?',
        [userId, stageId],
      );
      firstClear = !existing || !Boolean(existing.cleared);
      clearCount = Number(existing?.clear_count ?? 0) + 1;
      bestTimeMs = Number(existing?.best_time_ms)
        ? Math.min(Number(existing.best_time_ms), durationMs)
        : durationMs;
      const newBestStars = Math.max(Number(existing?.best_stars ?? 0), bestStars);
      if (existing) {
        await conn.run(`
          UPDATE player_stage_progress
          SET cleared=1, clear_count=?, best_stars=?, best_time_ms=?, updated_at=CURRENT_TIMESTAMP
          WHERE user_id=? AND stage_id=?
        `, [clearCount, newBestStars, bestTimeMs, userId, stageId]);
      } else {
        await conn.run(`
          INSERT INTO player_stage_progress(user_id,stage_id,cleared,best_stars,clear_count,best_time_ms)
          VALUES(?,?,1,?,?,?)
        `, [userId, stageId, newBestStars, clearCount, bestTimeMs]);
      }
      honorGain = firstClear ? 50 : 10;
    }

    const base = getBattleRewards(stage, won);
    let goldGain = Math.max(0, Number(base.gold) || 0);
    let expGain = Math.max(0, Number(base.exp) || 0);
    const firstRewards = won && firstClear ? parseFirstClearRewards(stage) : [];

    for (const reward of firstRewards) {
      if (reward.type === 3) goldGain += reward.amount;
      else if (reward.type === 27) expGain += reward.amount;
      else if (reward.type === 1) await addItem(conn, userId, reward.amount, 1, 0);
      else if (reward.type === 2) await addCard(conn, userId, reward.amount);
    }

    for (const drop of drops) {
      await addItem(conn, userId, drop.itemId, 1, 0);
    }

    const player = {
      level: Number(profile.level) || 1,
      exp: Number(profile.exp) || 0,
    };
    grantPlayerExp(player, expGain);
    await conn.run(`
      UPDATE player_profiles
      SET level=?, exp=?, gold=gold+?, honor=honor+?, updated_at=CURRENT_TIMESTAMP
      WHERE user_id=?
    `, [player.level, player.exp, goldGain, honorGain, userId]);

    const freshProfile = await conn.get(`
      SELECT user_id AS userId, nickname, level, exp, hp, gold,
             diamond, honor, arena, selected_deck_no AS selectedDeckNo
      FROM player_profiles WHERE user_id=?
    `, [userId]);
    return {
      clearCount,
      bestTimeMs,
      honorGain,
      firstClear,
      goldGain,
      expGain,
      persistedDrops: drops,
      profile: freshProfile,
    };
  });

  return res.json({
    ok: true,
    recorded: true,
    ...result,
    items: await readPlayerItems20260908(userId),
  });
});
