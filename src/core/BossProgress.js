const STORAGE_KEY = 'clbwz_boss_progress_v1';
import { FOREST_BOSS_IDS, TEMPLE_BOSS_IDS, isForestUnlocked, BOSS_REGION_PREREQUISITES_ENABLED } from '../data/AdventureCampaign.js';
const BOSS_ORDER = [...FOREST_BOSS_IDS, ...TEMPLE_BOSS_IDS];

function legacyBossCleared(bossId) {
  try {
    const state = JSON.parse(globalThis.localStorage?.getItem?.('clbwz_worldmap_v1') || '{}');
    return Boolean(state?.clearedMaps?.forest?.[String(bossId)] || state?.clearedMaps?.temple?.[String(bossId)]);
  } catch {
    return false;
  }
}

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
  return loadBossProgress().cleared[String(bossId)] === true || legacyBossCleared(bossId);
}

export function isBossUnlocked(bossId) {
  const id = String(bossId);
  if (isBossCleared(id)) return true;

  // 悲伤密林始终使用独立链式解锁：
  // 第1只默认开放，之后必须击败上一只才会变亮。
  const forestIndex = FOREST_BOSS_IDS.indexOf(id);
  if (forestIndex >= 0) {
    if (BOSS_REGION_PREREQUISITES_ENABLED) {
      let cleared = [];
      try { cleared = JSON.parse(globalThis.localStorage?.getItem?.('clbwz_worldmap_v1') || '{}').stageClaimed || []; } catch { /* optional storage */ }
      if (!isForestUnlocked(cleared)) return false;
    }
    return forestIndex === 0 || isBossCleared(FOREST_BOSS_IDS[forestIndex - 1]);
  }

  // 其它区域暂时维持当前开放策略；boss_fire 仍保留旧兼容入口。
  if (!BOSS_REGION_PREREQUISITES_ENABLED) return TEMPLE_BOSS_IDS.includes(id) || id === 'boss_fire';

  let cleared = [];
  try { cleared = JSON.parse(globalThis.localStorage?.getItem?.('clbwz_worldmap_v1') || '{}').stageClaimed || []; } catch { /* optional storage */ }
  if (!isForestUnlocked(cleared)) return false;
  const index = BOSS_ORDER.indexOf(id);
  if (index <= 0) return index === 0 || id === 'boss_fire';
  return isBossCleared(BOSS_ORDER[index - 1]);
}

export function resetBossProgressForTest() {
  try { globalThis.localStorage?.removeItem?.(STORAGE_KEY); } catch { /* ignore */ }
}
