import { Router } from 'express';
import { createRequire } from 'node:module';
import { db, withTransaction } from '../database.js';
import { requireAuth } from '../middleware/auth.js';
import { readPlayerItems20260908 } from '../domain/playerInventoryAuthority20260908.js';
import { readCardInventory } from './cardInventoryPersistence20260906.js';
import { resolveCraftQuality } from '../../src/core/constants.js';

/** 制作品质名（与客户端 core/constants.js 同源）。 */
const craftQualityLabel = (craftQuality) => resolveCraftQuality(craftQuality).name;

const require = createRequire(import.meta.url);
const cardRows = require('../../src/data/card.json');
const CARD_BY_ID = new Map(cardRows.map((row) => [Number(row.card_id), row]));

export const functionalItemAuthorityRouter20260908 = Router();
functionalItemAuthorityRouter20260908.use(requireAuth);

const FUNCTIONAL_IDS = new Set([80,81,82,83,84,85,86,87,88,89,90,91]);
const MAX_STARS = { 1:5, 2:7, 3:9, 4:11, 5:13, 6:15 };

function parseState(raw) {
  try {
    const value = JSON.parse(String(raw || '{}'));
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

async function readCardRow(conn, userId, slotIndex) {
  return conn.get(`
    SELECT pc.slot_index AS slotIndex, pc.card_id AS cardId, pc.star,
           pc.craft_quality AS craftQuality, ps.state_json AS stateJson
    FROM player_cards pc
    LEFT JOIN player_card_instance_state ps
      ON ps.user_id=pc.user_id AND ps.slot_index=pc.slot_index
    WHERE pc.user_id=? AND pc.slot_index=?
  `, [userId, slotIndex]);
}

async function writeState(conn, userId, slotIndex, state) {
  await conn.run('DELETE FROM player_card_instance_state WHERE user_id=? AND slot_index=?', [userId, slotIndex]);
  await conn.run(
    'INSERT INTO player_card_instance_state(user_id,slot_index,state_json) VALUES(?,?,?)',
    [userId, slotIndex, JSON.stringify(state)],
  );
}

async function consumeFunctionalItem(conn, userId, itemId, bound = null) {
  const rows = await conn.all(`
    SELECT is_bound AS isBound, count
    FROM player_items
    WHERE user_id=? AND item_id=? AND count>0
    ORDER BY is_bound ASC
  `, [userId, itemId]);
  const candidates = bound === null ? rows : rows.filter((row) => Boolean(row.isBound) === Boolean(bound));
  const row = candidates.find((entry) => Number(entry.count) > 0);
  if (!row) throw new Error('功能道具数量不足，请刷新背包后重试');
  const next = Number(row.count) - 1;
  if (next > 0) {
    await conn.run(
      'UPDATE player_items SET count=? WHERE user_id=? AND item_id=? AND is_bound=?',
      [next, userId, itemId, row.isBound ? 1 : 0],
    );
  } else {
    await conn.run(
      'DELETE FROM player_items WHERE user_id=? AND item_id=? AND is_bound=?',
      [userId, itemId, row.isBound ? 1 : 0],
    );
  }
}

async function addItem(conn, userId, itemId, count, bound = false) {
  const amount = Math.max(1, Math.floor(Number(count) || 1));
  const b = bound ? 1 : 0;
  const row = await conn.get(
    'SELECT count FROM player_items WHERE user_id=? AND item_id=? AND is_bound=?',
    [userId, itemId, b],
  );
  if (row) {
    await conn.run('UPDATE player_items SET count=count+? WHERE user_id=? AND item_id=? AND is_bound=?', [amount, userId, itemId, b]);
  } else {
    await conn.run('INSERT INTO player_items(user_id,item_id,count,is_bound) VALUES(?,?,?,?)', [userId, itemId, amount, b]);
  }
}

function baseQuality(cardId) {
  return Math.max(1, Math.min(6, Number(CARD_BY_ID.get(Number(cardId))?.card_quality) || 1));
}

functionalItemAuthorityRouter20260908.post('/cards/use-functional-item', async (req, res) => {
  const userId = Number(req.user.id);
  const itemId = Number(req.body?.itemId);
  const targetSlotIndex = Math.floor(Number(req.body?.targetSlotIndex));
  const sourceSlotIndex = Math.floor(Number(req.body?.sourceSlotIndex));
  const bound = req.body?.bound === true ? true : req.body?.bound === false ? false : null;
  if (!FUNCTIONAL_IDS.has(itemId)) return res.status(400).json({ message: '功能道具无效' });
  if (!Number.isInteger(targetSlotIndex) || targetSlotIndex < 0 || targetSlotIndex >= 500) {
    return res.status(400).json({ message: '目标卡牌无效' });
  }

  try {
    const result = await withTransaction(async (conn) => {
      const target = await readCardRow(conn, userId, targetSlotIndex);
      if (!target) throw new Error('目标卡牌不存在，请刷新后重试');
      const targetState = parseState(target.stateJson);
      const quality = baseQuality(target.cardId);
      const maxStar = MAX_STARS[quality] || 5;
      let star = Math.max(0, Number(target.star) || 0);
      let craftQuality = Math.max(1, Math.min(5, Number(target.craftQuality) || 1));
      let message = '已使用';
      // 卡牌显示名：自定义名优先，其次配置表里的卡名
      const displayName = String(targetState.customName || CARD_BY_ID.get(Number(target.cardId))?.card_name || '卡牌');

      if (itemId === 80) {
        const roll = Math.random();
        craftQuality = roll < 0.08 ? 5 : roll < 0.23 ? 4 : roll < 0.43 ? 3 : roll < 0.68 ? 2 : 1;
        message = `成功将${displayName}洗练为${craftQualityLabel(craftQuality)}的`;
      } else if (itemId === 81) {
        const first = Math.random();
        const delta = first < 0.35 ? 2 : Math.random() < 0.70 ? 1 : -1;
        star = Math.max(0, Math.min(maxStar, star + delta));
        message = delta > 0
          ? `成功将${displayName}升星${delta}，当前为${star}`
          : `很遗憾，${displayName}降低了${star}`;
      } else if (itemId === 82) {
        // 满品质时不允许使用（事务回滚，道具不会被扣）
        if (craftQuality >= 5) throw new Error('该卡牌品质已达最高');
        craftQuality = Math.min(5, craftQuality + 1);
        message = `已成功将${displayName}升级一级品质，当前为${craftQualityLabel(craftQuality)}的${displayName}`;
      } else if (itemId === 83) {
        craftQuality = 5;
        targetState.awakened = true;
        message = `成功将${displayName}品质提升至完美的`;
      } else if (itemId === 84) {
        targetState.learnedSkill = 'attack';
        message = '已学习攻击技能';
      } else if (itemId === 85) {
        targetState.learnedSkill = 'defense';
        message = '已学习防御技能';
      } else if (itemId === 86) {
        targetState.learnedSkill = 'support';
        message = '已学习辅助技能';
      } else if (itemId === 87) {
        delete targetState.learnedSkill;
        message = '已遗忘卡牌技能';
      } else if (itemId === 88) {
        const refund = Math.floor(star * 0.6);
        star = 0;
        if (refund > 0) {
          const powderId = 10001 + Math.min(4, Math.floor(quality / 2));
          await addItem(conn, userId, powderId, refund, false);
          message = `卡牌已重置为0星，返还 ${refund} 强化粉`;
        } else {
          message = '卡牌已重置为0星';
        }
      } else if (itemId === 89) {
        if (!Number.isInteger(sourceSlotIndex) || sourceSlotIndex < 0 || sourceSlotIndex >= 500 || sourceSlotIndex === targetSlotIndex) {
          throw new Error('请选择两张不同的卡牌');
        }
        const source = await readCardRow(conn, userId, sourceSlotIndex);
        if (!source) throw new Error('经验来源卡牌不存在');
        const moved = Math.max(0, Number(source.star) || 0);
        star = Math.min(maxStar, star + moved);
        await conn.run('UPDATE player_cards SET star=0 WHERE user_id=? AND slot_index=?', [userId, sourceSlotIndex]);
        message = `已转移 ${moved} 点强化经验`;
      } else if (itemId === 90) {
        const name = String(req.body?.name || '').trim().slice(0, 18);
        if (!name) throw new Error('请输入新名称');
        targetState.customName = name;
        message = `卡牌已更名为「${name}」`;
      } else if (itemId === 91) {
        targetState.awakened = true;
        message = '卡牌羁绊已觉醒';
      }

      await consumeFunctionalItem(conn, userId, itemId, bound);
      await conn.run(
        'UPDATE player_cards SET star=?, craft_quality=? WHERE user_id=? AND slot_index=?',
        [star, craftQuality, userId, targetSlotIndex],
      );
      await writeState(conn, userId, targetSlotIndex, targetState);
      return { message };
    });

    return res.json({
      ok: true,
      ...result,
      items: await readPlayerItems20260908(userId),
      cardInventory: await readCardInventory(userId),
    });
  } catch (error) {
    return res.status(400).json({ message: error?.message || '功能道具使用失败' });
  }
});
