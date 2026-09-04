import { roomManager } from '../rooms/RoomManager.js';
import { CoopBossBattle } from '../battle/CoopBossBattle.js';
import { PvpBattle } from '../battle/PvpBattle.js';
import { unitAnimPlayer } from '../../src/battle/UnitAnimPlayer.js';
import { db, withTransaction } from '../database.js';

// 战斗结果固定约60Hz权威推进；普通世界状态约30Hz广播。
// straight/parabola projectile 不再依赖周期性位置快照推进画面：发射时发送一次
// 服务器时间轴合同，客户端按绝对服务器时间求轨迹；命中/消失再即时发 despawn。
const STEP_SECONDS = 0.0166666667;
const BROADCAST_SECONDS = 0.0333333333;
const HEAVY_BROADCAST_SECONDS = 0.05;
const HEAVY_UNIT_SNAPSHOT_THRESHOLD = 30;
const MAX_CATCHUP_SECONDS = 0.25;
const FINISHED_RETENTION_MS = 30_000;
const BOT_DECK_IDS = [1, 2, 3, 4, 5, 6, 8, 9, 11, 15, 17, 19, 20, 21, 22, 25, 26, 30, 31, 32, 33, 35, 36, 37, 38];

// roomId -> { battle, timer, lastAt, accumulator, broadcastAccumulator, seq, cleanupTimer }
const authorityBattles = new Map();

function monotonicNowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function recipientSocketIds(room, entry) {
  const ids = new Set();
  for (const member of room.members?.values?.() ?? []) {
    if (member?.socketId) ids.add(member.socketId);
  }
  for (const socketId of entry?.spectators?.values?.() ?? []) {
    if (socketId) ids.add(socketId);
  }
  return ids;
}

function ackOk(ack, data = {}) {
  if (typeof ack === 'function') ack({ ok: true, ...data });
}

function ackError(ack, error) {
  if (typeof ack === 'function') {
    ack({ ok: false, message: error instanceof Error ? error.message : String(error) });
  }
}

function isTimelineProjectile(projectile) {
  return projectile?.launched === true
    && projectile?.done !== true
    && (projectile?.trajectory === 'straight' || projectile?.trajectory === 'parabola');
}

function ensureProjectileTimeline(projectile, serverTimeMs = monotonicNowMs()) {
  if (!isTimelineProjectile(projectile)) return null;
  if (!Number.isFinite(Number(projectile.__authorityLaunchServerTimeMs))) {
    const elapsedSec = Math.max(0, Number(projectile._flightElapsed) || 0);
    const durationSec = Math.max(0.001, Number(projectile._flightDuration) || 0.001);
    projectile.__authorityLaunchServerTimeMs = Number(serverTimeMs) - elapsedSec * 1000;
    projectile.__authorityEndServerTimeMs = projectile.__authorityLaunchServerTimeMs + durationSec * 1000;
    projectile.__authorityDurationMs = durationSec * 1000;
  }
  return {
    launchServerTimeMs: Number(projectile.__authorityLaunchServerTimeMs),
    endServerTimeMs: Number(projectile.__authorityEndServerTimeMs),
    durationMs: Number(projectile.__authorityDurationMs),
  };
}

function projectileSnapshot(projectile, serverTimeMs = monotonicNowMs()) {
  const timeline = ensureProjectileTimeline(projectile, serverTimeMs);
  return {
    id: projectile.id,
    owner: projectile.owner,
    lane: projectile.lane,
    startCol: projectile.startCol,
    hitLane: projectile.hitLane,
    hitCol: projectile.hitCol,
    resolveCol: projectile.resolveCol,
    // 普通弹视觉必须使用 Projectile 构造时锁死的 flightStart/flightEnd；
    // hitCol 之后可能因目标移动而变化，只能用于权威碰撞/结算信息，不能重写飞行路线。
    flightStartCol: projectile.flightStartCol,
    flightStartLane: projectile.flightStartLane,
    flightEndCol: projectile.flightEndCol,
    flightEndLane: projectile.flightEndLane,
    arcHeight: projectile._arcHeight,
    damage: projectile.damage,
    trajectory: projectile.trajectory,
    color: projectile.color,
    targetUid: projectile.targetUid,
    targetLayerMask: projectile.targetLayerMask,
    targetBase: projectile.targetBase,
    sourceUid: projectile.sourceUid,
    sourceRes: projectile.sourceRes,
    icon: projectile.icon,
    attackPattern: projectile.attackPattern,
    progress: projectile.progress,
    flightT: projectile.flightT,
    x: projectile.x,
    y: projectile.y,
    arcOffset: projectile.arcOffset,
    attackerCol: projectile.attackerCol,
    attackerLane: projectile.attackerLane,
    visualOnly: projectile.visualOnly,
    pierce: projectile.pierce,
    launched: projectile.launched,
    done: projectile.done,
    ...(timeline ?? {}),
  };
}

/**
 * projectile 真正离膛的权威 tick 只发送一次轨迹合同。
 * 客户端收到后按 launch/end server time 直接计算可见位置，不再从“收包时刻”重新起跑。
 */
export function emitNewProjectileLaunchEvents(io, room, entry) {
  if (!io || !room || !entry?.battle?.engine) return 0;
  entry.launchedProjectileIds ??= new Set();
  const engine = entry.battle.engine;
  let launched = 0;

  for (const projectile of engine.projectiles ?? []) {
    if (!isTimelineProjectile(projectile)) continue;
    const id = Number(projectile.id);
    if (!Number.isFinite(id) || entry.launchedProjectileIds.has(id)) continue;
    const serverTimeMs = monotonicNowMs();
    const timeline = ensureProjectileTimeline(projectile, serverTimeMs);
    if (!timeline) continue;

    entry.launchedProjectileIds.add(id);
    launched += 1;
    const payload = {
      t: Number(engine.time) || 0,
      serverNow: Date.now(),
      serverTimeMs,
      ...timeline,
      projectile: projectileSnapshot(projectile, serverTimeMs),
    };
    for (const socketId of recipientSocketIds(room, entry)) {
      io.to(socketId).emit('pvp:authority:projectile-spawn', payload);
    }
  }
  return launched;
}

/**
 * projectile 的最终碰撞/伤害仍由服务端决定。已经发过 launch 的 projectile 一旦在
 * 权威 tick 内消失，立即发送 despawn，避免客户端为了移除视觉再等下一份世界快照。
 */
export function emitRemovedProjectileEvents(io, room, entry, previousProjectiles) {
  if (!io || !room || !entry?.battle?.engine || !(previousProjectiles instanceof Map)) return 0;
  entry.despawnedProjectileIds ??= new Set();
  const engine = entry.battle.engine;
  const liveIds = new Set((engine.projectiles ?? []).map((projectile) => Number(projectile?.id)));
  let removed = 0;

  for (const [id, projectile] of previousProjectiles) {
    const numericId = Number(id);
    if (!Number.isFinite(numericId) || liveIds.has(numericId)) continue;
    if (!entry.launchedProjectileIds?.has(numericId) || entry.despawnedProjectileIds.has(numericId)) continue;
    entry.despawnedProjectileIds.add(numericId);
    removed += 1;

    const payload = {
      id: numericId,
      t: Number(engine.time) || 0,
      serverNow: Date.now(),
      serverTimeMs: monotonicNowMs(),
      x: Number(projectile?.x),
      y: Number(projectile?.y),
      resolveCol: Number(projectile?.resolveCol ?? projectile?.hitCol),
      hitLane: Number(projectile?.hitLane ?? projectile?.lane),
    };
    for (const socketId of recipientSocketIds(room, entry)) {
      io.to(socketId).emit('pvp:authority:projectile-despawn', payload);
    }
  }
  return removed;
}

function impactSnapshot(entry, impact) {
  if (!impact.__authorityImpactId) {
    entry.impactSeq = (Number(entry.impactSeq) || 0) + 1;
    impact.__authorityImpactId = entry.impactSeq;
  }
  return {
    id: impact.__authorityImpactId,
    lane: Number(impact.lane),
    col: Number(impact.col),
    amount: Number(impact.amount) || 0,
    res: impact.res != null ? String(impact.res) : null,
    t: Number(impact.t) || 0,
    life: Number(impact.life) || 0,
  };
}

function activeAnimationStart(battle, unit, state, animUntil) {
  const time = Number(battle?.engine?.time) || 0;
  if (state === 'attacking' && Number.isFinite(Number(unit?._attackAnimStartedAt))) {
    return Number(unit._attackAnimStartedAt);
  }
  if (state === 'jump' && Number.isFinite(Number(unit?._jumpStart))) {
    return Number(unit._jumpStart);
  }
  if (unit?._forcedAnimState === state) {
    if (Number.isFinite(Number(unit._forcedAnimStartedAt))) return Number(unit._forcedAnimStartedAt);
    const duration = Math.max(0.001, unitAnimPlayer.resolveAnimationDuration(unit, state, 0.45));
    if (animUntil > 0) return Math.max(0, animUntil - duration);
  }
  return time;
}

function unitSnapshot(battle, unit) {
  const base = battle.publicUnit(unit);
  const time = battle.engine.time;
  let state = base.animState || base.state;
  if (unit.attackingBase || (unit._attackAnimUntil && time < unit._attackAnimUntil)) {
    state = 'attacking';
  } else if (unit._jumpUntil && time < unit._jumpUntil) {
    state = 'jump';
  }
  const animUntil = Number(base.animUntil)
    || Math.max(
      Number(unit._attackAnimUntil) || 0,
      Number(unit._jumpUntil) || 0,
      Number(unit._forcedAnimUntil) || 0,
      Number(unit.stunnedUntil) || 0,
      Number(unit.frozenUntil) || 0,
    );
  return {
    ...base,
    state,
    animState: base.animState || state,
    animUntil,
    animStartedAt: activeAnimationStart(battle, unit, base.animState || state, animUntil),
    attackReadyAt: Number(time) + Math.max(0, Number(unit.atkTimer) || 0),
    firstContactStun: Boolean(unit._firstContactStun),
    attackingBase: Boolean(unit.attackingBase),
  };
}

function buildSnapshot(entry, userId, seq = ++entry.seq, basicOverride = null) {
  const battle = entry.battle;
  const engine = battle.engine;
  const basic = basicOverride ?? battle.snapshot();
  const decoratedUnits = new Map((basic.units ?? []).map((unit) => [Number(unit.uid), unit]));
  const team = battle.teamOf(userId);
  const resources = battle.publicResources(userId);
  const skill = battle.publicSkillState(userId);
  const serverTimeMs = monotonicNowMs();
  return {
    ...basic,
    protocol: battle.mode === 'boss' ? 'server-authoritative-boss-v2' : 'server-authoritative-v5',
    seq,
    serverNow: Date.now(),
    serverTimeMs,
    viewerUserId: Number(userId),
    viewerTeam: team,
    resources,
    skill,
    energy: {
      blue: team === 'blue' ? resources.sun : 0,
      red: team === 'red' ? resources.sun : 0,
    },
    heroMaxHp: {
      blue: Math.round(engine.heroMaxHp),
      red: Math.round(engine.enemyHeroMaxHp),
    },
    units: engine.units
      .filter((unit) => unit.alive)
      .map((unit) => ({
        ...(decoratedUnits.get(Number(unit.uid)) ?? {}),
        ...unitSnapshot(battle, unit),
      })),
    // Snapshot 仅承担加入战斗/丢包恢复所需的 active projectile 描述；
    // timeline projectile 的每帧 X/Y 不再由这里驱动。
    projectiles: engine.projectiles
      .filter((projectile) => !projectile.done)
      .map((projectile) => projectileSnapshot(projectile, serverTimeMs)),
    impactEvents: (engine.impactFx ?? []).map((impact) => impactSnapshot(entry, impact)),
  };
}

function teamRepresentativeSun(battle, team) {
  const members = team === 'blue' ? battle.teamBlue : battle.teamRed;
  if (!Array.isArray(members) || !members.length) return 0;
  const first = members[0];
  const resource = battle.resourcesOf?.(first.userId) ?? { sun: 0 };
  return round2(resource.sun);
}

function buildSpectatorSnapshot(entry, userId, seq = ++entry.seq, basicOverride = null) {
  const battle = entry.battle;
  const engine = battle.engine;
  const basic = basicOverride ?? battle.snapshot();
  const decoratedUnits = new Map((basic.units ?? []).map((unit) => [Number(unit.uid), unit]));
  const serverTimeMs = monotonicNowMs();
  return {
    ...basic,
    protocol: battle.mode === 'boss' ? 'server-authoritative-boss-v2' : 'server-authoritative-v5',
    seq,
    serverNow: Date.now(),
    serverTimeMs,
    viewerUserId: Number(userId),
    viewerTeam: 'blue',
    resources: null,
    skill: null,
    energy: {
      blue: teamRepresentativeSun(battle, 'blue'),
      red: teamRepresentativeSun(battle, 'red'),
    },
    heroMaxHp: {
      blue: Math.round(engine.heroMaxHp),
      red: Math.round(engine.enemyHeroMaxHp),
    },
    units: engine.units
      .filter((unit) => unit.alive)
      .map((unit) => ({
        ...(decoratedUnits.get(Number(unit.uid)) ?? {}),
        ...unitSnapshot(battle, unit),
      })),
    projectiles: engine.projectiles
      .filter((projectile) => !projectile.done)
      .map((projectile) => projectileSnapshot(projectile, serverTimeMs)),
    impactEvents: (engine.impactFx ?? []).map((impact) => impactSnapshot(entry, impact)),
  };
}

function emitPersonalized(io, room, entry, eventName) {
  const seq = ++entry.seq;
  // 基础战斗快照只算一次，再为每个玩家/观战者包装个性化字段，避免多人时重复序列化。
  const basic = entry.battle.snapshot();
  for (const member of room.members.values()) {
    if (!member.socketId) continue;
    io.to(member.socketId).emit(eventName, buildSnapshot(entry, member.userId, seq, basic));
  }
  for (const [spectatorUserId, socketId] of entry.spectators ?? []) {
    if (!socketId) continue;
    io.to(socketId).emit(eventName, buildSpectatorSnapshot(entry, spectatorUserId, seq, basic));
  }
}

function broadcastSnapshots(io, room, entry) {
  emitPersonalized(io, room, entry, 'pvp:authority:snapshot');
}

const AUTHORITY_DROP_ITEM_IDS = [10001, 10002, 10003, 10004, 10005, 30055];

async function awardAuthorityBattleDrops(room, entry) {
  if (entry._dropsAwarded) return;
  entry._dropsAwarded = true;

  const members = [...room.members.values()].filter((m) => Number.isFinite(Number(m.userId)));
  if (!members.length) return;

  const grants = members.map((member) => {
    const itemId = AUTHORITY_DROP_ITEM_IDS[Math.floor(Math.random() * AUTHORITY_DROP_ITEM_IDS.length)];
    const count = 1 + Math.floor(Math.random() * 3);
    return { userId: Number(member.userId), itemId, count };
  });

  await withTransaction(async (conn) => {
    for (const grant of grants) {
      const existing = await conn.get(
        'SELECT * FROM player_items WHERE user_id=? AND item_id=? AND is_bound=0',
        [grant.userId, grant.itemId],
      );
      if (existing) {
        await conn.run(
          'UPDATE player_items SET count=count+? WHERE user_id=? AND item_id=? AND is_bound=0',
          [grant.count, grant.userId, grant.itemId],
        );
      } else {
        await conn.run(
          'INSERT INTO player_items(user_id,item_id,count,is_bound) VALUES(?,?,?,0)',
          [grant.userId, grant.itemId, grant.count],
        );
      }
    }
  });
}

function broadcastFinished(io, room, entry) {
  awardAuthorityBattleDrops(room, entry).catch((error) => console.error('[clbwzzz] award drops failed', error));
  emitPersonalized(io, room, entry, 'pvp:authority:finished');
}

function stopAuthorityBattle(roomId) {
  const entry = authorityBattles.get(Number(roomId));
  if (!entry) return;
  clearInterval(entry.timer);
  if (entry.cleanupTimer) clearTimeout(entry.cleanupTimer);
  authorityBattles.delete(Number(roomId));
}

function cleanupSpectator(socket) {
  const userId = Number(socket.user?.id);
  if (!Number.isFinite(userId)) return;
  for (const entry of authorityBattles.values()) {
    entry.spectators?.delete?.(userId);
  }
}

function scheduleFinishedCleanup(roomId, entry) {
  if (entry.cleanupTimer) return;
  entry.cleanupTimer = setTimeout(() => stopAuthorityBattle(roomId), FINISHED_RETENTION_MS);
}

function createBattle(teams, cardDb) {
  const { room } = teams;
  if (room.mode === 'boss') {
    return new CoopBossBattle({
      roomId: room.id,
      members: [...room.members.values()].map((member) => ({
        userId: member.userId,
        nickname: member.nickname,
      })),
      db: cardDb,
      bossId: room.bossId,
      difficulty: room.difficulty,
    });
  }
  return new PvpBattle({
    roomId: room.id,
    mapId: room.mapId,
    teamBlue: teams.teamBlue,
    teamRed: teams.teamRed,
    db: cardDb,
  });
}

function runBotAI(entry, room) {
  if (!entry.battle || entry.battle.status !== 'playing') return;
  const now = entry.battle.engine?.time ?? 0;
  for (const member of room.members.values()) {
    if (!member?.isBot) continue;
    const nextDeployAt = Number(member._botDeployAt || 0);
    if (now < nextDeployAt) continue;
    member._botDeployAt = now + 2.2;
    const cardId = BOT_DECK_IDS[Math.floor(Math.random() * BOT_DECK_IDS.length)];
    const lane = Math.floor(Math.random() * 5);
    const isBlue = member.team === 'blue';
    const col = isBlue ? Math.floor(Math.random() * 5) : 7 + Math.floor(Math.random() * 5);
    try {
      entry.battle.deploy(Number(member.userId), { cardId, lane, col });
    } catch {
      // 资源不足或位置非法时跳过
    }
  }
}

function ensureAuthorityBattle(roomId, io, cardDb) {
  const numericRoomId = Number(roomId);
  const existing = authorityBattles.get(numericRoomId);
  if (existing) return existing;

  const teams = roomManager.getTeams(numericRoomId);
  if (!teams?.room || !['pvp', 'boss'].includes(teams.room.mode)) {
    throw new Error('权威战斗房间不存在');
  }
  if (!['starting', 'battling'].includes(teams.room.status)) {
    throw new Error('战斗尚未开始');
  }
  teams.room.status = 'battling';

  const entry = {
    battle: createBattle(teams, cardDb),
    timer: null,
    lastAt: monotonicNowMs(),
    accumulator: 0,
    broadcastAccumulator: 0,
    seq: 0,
    impactSeq: 0,
    launchedProjectileIds: new Set(),
    despawnedProjectileIds: new Set(),
    spectators: new Map(),
    cleanupTimer: null,
  };

  entry.timer = setInterval(() => {
    const room = roomManager.getRoom(numericRoomId);
    if (!room) {
      stopAuthorityBattle(numericRoomId);
      return;
    }

    const now = monotonicNowMs();
    const elapsed = Math.min(MAX_CATCHUP_SECONDS, Math.max(0, (now - entry.lastAt) / 1000));
    entry.lastAt = now;
    entry.accumulator += elapsed;
    entry.broadcastAccumulator += elapsed;

    while (entry.accumulator >= STEP_SECONDS) {
      const previousProjectiles = new Map(
        (entry.battle.engine?.projectiles ?? []).map((projectile) => [Number(projectile.id), projectile]),
      );
      entry.battle.tick(STEP_SECONDS);
      emitNewProjectileLaunchEvents(io, room, entry);
      emitRemovedProjectileEvents(io, room, entry, previousProjectiles);
      entry.accumulator -= STEP_SECONDS;
    }
    runBotAI(entry, room);

    const unitCount = entry.battle.engine?.units?.length ?? 0;
    const broadcastInterval = unitCount >= HEAVY_UNIT_SNAPSHOT_THRESHOLD
      ? HEAVY_BROADCAST_SECONDS
      : BROADCAST_SECONDS;
    if (entry.broadcastAccumulator >= broadcastInterval || entry.battle.status !== 'playing') {
      entry.broadcastAccumulator = 0;
      broadcastSnapshots(io, room, entry);
      if (entry.battle.status !== 'playing') {
        broadcastFinished(io, room, entry);
        scheduleFinishedCleanup(numericRoomId, entry);
      }
    }
  }, STEP_SECONDS * 1000);

  authorityBattles.set(numericRoomId, entry);
  return entry;
}

function currentRoomAndBattle(socket, io, cardDb) {
  const room = roomManager.getRoomByUser(socket.user?.id);
  if (!room) throw new Error('你不在房间中');
  return {
    room,
    entry: ensureAuthorityBattle(room.id, io, cardDb),
  };
}

/** PVP 与多人 BOSS 共用同一套权威 Socket 协议。 */
export function registerPvpAuthorityHandlers(io, { cardDb }) {
  io.on('connection', (socket) => {
    // 只同步单调时间轴，不涉及战斗结果。四时间戳由客户端计算 offset/RTT。
    socket.on('pvp:authority:clock-sync', (payload = {}, ack) => {
      const serverReceiveMs = monotonicNowMs();
      const serverSendMs = monotonicNowMs();
      ackOk(ack, {
        clientSendMs: Number(payload.clientSendMs),
        serverReceiveMs,
        serverSendMs,
      });
    });

    socket.on('pvp:authority:join', (payload = {}, ack) => {
      try {
        const { entry } = currentRoomAndBattle(socket, io, cardDb);
        if (Array.isArray(payload.loadout)) {
          entry.battle.setSkillLoadout(socket.user.id, payload.loadout, payload.maxMp);
        }
        const snapshot = buildSnapshot(entry, socket.user.id);
        socket.emit('pvp:authority:snapshot', snapshot);
        ackOk(ack, {
          snapshot,
          userId: Number(socket.user.id),
          team: entry.battle.teamOf(socket.user.id),
          protocol: snapshot.protocol,
        });
      } catch (error) {
        ackError(ack, error);
      }
    });

    socket.on('pvp:authority:spectate', (payload = {}, ack) => {
      try {
        const roomId = Number(payload.roomId);
        const room = roomManager.getRoom(roomId);
        if (!room) throw new Error('房间不存在');
        if (!['starting', 'battling', 'finished'].includes(room.status)) {
          throw new Error('战斗尚未开始');
        }
        if (roomManager.getRoomByUser(socket.user.id)) {
          throw new Error('你正在房间内，不能观战');
        }
        const entry = ensureAuthorityBattle(roomId, io, cardDb);
        entry.spectators.set(socket.user.id, socket.id);
        socket.join(`room:${roomId}`);
        const snapshot = buildSpectatorSnapshot(entry, socket.user.id);
        socket.emit('pvp:authority:snapshot', snapshot);
        ackOk(ack, {
          snapshot,
          userId: Number(socket.user.id),
          team: 'blue',
          protocol: snapshot.protocol,
        });
      } catch (error) {
        ackError(ack, error);
      }
    });

    socket.on('pvp:authority:leave-spectate', (payload = {}, ack) => {
      try {
        const roomId = Number(payload.roomId);
        const entry = authorityBattles.get(roomId);
        entry?.spectators?.delete?.(socket.user.id);
        if (roomId) socket.leave(`room:${roomId}`);
        ackOk(ack, { ok: true });
      } catch (error) {
        ackError(ack, error);
      }
    });

    socket.on('pvp:authority:set-loadout', (payload = {}, ack) => {
      try {
        const { room, entry } = currentRoomAndBattle(socket, io, cardDb);
        const skill = entry.battle.setSkillLoadout(
          socket.user.id,
          payload.loadout,
          payload.maxMp,
        );
        broadcastSnapshots(io, room, entry);
        ackOk(ack, {
          skill,
          snapshot: buildSnapshot(entry, socket.user.id),
        });
      } catch (error) {
        ackError(ack, error);
      }
    });

    socket.on('pvp:authority:deploy', (payload = {}, ack) => {
      try {
        const { room, entry } = currentRoomAndBattle(socket, io, cardDb);
        const result = entry.battle.deploy(socket.user.id, payload);
        broadcastSnapshots(io, room, entry);
        ackOk(ack, {
          result,
          snapshot: buildSnapshot(entry, socket.user.id),
        });
      } catch (error) {
        ackError(ack, error);
      }
    });

    socket.on('pvp:authority:cast-skill', (payload = {}, ack) => {
      try {
        const { room, entry } = currentRoomAndBattle(socket, io, cardDb);
        const result = entry.battle.castSkill(socket.user.id, payload);
        io.to(`room:${room.id}`).emit('pvp:authority:skill-cast', result);
        broadcastSnapshots(io, room, entry);
        ackOk(ack, {
          result,
          snapshot: buildSnapshot(entry, socket.user.id),
        });
      } catch (error) {
        ackError(ack, error);
      }
    });

    socket.on('disconnect', () => cleanupSpectator(socket));
  });
}

export function stopAllPvpAuthorityBattles() {
  for (const roomId of authorityBattles.keys()) stopAuthorityBattle(roomId);
}
