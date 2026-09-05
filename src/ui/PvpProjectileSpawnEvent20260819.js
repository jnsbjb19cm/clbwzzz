import { BattleView } from './BattleView.js';
import { Projectile } from '../battle/Projectile.js';
import {
  applyProjectileServerTimeline,
  configureProjectileServerTimeline,
  startPvpServerClock,
  stopPvpServerClock,
} from './PvpServerTimeline20260819.js';

const PATCH_FLAG = Symbol.for('clbwzzz.pvpProjectileSpawnEvent20260819');
const COLS = 12;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isRedPerspective(view) {
  return String(view?.pvp?.team || 'blue') === 'red';
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

function launchPath(view, data) {
  return {
    startCol: localCol(view, data.flightStartCol ?? data.startCol),
    startLane: finite(data.flightStartLane, data.lane),
    endCol: localCol(view, data.flightEndCol ?? data.hitCol),
    endLane: finite(data.flightEndLane, finite(data.hitLane, data.lane)),
  };
}

function latestSnapshotAlreadyRemoved(view, payload, projectileId) {
  if (view.__pvpProjectileDespawnedIds?.has?.(projectileId)) return true;
  const eventT = finite(payload?.t, Number.POSITIVE_INFINITY);
  const snapshotT = finite(view.__pvpAuthoritySnapshotTime, Number.NEGATIVE_INFINITY);
  if (snapshotT + 1e-6 < eventT) return false;

  // 新的周期状态快照会故意省略 projectiles 来降低带宽/序列化开销。
  // 只有“明确携带完整 projectile 数组”的加入/恢复快照，才有资格根据缺失推断该弹已消失。
  const snapshotProjectiles = view.__pvpLatestSnapshot?.projectiles;
  if (!Array.isArray(snapshotProjectiles)) return false;
  return !snapshotProjectiles.some((entry) => Number(entry?.id) === projectileId);
}

function createProjectile(view, data) {
  const path = launchPath(view, data);
  const resolveCol = localCol(view, data.resolveCol ?? data.hitCol ?? data.flightEndCol);
  const attackerCol = localCol(view, data.attackerCol ?? data.startCol ?? data.flightStartCol);
  const owner = localTeam(view, data.owner);

  const projectile = new Projectile({
    owner,
    lane: path.startLane,
    startCol: path.startCol,
    hitLane: path.endLane,
    hitCol: path.endCol,
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
  if (Number.isFinite(Number(data.arcHeight))) projectile._arcHeight = Math.max(0, Number(data.arcHeight));
  return projectile;
}

function applyLaunchPayload(view, projectile, payload) {
  const data = payload.projectile;
  const path = launchPath(view, data);
  const hitCol = localCol(view, data.hitCol ?? data.flightEndCol);
  const resolveCol = localCol(view, data.resolveCol ?? data.hitCol ?? data.flightEndCol);
  const attackerCol = localCol(view, data.attackerCol ?? data.startCol ?? data.flightStartCol);
  const targetX = localCol(view, data.x ?? data.flightStartCol ?? data.startCol);
  const targetY = finite(data.y, path.startLane);
  const owner = localTeam(view, data.owner);

  projectile.id = Number(data.id);
  projectile.owner = owner;
  projectile.lane = path.startLane;
  projectile.startCol = path.startCol;
  projectile.sourceCol = path.startCol;
  projectile.hitLane = finite(data.hitLane, path.endLane);
  projectile.hitCol = hitCol;
  projectile.resolveCol = resolveCol;
  if (data.targetLayerMask != null) {
    projectile.targetLayerMask = Number(data.targetLayerMask) & 3;
  }
  projectile.targetBase = localBase(view, data.targetBase);
  projectile.attackerCol = attackerCol;
  projectile.attackerLane = finite(data.attackerLane, data.lane);
  projectile.launched = data.launched !== false;
  projectile.done = false;

  projectile.flightStartCol = path.startCol;
  projectile.flightStartLane = path.startLane;
  projectile.flightEndCol = path.endCol;
  projectile.flightEndLane = path.endLane;
  if (Number.isFinite(Number(data.arcHeight))) projectile._arcHeight = Math.max(0, Number(data.arcHeight));

  const localNow = performance.now();
  const timelineEnabled = configureProjectileServerTimeline(
    projectile,
    payload,
    view.__pvpServerClock,
    localNow,
  );

  if (timelineEnabled) {
    projectile.__serverTimelineView = view;
    applyProjectileServerTimeline(view, projectile, localNow);
  } else {
    projectile.progress = finite(data.progress);
    projectile.flightT = finite(data.flightT);
    projectile.arcOffset = finite(data.arcOffset);
    projectile.x = targetX;
    projectile.y = targetY;
    projectile.__authorityTargetX = targetX;
    projectile.__authorityTargetY = targetY;
    projectile.__authorityReceivedAt = localNow;

    const launchOwnedTrajectory = projectile.trajectory === 'straight' || projectile.trajectory === 'parabola';
    projectile.__authorityVx = launchOwnedTrajectory && projectile.launched
      ? finite(projectile._flightVx)
      : 0;
    projectile.__authorityVy = launchOwnedTrajectory && projectile.launched
      ? finite(projectile._flightVy)
      : 0;
  }

  return projectile;
}

function createImmediateProjectile(view, payload) {
  const data = payload?.projectile;
  const engine = view?.engine;
  if (!data || !engine || data.done) return null;
  const id = Number(data.id);
  if (!Number.isFinite(id)) return null;

  let projectile = (engine.projectiles ?? []).find((entry) => Number(entry?.id) === id);
  if (!projectile && latestSnapshotAlreadyRemoved(view, payload, id)) return null;
  if (!projectile) {
    projectile = createProjectile(view, data);
    engine.projectiles ??= [];
    engine.projectiles.push(projectile);
  }

  applyLaunchPayload(view, projectile, payload);
  view.renderer?.requestBullet?.(data.sourceRes);
  return projectile;
}

function adoptSnapshotTimelines(view, snapshot) {
  if (!view?.engine || !snapshot) return;
  const localNow = performance.now();
  const locals = new Map((view.engine.projectiles ?? []).map((projectile) => [Number(projectile.id), projectile]));
  for (const data of snapshot.projectiles ?? []) {
    if (!Number.isFinite(Number(data?.launchServerTimeMs)) || !Number.isFinite(Number(data?.endServerTimeMs))) continue;
    const projectile = locals.get(Number(data.id));
    if (!projectile) continue;

    const enabled = configureProjectileServerTimeline(
      projectile,
      {
        launchServerTimeMs: data.launchServerTimeMs,
        endServerTimeMs: data.endServerTimeMs,
        durationMs: data.durationMs,
        serverTimeMs: snapshot.serverTimeMs,
      },
      view.__pvpServerClock,
      localNow,
    );
    if (!enabled) continue;
    const path = launchPath(view, data);
    projectile.__serverTimelineView = view;
    projectile.flightStartCol = path.startCol;
    projectile.flightStartLane = path.startLane;
    projectile.flightEndCol = path.endCol;
    projectile.flightEndLane = path.endLane;
    if (Number.isFinite(Number(data.arcHeight))) projectile._arcHeight = Math.max(0, Number(data.arcHeight));
    applyProjectileServerTimeline(view, projectile, localNow);
  }
}

function removeImmediateProjectile(view, payload) {
  const id = Number(payload?.id);
  if (!Number.isFinite(id) || !view?.engine) return false;
  view.__pvpProjectileDespawnedIds ??= new Set();
  view.__pvpProjectileDespawnedIds.add(id);
  const before = view.engine.projectiles?.length ?? 0;
  view.engine.projectiles = (view.engine.projectiles ?? []).filter((entry) => Number(entry?.id) !== id);
  return (view.engine.projectiles?.length ?? 0) !== before;
}

function installForView(view) {
  if (!view?.pvp || !view.pvpSocket?.on || view.__pvpProjectileSpawnEventUnsub) return;
  view.__pvpProjectileDespawnedIds ??= new Set();
  view.__pvpProjectileSpawnEventUnsub = view.pvpSocket.on(
    'pvp:authority:projectile-spawn',
    (payload) => createImmediateProjectile(view, payload),
  );
  view.__pvpProjectileDespawnEventUnsub = view.pvpSocket.on(
    'pvp:authority:projectile-despawn',
    (payload) => removeImmediateProjectile(view, payload),
  );
  view.__pvpProjectileSnapshotTimelineUnsub = view.pvpSocket.on(
    'pvp:authority:snapshot',
    (snapshot) => queueMicrotask(() => adoptSnapshotTimelines(view, snapshot)),
  );
  startPvpServerClock(view);
}

function cleanupForView(view) {
  view.__pvpProjectileSpawnEventUnsub?.();
  view.__pvpProjectileDespawnEventUnsub?.();
  view.__pvpProjectileSnapshotTimelineUnsub?.();
  view.__pvpProjectileSpawnEventUnsub = null;
  view.__pvpProjectileDespawnEventUnsub = null;
  view.__pvpProjectileSnapshotTimelineUnsub = null;
  view.__pvpProjectileDespawnedIds?.clear?.();
  for (const projectile of view.engine?.projectiles ?? []) {
    if (projectile.__serverTimelineView === view) projectile.__serverTimelineView = null;
  }
  stopPvpServerClock(view);
}

export function installPvpProjectileSpawnEvent20260819() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousRenderBattle = BattleView.prototype.renderBattle;
  BattleView.prototype.renderBattle = async function renderWithImmediateProjectileSpawn(root) {
    const result = await previousRenderBattle.call(this, root);
    installForView(this);
    return result;
  };

  const previousDestroy = BattleView.prototype.destroy;
  BattleView.prototype.destroy = function destroyImmediateProjectileSpawn(...args) {
    cleanupForView(this);
    return previousDestroy.apply(this, args);
  };
}
