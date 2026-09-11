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
import { BattleRenderer } from '../battle/BattleRenderer.js';
import { bgmAllowedFor, shouldShowDamageNumbers } from '../core/BattleClientFlags20260910.js';

const PATCH_FLAG = Symbol.for('clbwz.battleDisplayRuntime20260911');
/** 伤害数字存活时长（毫秒）。PvP 走服务端时间线，用本地时钟更稳。 */
const POP_MS = 900;
/** 单个单位同时最多保留的数字个数，防止刷屏。 */
const POP_LIMIT = 6;

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

function installDamageNumbers() {
  const previousTakeDamage = BattleUnit.prototype.takeDamage;
  BattleUnit.prototype.takeDamage = function takeDamageWithPop20260911(amount, now = 0) {
    const dealt = previousTakeDamage.call(this, amount, now);
    // 2026-09-11：显示实际扣掉的血量（致死后不再是溢出的 -500），
    // 不影响扣血结果与 takeDamage/applyCardHit 的返回值。
    const recorded = Number(this.lastDamageDealt);
    const shown = Number.isFinite(recorded) && recorded > 0 ? recorded : dealt;
    if (shown > 0 && shouldShowDamageNumbers()) {
      const pops = this.__damagePops20260911 ?? (this.__damagePops20260911 = []);
      pops.push({ amount: shown, at: nowMs() });
      if (pops.length > POP_LIMIT) pops.splice(0, pops.length - POP_LIMIT);
    }
    return dealt;
  };

  const previousDrawUnitUi = BattleRenderer.prototype.drawUnitUi;
  BattleRenderer.prototype.drawUnitUi = function drawUnitUiWithDamageNumbers20260911(ctx, unit, layout, engine) {
    const result = previousDrawUnitUi.call(this, ctx, unit, layout, engine);
    const pops = unit?.__damagePops20260911;
    if (!pops?.length || !shouldShowDamageNumbers()) return result;
    const time = nowMs();
    const alive = [];
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const pop of pops) {
      const age = time - pop.at;
      if (age >= POP_MS) continue;
      alive.push(pop);
      const progress = age / POP_MS;
      const x = layout.cx;
      const y = layout.cellTop + 2 - progress * 18;
      const alpha = progress < 0.75 ? 1 : 1 - (progress - 0.75) / 0.25;
      const size = Math.max(11, Math.round((layout.cellW ?? 40) * 0.34));
      ctx.font = `bold ${size}px "Microsoft YaHei", sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = `rgba(24, 12, 0, ${0.85 * alpha})`;
      ctx.strokeText(`-${Math.round(pop.amount)}`, x, y);
      ctx.fillStyle = pop.crit ? `rgba(255, 236, 120, ${alpha})` : `rgba(255, 122, 110, ${alpha})`;
      ctx.fillText(`-${Math.round(pop.amount)}`, x, y);
    }
    ctx.restore();
    if (alive.length) unit.__damagePops20260911 = alive;
    else delete unit.__damagePops20260911;
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
