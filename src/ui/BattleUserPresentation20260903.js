import {
  CELL_W,
  LANES,
  cellCenterY,
  colFracToX,
} from '../battle/BattleConfig.js';
import { resolveBattleBackground } from '../battle/BattleBackground.js';
import { BattleRenderer } from '../battle/BattleRenderer.js';
import { unitAnimPlayer } from '../battle/UnitAnimPlayer.js';
import { BattleView } from './BattleView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleUserPresentation20260903');
const FLYING_PEACH_CARD_ID = 40;
const PEACH_SUICIDE_FX = 'peach-suicide-burst';
const PEACH_FLY_BOOST = 1.18;
const PEACH_FLY_LIFT = 0.58;
const PEACH_NATIVE_SUICIDE_FALLBACK = 21 / 12;

function isPeach(unit) {
  return Number(unit?.cardId) === FLYING_PEACH_CARD_ID && Number(unit?.viewType) === 6;
}

function isPeachBurst(fx) {
  return fx?.kind === PEACH_SUICIDE_FX || String(fx?.res ?? '') === PEACH_SUICIDE_FX;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function forcePeachFlyingLayout(layout, unit) {
  if (!layout || !isPeach(unit)) return layout;
  if (layout.flying) return layout;

  const oldWidth = Number(layout.portraitW) || 1;
  const oldHeight = Number(layout.portraitH) || 1;
  const oldCenterX = Number(layout.portraitX) + oldWidth / 2;
  const centerOffsetX = oldCenterX - Number(layout.cx || oldCenterX);
  const portraitW = oldWidth * PEACH_FLY_BOOST;
  const portraitH = oldHeight * PEACH_FLY_BOOST;
  const laneFootY = Number(layout.laneFootY ?? layout.footY ?? 0);

  return {
    ...layout,
    flying: true,
    portraitW,
    portraitH,
    portraitX: Number(layout.cx || oldCenterX) + centerOffsetX - portraitW / 2,
    portraitY: laneFootY - portraitH * (0.82 + PEACH_FLY_LIFT * 0.42),
  };
}

function drawPeachBurst(ctx, fx) {
  const life = Math.max(0.001, Number(fx.life) || 0.82);
  const progress = clamp((Number(fx.t) || 0) / life, 0, 1);
  const alpha = Math.max(0, 1 - progress);
  if (alpha <= 0) return;

  const lane = clamp(Math.round(Number(fx.lane) || 0), 0, LANES - 1);
  const cx = colFracToX(Number(fx.col) || 0);
  const cy = cellCenterY(lane) - CELL_W * 0.08;
  const radius = CELL_W * (0.24 + progress * 0.58);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  glow.addColorStop(0, `rgba(255,255,235,${0.98 * alpha})`);
  glow.addColorStop(0.18, `rgba(255,240,112,${0.94 * alpha})`);
  glow.addColorStop(0.48, `rgba(255,128,40,${0.82 * alpha})`);
  glow.addColorStop(1, 'rgba(240,54,28,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = alpha * 0.92;
  ctx.strokeStyle = '#fff3a0';
  ctx.lineWidth = Math.max(2, CELL_W * 0.045);
  ctx.beginPath();
  ctx.arc(cx, cy, CELL_W * (0.18 + progress * 0.50), 0, Math.PI * 2);
  ctx.stroke();

  const rayStart = CELL_W * (0.14 + progress * 0.10);
  const rayEnd = CELL_W * (0.36 + progress * 0.42);
  ctx.lineWidth = Math.max(2, CELL_W * 0.035);
  for (let index = 0; index < 10; index += 1) {
    const angle = index * Math.PI * 2 / 10 + progress * 0.25;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * rayStart, cy + Math.sin(angle) * rayStart);
    ctx.lineTo(cx + Math.cos(angle) * rayEnd, cy + Math.sin(angle) * rayEnd);
    ctx.stroke();
  }

  ctx.restore();
}

function hasVisibleNativePeachSuicide(engine, fx) {
  const time = Number(engine?.time) || 0;
  const lane = Number(fx?.lane);
  const col = Number(fx?.col);
  return (engine?.units ?? []).some((unit) => {
    if (unit?.alive || !isPeach(unit) || unit?._deathFrozen) return false;
    if (!(Number(unit?._deathUntil) > time)) return false;
    if (Number.isFinite(lane) && Number(unit?.lane) !== lane) return false;
    if (Number.isFinite(col) && Math.abs(Number(unit?.col) - col) > 1.05) return false;
    return true;
  });
}

function resolveCurrentBossId(view) {
  return String(
    view?.__pvpLatestSnapshot?.boss?.id
    || view?.pvp?.bossId
    || view?.pvp?.room?.bossId
    || view?.bossId
    || view?.viewRoot?.querySelector?.('.battle-game-wrap')?.dataset?.bossId
    || '',
  );
}

function lockBossBattlefieldBackground(view, root) {
  const bossId = resolveCurrentBossId(view);
  if (!bossId) return;
  const bg = resolveBattleBackground(view?.engine?.stage, {
    trainingMode: Boolean(view?.trainingMode),
    pvpMode: Boolean(view?.pvp),
    useMap: true,
    bossId,
    trainingMap: view?.trainingMap,
  });
  const wrap = root?.querySelector?.('.battle-game-wrap');
  const game = root?.querySelector?.('.game-container');
  if (!wrap || !game) return;

  // BOSS 背景和柱子必须来自同一个 bossId；最后展示层直接锁定两层底图，
  // 避免后续 PVP 随机场景补丁把多特草地重新覆盖成黄沙。
  for (const element of [wrap, game]) {
    element.style.setProperty('--bg-base', `url('${bg.baseUrl}')`);
    element.style.setProperty('--bg-grass', `url('${bg.baseUrl}')`);
    element.style.setProperty('--bg-map', `url('${bg.mapUrl || bg.baseUrl}')`);
    element.style.setProperty('--bg-left', `url('${bg.leftColumnUrl}')`);
    element.style.setProperty('--bg-right', `url('${bg.rightColumnUrl}')`);
  }
  for (const layer of [game.querySelector('.bg-layer-base'), game.querySelector('.bg-layer-map')]) {
    layer?.style?.setProperty('background-image', `url('${bg.baseUrl}')`, 'important');
  }
  const label = root?.querySelector?.('.battle-map-label');
  if (label) label.textContent = `🗺️ ${bg.sceneLabel || '草地'}地图`;
  wrap.dataset.bossScene = bg.sceneKey || '';
}

export function installBattleUserPresentation20260903() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousPickDrawState = unitAnimPlayer.pickDrawState.bind(unitAnimPlayer);
  unitAnimPlayer.pickDrawState = function pickDrawStateWithPermanentPeachFlight(pack, unit, engine) {
    // 40号源骨骼没有独立 death；原生自爆就是 attacking。
    // 死亡生命周期继续保持 requested=death，只有实际取帧状态映射到 attacking，
    // 这样既能沿用死亡窗口/时间缩放，又不会回退成静止 default。
    if (!unit?.alive && isPeach(unit) && !unit?._deathFrozen
      && pack?.meta?.animations?.attacking?.frames?.length) {
      return { requested: 'death', state: 'attacking' };
    }
    if (unit?.alive && isPeach(unit) && pack?.meta?.animations?.flying?.frames?.length) {
      return { requested: 'flying', state: 'flying' };
    }
    return previousPickDrawState(pack, unit, engine);
  };

  const previousMarkDeath = unitAnimPlayer.markDeath.bind(unitAnimPlayer);
  unitAnimPlayer.markDeath = function markDeathWithPeachNativeSuicide(unit, engine) {
    const result = previousMarkDeath(unit, engine);
    if (!isPeach(unit) || unit?._deathFrozen) return result;

    // 即使 finishSuicideUnit 已把 _suicideRemoved 置位，也必须重新建立原生自爆窗口。
    // 正常预载时取 attacking 的真实烘焙时长；极端预载竞态用 21帧@12fps 兜底。
    const duration = this.resolveAnimationDuration(
      unit,
      'attacking',
      PEACH_NATIVE_SUICIDE_FALLBACK,
    );
    const startedAt = Number(engine?.time) || 0;
    unit._deathAnimStartedAt = startedAt;
    unit._deathUntil = startedAt + Math.max(PEACH_NATIVE_SUICIDE_FALLBACK, duration);
    this.clocks.set(`${unit.uid}:attacking`, 0);
    this.lastDrawTimes.delete(unit.uid);
    return result;
  };

  const previousComputeUnitLayout = BattleRenderer.prototype.computeUnitLayout;
  BattleRenderer.prototype.computeUnitLayout = function computeUnitLayoutWithPermanentPeachFlight(engine, unit) {
    const layout = previousComputeUnitLayout.call(this, engine, unit);
    // 死亡动画仍在空中原高度播放：水蜜桃从生到死都不进入“落地”表现。
    return forcePeachFlyingLayout(layout, unit);
  };

  const previousDrawImpactFx = BattleRenderer.prototype.drawImpactFx;
  BattleRenderer.prototype.drawImpactFx = function drawImpactFxWithPeachSuicide(ctx, engine) {
    const all = engine?.impactFx ?? [];
    const special = all.filter(isPeachBurst);
    if (!special.length) return previousDrawImpactFx.call(this, ctx, engine);

    // 联机同步把特殊标记放在 impact.res 中。先从通用子弹爆炸渲染里拿掉，
    // 避免它把标记当成不存在的子弹资源去请求。
    const original = engine.impactFx;
    try {
      engine.impactFx = all.filter((fx) => !isPeachBurst(fx));
      previousDrawImpactFx.call(this, ctx, engine);
    } finally {
      engine.impactFx = original;
    }

    // 本机/能看到死亡单位的联机端由40号原生 attacking 帧负责自爆；
    // 只有权威快照已经没有死亡单位时才保留程序爆炸作为网络兜底，避免双重爆炸覆盖原动画。
    for (const fx of special) {
      if (!hasVisibleNativePeachSuicide(engine, fx)) drawPeachBurst(ctx, fx);
    }
  };

  const previousRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderWithUserBossBackground(root) {
    const result = await previousRenderBattle.call(this, root);
    lockBossBattlefieldBackground(this, root);
    return result;
  };
}
