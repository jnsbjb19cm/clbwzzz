/**
 * 2026-10-09：礼包奖励池掷骰（纯函数，单一来源）。
 *
 * 客户端（GiftBoxOpening20261009）与服务端（inventory/use 权威接口）共用这一份，
 * 避免两边各写一套导致「客户端开出的东西和服务端扣的不一致」。
 *
 * ⚠️ 本模块**不 import JSON**：服务端是原生 Node ESM，`import ... from '*.json'` 会报错
 * （仓库里的服务端统一用 createRequire 读 JSON）。所以 giftPools 由调用方传进来。
 *
 * 池形态（见 src/data/giftPools.json）：
 *   fixed          固定给
 *   one_of_cards   随机给 1 张卡（cards 列表 或 quality 卡池）
 *   n_of           从 rewards 里随机挑 pick 种
 *   extra          在 fixed 基础上按 chance 概率额外给
 *   lock           打开不消耗（情报类，不给东西）
 */

/** 从池表里取某个道具的池（池表由调用方加载）。 */
export function findGiftPool(pools, itemId) {
  if (!pools) return null;
  if (typeof pools.get === 'function') return pools.get(String(itemId)) ?? pools.get(Number(itemId)) ?? null;
  return pools[String(itemId)] ?? null;
}

/**
 * 按池配置掷一次奖励（不碰背包/引擎，方便单测）。
 * @param {object} pool giftPools 里的单条配置
 * @param {() => number} rng 随机源（默认 Math.random）
 * @returns {{ cards: Array<{cardId:number}|{quality:number}>, items: Array<{itemId:number,count:number}>, extraItems: Array<{itemId:number,count:number}> }}
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
    if (pool.extra && rng() < Number(pool.extra.chance ?? 0)) {
      out.extraItems.push({ itemId: Number(pool.extra.item), count: Math.max(1, Number(pool.extra.count) || 1) });
    }
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
