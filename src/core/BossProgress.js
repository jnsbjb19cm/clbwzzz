const STORAGE_KEY = 'clbwz_boss_progress_v1';
import { FOREST_BOSS_IDS, TEMPLE_BOSS_IDS, isForestUnlocked, BOSS_REGION_PREREQUISITES_ENABLED } from '../data/AdventureCampaign.js';
const BOSS_ORDER = [...FOREST_BOSS_IDS, ...TEMPLE_BOSS_IDS];

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
  if (!BOSS_ORDER.includes(String(bossId)) && bossId !== 'boss_fire') return false;
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
  if (!BOSS_REGION_PREREQUISITES_ENABLED) return BOSS_ORDER.includes(String(bossId)) || bossId === 'boss_fire';
  if (isBossCleared(bossId)) return true;
  let cleared = [];
  try { cleared = JSON.parse(globalThis.localStorage?.getItem?.('clbwz_worldmap_v1') || '{}').stageClaimed || []; } catch { /* optional storage */ }
  if (!isForestUnlocked(cleared)) return false;
  const index = BOSS_ORDER.indexOf(String(bossId));
  if (index <= 0) return index === 0;
  return isBossCleared(BOSS_ORDER[index - 1]);
}

export function resetBossProgressForTest() {
  try { globalThis.localStorage?.removeItem?.(STORAGE_KEY); } catch { /* ignore */ }
}
