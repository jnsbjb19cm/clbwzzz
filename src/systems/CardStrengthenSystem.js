import smithyJson from '../data/smithy.json';
import { calculateCardStats } from '../battle/CardStatFormula.js';

const POWDER_IDS = [10001, 10002, 10003, 10004, 10005];
// Keep the client preview in lock-step with the authoritative
// server/routes/smithyAuthority20260907.js BASE_STAR_RATES table.
// craftRules.json has no strengthenSuccess array, so reading that missing
// property made getSuccessRate() iterate undefined as soon as a card was put
// into the strengthen slot.
const BASE_STRENGTH_RATES = [100, 45, 40, 35, 30, 25, 20, 18, 16, 14, 12, 10, 9, 8, 7];

/**
 * 各原始等级的强化星级硬上限（2026-10-15 用户《强化削弱.md》第一轮方案）：
 *   1级 4星 · 2级 7星 · 3级 10星 · 4级 13星 · 5级 15星（6级/红卡按 5 级档处理）
 * 注意：**只拦新的升星**，已经超过上限的老卡保留现状、不会被清退。
 */
const MAX_STARS_BY_LEVEL = Object.freeze({ 1: 4, 2: 7, 3: 10, 4: 13, 5: 15, 6: 15 });
export function maxStarsForCard(card) {
  const level = Math.max(1, Math.min(6, Number(card?.quality ?? card?.card_quality) || 1));
  return MAX_STARS_BY_LEVEL[level] ?? 15;
}

export class CardStrengthenSystem {
  constructor(db) {
    this.db = db;
    this.table = smithyJson[0]?.strength ?? [];
  }

  getSuccessRate(strengthLv) {
    const level = Math.max(0, Math.min(BASE_STRENGTH_RATES.length - 1, Number(strengthLv) || 0));
    return BASE_STRENGTH_RATES[level] / 100;
  }

  getPowderNeed(cardQuality, strengthLv) {
    const row = this.table[strengthLv];
    if (!row) return null;
    const key = `powder_${Math.min(5, Math.max(1, cardQuality))}`;
    const raw = row[key];
    if (!raw || raw === '0') return null;
    const [id, num] = raw.split('|').map(Number);
    if (!id || !num) return null;
    return { itemId: id, count: num };
  }

  canStrengthen(slot, card) {
    if (!slot || !card) return { ok: false, error: '未选择卡牌' };
    // 2026-10-15：改为按卡牌原始等级的上限（原来是统一 14 → 15 星）
    const cap = maxStarsForCard(card);
    if ((slot.strengthLv ?? 0) >= cap) {
      return { ok: false, error: `已达 ${cap} 星上限（${card.quality} 级卡）` };
    }
    const need = this.getPowderNeed(card.quality, slot.strengthLv ?? 0);
    if (!need) return { ok: false, error: '该品质无法继续强化' };
    return { ok: true, need, rate: this.getSuccessRate(slot.strengthLv ?? 0) };
  }

  strengthen(inventory, cardInventory, index) {
    const slot = cardInventory.getSlots()[index];
    const card = slot ? this.db.getById(slot.cardId) : null;
    const check = this.canStrengthen(slot, card);
    if (!check.ok) return check;

    if (inventory.countItem(check.need.itemId) < check.need.count) {
      return { ok: false, error: '强化粉不足' };
    }

    if (!inventory.consumeItem(check.need.itemId, check.need.count)) {
      return { ok: false, error: '强化粉扣除失败' };
    }
    slot.powderSpent = { ...(slot.powderSpent ?? {}) };
    slot.powderSpent[check.need.itemId] = (Number(slot.powderSpent[check.need.itemId]) || 0) + check.need.count;

    const lv = slot.strengthLv ?? 0;
    const success = Math.random() < check.rate;

    if (success) {
      slot.strengthLv = lv + 1;
      slot.star = slot.strengthLv;
      cardInventory.save();
      const stats = calculateCardStats(card, slot.craftQuality, slot.strengthLv, slot.attributeRoll);
      return {
        ok: true,
        success: true,
        strengthLv: slot.strengthLv,
        message: `强化成功！+${slot.strengthLv}（攻击 ${stats.atk}，生命 ${stats.hp}）`,
      };
    }

    slot.strengthLv = Math.max(0, lv - 1);
    slot.star = slot.strengthLv;
    cardInventory.save();
    return {
      ok: true,
      success: false,
      strengthLv: slot.strengthLv,
      message: `强化失败，等级回落至 +${slot.strengthLv}`,
    };
  }

  static powderName(itemId) {
    const names = {
      10001: '一级强化粉',
      10002: '二级强化粉',
      10003: '三级强化粉',
      10004: '四级强化粉',
      10005: '五级强化粉',
    };
    return names[itemId] ?? `粉末#${itemId}`;
  }

  static powderIds() {
    return [...POWDER_IDS];
  }
}
