/**
 * 2026-09-11：设置页新增开关的运行时接线（BGM 分场景 / 伤害数字 / 血条）。
 *
 * 设计原则：设置页只负责写 GameSettingsStore，这里的补丁在**读取时刻**判断开关，
 * 所以改完立即生效，不需要重开战斗或刷新页面。
 *
 * 接线点（都是真实存在的实现，不是摆设）：
 *   - AudioManager.playBgm      → BGM 总开关 + 主城/房间/战斗分场景开关
 *   - BattleUnit.takeDamage     → 记录伤害数值（只记录，不改变战斗逻辑与返回值）
 *   - BattleRenderer.drawUnitUi → 在单位上方把伤害数字画出来（用 layout 的屏幕坐标）
 *   - BattleRenderer.drawUnitUi / BattleUnitPresentation 里的血条 → 由 shouldDrawUnitHpBar() 控制
 */
import { audio } from '../core/AudioManager.js';
import { BattleUnit } from '../battle/BattleUnit.js';
import { BattleEngine } from '../battle/BattleEngine.js';
import { BattleRenderer } from '../battle/BattleRenderer.js';
import { CELL_H, CELL_W, cellCenterY, formatBattleAmount, fracColToCenterX } from '../battle/BattleConfig.js';
import { bgmAllowedFor, shouldShowDamageNumbers } from '../core/BattleClientFlags20260910.js';

const PATCH_FLAG = Symbol.for('clbwz.battleDisplayRuntime20260911');
/** 伤害数字存活时长（毫秒）。PvP 走服务端时间线，用本地时钟更稳。 */
const POP_MS = 900;
/** 单个单位同时最多保留的数字个数，防止刷屏。 */
const POP_LIMIT = 6;
/** 挂在单位身上的伤害数字字段 */
const POP_FIELD = '__damagePops20260911';
/** 单位被瞬间消除时，把它的伤害数字搬到这里继续画（引擎级，脱离单位生命周期） */
const ORPHAN_FIELD = '__orphanDamagePops20260911';

function nowMs() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

function installBgmGate() {
  const previousPlayBgm = audio.playBgm.bind(audio);
  audio.playBgm = function playBgmWithSceneFlags(key, options) {
    // 场景被关掉时不播放，并清掉「期望曲目」，避免手势解锁后又自动放起来。
    if (!bgmAllowedFor(key)) {
      this.desiredBgmKey = null;
      if (this.bgmKey === key) this.stopBgm();
      return undefined;
    }
    return previousPlayBgm(key, options);
  };
  audio.__playBgmWithoutFlags20260911 = previousPlayBgm;
}

/** 画一个伤害数字（单位身上 / 引擎级孤儿队列共用同一套样式）。返回是否还活着。 */
function drawDamagePop(ctx, pop, cx, topY, cellW, time) {
  const age = time - pop.at;
  if (!(age >= 0) || age >= POP_MS) return false;
  const progress = age / POP_MS;
  const y = topY + 2 - progress * 18;
  const alpha = progress < 0.75 ? 1 : 1 - (progress - 0.75) / 0.25;
  const size = Math.max(11, Math.round((cellW ?? 40) * 0.34));
  // 2026-09-12：不四舍五入 —— 剩余血量是小数（例如 3.2）时显示 -3.2
  const text = `-${formatBattleAmount(Math.abs(pop.amount))}`;
  ctx.font = `bold ${size}px "Microsoft YaHei", sans-serif`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = `rgba(24, 12, 0, ${0.85 * alpha})`;
  ctx.strokeText(text, cx, y);
  ctx.fillStyle = pop.crit ? `rgba(255, 236, 120, ${alpha})` : `rgba(255, 122, 110, ${alpha})`;
  ctx.fillText(text, cx, y);
  return true;
}

/**
 * 单位被"瞬间消除"（没有死亡动画）时，把挂在它身上的伤害数字搬到引擎级队列。
 * 否则这个单位下一帧就不在 engine.units 里了，drawUnitUi 不会被调用，致命一击的数字
 * 就再也画不出来（用户 2026-09-12 反馈的问题）。
 */
function rescueDamagePops(engine, unit) {
  const pops = unit?.[POP_FIELD];
  if (!pops?.length) return;
  // 尸体窗口够数字飘完（≥ POP_MS）→ 照旧由 drawUnitUi 逐单位绘制。
  // 窗口太短（瞬间消除 = 0 秒 / 冻结死亡 = 0.16 秒）→ 搬到引擎级队列，否则数字会随单位一起消失。
  const remainingMs = (Number(unit._deathUntil) - Number(engine?.time ?? 0)) * 1000;
  if (Number.isFinite(remainingMs) && remainingMs >= POP_MS) return;
  const orphans = engine[ORPHAN_FIELD] ?? (engine[ORPHAN_FIELD] = []);
  for (const pop of pops) {
    orphans.push({ amount: pop.amount, at: pop.at, crit: pop.crit, lane: unit.lane, col: unit.col });
  }
  if (orphans.length > POP_LIMIT * 4) orphans.splice(0, orphans.length - POP_LIMIT * 4);
  delete unit[POP_FIELD];
}

function installDamageNumbers() {
  const previousTakeDamage = BattleUnit.prototype.takeDamage;
  BattleUnit.prototype.takeDamage = function takeDamageWithPop20260911(amount, now = 0) {
    const dealt = previousTakeDamage.call(this, amount, now);
    // 2026-09-11：显示实际扣掉的血量（致死后不再是溢出的 -500），
    // 不影响扣血结果与 takeDamage/applyCardHit 的返回值。
    const recorded = Number(this.lastDamageDealt);
    const shown = Number.isFinite(recorded) && recorded > 0 ? recorded : dealt;
    if (shown > 0 && shouldShowDamageNumbers()) {
      const pops = this[POP_FIELD] ?? (this[POP_FIELD] = []);
      pops.push({ amount: shown, at: nowMs() });
      if (pops.length > POP_LIMIT) pops.splice(0, pops.length - POP_LIMIT);
    }
    return dealt;
  };

  // 死亡结算时立刻把数字搬走（此时单位还在 units 里，之后才会被过滤掉）。
  const previousOnUnitDeath = BattleEngine.prototype.onUnitDeath;
  BattleEngine.prototype.onUnitDeath = function onUnitDeathKeepingDamageNumbers20260912(unit, ...args) {
    const result = previousOnUnitDeath.apply(this, [unit, ...args]);
    rescueDamagePops(this, unit);
    return result;
  };

  const previousDrawUnitUi = BattleRenderer.prototype.drawUnitUi;
  BattleRenderer.prototype.drawUnitUi = function drawUnitUiWithDamageNumbers20260911(ctx, unit, layout, engine) {
    const result = previousDrawUnitUi.call(this, ctx, unit, layout, engine);
    const pops = unit?.[POP_FIELD];
    if (!pops?.length || !shouldShowDamageNumbers()) return result;
    const time = nowMs();
    const alive = [];
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const pop of pops) {
      if (drawDamagePop(ctx, pop, layout.cx, layout.cellTop, layout.cellW, time)) alive.push(pop);
    }
    ctx.restore();
    if (alive.length) unit[POP_FIELD] = alive;
    else delete unit[POP_FIELD];
    return result;
  };

  // 引擎级伤害数字（来自被瞬间消除的单位）：位置只依赖 lane/col，不依赖单位是否存在。
  const previousDrawFloats = BattleRenderer.prototype.drawFloats;
  BattleRenderer.prototype.drawFloats = function drawFloatsWithOrphanDamageNumbers20260912(ctx, engine) {
    const result = previousDrawFloats.call(this, ctx, engine);
    const orphans = engine?.[ORPHAN_FIELD];
    if (!orphans?.length) return result;
    if (!shouldShowDamageNumbers()) {
      delete engine[ORPHAN_FIELD];
      return result;
    }
    const time = nowMs();
    const alive = [];
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const pop of orphans) {
      const cx = fracColToCenterX(pop.col);
      const topY = cellCenterY(pop.lane) - CELL_H / 2;
      if (drawDamagePop(ctx, pop, cx, topY, CELL_W, time)) alive.push(pop);
    }
    ctx.restore();
    if (alive.length) engine[ORPHAN_FIELD] = alive;
    else delete engine[ORPHAN_FIELD];
    return result;
  };
}

/** 开关切换后需要立即反应的动作（当前只有 BGM：关掉正在放的那首）。 */
export function syncBattleDisplayRuntime() {
  const currentKey = audio.getBgmKey?.();
  if (currentKey && !bgmAllowedFor(currentKey)) audio.stopBgm();
}

export function installBattleDisplayRuntime20260911() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;
  installBgmGate();
  installDamageNumbers();
}
