const MAX_BATTLE_DROPS_PER_RESULT = 40;
const BATTLE_DROP_ITEM_IDS = new Set([
  1, 2,                           // 金币礼盒、红钻礼盒
  10001, 10002, 10003, 10004, 10005,
  50001, 50002, 50003, 50004,
  50011, 50012, 50013, 50014,
  50031, 50032, 50033, 50034,
  50021, 50022, 50023, 50024,
]);

// Shared validation without importing the router or starting a database.
export function normalizeBattleDrops20260908(rawDrops) {
  if (!Array.isArray(rawDrops)) return [];
  const out = [];
  for (const raw of rawDrops) {
    if (out.length >= MAX_BATTLE_DROPS_PER_RESULT) break;
    const itemId = Number(raw?.itemId);
    if (!Number.isInteger(itemId) || !BATTLE_DROP_ITEM_IDS.has(itemId)) continue;
    // One drop per defeated unit; never trust a client-supplied quantity.
    out.push({ itemId, count: 1 });
  }
  return out;
}
