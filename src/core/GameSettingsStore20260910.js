/**
 * 2026-09-10：客户端总设置（设置页里可调）。
 *
 * 之前一些开关只有各自页面里能改，或者干脆写死在代码里（比如图鉴未获得卡是否显示剪影、
 * 全屏技能特效缩放）。这里统一成一份可读写的设置，默认值集中声明，页面共用同一份数据。
 *
 * 存储位置：localStorage（离线也可用，登录状态下不覆盖服务端的音量/显示卡名设置）。
 */
export const GAME_SETTINGS_STORAGE_KEY = 'clbwz_game_settings_v1';

export const GAME_SETTINGS_DEFAULTS = Object.freeze({
  /** 图鉴：未获得的卡是否显示为剪影。默认关 —— 也就是正常显示立绘。 */
  gallerySilhouetteUnowned: false,
  /** 全屏技能特效大小（1 = 铺满整个画布）。0.72 与代码默认值一致。 */
  fullscreenFxScale: 0.72,
});

/** 全屏特效缩放的可用区间，防止设置页拖出离谱数值。 */
export const FULLSCREEN_FX_SCALE_RANGE = Object.freeze({ min: 0.4, max: 1, step: 0.02 });

function clampFxScale(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return GAME_SETTINGS_DEFAULTS.fullscreenFxScale;
  return Math.max(FULLSCREEN_FX_SCALE_RANGE.min, Math.min(FULLSCREEN_FX_SCALE_RANGE.max, n));
}

function normalize(key, value) {
  if (key === 'fullscreenFxScale') return clampFxScale(value);
  if (key === 'gallerySilhouetteUnowned') return Boolean(value);
  return value;
}

export class GameSettingsStore {
  constructor(storage = null) {
    this.storage = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    this.listeners = new Set();
    this.values = { ...GAME_SETTINGS_DEFAULTS };
    this.load();
  }

  load() {
    try {
      const raw = this.storage?.getItem(GAME_SETTINGS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      for (const key of Object.keys(GAME_SETTINGS_DEFAULTS)) {
        if (key in parsed) this.values[key] = normalize(key, parsed[key]);
      }
    } catch {
      // 存储损坏时直接用默认值。
    }
  }

  save() {
    try {
      this.storage?.setItem(GAME_SETTINGS_STORAGE_KEY, JSON.stringify(this.values));
    } catch {
      // 隐私模式下写不进去也不影响本次会话。
    }
  }

  get(key) {
    if (!(key in GAME_SETTINGS_DEFAULTS)) return undefined;
    return this.values[key];
  }

  all() {
    return { ...this.values };
  }

  set(key, value) {
    if (!(key in GAME_SETTINGS_DEFAULTS)) return this.get(key);
    const next = normalize(key, value);
    if (this.values[key] === next) return next;
    this.values[key] = next;
    this.save();
    for (const listener of this.listeners) {
      try {
        listener(key, next, this.all());
      } catch {
        // 单个订阅者异常不影响其它订阅者。
      }
    }
    return next;
  }

  reset() {
    for (const key of Object.keys(GAME_SETTINGS_DEFAULTS)) this.set(key, GAME_SETTINGS_DEFAULTS[key]);
    return this.all();
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const gameSettings = new GameSettingsStore();

/** 给不方便 import 单例的地方（如战斗渲染热路径）用的读取入口。 */
export function getGameSetting(key) {
  return gameSettings.get(key);
}
