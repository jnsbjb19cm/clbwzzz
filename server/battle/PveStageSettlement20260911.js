/**
 * 2026-09-11：野外冒险(PVE)联机 —— 服务端权威结算。
 *
 * 单机冒险的金币/经验/首通奖励原本在客户端计算（App.handleBattleResult），联机下改为
 * 服务端在战斗结束时按同一套规则为每名玩家各结算一份，避免双端不一致与客户端伪造。
 *
 * 与 /player/stage-result 保持一致的部分：通关进度(player_stage_progress)、功勋(10/50)、
 * 掉落入库；额外补上单机一直在发但服务端没有的金币/经验/首通特殊奖励。
 */
import { getBattleRewards, grantPlayerExp } from '../../src/core/PlayerProgression.js';

function clampInt(value, min, max) {
  const number = Math.floor(Number(value) || 0);
  return Math.max(min, Math.min(max, number));
}

/** 与 WorldMapView.parseRewards 同规则：type|?|amount,... */
export function parseStageRewards(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((part) => {
      const [type, , amount] = String(part).split('|').map(Number);
      return { type, amount };
    })
    .filter((entry) => Number.isFinite(entry.type) && Number.isFinite(entry.amount));
}

async function grantItem(conn, userId, itemId, count = 1) {
  const id = Number(itemId);
  const amount = clampInt(count, 1, 99);
  if (!Number.isInteger(id) || id <= 0) return false;
  const existing = await conn.get(
    'SELECT count FROM player_items WHERE user_id=? AND item_id=? AND is_bound=0',
    [userId, id],
  );
  if (existing) {
    await conn.run('UPDATE player_items SET count=count+? WHERE user_id=? AND item_id=? AND is_bound=0', [amount, userId, id]);
  } else {
    await conn.run('INSERT INTO player_items(user_id,item_id,count,is_bound) VALUES(?,?,?,0)', [userId, id, amount]);
  }
  return true;
}

async function grantCard(conn, userId, cardId) {
  const id = Number(cardId);
  if (!Number.isInteger(id) || id <= 0) return false;
  const bag = await conn.get('SELECT slot_count AS slotCount FROM player_card_bags WHERE user_id=?', [userId]);
  const slotCount = clampInt(bag?.slotCount ?? 60, 1, 500);
  const rows = await conn.all('SELECT slot_index AS slotIndex FROM player_cards WHERE user_id=?', [userId]);
  const occupied = new Set(rows.map((row) => Number(row.slotIndex)));
  let slotIndex = -1;
  for (let index = 0; index < slotCount; index += 1) {
    if (!occupied.has(index)) { slotIndex = index; break; }
  }
  if (slotIndex < 0) return false;
  await conn.run(
    'INSERT INTO player_cards(user_id,slot_index,card_id,star,craft_quality) VALUES(?,?,?,?,?)',
    [userId, slotIndex, id, 0, 1],
  );
  return true;
}

/**
 * 为单个玩家结算一场 PVE 联机战斗。
 * @returns {{gold:number, exp:number, honor:number, items:Array<{itemId:number,count:number}>, firstClear:boolean, level:number}}
 */
export async function settlePveStageForPlayer(conn, userId, { stageId, stage, won, durationMs = 0, drops = [] } = {}) {
  const id = String(stageId ?? stage?.stage_id ?? '').trim();
  const summary = { gold: 0, exp: 0, honor: 0, items: [], firstClear: false, level: 1 };

  // 1) 基础奖励（胜负都给，与单机 App.handleBattleResult 一致）
  const base = getBattleRewards(stage, Boolean(won));
  summary.gold += Number(base?.gold) || 0;
  summary.exp += Number(base?.exp) || 0;

  // 2) 通关进度 / 功勋 / 首通特殊奖励（仅胜利，与 /player/stage-result 一致）
  if (won && id) {
    const existing = await conn.get(
      'SELECT clear_count AS clearCount, best_stars AS bestStars, best_time_ms AS bestTimeMs FROM player_stage_progress WHERE user_id=? AND stage_id=?',
      [userId, id],
    );
    const clearCount = Number(existing?.clearCount ?? 0) + 1;
    const bestTimeMs = existing?.bestTimeMs
      ? Math.min(Number(existing.bestTimeMs), clampInt(durationMs, 0, 3_600_000))
      : clampInt(durationMs, 0, 3_600_000);
    const bestStars = Math.max(Number(existing?.bestStars ?? 0), 1);
    if (existing) {
      await conn.run(
        'UPDATE player_stage_progress SET cleared=1, clear_count=?, best_stars=?, best_time_ms=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND stage_id=?',
        [clearCount, bestStars, bestTimeMs, userId, id],
      );
    } else {
      await conn.run(
        'INSERT INTO player_stage_progress(user_id,stage_id,cleared,best_stars,clear_count,best_time_ms) VALUES(?,?,1,?,?,?)',
        [userId, id, bestStars, clearCount, bestTimeMs],
      );
    }
    summary.honor += existing ? 10 : 50;

    if (!existing) {
      summary.firstClear = true;
      for (const reward of parseStageRewards(stage?.reward)) {
        if (reward.type === 3) {
          summary.gold += reward.amount;
        } else if (reward.type === 27) {
          summary.exp += reward.amount;
        } else if (reward.type === 2) {
          // 首通卡牌
          if (await grantCard(conn, userId, reward.amount)) summary.items.push({ itemId: reward.amount, count: 1 });
        } else if (reward.type === 1) {
          // 首通道具
          if (await grantItem(conn, userId, reward.amount, 1)) summary.items.push({ itemId: reward.amount, count: 1 });
        }
      }
    }
  }

  // 3) 掉落：每名玩家各拿一份（服务端权威战斗的共享掉落池）
  for (const drop of Array.isArray(drops) ? drops : []) {
    const itemId = Number(drop?.itemId);
    const count = clampInt(drop?.count ?? 1, 1, 99);
    if (!Number.isInteger(itemId) || itemId <= 0) continue;
    if (!(await grantItem(conn, userId, itemId, count))) continue;
    const existing = summary.items.find((item) => Number(item.itemId) === itemId);
    if (existing) existing.count += count;
    else summary.items.push({ itemId, count });
  }

  // 4) 入账：金币 / 经验(含升级) / 功勋
  const profile = await conn.get('SELECT level, exp FROM player_profiles WHERE user_id=?', [userId]);
  const progress = { level: Number(profile?.level) || 1, exp: Number(profile?.exp) || 0 };
  grantPlayerExp(progress, summary.exp);
  summary.level = progress.level;
  await conn.run(
    'UPDATE player_profiles SET gold=gold+?, level=?, exp=?, honor=honor+?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?',
    [summary.gold, progress.level, progress.exp, summary.honor, userId],
  );
  return summary;
}
