import { BattleEngine } from '../battle/BattleEngine.js';
import { BattleRenderer } from '../battle/BattleRenderer.js';
import { BattleView } from './BattleView.js';
import {
  COLS,
  LANES,
  cellCenterY,
  fracColToCenterX,
} from '../battle/BattleConfig.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battlefieldRuntimeAuditFix');
const TRANSPARENT_DRAG_CANVAS = document.createElement('canvas');
TRANSPARENT_DRAG_CANVAS.width = 1;
TRANSPARENT_DRAG_CANVAS.height = 1;
TRANSPARENT_DRAG_CANVAS.setAttribute('aria-hidden', 'true');
TRANSPARENT_DRAG_CANVAS.style.cssText = [
  'position:fixed',
  'left:-8px',
  'top:-8px',
  'width:1px',
  'height:1px',
  'opacity:0',
  'pointer-events:none',
  'z-index:-1',
].join(';');

function ensureTransparentDragCanvas() {
  if (!TRANSPARENT_DRAG_CANVAS.isConnected && document.body) {
    document.body.appendChild(TRANSPARENT_DRAG_CANVAS);
  }
}

function isBattleHandDrag(event) {
  const target = event.target instanceof Element ? event.target : null;
  return Boolean(target?.closest('#hand [data-hand-idx]'));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function effectColor(kind) {
  const key = String(kind ?? '').toLowerCase();
  if (key.includes('heal') || key.includes('revival') || key.includes('buff')) {
    return { main: '#8ff58d', glow: 'rgba(125,255,155,.72)' };
  }
  if (key.includes('freeze') || key.includes('ice')) {
    return { main: '#9deaff', glow: 'rgba(78,202,255,.78)' };
  }
  if (key.includes('thunder') || key.includes('lightning')) {
    return { main: '#fff37a', glow: 'rgba(126,183,255,.88)' };
  }
  if (key.includes('poison') || key.includes('curse')) {
    return { main: '#d88cff', glow: 'rgba(106,255,137,.70)' };
  }
  if (key.includes('fire') || key.includes('meteor') || key.includes('damage')) {
    return { main: '#ffb14a', glow: 'rgba(255,74,53,.78)' };
  }
  return { main: '#fff5aa', glow: 'rgba(255,255,255,.70)' };
}

function pushRuntimeEffect(engine, effect) {
  engine._battleVisualEffects ??= [];
  const now = Number(engine.time) || 0;
  const lane = Math.max(0, Math.min(LANES - 1, Number(effect.lane) || 0));
  const col = Math.max(-1, Math.min(COLS, Number(effect.col) || 0));
  const life = Math.max(0.18, Number(effect.life) || 0.38);
  engine._battleVisualEffects.push({
    ...effect,
    lane,
    col,
    life,
    maxLife: life,
    bornAt: now,
    seed: Math.random() * Math.PI * 2,
  });
  if (engine._battleVisualEffects.length > 160) {
    engine._battleVisualEffects.splice(0, engine._battleVisualEffects.length - 160);
  }
}

function drawSkillEffect(ctx, effect, progress, color) {
  const x = fracColToCenterX(effect.col);
  const y = cellCenterY(effect.lane);
  const radiusCells = Math.max(0.55, Number(effect.radius) || 0.8);
  const radius = 22 + radiusCells * 31 + Math.sin(progress * Math.PI) * 18;
  const alpha = Math.max(0, 1 - progress * 0.86);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color.main;
  ctx.fillStyle = color.glow;
  ctx.shadowColor = color.glow;
  ctx.shadowBlur = 22;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.globalAlpha = alpha * 0.85;
  ctx.lineWidth = 2;
  for (let index = 0; index < 3; index += 1) {
    const ring = radius * (0.35 + index * 0.24 + progress * 0.12);
    ctx.beginPath();
    ctx.arc(x, y, ring, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRuntimeEffects(renderer, engine) {
  const effects = engine?._battleVisualEffects ?? [];
  if (!effects.length) return;
  const ctx = renderer.ctx;
  for (const effect of effects) {
    const progress = 1 - clamp01(effect.life / Math.max(0.001, effect.maxLife));
    const color = effectColor(effect.effectKind ?? effect.kind);
    // 用户已要求移除攻击/受击/治疗命中的小圈圈点特效，不再绘制 hit/heal。
    if (effect.kind === 'hit' || effect.kind === 'heal') continue;
    drawSkillEffect(ctx, effect, progress, color);
  }
}

export function installBattlefieldRuntimeAuditFix() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;
  ensureTransparentDragCanvas();

  /*
   * 旧实现用 Math.round(col) 搜索目标，移动近战会停在相邻格边界，
   * 但 melee range=0.5 的整数循环一次都不执行。改为连续坐标距离判定。
   */
  BattleEngine.prototype.getEnemiesInLane = function getEnemiesInLaneContinuous(unit, lane) {
    const direction = unit.team === 'player' ? 1 : -1;
    const ranged = Boolean(unit.isRanged?.());
    const maxDistance = ranged
      ? Math.max(1, Number(unit.range) || 1)
      : 1.08;
    const rearTolerance = ranged ? 0.12 : 0.22;

    return this.units
      .filter((candidate) => {
        if (!candidate?.alive || candidate.lane !== lane) return false;
        if (!this.isValidEnemyTarget(unit, candidate)) return false;
        const signedDistance = direction * (candidate.col - unit.col);
        return signedDistance >= -rearTolerance && signedDistance <= maxDistance + 0.08;
      })
      .map((candidate) => ({
        unit: candidate,
        dist: Math.abs(candidate.col - unit.col),
      }));
  };

  const originalSpawnFloat = BattleEngine.prototype.spawnFloat;
  BattleEngine.prototype.spawnFloat = function spawnFloatWithImpact(lane, col, amount) {
    const result = originalSpawnFloat.call(this, lane, col, amount);
    const numeric = Number(amount) || 0;
    if (numeric !== 0) {
      this._runtimeFxThrottle ??= new Map();
      const kind = numeric > 0 ? 'heal' : 'hit';
      const key = `${kind}:${Math.round(lane)}:${Math.round(col * 2)}`;
      const now = Number(this.time) || 0;
      const previous = this._runtimeFxThrottle.get(key) ?? -99;
      if (now - previous >= 0.07) {
        this._runtimeFxThrottle.set(key, now);
        pushRuntimeEffect(this, { kind, lane, col, life: kind === 'heal' ? 0.48 : 0.34 });
      }
    }
    return result;
  };

  const originalPushSkillEffect = BattleEngine.prototype.pushSkillEffect;
  BattleEngine.prototype.pushSkillEffect = function pushVisibleSkillEffect(
    kind,
    target,
    radius = 0,
    skillId = null,
    duration = 0.9,
  ) {
    originalPushSkillEffect?.call(this, kind, target, radius, skillId, duration);
    const fallbackTarget = target ?? { lane: 2, col: 5.5 };
    pushRuntimeEffect(this, {
      kind: 'skill',
      effectKind: kind,
      skillId,
      lane: fallbackTarget.lane ?? 2,
      col: fallbackTarget.col ?? 5.5,
      radius,
      life: Math.min(1.45, Math.max(0.62, Number(duration) * 0.35 || 0.9)),
    });
  };

  const originalUpdateFloats = BattleEngine.prototype.updateFloats;
  BattleEngine.prototype.updateFloats = function updateFloatsAndEffects(dt) {
    const result = originalUpdateFloats.call(this, dt);
    for (const effect of this._battleVisualEffects ?? []) effect.life -= dt;
    this._battleVisualEffects = (this._battleVisualEffects ?? []).filter(
      (effect) => effect.life > 0,
    );
    return result;
  };

  const originalRendererDraw = BattleRenderer.prototype.draw;
  BattleRenderer.prototype.draw = function drawWithRuntimeEffects(engine) {
    const result = originalRendererDraw.call(this, engine);
    drawRuntimeEffects(this, engine);
    return result;
  };

  /* 最后一层覆盖所有旧 dragstart 设置，彻底移除浏览器复制框/小加号。 */
  document.addEventListener('dragstart', (event) => {
    if (!isBattleHandDrag(event)) return;
    ensureTransparentDragCanvas();
    try {
      event.dataTransfer?.setDragImage(TRANSPARENT_DRAG_CANVAS, 0, 0);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    } catch {
      // 浏览器不支持时保留自定义 drag-ghost，不影响部署逻辑。
    }
  });

  /* 旧监听器先把预览吸附到格子中心；本监听器最后执行，恢复为鼠标跟随。 */
  document.addEventListener('dragover', (event) => {
    if (!document.body.classList.contains('battle-immersive')) return;
    const ghost = document.querySelector('#drag-ghost:not(.hidden)');
    if (!(ghost instanceof HTMLElement)) return;
    ghost.style.left = `${event.clientX + 14}px`;
    ghost.style.top = `${event.clientY - 18}px`;
  });

  const originalRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderBattleAudited(root) {
    const result = await originalRenderBattle.call(this, root);
    root.querySelector('.game-container')?.classList.add('battlefield-runtime-audited');
    root.querySelector('#hand')?.classList.add('battle-hand-large');
    return result;
  };

  window.__battlefieldRuntimeAudit = () => {
    const wrap = document.querySelector('.battlefield-wrap');
    const hand = document.querySelector('#hand');
    const ghost = document.querySelector('#drag-ghost');
    return {
      battlefield: wrap?.getBoundingClientRect?.() ?? null,
      hand: hand?.getBoundingClientRect?.() ?? null,
      ghost: ghost?.getBoundingClientRect?.() ?? null,
      cardJsonOnly: true,
      continuousMeleeTargeting: true,
      transparentNativeDragImage: TRANSPARENT_DRAG_CANVAS.isConnected,
    };
  };
}
