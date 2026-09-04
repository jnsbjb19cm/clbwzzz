const STORAGE_KEY = 'clbwz_star_upgrade_v2';
const DAY_MS = 24 * 60 * 60 * 1000;
export const REVERSE_CARD_ID = 50041;
export const MAX_CARD_STAR = 15;

const BASE_RATES = [100, 45, 40, 35, 30, 25, 20, 18, 16, 14, 12, 10, 9, 8, 7];

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      failures: parsed.failures && typeof parsed.failures === 'object' ? parsed.failures : {},
      pity: parsed.pity && typeof parsed.pity === 'object' ? parsed.pity : {},
      protections: parsed.protections && typeof parsed.protections === 'object' ? parsed.protections : {},
      escrow: Array.isArray(parsed.escrow) ? parsed.escrow : [],
    };
  } catch {
    return { failures: {}, pity: {}, protections: {}, escrow: [] };
  }
}

function bindingKey(slot) {
  return `${slot.cardId}:${slot.craftQuality ?? 1}`;
}

export class StarUpgradeSystem {
  constructor(db, inventory, cardInventory, random = Math.random) {
    this.db = db;
    this.inventory = inventory;
    this.cardInventory = cardInventory;
    this.random = random;
    this.state = loadState();
    this.purgeExpired();
  }

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
  }

  purgeExpired(now = Date.now()) {
    const before = this.state.escrow.length;
    this.state.escrow = this.state.escrow.filter((entry) => Number(entry.expiresAt) > now);
    if (before !== this.state.escrow.length) this.save();
  }

  getEscrow() {
    this.purgeExpired();
    return this.state.escrow.map((entry) => ({ ...entry, slot: { ...entry.slot } }));
  }

  validate(mainIndex, subIndices, { requireSub = true } = {}) {
    const slots = this.cardInventory.getSlots();
    const main = slots[mainIndex];
    if (!main) return { ok: false, error: '请先放入主卡。' };
    const star = Math.max(0, Number(main.star ?? main.strengthLv) || 0);
    if (star >= MAX_CARD_STAR) return { ok: false, error: `已达到${MAX_CARD_STAR}星上限。` };
    const indices = [...new Set(subIndices)].filter((index) => index !== mainIndex);
    if (requireSub && !indices.length) return { ok: false, error: '必须放入至少一张同卡、同星级副卡。' };
    const subs = indices.map((index) => ({ index, slot: slots[index] })).filter((entry) => entry.slot);
    if (subs.length !== indices.length) return { ok: false, error: '副卡不存在，请重新选择。' };
    const invalid = subs.find(({ slot }) => (
      slot.cardId !== main.cardId
      || Math.max(0, Number(slot.star ?? slot.strengthLv) || 0) !== star
    ));
    if (invalid) return { ok: false, error: '副卡必须与主卡相同，并且星级一致。' };
    return { ok: true, main, star, subs, key: bindingKey(main) };
  }

  preview(mainIndex, subIndices, { charmId = null, route = 'duplicate' } = {}) {
    const check = this.validate(mainIndex, subIndices, { requireSub: route !== 'powder' });
    if (!check.ok) return check;
    const count = check.subs.length;
    const baseRate = BASE_RATES[Math.min(check.star, BASE_RATES.length - 1)];
    const sameCardBonus = check.star <= 5 ? 50 : 25;
    const formulaBonus = check.star * count;
    const charmLevel = charmId ? Math.max(1, Math.min(4, Number(charmId) - 50020)) : 0;
    const storedProtection = this.state.protections[check.key];
    const storedLevel = Number(storedProtection?.charges) > 0
      ? Number(storedProtection?.level) || 0
      : 0;
    const protectionBonus = Math.max(charmLevel, storedLevel) * 5;
    const pityActive = Boolean(this.state.pity[check.key]);
    let rawRate = baseRate + sameCardBonus * count + formulaBonus + protectionBonus;
    if (pityActive) rawRate *= 2;
    if (check.star === 0) rawRate = 100;
    const successRate = Math.min(100, rawRate);
    const doubleRate = Math.min(100, Math.max(0, rawRate - 100));
    return {
      ...check,
      count,
      baseRate,
      sameCardBonus,
      formulaBonus,
      protectionBonus,
      pityActive,
      successRate,
      doubleRate,
      failureRate: Math.max(0, 100 - successRate),
      failures: Number(this.state.failures[check.key]) || 0,
    };
  }

  upgrade(mainIndex, subIndices, { route = 'duplicate', charmId = null, powderNeed = null } = {}) {
    const preview = this.preview(mainIndex, subIndices, { charmId, route });
    if (!preview.ok) return preview;
    if (charmId && this.inventory.countItem(charmId) < 1) {
      return { ok: false, error: '所选保护符数量不足。' };
    }
    if (route === 'powder') {
      if (!powderNeed?.itemId || !powderNeed?.count) return { ok: false, error: '当前星级没有可用强化粉配置。' };
      if (this.inventory.countItem(powderNeed.itemId) < powderNeed.count) {
        return { ok: false, error: '强化粉不足。' };
      }
      this.inventory.consumeItem(powderNeed.itemId, powderNeed.count);
    }

    if (charmId) {
      const level = Math.max(1, Math.min(4, Number(charmId) - 50020));
      this.state.protections[preview.key] = { itemId: charmId, level, charges: level };
    }

    const consumedSnapshots = preview.subs.map(({ slot }) => ({ ...slot }));
    // Removing a sub-card before the main card shifts the main slot left.
    // Consume in descending order and retain the main card's post-removal index.
    const mainTargetIndex = mainIndex - preview.subs.filter(({ index }) => index < mainIndex).length;
    for (const { index } of [...preview.subs].sort((a, b) => b.index - a.index)) {
      this.cardInventory.removeAt(index);
    }
    this.pushEscrow(consumedSnapshots);

    const success = this.random() * 100 < preview.successRate;
    if (success) {
      const double = preview.doubleRate > 0 && this.random() * 100 < preview.doubleRate;
      const gain = double ? 2 : 1;
      const nextStar = Math.min(MAX_CARD_STAR, preview.star + gain);
      this.cardInventory.updateSlot(mainTargetIndex, { star: nextStar, strengthLv: nextStar });
      this.state.failures[preview.key] = 0;
      this.state.pity[preview.key] = false;
      const protection = this.state.protections[preview.key];
      if (protection?.itemId && this.inventory.countItem(protection.itemId) > 0) {
        this.inventory.consumeItem(protection.itemId, 1);
      }
      delete this.state.protections[preview.key];
      this.save();
      return {
        ok: true,
        success: true,
        double,
        star: nextStar,
        message: double ? `升变成功，提升至${nextStar}星！` : `升星成功，提升至${nextStar}星！`,
      };
    }

    const failures = (Number(this.state.failures[preview.key]) || 0) + 1;
    this.state.failures[preview.key] = failures;
    if (failures >= 9) this.state.pity[preview.key] = true;
    const protection = this.state.protections[preview.key];
    let dropped = false;
    if (protection?.charges > 0) {
      protection.charges -= 1;
    } else if (!this.state.pity[preview.key] && failures % 3 === 0 && preview.star > 0) {
      const nextStar = preview.star - 1;
      this.cardInventory.updateSlot(mainTargetIndex, { star: nextStar, strengthLv: nextStar });
      dropped = true;
    }
    this.save();
    return {
      ok: true,
      success: false,
      failures,
      dropped,
      pityActive: Boolean(this.state.pity[preview.key]),
      message: dropped
        ? `连续失败${failures}次，主卡降低1星；副卡已进入销毁层。`
        : `升星失败(连续${failures}次)；副卡已进入销毁层。`,
    };
  }

  pushEscrow(slots) {
    const now = Date.now();
    for (const slot of slots) {
      const highTier = Number(slot.craftQuality || 1) >= 4;
      this.state.escrow.push({
        id: `${now}-${Math.random().toString(36).slice(2)}`,
        slot,
        consumedAt: now,
        expiresAt: now + (highTier ? 5 : 3) * DAY_MS,
      });
    }
    this.save();
  }

  restoreEscrow(entryId) {
    this.purgeExpired();
    const index = this.state.escrow.findIndex((entry) => entry.id === entryId);
    if (index < 0) return { ok: false, error: '该副卡已过期或不存在。' };
    const entry = this.state.escrow[index];
    const reverseCount = Number(entry.slot.craftQuality || 1) > 4 ? 2 : 1;
    if (this.inventory.countItem(REVERSE_CARD_ID) < reverseCount) {
      return { ok: false, error: `逆转卡不足，需要${reverseCount}张。` };
    }
    if (!this.cardInventory.hasSpaceForCard(1)) return { ok: false, error: '卡牌背包已满。' };
    const restored = this.cardInventory.addCard(entry.slot.cardId, entry.slot.star, {
      craftQuality: entry.slot.craftQuality,
      strengthLv: entry.slot.star,
    });
    if (!restored.ok) return restored;
    this.inventory.consumeItem(REVERSE_CARD_ID, reverseCount);
    this.state.escrow.splice(index, 1);
    this.save();
    return { ok: true, message: `副卡已还原，消耗逆转卡×${reverseCount}。` };
  }
}