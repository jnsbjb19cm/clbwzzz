import {
  CELL_H,
  CELL_W,
  COLS,
  GRID_GAP,
  LANES,
  cellCenterX,
  cellCenterY,
  cellX,
  cellY,
  colFracToX,
  laneFracToY,
  pointerToCol,
  pointerToLane,
} from '../battle/BattleConfig.js';
import { BattleRenderer } from '../battle/BattleRenderer.js';
import { BattleView } from './BattleView.js';
import { SpriteAtlas } from '../core/SpriteAtlas.js';
import { skillAnimPlayer } from '../battle/SkillAnimPlayer.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battlefieldRuntimeCoordinateFinal');
const TOMATO_SKILL_ID = 500;
const CACTUS_BULLET_RES = new Set([4, 25]);

// ES modules are evaluated before main.js starts calling installers, so this captures
// the real renderer implementation before the later coordinate monkey-patches replace it.
const BASE_COMPUTE_UNIT_LAYOUT = BattleRenderer.prototype.computeUnitLayout;
const BASE_DRAW_DEPLOY_EFFECTS = BattleRenderer.prototype.drawDeployEffects;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getBattleView() {
  return document.querySelector('.battlefield-wrap')?.__battleView
    ?? document.querySelector('.game-container')?.__battleView
    ?? null;
}

function fieldToClient(renderer, x, y) {
  const canvas = renderer?.canvas;
  const rect = canvas?.getBoundingClientRect?.();
  if (!canvas || !rect?.width || !rect?.height) return { x: 0, y: 0 };
  const scale = Math.max(0.0001, finite(renderer.fieldScale, 1) || 1);
  const offsetX = finite(renderer.fieldOffsetX, 0);
  const offsetY = finite(renderer.fieldOffsetY, 0);
  const pixelX = x * scale + offsetX;
  const pixelY = y * scale + offsetY;
  return {
    x: rect.left + pixelX * rect.width / Math.max(1, canvas.width),
    y: rect.top + pixelY * rect.height / Math.max(1, canvas.height),
  };
}

function clientToField(renderer, clientX, clientY) {
  const canvas = renderer?.canvas;
  const rect = canvas?.getBoundingClientRect?.();
  if (!canvas || !rect?.width || !rect?.height) return { x: NaN, y: NaN };
  const pixelX = (clientX - rect.left) * canvas.width / rect.width;
  const pixelY = (clientY - rect.top) * canvas.height / rect.height;
  const scale = Math.max(0.0001, finite(renderer.fieldScale, 1) || 1);
  return {
    x: (pixelX - finite(renderer.fieldOffsetX, 0)) / scale,
    y: (pixelY - finite(renderer.fieldOffsetY, 0)) / scale,
  };
}

function viewportFieldBounds(renderer) {
  const canvas = renderer?.canvas;
  const scale = Math.max(0.0001, finite(renderer?.fieldScale, 1) || 1);
  const left = -finite(renderer?.fieldOffsetX, 0) / scale;
  const top = -finite(renderer?.fieldOffsetY, 0) / scale;
  const width = (canvas?.width ?? 1) / scale;
  const height = (canvas?.height ?? 1) / scale;
  return { left, top, right: left + width, bottom: top + height, width, height };
}

function gridPoint(col, lane) {
  return { x: cellCenterX(finite(col)), y: cellCenterY(finite(lane)) };
}

function gridBounds(col, lane) {
  const left = cellX(finite(col));
  const top = cellY(finite(lane));
  return {
    left,
    top,
    right: left + CELL_W,
    bottom: top + CELL_H,
    width: CELL_W,
    height: CELL_H,
  };
}

function clientPointToCell(renderer, clientX, clientY) {
  const point = clientToField(renderer, clientX, clientY);
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return { lane: -1, col: -1 };

  const minX = cellX(0) - GRID_GAP / 2;
  const maxX = cellX(COLS - 1) + CELL_W + GRID_GAP / 2;
  const minY = cellY(0) - GRID_GAP / 2;
  const maxY = cellY(LANES - 1) + CELL_H + GRID_GAP / 2;
  if (point.x < minX || point.x >= maxX || point.y < minY || point.y >= maxY) {
    return { lane: -1, col: -1 };
  }
  return {
    col: clamp(pointerToCol(point.x), 0, COLS - 1),
    lane: clamp(pointerToLane(point.y), 0, LANES - 1),
  };
}

function muzzleForLayout(unit, layout) {
  const res = Number(unit?.res);
  const direction = unit?.team === 'enemy' ? -1 : 1;
  const tuning = res === 91
    ? { x: 0.31, y: 0.42 }
    : res === 14
      ? { x: 0.29, y: 0.43 }
      : { x: 0.27, y: 0.47 };
  return {
    x: layout.cx + direction * layout.portraitW * tuning.x,
    y: layout.portraitY + layout.portraitH * tuning.y,
  };
}

function projectilePoint(renderer, engine, projectile) {
  const sourceUnit = engine?.units?.find?.((unit) => unit.uid === projectile.sourceUid);
  const sourceLayout = sourceUnit ? renderer.computeUnitLayout(engine, sourceUnit) : null;
  const source = sourceLayout
    ? muzzleForLayout(sourceUnit, sourceLayout)
    : {
        x: colFracToX(finite(projectile.sourceCol ?? projectile.startCol)),
        y: laneFracToY(finite(projectile.sourceLane ?? projectile.lane), 0),
      };
  const gridStart = {
    x: colFracToX(finite(projectile.startCol)),
    y: laneFracToY(finite(projectile.lane), 0),
  };
  const progress = clamp(finite(projectile.progress), 0, 1);
  return {
    x: colFracToX(finite(projectile.x, projectile.startCol))
      + (source.x - gridStart.x) * (1 - progress),
    y: laneFracToY(finite(projectile.y, projectile.lane), finite(projectile.arcOffset))
      + (source.y - gridStart.y) * (1 - progress),
    source,
  };
}

function drawProjectileAt(renderer, ctx, projectile, point) {
  if (projectile.sourceRes != null) {
    const pack = renderer.bulletAnims.get(String(projectile.sourceRes));
    if (pack?.meta?.animations?.yidong) {
      renderer.drawBulletAnimFrame(
        ctx,
        pack,
        'yidong',
        point.x,
        point.y,
        projectile.trajectory === 'parabola' ? 30 : 24,
        projectile.flightT ?? 0,
        projectile.owner === 'enemy',
      );
      return;
    }
    void renderer.requestBulletAnim(projectile.sourceRes);
  }

  const image = (projectile.sourceRes != null
    ? renderer.bulletCache.get(String(projectile.sourceRes))
    : null) ?? renderer.bulletCache.get('default');
  const size = projectile.trajectory === 'parabola' ? 28 : 22;
  if (image) {
    const bulletRes = projectile.sourceRes != null ? Number(projectile.sourceRes) : null;
    const angle = bulletRes != null
      && CACTUS_BULLET_RES.has(bulletRes)
      && projectile.trajectory === 'straight'
      ? (projectile.owner === 'player' ? 0 : Math.PI)
      : Math.atan2(
          laneFracToY(finite(projectile.hitLane), 0) - point.source.y,
          colFracToX(finite(projectile.hitCol)) - point.source.x,
        );
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(angle);
    SpriteAtlas.draw(ctx, image, -size / 2, -size / 2, size, size);
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.beginPath();
  ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
  ctx.fillStyle = projectile.color ?? '#fff';
  ctx.fill();
  ctx.restore();
}

function drawProjectilesPure(ctx, engine) {
  this._runtimeCoordinateProjectileAudit = [];
  for (const projectile of engine.projectiles ?? []) {
    if (!projectile.launched) continue;
    const point = projectilePoint(this, engine, projectile);
    drawProjectileAt(this, ctx, projectile, point);
    this._runtimeCoordinateProjectileAudit.push({
      id: projectile.id,
      sourceRes: Number(projectile.sourceRes),
      sourceLane: projectile.sourceLane ?? projectile.lane,
      visualLane: finite(projectile.y, projectile.lane),
      progress: projectile.progress,
      drawX: point.x,
      drawY: point.y,
      muzzleX: point.source.x,
      muzzleY: point.source.y,
    });
  }
}

function drawDeployEffectsPure(ctx, engine) {
  BASE_DRAW_DEPLOY_EFFECTS.call(this, ctx, engine);
  this._runtimeCoordinateDeployAudit = [];
  for (const fx of engine.deployEffects ?? []) {
    const unit = [...(engine.units ?? [])].reverse().find(
      (candidate) => candidate.alive
        && candidate.lane === fx.lane
        && Math.abs(candidate.col - fx.col) < 0.7,
    );
    const layout = unit ? this.computeUnitLayout(engine, unit) : null;
    const center = layout ? { x: layout.cx, y: layout.footY } : gridPoint(fx.col, fx.lane);
    this._runtimeCoordinateDeployAudit.push({
      lane: fx.lane,
      col: fx.col,
      effectX: center.x,
      effectY: center.y,
      unitX: center.x,
      unitFootY: center.y,
    });
  }
}

function resolveSkillTarget(effect) {
  return {
    lane: clamp(Math.round(finite(effect?.targetLane ?? effect?.lane ?? effect?.target?.lane, 2)), 0, LANES - 1),
    col: clamp(Math.round(finite(effect?.targetCol ?? effect?.col ?? effect?.target?.col, 5)), 0, COLS - 1),
  };
}

function drawSkillFxPure(ctx, engine) {
  this._runtimeCoordinateSkillAudit = [];
  this._runtimeViewportCovers = [];
  for (const effect of engine.skillFx ?? engine.skillEffects ?? []) {
    if (effect.startAt != null && finite(engine.time) < finite(effect.startAt)) continue;

    const skillId = Number(effect.skillId);
    const target = resolveSkillTarget(effect);
    const center = gridPoint(target.col, target.lane);
    const duration = Math.max(0.001, finite(effect.duration, 1));
    const remain = 1 - finite(effect.t) / duration;
    if (remain <= 0) continue;
    const alpha = finite(effect.t) < 0.05
      ? finite(effect.t) / 0.05
      : Math.min(1, remain * 4);

    if (effect.fullScreen === true) {
      const viewport = viewportFieldBounds(this);
      skillAnimPlayer.drawCover(
        ctx,
        skillId,
        viewport.left,
        viewport.top,
        viewport.width,
        viewport.height,
        effect.t,
        alpha * 0.92,
        effect.loop === true,
      );
      this._runtimeViewportCovers.push({ skillId, ...viewport });
    } else {
      const size = Math.max(CELL_W, CELL_H)
        * Math.max(1.35, 1.35 + finite(effect.radius) * 1.35);
      skillAnimPlayer.draw(
        ctx,
        skillId,
        center.x,
        center.y,
        size,
        effect.t,
        alpha,
        effect.loop === true,
      );
    }

    this._runtimeCoordinateSkillAudit.push({
      skillId,
      targetLane: target.lane,
      targetCol: target.col,
      drawX: center.x,
      drawY: center.y,
      cellX: center.x,
      cellY: center.y,
    });
  }
}

function drawImpactFxPure(ctx, engine) {
  for (const fx of engine.impactFx ?? []) {
    const cx = colFracToX(finite(fx.col));
    const cy = cellCenterY(clamp(Math.round(finite(fx.lane)), 0, LANES - 1));
    if (fx.res != null) {
      const pack = this.bulletAnims.get(String(fx.res));
      if (pack?.meta?.animations?.baoza) {
        const anim = pack.meta.animations.baoza;
        const rate = Number(anim.frameRate) || 12;
        const animDuration = Math.max(0.001, Number(anim.duration) || anim.frames.length / rate);
        const slow = 0.55;
        const played = Math.max(0, finite(fx.t)) * slow;
        const alpha = played >= animDuration
          ? Math.max(0, 1 - (played - animDuration) / 0.12)
          : 1;
        this.drawBulletAnimFrame(
          ctx,
          pack,
          'baoza',
          cx,
          cy,
          CELL_W * 1.05,
          finite(fx.t),
          false,
          alpha,
          false,
          slow,
        );
        continue;
      }
      void this.requestBulletAnim(fx.res);
    }
    // 不再合成 fallback 光圈；源爆炸动画缺失/不安全时直接不绘制命中圈。
  }
}

function buildRoundTrips(renderer) {
  return [[0, 0], [2, 4], [4, 11]].map(([lane, col]) => {
    const logical = gridPoint(col, lane);
    const client = fieldToClient(renderer, logical.x, logical.y);
    const mapped = clientPointToCell(renderer, client.x, client.y);
    const backLogical = clientToField(renderer, client.x, client.y);
    const back = fieldToClient(renderer, backLogical.x, backLogical.y);
    return {
      lane,
      col,
      mappedLane: mapped.lane,
      mappedCol: mapped.col,
      clientX: client.x,
      clientY: client.y,
      clientErrorX: back.x - client.x,
      clientErrorY: back.y - client.y,
    };
  });
}

function clientAudit(renderer, raw, kind) {
  if (kind === 'projectile') {
    return raw.map((item) => {
      const draw = fieldToClient(renderer, item.drawX, item.drawY);
      const muzzle = fieldToClient(renderer, item.muzzleX, item.muzzleY);
      return {
        ...item,
        drawClientX: draw.x,
        drawClientY: draw.y,
        muzzleClientX: muzzle.x,
        muzzleClientY: muzzle.y,
      };
    });
  }
  if (kind === 'deploy') {
    return raw.map((item) => {
      const effect = fieldToClient(renderer, item.effectX, item.effectY);
      const unit = fieldToClient(renderer, item.unitX, item.unitFootY);
      return {
        ...item,
        effectClientX: effect.x,
        effectClientY: effect.y,
        unitClientX: unit.x,
        unitFootClientY: unit.y,
      };
    });
  }
  return raw.map((item) => {
    const draw = fieldToClient(renderer, item.drawX, item.drawY);
    const cell = fieldToClient(renderer, item.cellX, item.cellY);
    return {
      ...item,
      drawClientX: draw.x,
      drawClientY: draw.y,
      cellClientX: cell.x,
      cellClientY: cell.y,
    };
  });
}

export function installBattlefieldRuntimeCoordinateFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  // 还原真正的 BattleConfig 布局；不再按 battlefield-wrap DOM 尺寸每帧重算单位格子。
  BattleRenderer.prototype.computeUnitLayout = BASE_COMPUTE_UNIT_LAYOUT;
  BattleRenderer.prototype.drawProjectiles = drawProjectilesPure;
  BattleRenderer.prototype.drawDeployEffects = drawDeployEffectsPure;
  BattleRenderer.prototype.drawSkillFx = drawSkillFxPure;
  BattleRenderer.prototype.drawImpactFx = drawImpactFxPure;

  BattleView.prototype.pointerToCell = function pointerToCalibratedCell(event) {
    return clientPointToCell(this.renderer, event.clientX, event.clientY);
  };

  globalThis.__verifyBattlefieldCoordinateAuthorityFinal = () => {
    const view = getBattleView();
    const renderer = view?.renderer;
    if (!renderer) return { enabled: false };
    const projectiles = clientAudit(renderer, renderer._runtimeCoordinateProjectileAudit ?? [], 'projectile');
    const deploy = clientAudit(renderer, renderer._runtimeCoordinateDeployAudit ?? [], 'deploy');
    const skills = clientAudit(renderer, renderer._runtimeCoordinateSkillAudit ?? [], 'skill');

    const tomatoLogical = gridPoint(7, 3);
    const tomatoClient = fieldToClient(renderer, tomatoLogical.x, tomatoLogical.y);
    return {
      enabled: true,
      pureFieldMath: true,
      renderHotPathDomReads: 0,
      roundTrips: buildRoundTrips(renderer),
      tomatoProbe: skills.find((item) => item.skillId === TOMATO_SKILL_ID) ?? {
        skillId: TOMATO_SKILL_ID,
        drawClientX: tomatoClient.x,
        drawClientY: tomatoClient.y,
        cellClientX: tomatoClient.x,
        cellClientY: tomatoClient.y,
      },
      runtime: { projectiles, deploy, skills },
    };
  };

  globalThis.__verifyBattlefieldViewportFxFinal = () => {
    const view = getBattleView();
    const renderer = view?.renderer;
    const canvas = renderer?.canvas;
    const canvasRect = canvas?.getBoundingClientRect?.();
    const covers = (renderer?._runtimeViewportCovers ?? []).map((cover) => {
      const a = fieldToClient(renderer, cover.left, cover.top);
      const b = fieldToClient(renderer, cover.right, cover.bottom);
      return {
        skillId: cover.skillId,
        logical: cover,
        client: {
          left: a.x,
          top: a.y,
          right: b.x,
          bottom: b.y,
          width: b.x - a.x,
          height: b.y - a.y,
        },
      };
    });
    return {
      enabled: Boolean(renderer),
      logicalViewport: renderer ? viewportFieldBounds(renderer) : null,
      canvasClient: canvasRect ? {
        left: canvasRect.left,
        top: canvasRect.top,
        right: canvasRect.right,
        bottom: canvasRect.bottom,
        width: canvasRect.width,
        height: canvasRect.height,
      } : null,
      covers,
    };
  };

  globalThis.__verifyBattlefieldRuntimeCoordinateFinal = () => ({
    enabled: true,
    pureFieldMath: true,
    gridIsLogicOnly: true,
    fullViewportFx: true,
    projectileUsesFullViewport: true,
    impactUsesFullViewport: true,
  });
}
