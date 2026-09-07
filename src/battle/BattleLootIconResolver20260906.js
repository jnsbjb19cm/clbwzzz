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
 * Most legacy items use the same id in both places, while a few imported rows expose an
 * explicit sprite/resource field. Always retain the business id as the final fallback.
 */
export function resolveLootAtlasSprite20260906(itemId, itemData = []) {
  const businessId = numericCandidate(itemId);
  if (!businessId) return null;

  const row = Array.isArray(itemData)
    ? itemData.find((item) => itemBusinessId(item) === businessId)
    : null;

  const explicit = [
    row?.sprite_id,
    row?.spriteId,
    row?.sprite_res,
    row?.spriteRes,
    row?.res,
    row?.icon_id,
    row?.iconId,
  ];
  for (const value of explicit) {
    const candidate = numericCandidate(value);
    if (candidate) return candidate;
  }
  return businessId;
}

// Kept as a small alias because an earlier red regression used this spelling.
export const resolveLootSpriteId20260906 = resolveLootAtlasSprite20260906;
