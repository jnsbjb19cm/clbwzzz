import { BattleRenderer } from '../battle/BattleRenderer.js';
import { skillAnimPlayer } from '../battle/SkillAnimPlayer.js';
import { installPvpReferenceGeometryFinalFix } from './PvpReferenceGeometryFinalFix.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battlefieldViewportFxFinal');

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/**
 * Canvas 已经由 BattlefieldViewportCanvasFixV3 扩到整个战斗视口。
 * renderer.fieldOffsetX/Y 表示 12x5 FIELD 在这张大 Canvas 里的偏移。
 * 因而“全屏技能”的逻辑绘制区域必须反推到整张 Canvas，而不是再取 12x5 网格边界。
 */
function viewportFieldBounds(renderer) {
  const canvas = renderer?.canvas;
  const scale = Math.max(0.0001, finite(renderer?.fieldScale, 1) || 1);
  const offsetX = finite(renderer?.fieldOffsetX, 0);
  const offsetY = finite(renderer?.fieldOffsetY, 0);
  if (!canvas) {
    return { left: 0, top: 0, right: 1, bottom: 1, width: 1, height: 1 };
  }
  const left = -offsetX / scale;
  const top = -offsetY / scale;
  const width = canvas.width / scale;
  const height = canvas.height / scale;
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  };
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

function clientBoundsFor(renderer, bounds) {
  const topLeft = fieldToClient(renderer, bounds.left, bounds.top);
  const bottomRight = fieldToClient(renderer, bounds.right, bounds.bottom);
  return {
    left: topLeft.x,
    top: topLeft.y,
    right: bottomRight.x,
    bottom: bottomRight.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
}

export function installBattlefieldViewportFxFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  // 这里只安装战斗场地几何修复；不要接管/重绘 PVP 准备房。
  installPvpReferenceGeometryFinalFix();

  const previousDrawSkillFx = BattleRenderer.prototype.drawSkillFx;
  BattleRenderer.prototype.drawSkillFx = function drawSkillFxAcrossViewport(ctx, engine) {
    const renderer = this;
    const viewportBounds = viewportFieldBounds(renderer);
    const originalDrawCover = skillAnimPlayer.drawCover;
    const covers = [];

    /*
     * CoordinateAuthorityFinal 已经决定哪些 effect 需要 drawCover。
     * 这里只替换 drawCover 的“目标矩形”，不改变技能逻辑、不改变单格技能定位。
     * 这样 12x5 仍只是逻辑网格，而所有 full-screen cover 真正覆盖 battle viewport。
     */
    skillAnimPlayer.drawCover = function drawViewportCover(
      context,
      skillId,
      _x,
      _y,
      _width,
      _height,
      ...rest
    ) {
      const client = clientBoundsFor(renderer, viewportBounds);
      covers.push({
        skillId: Number(skillId),
        logical: { ...viewportBounds },
        client,
      });
      return originalDrawCover.call(
        this,
        context,
        skillId,
        viewportBounds.left,
        viewportBounds.top,
        viewportBounds.width,
        viewportBounds.height,
        ...rest
      );
    };

    try {
      return previousDrawSkillFx.call(renderer, ctx, engine);
    } finally {
      skillAnimPlayer.drawCover = originalDrawCover;
      renderer._viewportFxAudit = covers;
    }
  };

  window.__verifyBattlefieldViewportFxFinal = () => {
    const field = document.querySelector('.battlefield-wrap');
    const view = field?.__battleView ?? document.querySelector('.game-container')?.__battleView;
    const renderer = view?.renderer;
    const canvas = renderer?.canvas;
    const canvasRect = canvas?.getBoundingClientRect?.();
    const gridRect = field?.getBoundingClientRect?.();
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
      gridClient: gridRect ? {
        left: gridRect.left,
        top: gridRect.top,
        right: gridRect.right,
        bottom: gridRect.bottom,
        width: gridRect.width,
        height: gridRect.height,
      } : null,
      covers: renderer?._viewportFxAudit ?? [],
    };
  };
}
