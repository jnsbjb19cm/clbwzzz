/**
 * 2026-10-09：在线时长上报 —— 主线26「好运来：等待10分钟（挂机也算）」。
 *
 * 每 60 秒给任务系统发一次 { minutes: 1 }，由 QuestView 累加进 _extra.totalPlayMinutes。
 * 标签页切到后台时不计（挂机 = 页面开着但人不操作，不是页面关掉）。
 */
import { emitQuestEvent } from './QuestEventBus.js';

const TICK_MS = 60_000;
let installed = false;

export function installPlaytimeTracker20261009() {
  if (installed) return;
  if (typeof window === 'undefined' || typeof window.setInterval !== 'function') return;
  installed = true;
  window.setInterval(() => {
    try {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      emitQuestEvent('playtime', { minutes: 1 });
    } catch {
      /* 计时失败不影响游戏 */
    }
  }, TICK_MS);
}
