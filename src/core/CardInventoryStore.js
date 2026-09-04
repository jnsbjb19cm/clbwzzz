import { STARTER_DECK } from '../battle/BattleConfig.js';
import { isCraftableCard, sanitizeCustomCardName } from './constants.js';

const DEFAULT_SLOT_COUNT = 200;
export const CARD_INVENTORY_STORAGE_KEY = 'clbwz_card_inventory_v1';
const STORAGE_KEY = CARD_INVENTORY_STORAGE_KEY;

const STARTER_EXTRA = [5, 6, 8, 12, 13, 20, 21, 23, 24, 26, 27, 28, 30, 31, 32, 33, 35, 36, 37, 38];

const EXPAND_STEPS = Array.from({ length: 15 }, (_, i) => {
  const slots = DEFAULT_SLOT_COUNT + (i + 1) * 20;
  return { slots, cost: 10 + i * 4 };
});
const MAX_SLOT_COUNT = EXPAND_STEPS.at(-1)?.slots ?? DEFAULT_SLOT_COUNT;

function normalizePowderSpent(value) {
  if (!value || typeof value !== 'object') return {};
  const out = {};
  for (const [id, count] of Object.entries(value)) {
    const itemId = Number(id);
    const amount = Math.max(0, Math.floor(Number(count) || 0));
    if (Number.isInteger(itemId) && itemId > 0 && amount > 0) out[itemId] = amount;
  }
  return out;
}

function normalizeAttributeRoll(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    atk: Math.max(-20, Math.min(20, Number(value.atk) || 0)),
    hp: Math.max(-20, Math.min(20, Number(value.hp) || 0)),
    cd: Math.max(-20, Math.min(20, Number(value.cd) || 0)),
  };
}

function normalizeSlot(slot) {
  if (!slot) return null;
  const cardId = Number(slot.cardId);
  if (!Number.isInteger(cardId) || cardId <= 0) return null;
  const cq = slot.craftQuality;
  const star = Math.max(0, Number(slot.star ?? slot.strengthLv) || 0);
  const customName = sanitizeCustomCardName(slot.customName);
  return {
    ...slot,
    cardId,
    star,
    strengthLv: star,
    craftQuality: cq === 0 || cq ? Math.max(1, Math.min(5, Number(cq) || 1)) : 1,
    exp: Math.max(0, Math.floor(Number(slot.exp) || 0)),
    customName: customName || null,
    awakened: Boolean(slot.awakened),
    attributeRoll: normalizeAttributeRoll(slot.attributeRoll),
    powderSpent: normalizePowderSpent(slot.powderSpent),
  };
}

export class CardInventoryStore {
  constructor(cardDb) {
    this.cardDb = cardDb;
    this.state = this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.slots)) {
          parsed.slots = parsed.slots.map(normalizeSlot);
          const savedCount = Number(parsed.slotCount);
          parsed.slotCount = Math.max(
            DEFAULT_SLOT_COUNT,
            Number.isInteger(savedCount) ? Math.min(savedCount, MAX_SLOT_COUNT) : 0,
            parsed.slots.length,
          );
          while (parsed.slots.length < parsed.slotCount) parsed.slots.push(null);
          if (parsed.slots.length > parsed.slotCount) parsed.slots.length = parsed.slotCount;
          return parsed;
        }
      }
    } catch {
      /* ignore */
    }
    return this.createDefault();
  }

  createDefault() {
    const slotCount = DEFAULT_SLOT_COUNT;
    const slots = Array.from({ length: slotCount }, () => null);
    const seen = new Set();
    let idx = 0;
    for (const id of [...STARTER_DECK, ...STARTER_EXTRA]) {
      if (seen.has(id) || idx >= slotCount) continue;
      const card = this.cardDb.getById(id);
      if (!card?.isCollectible()) continue;
      seen.add(id);
      slots[idx++] = normalizeSlot({ cardId: id, star: 0, strengthLv: 0, craftQuality: 1 });
    }
    return { slotCount, slots };
  }

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
  }

  reset() {
    this.state = this.createDefault();
    this.save();
  }

  getSlotCount() { return this.state.slotCount; }
  getSlots() { return this.state.slots; }
  getUsedCount() { return this.state.slots.filter(Boolean).length; }
  getFreeSlots() { return this.state.slots.filter((s) => !s).length; }
  hasSpaceForCard(count = 1) { return this.getFreeSlots() >= count; }

  getOwnershipMap() {
    const map = new Map();
    for (const slot of this.state.slots) {
      if (!slot) continue;
      map.set(slot.cardId, (map.get(slot.cardId) ?? 0) + 1);
    }
    return map;
  }

  getOwnedCardIds() { return [...this.getOwnershipMap().keys()]; }
  ownsCard(cardId) { return (this.getOwnershipMap().get(Number(cardId)) ?? 0) > 0; }

  findFirstInstance(cardId) {
    const id = Number(cardId);
    const idx = this.state.slots.findIndex((s) => s?.cardId === id);
    return idx >= 0 ? { index: idx, slot: this.state.slots[idx] } : null;
  }

  updateSlot(index, patch) {
    if (!Number.isInteger(index) || !patch || typeof patch !== 'object') return false;
    const slot = this.state.slots[index];
    if (!slot) return false;
    const next = normalizeSlot({ ...slot, ...patch });
    if (!next) return false;
    this.state.slots[index] = next;
    this.save();
    return true;
  }

  addCard(cardId, star = 0, opts = {}) {
    const id = Number(cardId);
    const card = this.cardDb.getById(id);
    if (!card?.isInventoryCard?.()) return { ok: false, error: '无效卡牌' };
    const empty = this.state.slots.findIndex((s) => !s);
    if (empty < 0) return { ok: false, error: '卡牌背包已满' };
    const normalizedStar = Math.max(0, Number(star ?? opts.strengthLv) || 0);
    this.state.slots[empty] = normalizeSlot({
      cardId: id,
      star: normalizedStar,
      strengthLv: normalizedStar,
      craftQuality: opts.craftQuality ?? 1,
      exp: opts.exp ?? 0,
      customName: opts.customName ?? null,
      awakened: opts.awakened ?? false,
      attributeRoll: opts.attributeRoll ?? null,
      powderSpent: opts.powderSpent ?? {},
    });
    this.save();
    return { ok: true, index: empty };
  }

  grantAllCollectibleCards() {
    const owned = new Set(this.getOwnedCardIds());
    let added = 0;
    let skipped = 0;
    for (const card of this.cardDb.getCollectibleCards()) {
      const copies = owned.has(card.id) ? 0 : 1;
      for (let i = 0; i < copies; i++) {
        const res = this.addCard(card.id, 0, { craftQuality: 5, strengthLv: 2 });
        if (res.ok) {
          added++;
          owned.add(card.id);
        } else {
          skipped++;
          break;
        }
      }
      if (skipped) break;
    }
    return { ok: true, added, skipped, total: this.getUsedCount() };
  }

  removeAt(index) {
    if (!Number.isInteger(index)) return false;
    if (!this.state.slots[index]) return false;
    this.state.slots[index] = null;
    this.save();
    return true;
  }

  getExpandInfo() {
    const next = EXPAND_STEPS.find((s) => s.slots > this.state.slotCount);
    if (!next) return null;
    return { nextSlots: next.slots, gemCost: next.cost };
  }

  expand() {
    const info = this.getExpandInfo();
    if (!info) return { ok: false, error: '已达上限' };
    this.state.slotCount = info.nextSlots;
    while (this.state.slots.length < info.nextSlots) this.state.slots.push(null);
    this.save();
    return { ok: true, gemCost: info.gemCost, slotCount: info.nextSlots };
  }

  getCraftableInBag() {
    return this.state.slots
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => slot && isCraftableCard(this.cardDb.getById(slot.cardId)));
  }

  organize() {
    const filled = this.state.slots.filter(Boolean);
    filled.sort((a, b) => {
      const ca = this.cardDb.getById(a.cardId);
      const cb = this.cardDb.getById(b.cardId);
      if (!ca || !cb) return 0;
      if (cb.quality !== ca.quality) return cb.quality - ca.quality;
      const cqA = a.craftQuality ?? 1;
      const cqB = b.craftQuality ?? 1;
      if (cqB !== cqA) return cqB - cqA;
      const stA = a.strengthLv ?? 0;
      const stB = b.strengthLv ?? 0;
      if (stB !== stA) return stB - stA;
      return ca.id - cb.id;
    });
    const n = this.state.slotCount;
    this.state.slots = [...filled, ...Array(Math.max(0, n - filled.length)).fill(null)];
    this.save();
    return { ok: true, count: filled.length };
  }
}
