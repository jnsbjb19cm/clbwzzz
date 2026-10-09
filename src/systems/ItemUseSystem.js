import { pickExactTierCard } from '../core/CardEgg.js';
import { formatCraftCardName } from '../core/constants.js';

const FIXED_GIFTS = { 1:{gold:5000}, 2:{gem:10}, 3:{honor:5000}, 4:{stamina:6}, 5:{exp:200} };
const RANDOM_ITEM_POOL = [1,2,3,4,5,10001,10002,30055];

const CARD_PICKER_ITEMS = new Set([80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91]);
const DIRECT_ITEMS = new Set([92]);
/** 2026-09-11：改名卡（98）不改卡牌，由 BagView 弹窗 + 服务端 /player/rename 处理。 */
const PLAYER_RENAME_ITEM = 98;
/** 2026-10-09：体验卡（function 64）—— 使用后获得指定卡牌的限时副本。 */
const TRIAL_CARD_FUNCTION = 64;

export class ItemUseSystem {
  constructor(cardDb, itemDb) { this.cardDb = cardDb; this.itemDb = itemDb; }

  isUsable(item) {
    if (!item || item.type !== 1) return false;
    const id = Number(item.id);
    if (id === PLAYER_RENAME_ITEM) return true;
    if (CARD_PICKER_ITEMS.has(id) || DIRECT_ITEMS.has(id)) return true;
    if (item.function === TRIAL_CARD_FUNCTION) return true;
    if (item.function === 13) return true;
    if (item.function === 2) return /礼盒|礼包|卡包|卡蛋|药水/.test(item.showType ?? '');
    if (item.function === 1 && /礼盒/.test(item.showType ?? '')) return true;
    return false;
  }

  use(item, slotIndex, inventory, cardInventory, player) {
    if (!this.isUsable(item)) return { ok: false, error: '该物品不可使用' };
    const slot = inventory.getSlots()[slotIndex];
    if (!slot || slot.itemId !== item.id || slot.count < 1) return { ok: false, error: '物品不存在' };
    const id = Number(item.id);
    if (id === PLAYER_RENAME_ITEM) return { ok: true, requiresRename: true };
    if (item.function === TRIAL_CARD_FUNCTION) return this.useTrialCard(item, slotIndex, inventory, cardInventory);
    if (CARD_PICKER_ITEMS.has(id)) return { ok: true, picker: true };
    if (DIRECT_ITEMS.has(id)) return this._useDirect(id, slotIndex, inventory, player);
    if (item.function === 13 || /卡包|卡蛋/.test(item.showType ?? '')) {
      if (cardInventory.getFreeSlots() < 1) return { ok: false, error: '卡牌背包已满' };
      return this.openCardPack(item, slotIndex, inventory, cardInventory);
    }
    return this.openGift(item, slotIndex, inventory, player);
  }

  /**
   * 2026-10-09：体验卡 —— 给指定卡牌一张限时副本（默认 7 天）。
   * expiresAt 写进卡牌实例，到期由卡牌背包清理（服务端读快照时也会过滤）。
   */
  useTrialCard(item, slotIndex, inventory, cardInventory) {
    const cardId = Math.floor(Number(item?.trialCardId ?? item?.effectValue));
    const card = this.cardDb?.getById?.(cardId);
    if (!Number.isInteger(cardId) || cardId <= 0 || !card) return { ok: false, error: '体验卡未配置卡牌' };
    if (typeof cardInventory?.getFreeSlots === 'function' && cardInventory.getFreeSlots() < 1) {
      return { ok: false, error: '卡牌背包已满' };
    }
    const days = Math.max(1, Math.floor(Number(item?.trialDays) || 7));
    const expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;
    const res = cardInventory.addCard(cardId, 0, { craftQuality: 1, strengthLv: 0, expiresAt });
    if (res && res.ok === false) return res;
    inventory.consumeAt(slotIndex, 1);
    return { ok: true, message: `获得「${card.name}」体验卡（${days} 天）` };
  }

  _useDirect(id, slotIndex, inventory, player) {
    if (id === 92) {
      const result = inventory.expandBy(10);
      if (!result.ok) return result;
      inventory.consumeAt(slotIndex, 1);
      return { ok: true, message: '背包永久增加 10 格！' };
    }
    inventory.consumeAt(slotIndex, 1);
    return { ok: true, message: '道具已使用' };
  }

  openGift(item, slotIndex, inventory, player) {
    const fixed = FIXED_GIFTS[item.id], rewards = fixed ? { ...fixed } : this.parseDescRewards(item);
    if (!rewards || Object.keys(rewards).length === 0) {
      if (item.function === 1) {
        const pick = RANDOM_ITEM_POOL[Math.floor(Math.random() * RANDOM_ITEM_POOL.length)];
        inventory.consumeAt(slotIndex, 1);
        if (!inventory.addItem(pick, 1)) { inventory.addItem(item.id, 1); return { ok: false, error: '背包已满' }; }
        return { ok: true, message: '获得 ' + (this.itemDb.getById(pick)?.name ?? '道具#' + pick) };
      }
      return { ok: false, error: '暂未配置该礼盒奖励' };
    }
    inventory.consumeAt(slotIndex, 1);
    const parts = [];
    if (rewards.gold) { player.gold += rewards.gold; parts.push(rewards.gold + '金币'); }
    if (rewards.gem) { player.gem += rewards.gem; parts.push(rewards.gem + '钻石'); }
    if (rewards.honor) { player.honor = (player.honor ?? 0) + rewards.honor; parts.push(rewards.honor + '荣誉'); }
    return { ok: true, message: '打开「' + item.name + '」获得 ' + parts.join('、') };
  }

  parseDescRewards(item) {
    const d = item.desc ?? '', g = d.match(/(\d+)\s*金币/), gm = d.match(/(\d+)\s*红钻/), h = d.match(/(\d+)\s*点?荣誉/);
    const out = {}; if (g) out.gold = Number(g[1]); if (gm) out.gem = Number(gm[1]); if (h) out.honor = Number(h[1]);
    return Object.keys(out).length ? out : null;
  }

  openCardPack(item, slotIndex, inventory, cardInventory) {
    const maxQ = Math.min(6, Math.max(1, item.quality ?? 2));
    const pool = this.cardDb.getCollectibleCards().filter(c => item.cardPoolQuality ? c.quality === item.cardPoolQuality : c.quality <= maxQ);
    if (!pool.length) return { ok: false, error: '卡池为空' };
    const weights = pool.map(c => Math.max(1, maxQ - c.quality + 1));
    const total = weights.reduce((s, w) => s + w, 0);
    let r = Math.random() * total, card = pool[0];
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) { card = pool[i]; break; } }
    if (item.cardPoolQuality) card = pickExactTierCard(pool, item.cardPoolQuality);
    const res = cardInventory.addCard(card.id, 0, { craftQuality: 1, strengthLv: 0 });
    if (!res.ok) return { ok: false, error: '卡牌背包已满' };
    inventory.consumeAt(slotIndex, 1);
    return { ok: true, message: '获得 ' + formatCraftCardName(1, card.name) };
  }
}
