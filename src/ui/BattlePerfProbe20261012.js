/**
 * 2026-10-12：BOSS 战卡顿排查用「耗时探针」（临时工具，定位后即可删除）
 *
 * 用户：「痴情的多特的 那个先加探针看怎么回事」
 *
 * 做什么：
 *   1) 统计真实 FPS（requestAnimationFrame 间隔）
 *   2) 给 BattleRenderer.prototype.draw 计时（每次绘制的耗时 ms，取最近 120 帧）
 *   3) 统计同屏单位数 / 特效数 / 弹幕数（卡顿时通常是这些爆了）
 *   4) 每 3 秒往控制台打一行汇总；也可以随时手动调用 window.__clbwzPerf()
 *
 * 怎么用：
 *   打一局痴情的多特 → 卡的时候看控制台（或随时敲 __clbwzPerf()）→ 把输出发给助手
 *
 * 注意：只读不写，不改游戏逻辑；删除本文件与 main.js 里的一行 import 即可移除。
 */

const FLAG = Symbol.for('clbwz.battlePerfProbe20261012');

const state = {
  frames: [],
  drawMs: [],
  lastAt: 0,
  slowFrames: 0,
  maxDrawMs: 0,
  hookInstalled: false,
};

function pct(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[idx];
}

function avg(arr) {
  if (!arr.length) return 0;
  let sum = 0;
  for (const v of arr) sum += v;
  return sum / arr.length;
}

function battleView() {
  return document.querySelector('.battlefield-wrap')?.__battleView
    ?? document.querySelector('.battle-game-wrap')?.__battleView
    ?? null;
}

function snapshotCounts() {
  const engine = battleView()?.engine;
  const units = engine?.units ?? [];
  let alive = 0;
  for (const u of units) if (u?.alive) alive += 1;
  const count = (x) => (Array.isArray(x) ? x.length : 0);
  return {
    单位总数: count(units),
    存活单位: alive,
    中立单位: units.filter((u) => u && (u.team === 'neutral' || u.pvpNeutral)).length,
    特效: count(engine?.fx) + count(engine?.effects) + count(engine?.impactFx),
    弹幕: count(engine?.projectiles) + count(engine?.flights),
    飘字: count(engine?.floats),
    日志: count(engine?.logs),
    画布: document.querySelectorAll('.battlefield-wrap canvas, .battle-game-wrap canvas').length,
  };
}

export function perfReport() {
  const r = {
    采样帧数: state.frames.length,
    FPS_平均: Number((1000 / (avg(state.frames) || 16.7)).toFixed(1)),
    FPS_最低1percent: Number((1000 / (pct(state.frames, 0.99) || 16.7)).toFixed(1)),
    帧间隔_中位ms: Number((pct(state.frames, 0.5) || 0).toFixed(2)),
    帧间隔_最差ms: Number((pct(state.frames, 1) || 0).toFixed(2)),
    掉帧数_超过33ms: state.slowFrames,
    绘制_平均ms: Number(avg(state.drawMs).toFixed(2)),
    绘制_p95ms: Number(pct(state.drawMs, 0.95).toFixed(2)),
    绘制_最差ms: Number(state.maxDrawMs.toFixed(2)),
    ...snapshotCounts(),
  };
  console.table ? console.table(r) : console.log(r);
  return r;
}

export function installBattlePerfProbe20261012() {
  if (globalThis[FLAG]) return;
  globalThis[FLAG] = true;

  // 1) FPS 采样
  const tick = (now) => {
    if (state.lastAt) {
      const dt = now - state.lastAt;
      if (dt > 0 && dt < 1000) {
        state.frames.push(dt);
        if (state.frames.length > 300) state.frames.shift();
        if (dt > 33) state.slowFrames += 1;
      }
    }
    state.lastAt = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // 2) 给渲染器 draw 计时（只包裹一次；即使渲染器类之后被替换，也会在下面兜住）
  const patch = async () => {
    try {
      const mod = await import('../battle/BattleRenderer.js');
      const proto = mod?.BattleRenderer?.prototype;
      if (!proto || proto.__perfProbed) return false;
      const original = proto.draw;
      if (typeof original !== 'function') return false;
      proto.draw = function drawWithPerfProbe(...args) {
        const t0 = performance.now();
        try {
          return original.apply(this, args);
        } finally {
          const dt = performance.now() - t0;
          state.drawMs.push(dt);
          if (state.drawMs.length > 300) state.drawMs.shift();
          if (dt > state.maxDrawMs) state.maxDrawMs = dt;
        }
      };
      proto.__perfProbed = true;
      state.hookInstalled = true;
      return true;
    } catch {
      return false;
    }
  };
  patch().then((ok) => {
    console.info(`[clbwz:perf] 探针已安装（渲染计时${ok ? '已' : '未'}挂钩）· 随时敲 __clbwzPerf() 取快照`);
  });

  // 3) 每 3 秒汇总一次（只在战斗中，避免刷屏）
  setInterval(() => {
    if (!battleView()?.engine) return;
    if (!state.frames.length) return;
    const r = perfReport();
    console.info(
      `[clbwz:perf] FPS 平均 ${r.FPS_平均} / 最差1% ${r.FPS_最低1percent} · `
      + `绘制 平均 ${r.绘制_平均ms}ms p95 ${r.绘制_p95ms}ms · `
      + `单位 ${r.存活单位}/${r.单位总数} · 特效 ${r.特效} · 弹幕 ${r.弹幕} · 掉帧 ${r.掉帧数_超过33ms}`,
    );
  }, 3000);

  globalThis.__clbwzPerf = perfReport;
  console.info('[clbwz:perf] 用法：打一局痴情的多特 → 卡的时候敲 __clbwzPerf() 把输出发给助手');
}
