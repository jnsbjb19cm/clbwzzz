export function normalizeGuildRole20260906(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export function canApproveGuildJoin20260906(role) {
  const normalized = normalizeGuildRole20260906(role);
  return normalized === 'president' || normalized === 'vice_president';
}
