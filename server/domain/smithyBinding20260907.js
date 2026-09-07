function int(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

/**
 * Plans a material consumption without mutating storage.
 * Bound stacks are deliberately consumed first; if any bound unit is consumed,
 * the crafted/combined result must become bound as well.
 */
export function planBoundFirstConsumption20260907(rows, requestedCount) {
  let left = int(requestedCount);
  const steps = [];
  let usedBound = false;

  const ordered = [...(Array.isArray(rows) ? rows : [])]
    .map((row) => ({ isBound: row?.isBound ? 1 : 0, count: int(row?.count) }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.isBound - a.isBound);

  for (const row of ordered) {
    if (left <= 0) break;
    const take = Math.min(left, row.count);
    if (take <= 0) continue;
    steps.push({ isBound: row.isBound, take, remain: row.count - take });
    if (row.isBound) usedBound = true;
    left -= take;
  }

  return {
    ok: left === 0,
    usedBound,
    missing: left,
    steps,
  };
}

export function inheritSmithyBinding20260907(...sources) {
  return sources.some((source) => Boolean(
    source === true
    || source === 1
    || source?.bound
    || source?.usedBound
    || source?.isBound,
  ));
}
