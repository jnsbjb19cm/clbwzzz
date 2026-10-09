/**
 * 2026-10-09：礼包 / 卡蛋 / 情报道具的开启逻辑（① 的第二半）
 *
 * 背景：txt 里新加了一批礼包（新手礼包、5级礼包、10级礼包、神秘的蛋I、神秘的卡蛋III、
 * 神秘包裹、神秘福袋、奇珍礼盒、悲伤密林的情报），它们不是"固定给 N 金币"那类，
 * 需要 **随机奖励池**（随机 1 张卡 / 随机 N 种材料 / 概率额外给 / 打开不消耗）。
 *
 * 设计：池定义在 src/data/giftPools.json；本模块只接管"有池的道具"，
 *      **其它道具一律原样交给原来的 ItemUseSystem.use**（不改变既有行为）。
 *
 * 池形态：
 *   fixed          固定给
 *   one_of_cards   随机给 1 张卡（cards 列表 或 quality 卡池）
 *   n_of           从 rewards 里随机挑 pick 种
 *   extra          在 fixed 基础上按 chance 概率额外给
 *   lock           打开不消耗（情报类）
 */
import giftPools from '../data/giftPools.json';
import { ItemUseSystem } from '../systems/ItemUseSystem.js';

const PATCH_FLAG = Symbol.for('clbwz.giftBoxOpening20261009');

/** 兼容 Node 侧的 JSON 载入（Vite 下是对象/模块） */
const POOLS = (giftPools && giftPools.default) ? giftPools.default : giftPools;

/**
 * 纯函数：按池配置掷一次奖励（不碰背包/引擎，方便单测）。
 * @returns {{ cards: Array<{cardId:number}|{quality:number}>, items: Array<{itemId:number,count:number}> , extraItems:[] }}
 */
export function rollGiftPool(pool, rng = Math.random) {
  const out = { cards: [], items: [], extraItems: [] };
  if (!pool || pool.kind === 'lock') return out;

  const pushFixed = (list, bucket) => {
    for (const row of list ?? []) {
      if (row.card != null) out.cards.push({ cardId: Number(row.card) });
      else if (row.item != null) bucket.push({ itemId: Number(row.item), count: Math.max(1, Number(row.count) || 1) });
    }
  };

  if (pool.kind === 'fixed') {
    pushFixed(pool.rewards, out.items);
    if (pool.extra && rng() < Number(pool.extra.chance ?? 0)) out.extraItems.push({ itemId: Number(pool.extra.item), count: Math.max(1, Number(pool.extra.count) || 1) });
    return out;
  }
  if (pool.kind === 'one_of_cards') {
    if (Array.isArray(pool.cards) && pool.cards.length) {
      const pick = pool.cards[Math.floor(rng() * pool.cards.length) % pool.cards.length];
      out.cards.push({ cardId: Number(pick) });
    } else if (pool.quality != null) {
      out.cards.push({ quality: Number(pool.quality) });
    }
    return out;
  }
  if (pool.kind === 'n_of') {
    const rows = [...(pool.rewards ?? [])];
    const want = Math.max(1, Math.min(rows.length, Number(pool.pick) || 1));
    for (let i = 0; i < want; i += 1) {
      const index = Math.floor(rng() * rows.length) % rows.length;
      const [row] = rows.splice(index, 1);
      if (!row) break;
      if (row.card != null) out.cards.push({ cardId: Number(row.card) });
      else out.items.push({ itemId: Number(row.item), count: Math.max(1, Number(row.count) || 1) });
    }
    return out;
  }
  return out;
}

/** 把一次掷出的奖励落到背包 / 卡牌背包；返回可读文案与是否成功 */
function grantRoll(view, out, cardDb, rng = Math.random) {
  const names = [];
  const cardName = (card) => card?.name ?? card?.card_name ?? `卡${card?.id}`;
  for (const entry of out.cards) {
    let card = null;
    if (entry.cardId != null) card = cardDb?.getById?.(entry.cardId) ?? null;
    else if (entry.quality != null) {
      const pool = (cardDb?.getCollectibleCards?.() ?? []).filter((c) => Number(c.quality) === Number(entry.quality));
      if (pool.length) card = pool[Math.floor(rng() * pool.length) % pool.length];
    }
    if (!card) continue;
    const res = view.cardInventory?.addCard?.(card.id, 0, { craftQuality: 1 });
    if (res && res.ok === false) names.push(`${cardName(card)}（卡牌背包已满）`);
    else names.push(`卡牌「${cardName(card)}」`);
  }
  const rows = [...out.items, ...out.extraItems];
  for (const row of rows) {
    const ok = view.inventory?.addItem?.(row.itemId, row.count);
    const def = view.itemDb?.getById?.(row.itemId);
    const label = `${def?.name ?? `道具${row.itemId}`}×${row.count}`;
    names.push(ok === false ? `${label}（背包已满）` : label);
  }
  return names;
}

export function installGiftBoxOpening20261009() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  // 2026-10-09：新礼包的函数码是 60~63，ItemUseSystem.isUsable 不认 → 背包里显示「不可使用」。
  // 这里补一条：只要道具在 giftPools 里有池，就视为可使用，具体开启交给下面的 use 包装。
  const previousUsable = ItemUseSystem.prototype.isUsable;
  ItemUseSystem.prototype.isUsable = function isUsableWithGiftPool20261009(item) {
    if (item && POOLS?.[String(item.id)]) return true;
    return previousUsable.call(this, item);
  };

  const previousUse = ItemUseSystem.prototype.use;
  ItemUseSystem.prototype.use = function useWithGiftPool20261009(item, index, inventory, cardInventory, player) {
    const pool = POOLS?.[String(item?.id)];
    if (!pool) return previousUse.call(this, item, index, inventory, cardInventory, player);

    const needLevel = Math.max(0, Number(item?.open_level ?? item?.openLevel) || 0);
    const level = Math.max(1, Number(player?.level) || 1);
    if (needLevel && level < needLevel) {
      return { ok: false, message: `需要 ${needLevel} 级才能开启「${item.name}」` };
    }

    const view = { inventory, cardInventory, itemDb: this.itemDb ?? this.itemDatabase };
    const cardDb = this.cardDb ?? cardInventory?.cardDb ?? null;
    const out = rollGiftPool(pool);
    const names = grantRoll(view, out, cardDb);

    // lock（情报类）：打开不消耗
    if (pool.kind !== 'lock') inventory?.removeAt?.(index, 1);

    const message = pool.kind === 'lock'
      ? `已查看「${item.name}」（不消耗）`
      : names.length ? `打开「${item.name}」获得：${names.join('、')}` : `打开「${item.name}」但没有获得任何物品`;
    return { ok: true, message };
  };
}
