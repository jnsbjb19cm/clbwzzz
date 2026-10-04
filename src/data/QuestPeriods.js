// Keep the existing daily UTC boundary, and use the same Monday boundary on both ends.
export function questPeriodKey(category, now = new Date()) {
  if (category !== 'daily' && category !== 'weekly') return 'permanent';
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) return '';
  if (category === 'weekly') date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}
export function questClaimStorageId(category, questId, now = new Date()) {
  const period = questPeriodKey(category, now);
  return period === 'permanent' ? String(questId) : `${questId}@${period}`;
}
