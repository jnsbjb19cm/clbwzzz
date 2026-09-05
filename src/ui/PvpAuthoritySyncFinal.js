import { App } from './App.js';
import { BattleView } from './BattleView.js';
import { BattleUnit } from '../battle/BattleUnit.js';
import { Projectile } from '../battle/Projectile.js';
import { calculateCardStats } from '../battle/CardStatFormula.js';
import { unitAnimPlayer } from '../battle/UnitAnimPlayer.js';
import { sanitizeCustomCardName } from '../core/constants.js';

const PATCH_FLAG = Symbol.for('clbwzzz.pvpAuthoritySyncFinal');
const COLS = 12;
const VISUAL_SMOOTHING = 14;
const PROJECTILE_SMOOTHING = 22;
const PROJECTILE_EXTRAPOLATE_SEC = 0.12;
const UI_SYNC_INTERVAL = 0.1;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isRedPerspective(view) {
  return String(view.pvp?.team || 'blue') === 'red';
}

function localTeam(view, canonicalTeam) {
  if (canonicalTeam === 'neutral') return 'neutral';
  if (!isRedPerspective(view)) return canonicalTeam;
  return canonicalTeam === 'player' ? 'enemy' : canonicalTeam === 'enemy' ? 'player' : canonicalTeam;
}

function localCol(view, canonicalCol) {
  const col = finite(canonicalCol);
  return isRedPerspective(view) ? COLS - 1 - col : col;
}

function localBase(view, canonicalBase) {
  if (!isRedPerspective(view)) return canonicalBase;
  if (canonicalBase === 'player') return 'enemy';
  if (canonicalBase === 'enemy') return 'player';
  return canonicalBase;
}

function mapAsset(view, side) {
  const bossId = String(
    view?.__pvpLatestSnapshot?.boss?.id
      ?? view?.pvp?.bossId
      ?? view?.pvp?.room?.bossId
      ?? '',
  );
  if (bossId === 'boss_gravo' || bossId === 'boss_forest') {
    return '/battle/background/leftrock-column.png';
  }
  if (bossId === 'boss_dot' || bossId === 'boss_fire') {
    return `/battle/background/${side === 'right' ? 'mushroomright' : 'mushroomleft'}-column.png`;
  }
  if (bossId === 'boss_ice') {
    return `/battle/background/${side === 'right' ? 'rightice' : 'leftice'}-column.png`;
  }
  const chosen = view?.pvp?.mapScene
    ?? ({ '2': 'grass', '4': 'ice', '7': 'rock' }[String(view?.pvp?.mapId ?? '')]);
  const scene = chosen === 'ice' || chosen === 'grass' ? chosen : 'rock';
  const right = side === 'right';
  if (scene === 'ice') return `/battle/background/${right ? 'rightice' : 'leftice'}-column.png`;
  if (scene === 'grass') return `/battle/background/${right ? 'mushroomright' : 'mushroomleft'}-column.png`;
  return `/battle/background/${right ? 'rightrock' : 'leftrock'}-column.png`;
}

function syncColumnAssets(view) {
  const wrap = view.viewRoot?.querySelector?.('.battle-game-wrap');
  if (!wrap) return;
  for (const side of ['left', 'right']) {
    const column = wrap.querySelector(`.pvp-authority-column.${side}`);
    if (!(column instanceof HTMLElement)) continue;
    const asset = mapAsset(view, side);
    if (column.dataset.pvpAuthorityAsset === asset) continue;
    column.dataset.pvpAuthorityAsset = asset;
    column.style.setProperty('background-image', `url('${asset}')`, 'important');
  }
}

function isBossBattle(view) {
  return view?.pvp?.mode === 'boss'
    || Boolean(
      view?.__pvpLatestSnapshot?.boss?.id
      ?? view?.pvp?.bossId
      ?? view?.pvp?.room?.bossId,
    );
}

function ensureColumns(view) {
  const wrap = view.viewRoot?.querySelector?.('.battle-game-wrap');
  if (!wrap) return;
  wrap.querySelectorAll('[data-pvp-authority-column]').forEach((node) => node.remove());
  wrap.querySelectorAll('.bg-layer-left-column, .bg-layer-right-column').forEach((node) => {
    node.style.setProperty('display', 'none', 'important');
  });
  for (const side of (isBossBattle(view) ? ['left'] : ['left', 'right'])) {
    const column = document.createElement('div');
    column.className = `pvp-authority-column ${side}`;
    column.dataset.pvpAuthorityColumn = side;
    column.setAttribute('aria-hidden', 'true');
    wrap.prepend(column);
  }
  syncColumnAssets(view);
}

function removeColumns(view) {
  view.viewRoot?.querySelectorAll?.('[data-pvp-authority-column]')?.forEach((node) => node.remove());
}

function ensureStatus(view, text = '正在同步服务器战场…') {
  const page = view.viewRoot?.querySelector?.('.battle-page');
  if (!page) return null;
  let status = page.querySelector('.pvp-authority-status');
  if (!status) {
    status = document.createElement('div');
    status.className = 'pvp-authority-status';
    page.append(status);
  }
  status.textContent = text;
  return status;
}

function setStatus(view, text, synced = false) {
  const status = ensureStatus(view, text);
  status?.classList.toggle('synced', synced);
}

function updateUnitFromSnapshot(view, unit, data, immediate) {
  const engine = view.engine;
  const targetCol = localCol(view, data.col);
  const targetLane = finite(data.lane);

  unit._prevRenderX = unit.col;
  unit.team = localTeam(view, data.team);
  unit.hp = finite(data.hp, unit.hp);
  unit.maxHp = Math.max(1, finite(data.maxHp, unit.maxHp));
  unit.atk = finite(data.atk, unit.atk);
  const state = data.animState || data.state || 'default';
  const alive = data.alive !== false && state !== 'death';
  unit.craftQuality = Math.max(
    1,
    Math.min(5, Math.round(finite(data.craftQuality, unit.craftQuality || 1))),
  );
  unit.strengthLv = Math.max(0, Math.round(finite(data.strengthLv, unit.strengthLv || 0)));
  unit.star = unit.strengthLv;
  unit.customName = sanitizeCustomCardName(data.customName);
  const snapshot = view.__pvpLatestSnapshot;
  const timeOffset = Number(engine.time) - Number(snapshot?.t || engine.time);
  unit.slowedUntil = Math.max(Number(unit.slowedUntil || 0), Math.max(0, finite(data.slowedUntil) + timeOffset));
  unit.frozenUntil = Math.max(Number(unit.frozenUntil || 0), Math.max(0, finite(data.frozenUntil) + timeOffset));
  unit.stunnedUntil = Math.max(Number(unit.stunnedUntil || 0), Math.max(0, finite(data.stunnedUntil) + timeOffset));
  unit.dots = (Array.isArray(data.dots) ? data.dots : []).map((dot) => ({
    kind: String(dot?.kind ?? ''),
    dps: finite(dot?.dps),
    every: finite(dot?.every, 1),
    until: finite(dot?.until),
  }));
  unit.alive = alive;
  if (!alive) {
    unit._deathAnimStartedAt = finite(data.deathStartedAt, engine.time);
    unit._deathUntil = Math.max(
      engine.time + 0.02,
      finite(data.deathUntil, engine.time + 0.02),
    );
  } else {
    unit._deathAnimStartedAt = undefined;
    unit._deathUntil = undefined;
  }
  unit.pvpRemote = true;
  unit.pvpNeutral = data.neutral === true || data.team === 'neutral';
  unit.__authorityUid = data.uid;
  unit.__authorityTargetCol = targetCol;
  unit.__authorityTargetLane = targetLane;

  if (immediate || Math.abs(unit.col - targetCol) > 2.5) {
    unit.col = targetCol;
    unit.lane = targetLane;
  }
  unit.renderX = unit.col;
  unit.renderY = unit.lane;

  unit.attackingBase = Boolean(data.attackingBase);
  if ('aerialLandingRequested' in data || state === 'toGround') {
    unit._aerialWasFlying = Boolean(data.aerialWasFlying || data.aerialLandingRequested || state === 'toGround');
    unit._aerialLandingRequested = Boolean(data.aerialLandingRequested || state === 'toGround');
    unit._baseLandingRequested = Boolean(data.baseLandingRequested);
    unit._aerialLanded = Boolean(data.aerialLanded);
    unit._aerialLandingUntil = Math.max(
      engine.time + 0.02,
      finite(data.aerialLandingUntil, engine.time) + timeOffset,
    );
  }
  if (state === 'attacking') unit._attackAnimUntil = Math.max(unit._attackAnimUntil ?? 0, engine.time + 0.22);
  if (state === 'jump') unit._jumpUntil = Math.max(unit._jumpUntil ?? 0, engine.time + 0.22);
  unit.stunnedUntil = state === 'stun' ? Math.max(unit.stunnedUntil ?? 0, engine.time + 0.2) : unit.stunnedUntil;
  unit.frozenUntil = state === 'frozen' ? Math.max(unit.frozenUntil ?? 0, engine.time + 0.2) : unit.frozenUntil;
}

function buildOrUpdateProjectile(view, existing, data, immediate, snapshotDt) {
  const owner = localTeam(view, data.owner);
  const startCol = localCol(view, data.startCol);
  const hitCol = localCol(view, data.hitCol);
  const resolveCol = localCol(view, data.resolveCol ?? data.hitCol);
  const attackerCol = localCol(view, data.attackerCol ?? data.startCol);
  const targetX = localCol(view, data.x ?? data.startCol);
  const targetY = finite(data.y, data.lane);

  const projectile = existing ?? new Projectile({
    owner,
    lane: finite(data.lane),
    startCol,
    hitLane: finite(data.hitLane, data.lane),
    hitCol,
    resolveCol,
    damage: finite(data.damage),
    trajectory: data.trajectory,
    color: data.color,
    targetUid: data.targetUid,
    targetLayerMask: data.targetLayerMask,
    targetBase: localBase(view, data.targetBase),
    sourceUid: data.sourceUid,
    sourceRes: data.sourceRes,
    icon: data.icon,
    attackPattern: data.attackPattern,
    attackerCol,
    attackerLane: finite(data.attackerLane, data.lane),
    visualOnly: Boolean(data.visualOnly),
    pierce: Boolean(data.pierce),
  });

  const oldTargetX = finite(projectile.__authorityTargetX, targetX);
  const oldTargetY = finite(projectile.__authorityTargetY, targetY);
  const dt = Math.max(0.001, finite(snapshotDt, 0.05));
  const canBootstrapLaunchVelocity = !existing
    && data.launched !== false
    && (data.trajectory === 'straight' || data.trajectory === 'parabola');
  projectile.__authorityVx = existing
    ? (targetX - oldTargetX) / dt
    : (canBootstrapLaunchVelocity ? finite(projectile._flightVx) : 0);
  projectile.__authorityVy = existing
    ? (targetY - oldTargetY) / dt
    : (canBootstrapLaunchVelocity ? finite(projectile._flightVy) : 0);
  projectile.__authorityReceivedAt = performance.now();

  projectile.id = data.id;
  projectile.owner = owner;
  projectile.lane = finite(data.lane);
  projectile.startCol = startCol;
  projectile.hitLane = finite(data.hitLane, data.lane);
  projectile.hitCol = hitCol;
  projectile.resolveCol = resolveCol;
  if (data.targetLayerMask != null) projectile.targetLayerMask = Number(data.targetLayerMask) & 3;
  projectile.targetBase = localBase(view, data.targetBase);
  projectile.attackerCol = attackerCol;
  projectile.attackerLane = finite(data.attackerLane, data.lane);
  projectile.progress = finite(data.progress);
  projectile.flightT = finite(data.flightT);
  projectile.arcOffset = finite(data.arcOffset);
  projectile.launched = data.launched !== false;
  projectile.done = false;
  projectile.__authorityTargetX = targetX;
  projectile.__authorityTargetY = targetY;
  if (immediate || !existing) {
    projectile.x = targetX;
    projectile.y = targetY;
  }
  return projectile;
}

function applySnapshot(view, snapshot, { force = false } = {}) {
  if (!view.engine || !snapshot) return;
  const seq = Number(snapshot.seq) || 0;
  if (!force && seq && seq <= (view.__pvpAuthoritySeq || 0)) return;
  view.__pvpAuthoritySeq = Math.max(view.__pvpAuthoritySeq || 0, seq);
  view.__pvpLatestSnapshot = snapshot;
  syncColumnAssets(view);

  const engine = view.engine;
  const previousSnapshotTime = finite(view.__pvpAuthoritySnapshotTime, finite(snapshot.t));
  const nextSnapshotTime = finite(snapshot.t, previousSnapshotTime);
  const snapshotDt = Math.max(0.001, nextSnapshotTime - previousSnapshotTime || 0.05);
  view.__pvpAuthoritySnapshotTime = nextSnapshotTime;
  const firstSnapshot = !view.__pvpHasAuthoritySnapshot;
  view.__pvpHasAuthoritySnapshot = true;
  const previousEngineTime = engine.time;
  const timeShift = nextSnapshotTime - previousEngineTime;
  if (firstSnapshot || Math.abs(timeShift) > 0.0001) {
    for (const unit of engine.units ?? []) {
      if (unit.slowedUntil && unit.slowedUntil > previousEngineTime) unit.slowedUntil += timeShift;
      if (unit.frozenUntil && unit.frozenUntil > previousEngineTime) unit.frozenUntil += timeShift;
      if (unit.stunnedUntil && unit.stunnedUntil > previousEngineTime) unit.stunnedUntil += timeShift;
      if (Array.isArray(unit.dots)) {
        for (const dot of unit.dots) {
          if (dot.until && dot.until > previousEngineTime) dot.until += timeShift;
        }
      }
    }
  }
  engine.time = nextSnapshotTime;

  const existingUnits = new Map((engine.units ?? []).map((unit) => [Number(unit.__authorityUid ?? unit.uid), unit]));
  const units = [];
  const incomingUnitIds = new Set();
  for (const data of snapshot.units ?? []) {
    const card = view.db?.getById?.(data.cardId);
    if (!card) continue;
    let unit = existingUnits.get(Number(data.uid));
    if (!unit || Number(unit.cardId) !== Number(data.cardId)) {
      unit = new BattleUnit({
        card,
        lane: finite(data.lane),
        col: localCol(view, data.col),
        team: localTeam(view, data.team),
        instance: {
          craftQuality: data.craftQuality,
          strengthLv: data.strengthLv,
          star: data.strengthLv,
          customName: data.customName,
          attributeRoll: data.attributeRoll ?? null,
          awakened: Boolean(data.awakened),
        },
      });
      unit.uid = Number(data.uid);
    }
    updateUnitFromSnapshot(view, unit, data, firstSnapshot || force);
    units.push(unit);
    incomingUnitIds.add(Number(data.uid));
    view.renderer?.requestSprite?.(card.spriteRes);
    view.renderer?.requestBullet?.(card.spriteRes);
  }
  for (const [uid, unit] of existingUnits) {
    if (incomingUnitIds.has(uid)) continue;
    if (unit.alive !== false) {
      unit.alive = false;
      unit.hp = 0;
      unitAnimPlayer.markDeath(unit, engine);
    }
    if (finite(unit._deathUntil) > engine.time) units.push(unit);
  }
  engine.units = units;
  engine.lootDrops = (snapshot.lootDrops ?? engine.lootDrops ?? []).map((drop) => ({
    ...drop,
    lane: finite(drop.lane),
    col: localCol(view, drop.col),
    createdAt: finite(drop.createdAt),
  }));

  // 周期压缩快照可以省略 projectiles；此时绝不能清空客户端正在按
  // projectile-spawn/despawn 时间轴播放的子弹。只有加入/恢复快照明确带了数组时才重建。
  if (Array.isArray(snapshot.projectiles)) {
    const existingProjectiles = new Map((engine.projectiles ?? []).map((item) => [Number(item.id), item]));
    engine.projectiles = snapshot.projectiles.map((data) =>
      buildOrUpdateProjectile(
        view,
        existingProjectiles.get(Number(data.id)),
        data,
        firstSnapshot || force,
        snapshotDt,
      ));
  }

  const ownTeam = String(view.pvp?.team || 'blue');
  const enemyTeam = ownTeam === 'red' ? 'blue' : 'red';
  engine.heroHp = finite(snapshot.heroHp?.[ownTeam], engine.heroHp);
  engine.enemyHeroHp = finite(snapshot.heroHp?.[enemyTeam], engine.enemyHeroHp);
  engine.heroMaxHp = Math.max(1, finite(snapshot.heroMaxHp?.[ownTeam], engine.heroMaxHp));
  engine.enemyHeroMaxHp = Math.max(1, finite(snapshot.heroMaxHp?.[enemyTeam], engine.enemyHeroMaxHp));

  const energy = finite(snapshot.energy?.[ownTeam], engine.sunlight);
  engine.sunlight = energy;
  engine.food = energy;

  engine.status = snapshot.status === 'finished'
    ? (snapshot.winner === ownTeam ? 'win' : 'lose')
    : 'playing';
  engine.waveNumber = 0;
  engine.totalWaves = 0;

  engine.floats ??= [];
  engine.deployEffects ??= [];
  engine.impactFx ??= [];
  engine.bumpFx ??= [];

  view.lastHandKey = '';
  view.lastInfoKey = '';
  view.lastSkillKey = '';
  setStatus(view, `服务器同步 · ${snapshot.t?.toFixed?.(1) ?? snapshot.t ?? 0}s`, true);
}

function advanceAuthorityVisuals(view, dt) {
  const amount = Math.min(1, Math.max(0, dt) * VISUAL_SMOOTHING);
  for (const unit of view.engine?.units ?? []) {
    unit._prevRenderX = unit.col;
    if (Number.isFinite(unit.__authorityTargetCol)) unit.col += (unit.__authorityTargetCol - unit.col) * amount;
    if (Number.isFinite(unit.__authorityTargetLane)) unit.lane += (unit.__authorityTargetLane - unit.lane) * amount;
    unit.renderX = unit.col;
    unit.renderY = unit.lane;
  }

  const projectileAmount = Math.min(1, Math.max(0, dt) * PROJECTILE_SMOOTHING);
  const now = performance.now();
  for (const projectile of view.engine?.projectiles ?? []) {
    const age = Math.min(
      PROJECTILE_EXTRAPOLATE_SEC,
      Math.max(0, (now - finite(projectile.__authorityReceivedAt, now)) / 1000),
    );
    let targetX = finite(projectile.__authorityTargetX, projectile.x)
      + finite(projectile.__authorityVx) * age;
    let targetY = finite(projectile.__authorityTargetY, projectile.y)
      + finite(projectile.__authorityVy) * age;

    const endX = finite(projectile.hitCol, targetX);
    const vx = finite(projectile.__authorityVx);
    if (vx > 0) targetX = Math.min(targetX, endX);
    else if (vx < 0) targetX = Math.max(targetX, endX);
    targetY = Math.max(-0.5, Math.min(4.5, targetY));

    projectile.x += (targetX - projectile.x) * projectileAmount;
    projectile.y += (targetY - projectile.y) * projectileAmount;
  }
}

function syncAuthorityUi(view) {
  if (!view.viewRoot) return;
  if (view.pvp?.spectator) {
    view.syncHud(view.viewRoot);
    return;
  }
  view.renderHand(view.viewRoot);
  view.syncCooldownOverlay(view.viewRoot);
  view.renderCardInfo(view.viewRoot);
  view.syncHud(view.viewRoot);
  view.syncPlaceGridOverlay(view.viewRoot);
}

function authorityOutroRemaining(view) {
  const engine = view.engine;
  if (!engine) return 0;
  let remaining = 0;
  for (const unit of engine.units ?? []) {
    if (unit.alive === false) remaining = Math.max(remaining, finite(unit._deathUntil) - engine.time);
  }
  for (const fx of engine.skillFx ?? engine.skillEffects ?? []) {
    remaining = Math.max(remaining, finite(fx.duration) - finite(fx.t));
  }
  return Math.max(0, remaining);
}

function scheduleAuthorityResultOverlay(view) {
  clearTimeout(view.__pvpAuthorityResultTimer);
  const show = () => {
    syncAuthorityUi(view);
    view.updateResultOverlay?.(view.viewRoot);
  };
  const delayMs = Math.ceil(authorityOutroRemaining(view) * 1000);
  if (delayMs <= 0) queueMicrotask(show);
  else view.__pvpAuthorityResultTimer = setTimeout(show, delayMs);
}

function startAuthorityLoop(view) {
  view.stopLoop();
  view.lastTs = performance.now();
  view.__authorityUiElapsed = 0;

  const tick = (timestamp) => {
    if (!view.__pvpAuthorityActive || !view.engine || !view.renderer) {
      view.raf = null;
      return;
    }
    const dt = Math.min(0.05, Math.max(0, (timestamp - view.lastTs) / 1000));
    view.lastTs = timestamp;
    view.engine.time += dt;
    advanceAuthorityVisuals(view, dt);
    view.engine.cooldowns = (view.engine.cooldowns ?? []).map((cooldown) => Math.max(0, cooldown - dt));
    view.renderer.draw(view.engine);

    view.__authorityUiElapsed += dt;
    if (view.__authorityUiElapsed >= UI_SYNC_INTERVAL) {
      view.__authorityUiElapsed = 0;
      syncAuthorityUi(view);
    }

    if (view.engine.status === 'playing' || authorityOutroRemaining(view) > 0) {
      view.raf = requestAnimationFrame(tick);
    } else {
      view.raf = null;
    }
  };

  view.raf = requestAnimationFrame(tick);
}

function catchUpAuthorityPresentation(view, elapsedSeconds) {
  const elapsed = Math.max(0, finite(elapsedSeconds));
  if (!view.engine || elapsed <= 0) return;

  view.engine.cooldowns = (view.engine.cooldowns ?? [])
    .map((cooldown) => Math.max(0, finite(cooldown) - elapsed));
  view.engine.updateFloats?.(elapsed);
  view.engine.updateDeployEffects?.(elapsed);
  view.engine.updateFx?.(elapsed);
  if (view.renderer) view.renderer.__pvpVisualClockMs = performance.now();
}

function installVisibilityRecovery(view) {
  if (view.__pvpVisibilityHandler) document.removeEventListener('visibilitychange', view.__pvpVisibilityHandler);
  view.__pvpVisibilityHandler = () => {
    view.lastTs = performance.now();
    if (view.__pvpLatestSnapshot) applySnapshot(view, view.__pvpLatestSnapshot, { force: true });
    if (document.hidden) {
      view.__pvpHiddenWallClockMs = Date.now();
      return;
    }

    const hiddenAt = finite(view.__pvpHiddenWallClockMs, Date.now());
    view.__pvpHiddenWallClockMs = null;
    catchUpAuthorityPresentation(view, (Date.now() - hiddenAt) / 1000);
    view.fitBattleScale?.(view.viewRoot);
    requestAnimationFrame(() => view.fitBattleScale?.(view.viewRoot));
    if (!view.raf && (view.engine?.status === 'playing' || authorityOutroRemaining(view) > 0)) {
      startAuthorityLoop(view);
    }
  };
  document.addEventListener('visibilitychange', view.__pvpVisibilityHandler);
}

async function joinAuthority(view) {
  if (!view.pvpSocket?.emitAck) {
    setStatus(view, '当前为本地测试模式');
    return;
  }
  try {
    const event = view.pvp?.spectator ? 'pvp:authority:spectate' : 'pvp:authority:join';
    const response = await view.pvpSocket.emitAck(event, { roomId: view.pvp?.roomId });
    if (response?.team) view.pvp.team = response.team;
    if (response?.snapshot) applySnapshot(view, response.snapshot, { force: true });
  } catch (error) {
    setStatus(view, `服务器同步失败：${error.message}`);
  }
}

function installAuthorityForView(view) {
  if (!view.pvp || view.__pvpAuthorityInstalled) return;
  view.__pvpAuthorityInstalled = true;
  view.__pvpAuthorityActive = true;
  view.pvpUnsub?.();
  view.pvpUnsub = null;

  ensureColumns(view);
  ensureStatus(view);
  view.viewRoot?.querySelector?.('#settings-restart')?.remove?.();
  view.viewRoot?.querySelector?.('#result-retry')?.remove?.();
  view.viewRoot?.querySelector?.('#result-next')?.remove?.();

  if (view.pvpSocket?.on) {
    view.__pvpAuthoritySnapshotUnsub = view.pvpSocket.on('pvp:authority:snapshot', (snapshot) => applySnapshot(view, snapshot));
    view.__pvpAuthorityFinishedUnsub = view.pvpSocket.on('pvp:authority:finished', (snapshot) => {
      applySnapshot(view, snapshot, { force: true });
      scheduleAuthorityResultOverlay(view);
    });
  }

  installVisibilityRecovery(view);
  startAuthorityLoop(view);
  view.fitBattleScale?.(view.viewRoot);
  requestAnimationFrame(() => {
    view.fitBattleScale?.(view.viewRoot);
    ensureColumns(view);
  });
  void joinAuthority(view);
}

function cleanupAuthority(view) {
  view.__pvpAuthorityActive = false;
  clearTimeout(view.__pvpAuthorityResultTimer);
  view.__pvpAuthorityResultTimer = null;
  view.__pvpHiddenWallClockMs = null;
  view.__pvpAuthoritySnapshotUnsub?.();
  view.__pvpAuthorityFinishedUnsub?.();
  view.__pvpAuthoritySnapshotUnsub = null;
  view.__pvpAuthorityFinishedUnsub = null;
  if (view.__pvpVisibilityHandler) {
    document.removeEventListener('visibilitychange', view.__pvpVisibilityHandler);
    view.__pvpVisibilityHandler = null;
  }
  removeColumns(view);
}

export function installPvpAuthoritySyncFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousNavigate = App.prototype.navigate;
  App.prototype.navigate = function navigateWithSharedHeroSkills(...args) {
    globalThis.__clbwzHeroSkills = this.heroSkills;
    return previousNavigate.apply(this, args);
  };

  const previousEnterBattle = BattleView.prototype.enterBattle;
  BattleView.prototype.enterBattle = function enterBattleWithPvpSkills(...args) {
    if (this.pvp && !this.heroSkills) this.heroSkills = globalThis.__clbwzHeroSkills ?? null;
    return previousEnterBattle.apply(this, args);
  };

  const previousRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderAuthoritativePvp(root) {
    const result = await previousRenderBattle.call(this, root);
    if (this.pvp) installAuthorityForView(this);
    return result;
  };

  const previousCanDragCard = BattleView.prototype.canDragCard;
  BattleView.prototype.canDragCard = function canDragAuthorityCard(handIndex) {
    if (this.pvp?.spectator) return false;
    if (!this.pvp || !this.__pvpAuthorityActive) return previousCanDragCard.call(this, handIndex);
    const entry = this.engine?.deck?.[handIndex];
    const card = entry?.card;
    if (!card) return false;
    const cost = Math.max(1, Math.round(finite(card.costA ?? card.cost_a ?? card.cost, 1)));
    return this.engine.status === 'playing'
      && finite(this.engine.sunlight) >= cost
      && finite(this.engine.cooldowns?.[handIndex]) <= 0
      && !this.__pvpDeployPending;
  };

  const previousTryDeployAt = BattleView.prototype.tryDeployAt;
  BattleView.prototype.tryDeployAt = async function deployThroughAuthority(root, lane, col, handIndex = this.engine?.selectedHandIndex) {
    if (this.pvp?.spectator) return false;
    if (!this.pvp || !this.__pvpAuthorityActive || !this.pvpSocket?.emitAck) {
      return previousTryDeployAt.call(this, root, lane, col, handIndex);
    }
    if (this.__pvpDeployPending || !Number.isInteger(handIndex) || handIndex < 0) return false;
    const entry = this.engine?.deck?.[handIndex];
    if (!entry?.card) return false;

    this.__pvpDeployPending = true;
    try {
      const canonicalCol = isRedPerspective(this) ? COLS - 1 - Number(col) : Number(col);
      const instance = entry.instance ?? {};
      const response = await this.pvpSocket.emitAck('pvp:authority:deploy', {
        cardId: entry.card.id,
        lane: Number(lane),
        col: canonicalCol,
        craftQuality: instance.craftQuality ?? 1,
        strengthLv: instance.strengthLv ?? instance.star ?? 0,
        attributeRoll: instance.attributeRoll ?? null,
        customName: instance.customName ?? null,
        awakened: Boolean(instance.awakened),
      });
      if (response?.snapshot) applySnapshot(this, response.snapshot, { force: true });
      const stats = calculateCardStats(
        entry.card,
        entry.instance?.craftQuality ?? 1,
        entry.instance?.star ?? entry.instance?.strengthLv ?? 0,
        entry.instance?.attributeRoll ?? null,
      );
      this.engine.cooldowns[handIndex] = Math.max(0, finite(stats.cd));
      this.engine.cancelPlacing();
      this.renderer?.setHover?.(-1, -1);
      this.renderer?.requestSprite?.(entry.card.spriteRes);
      this.renderer?.requestBullet?.(entry.card.spriteRes);
      this.lastHandKey = '';
      this.lastInfoKey = '';
      return true;
    } catch (error) {
      this.engine.lastDeployError = error.message || '服务器拒绝放置';
      this.lastInfoKey = '';
      this.renderCardInfo(root);
      return false;
    } finally {
      this.__pvpDeployPending = false;
    }
  };

  const previousRestartBattle = BattleView.prototype.restartBattle;
  BattleView.prototype.restartBattle = async function restartAuthorityBattle(...args) {
    if (!this.pvp || !this.__pvpAuthorityActive) return previousRestartBattle.apply(this, args);
    await joinAuthority(this);
    return undefined;
  };

  const previousDestroy = BattleView.prototype.destroy;
  BattleView.prototype.destroy = function destroyPvpAuthority() {
    cleanupAuthority(this);
    return previousDestroy.call(this);
  };

  window.__verifyPvpAuthoritySyncFinal = () => {
    const battle = document.querySelector('.pvp-wilderness-battle');
    const wrap = battle?.querySelector('.battle-game-wrap');
    const rect = wrap?.getBoundingClientRect();
    return {
      enabled: true,
      active: Boolean(battle),
      authoritative: Boolean(document.querySelector('.pvp-authority-status')),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      battleRect: rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null,
      columns: document.querySelectorAll('[data-pvp-authority-column]').length,
      projectileExtrapolateSec: PROJECTILE_EXTRAPOLATE_SEC,
      uiSyncInterval: UI_SYNC_INTERVAL,
      preservesVisualQueues: true,
      preservesTimelineProjectilesOnCompactSnapshots: true,
    };
  };
}
