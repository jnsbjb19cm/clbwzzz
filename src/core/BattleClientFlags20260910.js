/**
 * 2026-09-10：几个「客户端开关」的读写桥，供设置页使用。
 *
 * 这些开关**权威来源就是战斗/背包代码直接读取的 localStorage 键**：
 *   - clbwz_show_unit_names     BattleRenderer.drawUnitName / BattleView 顶栏按钮
 *   - clbwz_low_quality         BattleView 构造时读入 renderer.forceLowQuality
 *   - clbwz_bag_auto_organize   BagView 构造时读入 autoOrganize
 * 所以设置页不另存一份状态，直接读写同一批键，避免两处状态不一致（顶栏按钮改了设置页也能看到）。
 *
 * 2026-09-11：新增的显示开关（血条 / 伤害数字 / FPS 面板 / BGM / 画质预设）统一读
 * GameSettingsStore，不再新增 localStorage 键；战斗代码只通过本文件取开关，保证只有一处判据。
 */
import { gameSettings } from './GameSettingsStore20260910.js';
export const CLIENT_FLAG_KEYS = Object.freeze({
  unitNames: 'clbwz_show_unit_names',
  lowQuality: 'clbwz_low_quality',
  bagAutoOrganize: 'clbwz_bag_auto_organize',
});

export const TUTORIAL_KEYS = Object.freeze([
  'clbwz_new_player_tutorial_completed_v1',
  'clbwz_new_player_tutorial_prompt_v1',
]);

/** 重置「本机试玩数据」时要保留的键（都是界面/音量偏好，不算存档数据）。 */
export const TRIAL_DATA_KEEP_KEYS = Object.freeze([
  'clbwz_game_settings_v1',
  CLIENT_FLAG_KEYS.unitNames,
  CLIENT_FLAG_KEYS.lowQuality,
  CLIENT_FLAG_KEYS.bagAutoOrganize,
]);

function storage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readClientFlag(key, { defaultOn = true } = {}) {
  const store = storage();
  if (!store) return defaultOn;
  try {
    const raw = store.getItem(key);
    if (raw == null) return defaultOn;
    return raw !== '0';
  } catch {
    return defaultOn;
  }
}

export function writeClientFlag(key, on) {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(key, on ? '1' : '0');
    return true;
  } catch {
    return false;
  }
}

/** 正在进行的战斗视图（用于让画质开关立刻生效）。 */
export function activeBattleRenderer() {
  try {
    const view = document.querySelector('.battlefield-wrap')?.__battleView
      ?? document.querySelector('.game-container')?.__battleView
      ?? globalThis.__activeBattleWorldView
      ?? null;
    return view?.renderer ?? null;
  } catch {
    return null;
  }
}

export const readUnitNameFlag = () => readClientFlag(CLIENT_FLAG_KEYS.unitNames, { defaultOn: true });
export const setUnitNameFlag = (on) => writeClientFlag(CLIENT_FLAG_KEYS.unitNames, on);

export const readLowQualityFlag = () => readClientFlag(CLIENT_FLAG_KEYS.lowQuality, { defaultOn: false });

/** 低画质：写键 + 立刻作用到正在跑的战斗渲染器上（下一帧生效）。 */
export function setLowQualityFlag(on) {
  const ok = writeClientFlag(CLIENT_FLAG_KEYS.lowQuality, on);
  const renderer = activeBattleRenderer();
  if (renderer) {
    try {
      renderer.forceLowQuality = Boolean(on);
    } catch {
      // 渲染器只读就忽略，下一场战斗会按新设置生效。
    }
  }
  return ok;
}

export const readBagAutoOrganizeFlag = () => readClientFlag(CLIENT_FLAG_KEYS.bagAutoOrganize, { defaultOn: false });
export const setBagAutoOrganizeFlag = (on) => writeClientFlag(CLIENT_FLAG_KEYS.bagAutoOrganize, on);

/** 清掉新手教程进度，让下次进主城重新引导。 */
export function resetTutorialProgress() {
  const store = storage();
  if (!store) return 0;
  let cleared = 0;
  for (const key of TUTORIAL_KEYS) {
    try {
      if (store.getItem(key) != null) cleared += 1;
      store.removeItem(key);
    } catch {
      // ignore
    }
  }
  return cleared;
}

/** 清空本机试玩存档（保留界面偏好）。返回被清掉的键数量。 */
export function clearTrialData() {
  const store = storage();
  if (!store) return 0;
  const keep = new Set(TRIAL_DATA_KEEP_KEYS);
  const targets = [];
  try {
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (!key || !key.startsWith('clbwz_') || keep.has(key)) continue;
      targets.push(key);
    }
  } catch {
    return 0;
  }
  let cleared = 0;
  for (const key of targets) {
    try {
      store.removeItem(key);
      cleared += 1;
    } catch {
      // ignore
    }
  }
  return cleared;
}
/* ---------------------------------------------------------------------------
 * 2026-09-11：新增的显示开关统一读 GameSettingsStore（不再新增 localStorage 键）。
 * 战斗/背包代码只从这里取开关，保证设置页改完立刻生效、且只有一处判据。
 * ------------------------------------------------------------------------- */

/** 战斗内是否显示单位血条（默认开）。 */
export const shouldDrawUnitHpBar = () => gameSettings.get('showUnitHp') !== false;

/** 战斗内是否飘伤害数字（默认关）。 */
export const shouldShowDamageNumbers = () => gameSettings.get('showDamageNumbers') === true;

/** FPS / 性能面板是否开启（默认关）。 */
export const perfPanelEnabled = () => gameSettings.get('showPerfPanel') === true;

/** BGM 是否允许在该场景播放；key 为 AudioManager 里的 BGM 键（city/room/battle/boss/ambient）。 */
export function bgmAllowedFor(key) {
  if (gameSettings.get('bgmEnabled') !== true) return false;
  if (key === 'city' || key === 'room' || key === 'battle' || key === 'boss') {
    return gameSettings.get('bgm' + key[0].toUpperCase() + key.slice(1)) !== false;
  }
  return true;
}

/** 画质预设：低=强制低画质并关掉伤害数字；中=默认；高=默认 + 伤害数字 + 单位名字。 */
export function applyGraphicsQualityPreset(level) {
  const next = level === 'low' || level === 'high' ? level : 'medium';
  gameSettings.set('graphicsQuality', next);
  setLowQualityFlag(next === 'low');
  gameSettings.set('showDamageNumbers', next !== 'low');
  gameSettings.set('showUnitHp', true);
  if (next === 'high') setUnitNameFlag(true);
  return next;
}
