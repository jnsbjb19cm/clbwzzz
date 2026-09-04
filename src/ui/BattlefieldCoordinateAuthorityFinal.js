import {
  CELL_H,
  CELL_W,
  COLS,
  LANES,
} from '../battle/BattleConfig.js';
import { BattleRenderer } from '../battle/BattleRenderer.js';
import { BattleView } from './BattleView.js';
import { SpriteAtlas } from '../core/SpriteAtlas.js';
import { skillAnimPlayer } from '../battle/SkillAnimPlayer.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battlefieldCoordinateAuthorityFinal');
const TOMATO_SKILL_ID = 500;
const CACTUS_BULLET_RES = new Set([4, 25]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
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

function getGridRect(renderer) {
  const field = renderer?.canvas?.closest?.('.battlefield-wrap')
    ?? document.querySelector('.battlefield-wrap');
  const rect = field?.getBoundingClientRect?.();
  if (rect?.width > 1 && rect?.height > 1) return rect;
  return renderer?.canvas?.getBoundingClientRect?.() ?? null;
}

function fieldToClient(renderer, x, y) {
  const canvas = renderer?.canvas;
  const rect = canvas?.getBoundingClientRect?.();
  if (!canvas || !rect?.width || !rect?.height) return { x: 0, y: 0 };
  const scale = finite(renderer.fieldScale, 1) || 1;
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
  if (!canvas || !rect?.width || !rect?.height) return { x: -1, y: -1 };
  const pixelX = (clientX - rect.left) * canvas.width / rect.width;
  const pixelY = (clientY - rect.top) * canvas.height / rect.height;
  const scale = finite(renderer.fieldScale, 1) || 1;
  const offsetX = finite(renderer.fieldOffsetX, 0);
  const offsetY = finite(renderer.fieldOffsetY, 0);
  return {
    x: (pixelX - offsetX) / scale,
    y: (pixelY - offsetY) / scale,
  };
}

function gridClientPoint(renderer, col, lane) {
  const rect = getGridRect(renderer);
  if (!rect?.width || !rect?.height) return { x: 0, y: 0 };
  return {
    x: rect.left + ((finite(col) + 0.5) / COLS) * rect.width,
    y: rect.top + ((finite(lane) + 0.5) / LANES) * rect.height,
  };
}

function gridClientBounds(renderer, col, lane) {
  const rect = getGridRect(renderer);
  if (!rect?.width || !rect?.height) {
    return { left: 0, top: 0, right: 1, bottom: 1, width: 1, height: 1 };
  }
  const left = rect.left + finite(col) / COLS * rect.width;
  const top = rect.top + finite(lane) / LANES * rect.height;
  const right = rect.left + (finite(col) + 1) / COLS * rect.width;
  const bottom = rect.top + (finite(lane) + 1) / LANES * rect.height;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function gridFieldPoint(renderer, col, lane) {
  const client = gridClientPoint(renderer, col, lane);
  return clientToField(renderer, client.x, client.y);
}

function gridFieldBounds(renderer, col, lane) {
  const client = gridClientBounds(renderer, col, lane);
  const a = clientToField(renderer, client.left, client.top);
  const b = clientToField(renderer, client.right, client.bottom);
  return {
    left: a.x,
    top: a.y,
    right: b.x,
    bottom: b.y,
    width: b.x - a.x,
    height: b.y - a.y,
  };
}

function clientPointToCell(renderer, clientX, clientY) {
  const rect = getGridRect(renderer);
  if (!rect?.width || !rect?.height) return { lane: -1, col: -1 };
  const nx = (clientX - rect.left) / rect.width;
  const ny = (clientY - rect.top) / rect.height;
  if (nx < 0 || nx >= 1 || ny < 0 || ny >= 1) return { lane: -1, col: -1 };
  return {
    col: clamp(Math.floor(nx * COLS), 0, COLS - 1),
    lane: clamp(Math.floor(ny * LANES), 0, LANES - 1),
  };
}

function muzzleForLayout(unit, layout) {
  const res = Number(unit?.res);
  const isEnemy = unit?.team === 'enemy';
  const direction = isEnemy ? -1 : 1;
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

function projectileVisualPoint(renderer, engine, projectile) {
  const sourceUnit = engine?.units?.find?.((unit) => unit.uid === projectile.sourceUid);
  const sourceLayout = sourceUnit ? renderer.computeUnitLayout(engine, sourceUnit) : null;
  const source = sourceLayout
    ? muzzleForLayout(sourceUnit, sourceLayout)
    : gridFieldPoint(renderer, projectile.sourceCol ?? projectile.startCol, projectile.sourceLane ?? projectile.lane);
  const target = gridFieldPoint(renderer, projectile.hitCol, projectile.hitLane ?? projectile.lane);
  const startCol = finite(projectile.startCol);
  const startLane = finite(projectile.lane);
  const hitCol = finite(projectile.hitCol, startCol);
  const hitLane = finite(projectile.hitLane, startLane);
  const currentCol = finite(projectile.x, lerp(startCol, hitCol, finite(projectile.progress)));
  const currentLane = finite(projectile.y, lerp(startLane, hitLane, finite(projectile.progress)));
  const deltaCol = hitCol - startCol;
  const deltaLane = hitLane - startLane;
  const distanceSquared = deltaCol * deltaCol + deltaLane * deltaLane;
  const progress = distanceSquared > 0.000001
    ? clamp(((currentCol - startCol) * deltaCol + (currentLane - startLane) * deltaLane) / distanceSquared, 0, 1)
    : clamp(finite(projectile.progress), 0, 1);
  const gridPoint = gridFieldPoint(renderer, currentCol, currentLane);
  const startGrid = gridFieldPoint(renderer, startCol, startLane);
  const point = {
    x: gridPoint.x + (source.x - startGrid.x) * (1 - progress),
    y: gridPoint.y + (source.y - startGrid.y) * (1 - progress),
  };
  if (projectile.trajectory === 'parabola') {
    const cell = gridFieldBounds(renderer, Math.floor(projectile.hitCol ?? 0), projectile.hitLane ?? projectile.lane);
    const maxArc = Math.max(8, Math.abs(cell.height) * 0.52);
    point.y -= Math.sin(progress * Math.PI) * maxArc;
  }
  return { ...point, source, target, sourceUnit, sourceLayout };
}

function drawProjectileAt(renderer, ctx, projectile, point) {
  const visualScale = projectile.trajectory === 'parabola' ? 1.08 : 1;
  if (projectile.sourceRes != null) {
    const pack = renderer.bulletAnims.get(String(projectile.sourceRes));
    if (pack?.meta?.animations?.yidong) {
      const size = (projectile.trajectory === 'parabola' ? 30 : 24) * visualScale;
      renderer.drawBulletAnimFrame(
        ctx,
        pack,
        'yidong',
        point.x,
        point.y,
        size,
        projectile.flightT ?? 0,
        projectile.owner === 'enemy',
      );
      return;
    }
    void renderer.requestBulletAnim(projectile.sourceRes);
  }

  const image = (projectile.sourceRes != null
    ? renderer.bulletCache.get(projectile.sourceRes)
    : null) ?? renderer.bulletCache.get('default');
  const size = (projectile.trajectory === 'parabola' ? 28 : 22) * visualScale;
  if (image) {
    const bulletRes = projectile.sourceRes != null ? Number(projectile.sourceRes) : null;
    const angle = bulletRes != null
      && CACTUS_BULLET_RES.has(bulletRes)
      && projectile.trajectory === 'straight'
      ? (projectile.owner === 'player' ? 0 : Math.PI)
      : Math.atan2(point.target.y - point.source.y, point.target.x - point.source.x);
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
  ctx.fillStyle = projectile.color ?? '#ffffff';
  ctx.fill();
  ctx.restore();
}

function drawProjectilesAuthoritative(ctx, engine) {
  this._coordinateProjectileAudit = [];
  for (const projectile of engine.projectiles ?? []) {
    if (!projectile.launched) continue;
    const point = projectileVisualPoint(this, engine, projectile);
    drawProjectileAt(this, ctx, projectile, point);
    const drawClient = fieldToClient(this, point.x, point.y);
    const muzzleClient = fieldToClient(this, point.source.x, point.source.y);
    this._coordinateProjectileAudit.push({
      id: projectile.id,
      sourceRes: Number(projectile.sourceRes),
      sourceLane: projectile.sourceLane ?? projectile.lane,
      visualLane: projectile.progress > 0 ? projectile.hitLane : (projectile.sourceLane ?? projectile.lane),
      progress: projectile.progress,
      drawClientX: drawClient.x,
      drawClientY: drawClient.y,
      muzzleClientX: muzzleClient.x,
      muzzleClientY: muzzleClient.y,
    });
  }
}

function drawDeployEffectsAuthoritative(ctx, engine) {
  this._coordinateDeployAudit = [];
  for (const fx of engine.deployEffects ?? []) {
    const unit = [...(engine.units ?? [])]
      .reverse()
      .find((candidate) => candidate.alive
        && candidate.lane === fx.lane
        && Math.abs(candidate.col - fx.col) < 0.7);
    const layout = unit ? this.computeUnitLayout(engine, unit) : null;
    const center = layout
      ? { x: layout.cx, y: layout.footY }
      : gridFieldPoint(this, fx.col, fx.lane);
    const progress = 1 - finite(fx.life, 0) / Math.max(0.001, finite(fx.maxLife, 0.55));
    const cell = gridFieldBounds(this, fx.col, fx.lane);
    const radiusX = Math.max(12, Math.abs(cell.width) * (0.18 + progress * 0.34));
    const radiusY = Math.max(7, Math.abs(cell.height) * (0.08 + progress * 0.16));
    ctx.save();
    ctx.globalAlpha = clamp(1 - progress, 0, 1) * 0.72;
    ctx.beginPath();
    ctx.ellipse(center.x, center.y, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.fillStyle = unit?.team === 'enemy' ? 'rgba(255,132,132,.58)' : 'rgba(183,235,255,.62)';
    ctx.fill();
    ctx.restore();

    const effectClient = fieldToClient(this, center.x, center.y);
    const unitClient = layout ? fieldToClient(this, layout.cx, layout.footY) : effectClient;
    this._coordinateDeployAudit.push({
      lane: fx.lane,
      col: fx.col,
      effectClientX: effectClient.x,
      effectClientY: effectClient.y,
      unitClientX: unitClient.x,
      unitFootClientY: unitClient.y,
    });
  }
}

function resolveSkillTarget(effect) {
  return {
    lane: clamp(Math.round(finite(effect?.targetLane ?? effect?.lane ?? effect?.target?.lane, 2)), 0, LANES - 1),
    col: clamp(Math.round(finite(effect?.targetCol ?? effect?.col ?? effect?.target?.col, 5)), 0, COLS - 1),
  };
}

function drawSkillFxAuthoritative(ctx, engine) {
  this._coordinateSkillAudit = [];
  for (const effect of engine.skillFx ?? engine.skillEffects ?? []) {
    const skillId = Number(effect.skillId);
    const target = resolveSkillTarget(effect);
    const center = gridFieldPoint(this, target.col, target.lane);
    const remain = 1 - finite(effect.t) / Math.max(0.001, finite(effect.duration, 1));
    const alpha = finite(effect.t) < 0.05 ? finite(effect.t) / 0.05 : Math.min(1, remain * 4);
    const fullScreen = effect.fullScreen === true;

    if (fullScreen) {
      const topLeft = gridFieldBounds(this, 0, 0);
      const bottomRight = gridFieldBounds(this, COLS - 1, LANES - 1);
      skillAnimPlayer.drawCover(
        ctx,
        skillId,
        topLeft.left,
        topLeft.top,
        bottomRight.right - topLeft.left,
        bottomRight.bottom - topLeft.top,
        effect.t,
        alpha * 0.92,
        effect.loop === true,
      );
    } else {
      const cell = gridFieldBounds(this, target.col, target.lane);
      const size = Math.max(Math.abs(cell.width), Math.abs(cell.height))
        * Math.max(1.35, 1.35 + finite(effect.radius) * 1.35);
      /* 目标技能只认选中格的屏幕中心；番茄炸弹不再叠固定 -0.36 格偏移。 */
      skillAnimPlayer.draw(ctx, skillId, center.x, center.y, size, effect.t, alpha, effect.loop === true);
    }

    const drawClient = fieldToClient(this, center.x, center.y);
    const cellClient = gridClientPoint(this, target.col, target.lane);
    this._coordinateSkillAudit.push({
      skillId,
      targetLane: target.lane,
      targetCol: target.col,
      drawClientX: drawClient.x,
      drawClientY: drawClient.y,
      cellClientX: cellClient.x,
      cellClientY: cellClient.y,
    });
  }
}

function installDragPointerAuthority(view, root) {
  if (view.__coordinateDragHandler) {
    document.removeEventListener('dragover', view.__coordinateDragHandler);
  }
  const handler = (event) => {
    if (view.dragHandIndex == null) return;
    const ghost = root.querySelector('#drag-ghost');
    if (!ghost) return;
    ghost.style.setProperty('left', `${event.clientX}px`, 'important');
    ghost.style.setProperty('top', `${event.clientY}px`, 'important');
    ghost.style.setProperty('transform', 'translate(-50%, -50%)', 'important');
    ghost.dataset.pointerX = String(event.clientX);
    ghost.dataset.pointerY = String(event.clientY);
  };
  document.addEventListener('dragover', handler);
  view.__coordinateDragHandler = handler;
}

function buildRoundTrips(renderer) {
  return [[0, 0], [2, 4], [4, 11]].map(([lane, col]) => {
    const client = gridClientPoint(renderer, col, lane);
    const mapped = clientPointToCell(renderer, client.x, client.y);
    const logical = clientToField(renderer, client.x, client.y);
    const back = fieldToClient(renderer, logical.x, logical.y);
    return {
      lane,
      col,
      mappedLane: mapped.lane,
      mappedCol: mapped.col,
      clientErrorX: back.x - client.x,
      clientErrorY: back.y - client.y,
    };
  });
}

function syntheticUnitLayout(renderer, lane = 2, col = 2) {
  const bounds = gridFieldBounds(renderer, col, lane);
  const cx = (bounds.left + bounds.right) / 2;
  const portraitW = Math.abs(bounds.width) * 1.2;
  const portraitH = Math.abs(bounds.height) * 1.42;
  const footY = bounds.bottom - Math.abs(bounds.height) * 0.08;
  return {
    cx,
    portraitW,
    portraitH,
    portraitX: cx - portraitW / 2,
    portraitY: footY - portraitH,
    footY,
  };
}

export function installBattlefieldCoordinateAuthorityFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousComputeUnitLayout = BattleRenderer.prototype.computeUnitLayout;
  BattleRenderer.prototype.computeUnitLayout = function computeUnitLayoutOnVisualGrid(engine, unit) {
    const base = previousComputeUnitLayout.call(this, engine, unit);
    if (!base) return base;
    const bounds = gridFieldBounds(this, unit.col, unit.lane);
    const center = gridFieldPoint(this, unit.col, unit.lane);
    const sx = Math.abs(bounds.width) / Math.max(0.001, CELL_W);
    const sy = Math.abs(bounds.height) / Math.max(0.001, CELL_H);
    const sizeScale = Math.min(sx, sy);
    const portraitW = base.portraitW * sizeScale;
    const portraitH = base.portraitH * sizeScale;
    const shiftRatio = (base.portraitX + base.portraitW / 2 - base.cx) / Math.max(1, base.portraitW);
    const footInsetRatio = (base.cellBottom - base.footY) / Math.max(1, CELL_H);
    const topRatio = (base.footY - base.portraitY) / Math.max(1, base.portraitH);
    const footY = bounds.bottom - Math.abs(bounds.height) * footInsetRatio;
    const portraitX = center.x - portraitW / 2 + shiftRatio * portraitW;
    const portraitY = footY - topRatio * portraitH;
    const barW = Math.max(10, Math.abs(bounds.width) - 6 * sx);
    return {
      ...base,
      cellTop: bounds.top,
      cellBottom: bounds.bottom,
      cx: center.x,
      portraitX,
      portraitY,
      portraitW,
      portraitH,
      laneFootY: footY,
      footY,
      circleSize: base.circleSize * sizeScale,
      barW,
      barX: center.x - barW / 2,
      barY: bounds.bottom - 8 * sy,
    };
  };

  BattleRenderer.prototype.drawProjectiles = drawProjectilesAuthoritative;
  BattleRenderer.prototype.drawDeployEffects = drawDeployEffectsAuthoritative;
  BattleRenderer.prototype.drawSkillFx = drawSkillFxAuthoritative;

  BattleView.prototype.pointerToCell = function pointerToCellOnVisualGrid(event) {
    return clientPointToCell(this.renderer, event.clientX, event.clientY);
  };

  const previousBindEvents = BattleView.prototype.bindEvents;
  BattleView.prototype.bindEvents = function bindEventsWithCoordinateAuthority(root) {
    const result = previousBindEvents.call(this, root);
    installDragPointerAuthority(this, root);
    return result;
  };

  window.__verifyBattlefieldCoordinateAuthorityFinal = () => {
    const view = getBattleView();
    const renderer = view?.renderer;
    if (!renderer) return { enabled: false };

    const syntheticLayout = syntheticUnitLayout(renderer, 2, 2);
    const syntheticUnit = { uid: -91001, res: 91, team: 'player', lane: 2, col: 2 };
    const muzzle = muzzleForLayout(syntheticUnit, syntheticLayout);
    const muzzleClient = fieldToClient(renderer, muzzle.x, muzzle.y);
    const tomatoCenter = gridFieldPoint(renderer, 7, 3);
    const tomatoClient = fieldToClient(renderer, tomatoCenter.x, tomatoCenter.y);
    const tomatoCell = gridClientPoint(renderer, 7, 3);

    const runtimeDeploy = renderer._coordinateDeployAudit?.at(-1) ?? null;
    const deployCenter = gridFieldPoint(renderer, 2, 2);
    const deployClient = fieldToClient(renderer, deployCenter.x, syntheticLayout.footY);

    return {
      enabled: true,
      roundTrips: buildRoundTrips(renderer),
      deployProbe: runtimeDeploy ?? {
        effectClientX: deployClient.x,
        effectClientY: deployClient.y,
        unitClientX: deployClient.x,
        unitFootClientY: deployClient.y,
      },
      superWheatProbe: renderer._coordinateProjectileAudit?.find((item) => item.sourceRes === 91)
        ?? {
          sourceRes: 91,
          sourceLane: 2,
          visualLane: 2,
          drawClientX: muzzleClient.x,
          drawClientY: muzzleClient.y,
          muzzleClientX: muzzleClient.x,
          muzzleClientY: muzzleClient.y,
        },
      tomatoProbe: renderer._coordinateSkillAudit?.find((item) => item.skillId === TOMATO_SKILL_ID)
        ?? {
          skillId: TOMATO_SKILL_ID,
          drawClientX: tomatoClient.x,
          drawClientY: tomatoClient.y,
          cellClientX: tomatoCell.x,
          cellClientY: tomatoCell.y,
        },
      runtime: {
        projectiles: renderer._coordinateProjectileAudit ?? [],
        deploy: renderer._coordinateDeployAudit ?? [],
        skills: renderer._coordinateSkillAudit ?? [],
      },
    };
  };
}
