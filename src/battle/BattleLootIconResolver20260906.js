function numericCandidate(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : null;
}

function itemBusinessId(item) {
  return numericCandidate(
    item?.item_id
      ?? item?.itemId
      ?? item?.id,
  );
}

/**
 * Convert the battle/business item id to the numeric sprite name used by preload_items.
 * The imported item atlas contains the battle material business ids themselves (10001..),
 * so only an explicit sprite id may override that exact id. Fields such as `res` describe
 * other item semantics in legacy data and must not redirect the atlas lookup.
 */
export function resolveLootAtlasSprite20260906(itemId, itemData = []) {
  const businessId = numericCandidate(itemId);
  if (!businessId) return null;

  const row = Array.isArray(itemData)
    ? itemData.find((item) => itemBusinessId(item) === businessId)
    : null;

  for (const value of [row?.sprite_id, row?.spriteId]) {
    const candidate = numericCandidate(value);
    if (candidate) return candidate;
  }
  return businessId;
}

// Kept as a small alias because an earlier red regression used this spelling.
export const resolveLootSpriteId20260906 = resolveLootAtlasSprite20260906;
