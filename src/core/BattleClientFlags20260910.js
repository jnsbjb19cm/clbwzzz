/**
 * 2026-09-10：几个「客户端开关」的读写桥，供设置页使用。
 *
 * 这些开关**权威来源就是战斗/背包代码直接读取的 localStorage 键**：
 *   - clbwz_show_unit_names     BattleRenderer.drawUnitName / BattleView 顶栏按钮
 *   - clbwz_low_quality         BattleView 构造时读入 renderer.forceLowQuality
 *   - clbwz_bag_auto_organize   BagView 构造时读入 autoOrganize
 * 所以设置页不另存一份状态，直接读写同一批键，避免两处状态不一致（顶栏按钮改了设置页也能看到）。
 */
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
