/**
 * 2026-09-11：FPS / 性能面板（设置页开关，默认关）。
 *
 * 显示当前帧率 + 正在跑的战斗里的单位/特效数量，用来判断卡顿是掉帧还是别的原因。
 * 只在开启时挂 rAF 循环，关掉立即停止（不常驻占用）。
 */
import { perfPanelEnabled } from '../core/BattleClientFlags20260910.js';

const PATCH_FLAG = Symbol.for('clbwz.perfOverlay20260911');
const PANEL_ID = 'clbwz-perf-panel-20260911';
/** 采样窗口（毫秒）：太短会跳，太长不灵敏。 */
const SAMPLE_MS = 500;

function battleEngine() {
  try {
    const view = document.querySelector('.battlefield-wrap')?.__battleView
      ?? globalThis.__activeBattleWorldView
      ?? null;
    return view?.engine ?? view?.battleEngine ?? null;
  } catch {
    return null;
  }
}

export class PerfOverlay {
  constructor({ document: doc = globalThis.document } = {}) {
    this.doc = doc;
    this.running = false;
    this.frames = 0;
    this.windowStart = 0;
    this.raf = 0;
    this.fps = 0;
    this.lowFpsStreak = 0;
  }

  panel() {
    if (!this.doc) return null;
    let node = this.doc.getElementById(PANEL_ID);
    if (!node) {
      node = this.doc.createElement('div');
      node.id = PANEL_ID;
      node.className = 'clbwz-perf-panel';
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'off');
      this.doc.body.append(node);
    }
    return node;
  }

  start() {
    if (this.running || !this.doc) return;
    this.running = true;
    this.frames = 0;
    this.windowStart = performance.now();
    const node = this.panel();
    if (node) node.hidden = false;
    const tick = () => {
      if (!this.running) return;
      this.frames += 1;
      const now = performance.now();
      const elapsed = now - this.windowStart;
      if (elapsed >= SAMPLE_MS) {
        this.fps = Math.round((this.frames * 1000) / elapsed);
        this.frames = 0;
        this.windowStart = now;
        // 连续两次低于 30 帧就提示，方便判断"卡"是不是掉帧导致。
        if (this.fps < 30) this.lowFpsStreak += 1;
        else this.lowFpsStreak = 0;
        this.render();
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    this.render();
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    const node = this.doc?.getElementById(PANEL_ID);
    if (node) node.hidden = true;
  }

  render() {
    const node = this.panel();
    if (!node) return;
    const engine = battleEngine();
    const units = Array.isArray(engine?.units) ? engine.units.filter((u) => u?.alive).length : null;
    const fx = Array.isArray(engine?.skillFx) ? engine.skillFx.length : null;
    const parts = [`${this.fps} FPS`];
    if (units != null) parts.push(`单位 ${units}`);
    if (fx != null) parts.push(`特效 ${fx}`);
    if (this.lowFpsStreak >= 2) parts.push('帧率偏低');
    node.textContent = parts.join(' · ');
    node.classList.toggle('is-low', this.lowFpsStreak >= 2);
  }

  /** 跟随设置开关（设置页改动后调用）。 */
  sync() {
    if (perfPanelEnabled()) this.start();
    else this.stop();
  }
}

export const perfOverlay = new PerfOverlay();

export function installPerfOverlay20260911() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;
  if (typeof window === 'undefined') return;
  perfOverlay.sync();
  window.addEventListener('clbwz:settings-changed', () => perfOverlay.sync());
}
