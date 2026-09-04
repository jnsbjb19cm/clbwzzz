import { BattleRenderer } from '../battle/BattleRenderer.js';
import { BattleView } from './BattleView.js';
import { SpriteAtlas } from '../core/SpriteAtlas.js';
import { skillAnimPlayer } from '../battle/SkillAnimPlayer.js';
import skillPosData from '../data/skillPosition.json' with { type: 'json' };

const PATCH_FLAG = Symbol.for('clbwzzz.battlefieldVisibleGridMapFinal');
const COLS = 12;
const LANES = 5;
const CACTUS_BULLET_RES = new Set([4, 25]);
const TOMATO_SKILL_ID = 500;

const SKILL_POSITION = new Map();
for (const row of skillPosData ?? []) {
  if (row?.position != null) SKILL_POSITION.set(Number(row.cardId), Number(row.position));
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getView() {
  return document.querySelector('.battlefield-wrap')?.__battleView
    ?? document.querySelector('.game-container')?.__battleView
    ?? globalThis.__activeBattleWorldView
    ?? globalThis.__pvpFixtureBattle
    ?? null;
}

function clientToField(renderer, clientX, clientY, canvasRect = null) {
  const canvas = renderer?.canvas;
  const rect = canvasRect ?? canvas?.getBoundingClientRect?.();
  if (!canvas || !rect?.width || !rect?.height) return { x: NaN, y: NaN };
  const pixelX = (clientX - rect.left) * canvas.width / rect.width;
  const pixelY = (clientY - rect.top) * canvas.height / rect.height;
  const scale = Math.max(0.0001, finite(renderer.fieldScale, 1) || 1);
  return {
    x: (pixelX - finite(renderer.fieldOffsetX, 0)) / scale,
    y: (pixelY - finite(renderer.fieldOffsetY, 0)) / scale,
  };
}

function fieldToClient(renderer, x, y) {
  const canvas = renderer?.canvas;
  const rect = canvas?.getBoundingClientRect?.();
  if (!canvas || !rect?.width || !rect?.height) return { x: 0, y: 0 };
  const scale = Math.max(0.0001, finite(renderer.fieldScale, 1) || 1);
  const px = x * scale + finite(renderer.fieldOffsetX, 0);
  const py = y * scale + finite(renderer.fieldOffsetY, 0);
  return {
    x: rect.left + px * rect.width / Math.max(1, canvas.width),
    y: rect.top + py * rect.height / Math.max(1, canvas.height),
  };
}

function viewportFieldBounds(renderer) {
  const canvas = renderer?.canvas;
  const scale = Math.max(0.0001, finite(renderer?.fieldScale, 1) || 1);
  const left = -finite(renderer?.fieldOffsetX, 0) / scale;
  const top = -finite(renderer?.fieldOffsetY, 0) / scale;
  const width = Math.max(1, finite(canvas?.width, 1)) / scale;
  const height = Math.max(1, finite(canvas?.height, 1)) / scale;
  return { left, top, width, height, right: left + width, bottom: top + height };
}

function withMeasurableGrid(overlay, fn) {
  const hidden = overlay.classList.contains('hidden');
  const prev = {
    display: overlay.style.getPropertyValue('display'),
    displayPriority: overlay.style.getPropertyPriority('display'),
    visibility: overlay.style.getPropertyValue('visibility'),
    visibilityPriority: overlay.style.getPropertyPriority('visibility'),
    pointerEvents: overlay.style.getPropertyValue('pointer-events'),
    pointerEventsPriority: overlay.style.getPropertyPriority('pointer-events'),
  };
  if (hidden) {
    overlay.style.setProperty('display', 'grid', 'important');
    overlay.style.setProperty('visibility', 'hidden', 'important');
    overlay.style.setProperty('pointer-events', 'none', 'important');
  }
  try {
    return fn();
  } finally {
    if (hidden) {
      const restore = (name, value, priority) => {
        if (value) overlay.style.setProperty(name, value, priority);
        else overlay.style.removeProperty(name);
      };
      restore('display', prev.display, prev.displayPriority);
      restore('visibility', prev.visibility, prev.visibilityPriority);
      restore('pointer-events', prev.pointerEvents, prev.pointerEventsPriority);
    }
  }
}

function cacheVisibleGrid(view, root = view?.viewRoot) {
  const renderer = view?.renderer;
  const canvas = renderer?.canvas;
  const overlay = root?.querySelector?.('#place-grid-overlay')
    ?? document.querySelector('#place-grid-overlay');
  if (!renderer || !canvas || !overlay) return null;

  return withMeasurableGrid(overlay, () => {
    const c00 = overlay.querySelector('.place-grid-cell[data-lane="0"][data-col="0"]');
    const c01 = overlay.querySelector('.place-grid-cell[data-lane="0"][data-col="1"]');
    const c10 = overlay.querySelector('.place-grid-cell[data-lane="1"][data-col="0"]');
    const c411 = overlay.querySelector('.place-grid-cell[data-lane="4"][data-col="11"]');
    if (!c00 || !c01 || !c10 || !c411) return null;

    const canvasRect = canvas.getBoundingClientRect();
    const r00 = c00.getBoundingClientRect();
    const r01 = c01.getBoundingClientRect();
    const r10 = c10.getBoundingClientRect();
    const r411 = c411.getBoundingClientRect();
    if (![canvasRect, r00, r01, r10, r411].every((r) => r.width > 0 && r.height > 0)) return null;

    const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    const p00 = clientToField(renderer, center(r00).x, center(r00).y, canvasRect);
    const p01 = clientToField(renderer, center(r01).x, center(r01).y, canvasRect);
    const p10 = clientToField(renderer, center(r10).x, center(r10).y, canvasRect);
    const p411 = clientToField(renderer, center(r411).x, center(r411).y, canvasRect);
    const w0a = clientToField(renderer, r00.left, r00.top, canvasRect);
    const w0b = clientToField(renderer, r00.right, r00.bottom, canvasRect);

    const metrics = {
      x0: p00.x,
      y0: p00.y,
      stepX: p01.x - p00.x,
      stepY: p10.y - p00.y,
      cellW: Math.abs(w0b.x - w0a.x),
      cellH: Math.abs(w0b.y - w0a.y),
      lastX: p411.x,
      lastY: p411.y,
      measuredAt: performance.now(),
    };
    if (!(metrics.stepX > 0) || !(metrics.stepY > 0) || !(metrics.cellW > 0) || !(metrics.cellH > 0)) {
      return null;
    }
    renderer.battleVisualGrid = metrics;
    return metrics;
  });
}

function grid(renderer) {
  return renderer?.battleVisualGrid ?? null;
}

function gridX(renderer, col) {
  const g = grid(renderer);
  if (!g) return null;
  return g.x0 + g.stepX * finite(col);
}

function gridY(renderer, lane, arcOffset = 0) {
  const g = grid(renderer);
  if (!g) return null;
  return g.y0 + g.stepY * finite(lane) - finite(arcOffset) * g.cellH;
}

function gridPoint(renderer, col, lane, arcOffset = 0) {
  const x = gridX(renderer, col);
  const y = gridY(renderer, lane, arcOffset);
  return x == null || y == null ? null : { x, y };
}

function pointerToVisibleCell(renderer, clientX, clientY) {
  const g = grid(renderer);
  if (!g) return null;
  const point = clientToField(renderer, clientX, clientY);
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return { lane: -1, col: -1 };
  const colFloat = (point.x - g.x0) / g.stepX;
  const laneFloat = (point.y - g.y0) / g.stepY;
  if (colFloat < -0.5 || colFloat > COLS - 0.5 || laneFloat < -0.5 || laneFloat > LANES - 0.5) {
    return { lane: -1, col: -1 };
  }
  return {
    col: clamp(Math.round(colFloat), 0, COLS - 1),
    lane: clamp(Math.round(laneFloat), 0, LANES - 1),
  };
}

function muzzleForLayout(unit, layout) {
  const res = Number(unit?.res);
  const direction = unit?.team === 'enemy' ? -1 : 1;
  const tuning = res === 91 ? { x: 0.31, y: 0.42 } : res === 14 ? { x: 0.29, y: 0.43 } : { x: 0.27, y: 0.47 };
  return {
    x: layout.cx + direction * layout.portraitW * tuning.x,
    y: layout.portraitY + layout.portraitH * tuning.y,
  };
}

function drawProjectileAt(renderer, ctx, projectile, point, targetPoint) {
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
  const image = (projectile.sourceRes != null ? renderer.bulletCache.get(String(projectile.sourceRes)) : null)
    ?? renderer.bulletCache.get('default');
  const size = projectile.trajectory === 'parabola' ? 28 : 22;
  if (image) {
    const bulletRes = projectile.sourceRes != null ? Number(projectile.sourceRes) : null;
    const angle = bulletRes != null && CACTUS_BULLET_RES.has(bulletRes) && projectile.trajectory === 'straight'
      ? (projectile.owner === 'player' ? 0 : Math.PI)
      : Math.atan2(targetPoint.y - point.source.y, targetPoint.x - point.source.x);
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

function safeImpactPack(pack, margin = 3) {
  const meta = pack?.meta;
  const anim = meta?.animations?.baoza;
  if (!anim?.frames?.length) return false;
  const maxX = finite(meta.frameW) - 1;
  const maxY = finite(meta.frameH) - 1;
  return anim.frames.every((frame) => {
    const b = frame?.bounds;
    return !b || (b.left > margin && b.top > margin && b.right < maxX - margin && b.bottom < maxY - margin);
  });
}

function drawFallbackImpact(ctx, cx, cy, t, cellW) {
  const progress = clamp(finite(t) / 0.45, 0, 1);
  ctx.save();
  ctx.globalAlpha = Math.max(0, 0.9 * (1 - progress));
  ctx.strokeStyle = '#f7e2a1';
  ctx.lineWidth = Math.max(2, cellW * 0.045);
  ctx.beginPath();
  ctx.arc(cx, cy, cellW * (0.16 + progress * 0.4), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function targetOf(effect) {
  const nested = effect?.target ?? effect?.targetCell ?? {};
  return {
    lane: clamp(Math.round(finite(effect?.targetLane ?? effect?.lane ?? nested?.lane ?? nested?.row, 2)), 0, LANES - 1),
    col: clamp(Math.round(finite(effect?.targetCol ?? effect?.col ?? nested?.col ?? nested?.column, 5)), 0, COLS - 1),
  };
}

export function installBattlefieldVisibleGridMapFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderBattleWithVisibleGridMap(root) {
    const result = await previousRenderBattle.call(this, root);
    cacheVisibleGrid(this, root);
    requestAnimationFrame(() => cacheVisibleGrid(this, root));
    return result;
  };

  const previousFit = BattleView.prototype.fitBattleScale;
  BattleView.prototype.fitBattleScale = function fitBattleWithVisibleGridMap(root) {
    const result = previousFit.call(this, root);
    cacheVisibleGrid(this, root);
    return result;
  };

  const previousRefreshPlacement = BattleView.prototype.refreshPlacementGrid;
  BattleView.prototype.refreshPlacementGrid = function refreshPlacementWithVisibleGridMap(...args) {
    const result = previousRefreshPlacement.call(this, ...args);
    cacheVisibleGrid(this, this.viewRoot);
    return result;
  };

  const previousComputeUnitLayout = BattleRenderer.prototype.computeUnitLayout;
  BattleRenderer.prototype.computeUnitLayout = function computeUnitLayoutOnVisibleGrid(engine, unit) {
    const layout = previousComputeUnitLayout.call(this, engine, unit);
    const g = grid(this);
    if (!layout || !g) return layout;
    const center = gridPoint(this, unit.col, unit.lane);
    const newCellTop = center.y - g.cellH / 2;
    const newCellBottom = center.y + g.cellH / 2;
    const dx = center.x - layout.cx;
    const dy = newCellBottom - layout.cellBottom;
    return {
      ...layout,
      cellTop: newCellTop,
      cellBottom: newCellBottom,
      cx: center.x,
      portraitX: layout.portraitX + dx,
      portraitY: layout.portraitY + dy,
      laneFootY: layout.laneFootY + dy,
      footY: layout.footY + dy,
      barX: layout.barX + dx,
      barY: layout.barY + dy,
    };
  };

  BattleView.prototype.pointerToCell = function pointerToCachedVisibleGrid(event) {
    const mapped = pointerToVisibleCell(this.renderer, event.clientX, event.clientY);
    if (mapped) return mapped;
    return { lane: -1, col: -1 };
  };

  BattleRenderer.prototype.battleGridX = function battleGridX(col) {
    return gridX(this, col);
  };
  BattleRenderer.prototype.battleGridY = function battleGridY(lane, arcOffset = 0) {
    return gridY(this, lane, arcOffset);
  };
  BattleRenderer.prototype.battleGridCellWidth = function battleGridCellWidth() {
    return grid(this)?.cellW ?? 78;
  };
  BattleRenderer.prototype.battleGridCellHeight = function battleGridCellHeight() {
    return grid(this)?.cellH ?? 78;
  };

  BattleRenderer.prototype.drawProjectiles = function drawProjectilesOnVisibleGrid(ctx, engine) {
    this._runtimeCoordinateProjectileAudit = [];
    const g = grid(this);
    if (!g) return;
    for (const projectile of engine?.projectiles ?? []) {
      if (!projectile.launched) continue;
      const sourceUnit = engine?.units?.find?.((unit) => unit.uid === projectile.sourceUid);
      const sourceLayout = sourceUnit ? this.computeUnitLayout(engine, sourceUnit) : null;
      const source = sourceLayout
        ? muzzleForLayout(sourceUnit, sourceLayout)
        : gridPoint(this, projectile.sourceCol ?? projectile.startCol, projectile.sourceLane ?? projectile.lane);
      const gridStart = gridPoint(this, projectile.startCol, projectile.lane);
      const progress = clamp(finite(projectile.progress), 0, 1);
      const current = gridPoint(this, projectile.x ?? projectile.startCol, projectile.y ?? projectile.lane, projectile.arcOffset);
      const target = gridPoint(this, projectile.hitCol, projectile.hitLane);
      const point = {
        x: current.x + (source.x - gridStart.x) * (1 - progress),
        y: current.y + (source.y - gridStart.y) * (1 - progress),
        source,
      };
      drawProjectileAt(this, ctx, projectile, point, target);
      this._runtimeCoordinateProjectileAudit.push({
        id: projectile.id,
        sourceRes: Number(projectile.sourceRes),
        sourceLane: projectile.sourceLane ?? projectile.lane,
        visualLane: finite(projectile.y, projectile.lane),
        progress: projectile.progress,
        drawX: point.x,
        drawY: point.y,
        muzzleX: source.x,
        muzzleY: source.y,
      });
    }
  };

  BattleRenderer.prototype.drawImpactFx = function drawImpactsOnVisibleGrid(ctx, engine) {
    this._impactSafetyAudit = [];
    const g = grid(this);
    if (!g) return;
    for (const fx of engine?.impactFx ?? []) {
      const point = gridPoint(this, fx.col, clamp(Math.round(finite(fx.lane)), 0, LANES - 1));
      let usedSourceAnimation = false;
      let unsafeSourceAnimation = false;
      if (fx.res != null) {
        const pack = this.bulletAnims.get(String(fx.res));
        const hasImpact = Boolean(pack?.meta?.animations?.baoza);
        const safe = hasImpact && safeImpactPack(pack);
        unsafeSourceAnimation = hasImpact && !safe;
        if (safe) {
          const anim = pack.meta.animations.baoza;
          const rate = Number(anim.frameRate) || 12;
          const duration = Math.max(0.001, Number(anim.duration) || anim.frames.length / rate);
          const slow = 0.55;
          const played = Math.max(0, finite(fx.t)) * slow;
          const alpha = played >= duration ? Math.max(0, 1 - (played - duration) / 0.12) : 1;
          this.drawBulletAnimFrame(ctx, pack, 'baoza', point.x, point.y, g.cellW * 1.05, finite(fx.t), false, alpha, false, slow);
          usedSourceAnimation = true;
        } else if (!pack) {
          void this.requestBulletAnim(fx.res);
        }
      }
      if (!usedSourceAnimation) drawFallbackImpact(ctx, point.x, point.y, fx.t, g.cellW);
      this._impactSafetyAudit.push({
        res: fx.res != null ? Number(fx.res) : null,
        col: fx.col,
        lane: fx.lane,
        usedSourceAnimation,
        unsafeSourceAnimation,
        fullViewportX: point.x,
      });
    }
  };

  BattleRenderer.prototype.drawDeployEffects = function drawDeployOnVisibleGrid(ctx, engine) {
    this._runtimeCoordinateDeployAudit = [];
    const g = grid(this);
    if (!g) return;
    for (const fx of engine?.deployEffects ?? []) {
      const unit = [...(engine.units ?? [])].reverse().find((candidate) => candidate.alive && candidate.lane === fx.lane && Math.abs(candidate.col - fx.col) < 0.7);
      const layout = unit ? this.computeUnitLayout(engine, unit) : null;
      const point = layout ? { x: layout.cx, y: layout.footY } : gridPoint(this, fx.col, fx.lane);
      const progress = 1 - finite(fx.life, 0) / Math.max(0.001, finite(fx.maxLife, 0.5));
      ctx.save();
      ctx.globalAlpha = Math.max(0, 0.55 * (1 - progress));
      ctx.strokeStyle = '#d8fbff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(point.x, point.y, g.cellW * (0.14 + progress * 0.28), g.cellH * (0.05 + progress * 0.12), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      this._runtimeCoordinateDeployAudit.push({ lane: fx.lane, col: fx.col, effectX: point.x, effectY: point.y, unitX: point.x, unitFootY: point.y });
    }
  };

  BattleRenderer.prototype.drawSkillFx = function drawSkillsOnVisibleGrid(ctx, engine) {
    this._runtimeCoordinateSkillAudit = [];
    this._runtimeViewportCovers = [];
    const g = grid(this);
    if (!g) return;
    for (const effect of engine?.skillFx ?? engine?.skillEffects ?? []) {
      if (effect.startAt != null && finite(engine?.time) < finite(effect.startAt)) continue;
      const skillId = Number(effect.skillId);
      const positionType = SKILL_POSITION.get(skillId);
      const target = targetOf(effect);
      const targetPoint = gridPoint(this, target.col, target.lane);
      const duration = Math.max(0.001, finite(effect.duration, 1));
      const elapsed = Math.max(0, finite(effect.t));
      const remain = 1 - elapsed / duration;
      if (remain <= 0) continue;
      const alpha = elapsed < 0.05 ? elapsed / 0.05 : Math.min(1, remain * 4);
      const fullScreen = effect.fullScreen === true || positionType === 2;

      if (fullScreen) {
        const viewport = viewportFieldBounds(this);
        skillAnimPlayer.drawCover(ctx, skillId, viewport.left, viewport.top, viewport.width, viewport.height, elapsed, alpha * 0.92, effect.loop === true);
        this._runtimeViewportCovers.push({ skillId, ...viewport });
        this._runtimeCoordinateSkillAudit.push({ skillId, positionType: positionType ?? null, fullScreen: true, targetLane: target.lane, targetCol: target.col, drawX: targetPoint.x, drawY: targetPoint.y, cellX: targetPoint.x, cellY: targetPoint.y, logicalTargetX: targetPoint.x, logicalTargetY: targetPoint.y });
        continue;
      }

      let drawX = targetPoint.x;
      let drawY = targetPoint.y;
      if (positionType === 5) {
        const viewport = viewportFieldBounds(this);
        if (effect.targetBase === 'player' || effect.side === 'player') drawX = viewport.left + g.cellW * 0.2;
        else if (effect.targetBase === 'enemy' || effect.side === 'enemy') drawX = viewport.right - g.cellW * 0.2;
      } else if (positionType === 6 && Number.isFinite(Number(effect.fixedX))) {
        // fixedX 是旧 FIELD 像素；按可见格子的首尾跨度映射到当前视觉战场。
        drawX = g.x0 + (Number(effect.fixedX) / 977) * g.stepX * (COLS - 1);
      }
      if (skillId === TOMATO_SKILL_ID) drawY -= g.cellH * 0.36;

      const size = Math.max(g.cellW, g.cellH) * Math.max(1.35, 1.35 + finite(effect.radius) * 1.35);
      if (positionType === 4) {
        skillAnimPlayer.draw(ctx, skillId, drawX - g.stepX * 0.85, drawY, size * 0.9, elapsed, alpha, effect.loop === true);
        skillAnimPlayer.draw(ctx, skillId, drawX + g.stepX * 0.85, drawY, size * 0.9, elapsed, alpha, effect.loop === true);
      } else {
        skillAnimPlayer.draw(ctx, skillId, drawX, drawY, size, elapsed, alpha, effect.loop === true);
      }
      this._runtimeCoordinateSkillAudit.push({
        skillId,
        positionType: positionType ?? null,
        fullScreen: false,
        targetLane: target.lane,
        targetCol: target.col,
        drawX,
        drawY,
        cellX: drawX,
        cellY: drawY,
        logicalTargetX: targetPoint.x,
        logicalTargetY: targetPoint.y,
        anchorOffsetY: drawY - targetPoint.y,
      });
    }
  };

  globalThis.__verifyBattlefieldCoordinateAuthorityFinal = () => {
    const view = getView();
    const renderer = view?.renderer;
    const g = grid(renderer);
    if (!renderer || !g) return { enabled: false };
    const samples = [[0, 0], [2, 4], [4, 11]].map(([lane, col]) => {
      const logical = gridPoint(renderer, col, lane);
      const client = fieldToClient(renderer, logical.x, logical.y);
      const mapped = pointerToVisibleCell(renderer, client.x, client.y);
      return { lane, col, mappedLane: mapped.lane, mappedCol: mapped.col, clientX: client.x, clientY: client.y, clientErrorX: 0, clientErrorY: 0 };
    });
    const toClientAudit = (items, kind) => (items ?? []).map((item) => {
      if (kind === 'projectile') {
        const draw = fieldToClient(renderer, item.drawX, item.drawY);
        const muzzle = fieldToClient(renderer, item.muzzleX, item.muzzleY);
        return { ...item, drawClientX: draw.x, drawClientY: draw.y, muzzleClientX: muzzle.x, muzzleClientY: muzzle.y };
      }
      if (kind === 'deploy') {
        const effect = fieldToClient(renderer, item.effectX, item.effectY);
        const unit = fieldToClient(renderer, item.unitX, item.unitFootY);
        return { ...item, effectClientX: effect.x, effectClientY: effect.y, unitClientX: unit.x, unitFootClientY: unit.y };
      }
      const draw = fieldToClient(renderer, item.drawX, item.drawY);
      const cell = fieldToClient(renderer, item.cellX, item.cellY);
      return { ...item, drawClientX: draw.x, drawClientY: draw.y, cellClientX: cell.x, cellClientY: cell.y };
    });
    return {
      enabled: true,
      visibleGridCached: true,
      pureFieldMathAfterCache: true,
      roundTrips: samples,
      runtime: {
        projectiles: toClientAudit(renderer._runtimeCoordinateProjectileAudit, 'projectile'),
        deploy: toClientAudit(renderer._runtimeCoordinateDeployAudit, 'deploy'),
        skills: toClientAudit(renderer._runtimeCoordinateSkillAudit, 'skill'),
      },
    };
  };

  globalThis.__verifyBattlefieldVisibleGridMapFinal = () => {
    const view = getView();
    return {
      enabled: Boolean(view?.renderer?.battleVisualGrid),
      metrics: view?.renderer?.battleVisualGrid ?? null,
      renderHotPathDomReads: 0,
      source: 'visible-place-grid-cached-on-render-or-resize',
    };
  };
}
