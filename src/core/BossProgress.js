const STORAGE_KEY = 'clbwz_boss_progress_v1';
const BOSS_ORDER = ['boss_dot', 'boss_gravo', 'boss_fire', 'boss_forest', 'boss_ice'];

function emptyProgress() {
  return { cleared: {}, difficulties: {} };
}

export function loadBossProgress() {
  try {
    const raw = globalThis.localStorage?.getItem?.(STORAGE_KEY);
    return raw ? { ...emptyProgress(), ...JSON.parse(raw) } : emptyProgress();
  } catch {
    return emptyProgress();
  }
}

function saveBossProgress(progress) {
  try {
    globalThis.localStorage?.setItem?.(STORAGE_KEY, JSON.stringify(progress));
  } catch { /* Storage is optional. */ }
}

export function markBossCleared(bossId, difficulty = '简单') {
  if (!BOSS_ORDER.includes(String(bossId))) return false;
  const progress = loadBossProgress();
  progress.cleared[String(bossId)] = true;
  progress.difficulties[String(bossId)] ??= {};
  progress.difficulties[String(bossId)][String(difficulty || '简单')] = true;
  saveBossProgress(progress);
  return true;
}

export function isBossCleared(bossId) {
  return loadBossProgress().cleared[String(bossId)] === true;
}

export function isBossUnlocked(bossId) {
  const index = BOSS_ORDER.indexOf(String(bossId));
  if (index <= 0) return index === 0;
  return isBossCleared(BOSS_ORDER[index - 1]);
}

export function resetBossProgressForTest() {
  try { globalThis.localStorage?.removeItem?.(STORAGE_KEY); } catch { /* ignore */ }
}
