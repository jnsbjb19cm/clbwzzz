import craftRules from '../data/craftRules.json';
import smithyJson from '../data/smithy.json';
import { getInstanceStatMultiplier } from '../core/constants.js';

const POWDER_IDS = [10001, 10002, 10003, 10004, 10005];

export class CardStrengthenSystem {
  constructor(db) {
    this.db = db;
    this.table = smithyJson[0]?.strength ?? [];
    this.rules = craftRules.strengthenSuccess;
  }

  getSuccessRate(strengthLv) {
    const next = strengthLv + 1;
    for (const row of this.rules) {
      if (next <= row.maxLv) return row.rate;
    }
    return 0.4;
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
    if ((slot.strengthLv ?? 0) >= 14) return { ok: false, error: '已达最高强化等级' };
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
      const mult = getInstanceStatMultiplier(slot.craftQuality ?? 1, slot.strengthLv);
      return {
        ok: true,
        success: true,
        strengthLv: slot.strengthLv,
        message: `强化成功！+${slot.strengthLv}(属性 x${mult.toFixed(2)})`,
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
