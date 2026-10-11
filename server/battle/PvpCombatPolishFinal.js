import { BattleUnit } from '../../src/battle/BattleUnit.js';
import { getAttackPattern, getCardTraits } from '../../src/core/CardTraitRegistry.js';
import { getSkillVisualDuration } from '../../src/battle/SkillAnimationConfig.js';
import { PvpBattle } from './PvpBattle.js';

const PATCH_FLAG = Symbol.for('clbwzzz.pvpCombatPolishFinal');
const LANES = 5;
const NEUTRAL_ICE_CARD_ID = 1000;

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function swapBattleTeam(team) {
  if (team === 'player') return 'enemy';
  if (team === 'enemy') return 'player';
  return team;
}

function resolveAnimState(battle, unit) {
  const now = battle.engine.time;
  if (!unit.alive) return 'death';
  if (unit.pvpNeutral) return 'default';
  if (unit._forcedAnimState && now < Number(unit._forcedAnimUntil || 0)) return unit._forcedAnimState;
  if (unit.stunnedUntil && now < unit.stunnedUntil) return 'stun';
  if (unit.frozenUntil && now < unit.frozenUntil) return 'frozen';
  if (unit._burrowTargetCol != null) return 'underMoving';
  if (unit._aerialLandingRequested || unit._baseLandingRequested) return 'toGround';
  if (unit.attackingBase || (unit._attackAnimUntil && now < unit._attackAnimUntil)) return 'attacking';
  if (unit._jumpUntil && now < unit._jumpUntil) return 'jump';
  if (unit.isFlying?.()) return 'flying';
  if (unit.isMovable?.()) {
    const previous = Number(unit._prevRenderX ?? unit.col);
    if (Math.abs(Number(unit.col) - previous) > 0.00001) return 'moving';
  }
  return 'default';
}

function activeAnimUntil(battle, unit, state) {
  const now = battle.engine.time;
  if (state === 'attacking') return Math.max(now, Number(unit._attackAnimUntil || now));
  if (state === 'jump') return Math.max(now, Number(unit._jumpUntil || now));
  if (state === 'stun') return Math.max(now, Number(unit.stunnedUntil || now));
  if (state === 'frozen') return Math.max(now, Number(unit.frozenUntil || now));
  if (state === 'toGround') return Math.max(now, Number(unit._aerialLandingUntil || now));
  if (unit._forcedAnimState === state) return Math.max(now, Number(unit._forcedAnimUntil || now));
  return now + 0.18;
}

function ensureNeutralIce(battle) {
  if (battle.__pvpNeutralIceReady) return;
  // 中立障碍按房间场景（mapId）：2=草地木桩(1002)、4=冰川冰山(1000)、7=黄沙沙丘(1004)；默认冰山
  // 2026-10-11 用户实测: 房间 roll 后一切显示 8(古老密林)，中间柱却是 1004(沙滩=10) ✗
  // 根因: battle.mapId 是**建战斗那一刻**的快照（建房时随机值）✗，
  //       房间后来 roll 成 8 它不会更新 -> 柱子按旧的 10 造 ✗
  // 修: **优先用房间当前的地图**（battle.room.mapId 是活的），battle.mapId 只作兜底 ✔
  const roomMapId = String(battle?.room?.mapId ?? battle?.mapId ?? '');
  // 障碍 → 精灵：1000=冰山(冰精灵1005) 1001=火(火精灵1006) 1002=木桩(木精灵1007)
  //                  1003=石(石精灵1008) 1004=沙丘(沙精灵1009)
  const NEUTRAL_BY_MAP = {
    '2': 1002,   // 草地   -> 木桩   -> 木精灵 1007
    '4': 1000,   // 冰川   -> 冰山   -> 冰精灵 1005
    // 黄沙/沙滩 见下方（2026-10-11 更正：黄沙=石、沙滩=沙）
    // 2026-10-11 用户要求的新地图配精灵：
    //   古老密林 = 木精灵(1007) → 木桩 1002（用户：'古老密林人家是木精灵的那个柱子'）
    //   火焰     = 火精灵(1006) → 1001
    //   沙滩     = 石精灵(1008) → 1003
    '8': 1002,
    '9': 1001,
    // 2026-10-11 用户更正：黄沙 = 石柱子(打破出石精灵1008)、沙滩 = 沙丘(出沙精灵1009)
    // （我上一版把 7 和 10 配反了 ✗）
    '10': 1004,
    // 2026-10-11 用户：黄沙(7) 出土块和沙丘**随机**（即石精灵或沙精灵随机）
    '7': [1003, 1004],
  };
  // 海底神殿(11)：从五种精灵里**随机**挑一个（用户：'海底神殿的是随机小精灵'）
  const TEMPLE_SPIRIT_BARRIERS = [1000, 1001, 1002, 1003, 1004];
  // 2026-10-11：支持一图多障碍随机（黄沙=土块/沙丘随机）
  const pickFrom = (v) => Array.isArray(v) ? v[Math.floor(Math.random() * v.length)] : v;
  const barrierId = roomMapId === '11'
    ? TEMPLE_SPIRIT_BARRIERS[Math.floor(Math.random() * TEMPLE_SPIRIT_BARRIERS.length)]
    : (pickFrom(NEUTRAL_BY_MAP[roomMapId]) || 1000);
  const card = battle.db?.getById?.(barrierId);
  if (!card) throw new Error('PVP中立障碍卡牌' + barrierId + '不存在');

  for (let lane = 0; lane < LANES; lane += 1) {
    for (const col of [5, 6]) {
      const existing = battle.engine.units.find(
        (unit) => unit.alive && unit.pvpNeutral && unit.lane === lane && Math.round(unit.col) === col,
      );
      if (existing) continue;
      const unit = new BattleUnit({ card, lane, col, team: 'neutral' });
      unit.uid = ++battle.uidSeq;
      unit.pvpNeutral = true;
      // 2026-10-11 用户：柱子规则没表现 → 快照里写死了冰山(1000) ✗
      // 这里把**实际按地图选出的**障碍 id 记下来，供快照使用 ✔
      battle.__pvpBarrierId = barrierId;
      unit.pvpOwnerUserId = null;
      unit.atk = 0;
      unit.moveSpeed = 0;
      unit.atkSpeed = 0;
      unit.atkTimer = 99;
      unit.renderX = col;
      unit.renderY = lane;
      unit._prevRenderX = col;
      battle.engine.units.push(unit);
    }
  }
  battle.__pvpNeutralIceReady = true;
}

function ensureEventState(battle) {
  battle.__pvpVisualEvents ??= [];
  battle.__pvpVisualEventSeq ??= 0;
  battle.__pvpSnapshotTrack ??= new Map();
}

function pushSkillVisualEvent(battle, userId, castResult) {
  ensureEventState(battle);
  const event = {
    id: ++battle.__pvpVisualEventSeq,
    kind: 'skill',
    userId: Number(userId),
    team: castResult.team,
    skillId: Number(castResult.skillId),
    effectKind: castResult.effectKind ?? null,
    target: castResult.target ? { ...castResult.target } : null,
    startedAt: round2(battle.engine.time),
    duration: round2(getSkillVisualDuration(castResult.skillId, 0.9)),
    direction: castResult.team === 'red' ? -1 : 1,
    repeatCount: Number(castResult.skillId) === 517 ? 2 : 1,
  };
  battle.__pvpVisualEvents.push(event);
  if (battle.__pvpVisualEvents.length > 48) {
    battle.__pvpVisualEvents.splice(0, battle.__pvpVisualEvents.length - 48);
  }
  return event;
}

function decorateSnapshot(battle, snapshot) {
  ensureEventState(battle);
  const now = Number(battle.engine.time) || 0;
  const previousTrack = battle.__pvpSnapshotTrack;
  const nextTrack = new Map();
  const engineByUid = new Map(battle.engine.units.map((unit) => [Number(unit.uid), unit]));

  for (const data of snapshot.units ?? []) {
    const unit = engineByUid.get(Number(data.uid));
    const previous = previousTrack.get(Number(data.uid));
    const dt = previous ? Math.max(0.001, now - previous.t) : 0;
    data.velocityCol = dt > 0 ? round2((Number(data.col) - previous.col) / dt) : 0;
    data.velocityLane = dt > 0 ? round2((Number(data.lane) - previous.lane) / dt) : 0;
    data.neutral = Boolean(unit?.pvpNeutral || data.team === 'neutral');
    data.animState = unit ? resolveAnimState(battle, unit) : (data.state || 'default');
    data.animUntil = unit ? round2(activeAnimUntil(battle, unit, data.animState)) : now;
    data.attackToken = unit ? Math.round(Number(unit._attackAnimUntil || 0) * 1000) : 0;
    data.jumpToken = unit ? Math.round(Number(unit._jumpUntil || 0) * 1000) : 0;
    data.forcedToken = unit ? Math.round(Number(unit._forcedAnimUntil || 0) * 1000) : 0;
    data.burrowTargetCol = unit?._burrowTargetCol ?? null;
    data.burrowEmerged = Boolean(unit?._burrowEmerged);
    data.burrowReturning = Boolean(unit?._burrowReturning);
    data.burrowFacingReversed = Boolean(unit?._burrowFacingReversed);
    data.aerialWasFlying = Boolean(unit?._aerialWasFlying);
    data.aerialLandingRequested = Boolean(unit?._aerialLandingRequested);
    data.baseLandingRequested = Boolean(unit?._baseLandingRequested);
    data.aerialLanded = Boolean(unit?._aerialLanded);
    data.aerialLandingUntil = round2(unit?._aerialLandingUntil);
    data.attackPattern = getAttackPattern(data.cardId) ?? null;
    data.traits = getCardTraits(data.cardId);
    nextTrack.set(Number(data.uid), {
      t: now,
      col: Number(data.col),
      lane: Number(data.lane),
    });
  }

  battle.__pvpSnapshotTrack = nextTrack;
  snapshot.players = [
    ...battle.teamBlue.map((member) => ({ ...member, team: 'blue' })),
    ...battle.teamRed.map((member) => ({ ...member, team: 'red' })),
  ].map((member) => ({
    userId: Number(member.userId),
    nickname: member.nickname || '玩家',
    team: member.team,
  }));
  // 2026-10-11：原来写死 NEUTRAL_ICE_CARD_ID(1000 冰山) ✗ → 客户端无论哪张地图都显示冰山
  // 现在用本局**实际按地图选出的**障碍 id ✔（取不到才回退常量）
  snapshot.neutralIce = {
    cardId: Number(battle.__pvpBarrierId) || NEUTRAL_ICE_CARD_ID,
    columns: [5, 6],
    lanes: LANES,
  };
  snapshot.visualEvents = battle.__pvpVisualEvents.filter(
    (event) => now - Number(event.startedAt || 0) <= Math.max(0.25, Number(event.duration || 0) + 0.25),
  );
  snapshot.specialAuditVersion = 'pvp-specials-v4';
  return snapshot;
}

export function installPvpCombatPolishFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousWithTeamPerspective = PvpBattle.prototype.withTeamPerspective;
  PvpBattle.prototype.withTeamPerspective = function safeTeamPerspective(team, callback) {
    if (team === 'blue') return callback();
    if (team !== 'red') return previousWithTeamPerspective.call(this, team, callback);
    const engine = this.engine;
    for (const unit of engine.units) unit.team = swapBattleTeam(unit.team);

    const blueHp = engine.heroHp;
    const redHp = engine.enemyHeroHp;
    const blueMaxHp = engine.heroMaxHp;
    const redMaxHp = engine.enemyHeroMaxHp;
    engine.heroHp = redHp;
    engine.enemyHeroHp = blueHp;
    engine.heroMaxHp = redMaxHp;
    engine.enemyHeroMaxHp = blueMaxHp;

    try {
      return callback();
    } finally {
      const nextRedHp = engine.heroHp;
      const nextBlueHp = engine.enemyHeroHp;
      const nextRedMaxHp = engine.heroMaxHp;
      const nextBlueMaxHp = engine.enemyHeroMaxHp;
      engine.heroHp = nextBlueHp;
      engine.enemyHeroHp = nextRedHp;
      engine.heroMaxHp = nextBlueMaxHp;
      engine.enemyHeroMaxHp = nextRedMaxHp;
      for (const unit of engine.units) unit.team = swapBattleTeam(unit.team);
    }
  };

  const previousTick = PvpBattle.prototype.tick;
  PvpBattle.prototype.tick = function tickWithNeutralIce(dt) {
    ensureNeutralIce(this);
    return previousTick.call(this, dt);
  };

  const previousSnapshot = PvpBattle.prototype.snapshot;
  PvpBattle.prototype.snapshot = function snapshotWithCombatMetadata() {
    ensureNeutralIce(this);
    return decorateSnapshot(this, previousSnapshot.call(this));
  };

  const previousPublicUnit = PvpBattle.prototype.publicUnit;
  PvpBattle.prototype.publicUnit = function publicUnitWithAnimation(unit) {
    const base = previousPublicUnit.call(this, unit);
    const animState = resolveAnimState(this, unit);
    return {
      ...base,
      team: unit.team,
      neutral: Boolean(unit.pvpNeutral || unit.team === 'neutral'),
      animState,
      animUntil: round2(activeAnimUntil(this, unit, animState)),
      attackToken: Math.round(Number(unit._attackAnimUntil || 0) * 1000),
      jumpToken: Math.round(Number(unit._jumpUntil || 0) * 1000),
      forcedToken: Math.round(Number(unit._forcedAnimUntil || 0) * 1000),
      burrowTargetCol: unit._burrowTargetCol ?? null,
      burrowEmerged: Boolean(unit._burrowEmerged),
      burrowReturning: Boolean(unit._burrowReturning),
      burrowFacingReversed: Boolean(unit._burrowFacingReversed),
      aerialWasFlying: Boolean(unit._aerialWasFlying),
      aerialLandingRequested: Boolean(unit._aerialLandingRequested),
      baseLandingRequested: Boolean(unit._baseLandingRequested),
      aerialLanded: Boolean(unit._aerialLanded),
      aerialLandingUntil: round2(unit._aerialLandingUntil),
      moveSpeed: Number(unit.moveSpeed) || 0,
      viewType: Number(unit.viewType) || 0,
      atkStyle: Number(unit.atkStyle) || 0,
    };
  };

  // 这里只补中立冰山与表现元数据，不再重写 deploy。真正的放卡规则已经由
  // BattlePlacementRound3 安装；重新实现 deploy 会把最新规则覆盖回旧“五列/同格限制”。
  const previousDeploy = PvpBattle.prototype.deploy;
  PvpBattle.prototype.deploy = function deployWithCombatPolish(userId, payload = {}) {
    ensureNeutralIce(this);
    return previousDeploy.call(this, userId, payload);
  };

  const previousCastSkill = PvpBattle.prototype.castSkill;
  PvpBattle.prototype.castSkill = function castSkillWithDirectionEvent(userId, payload = {}) {
    const result = previousCastSkill.call(this, userId, payload);
    const pending = this.skillStateOf(userId).pending.at(-1);
    result.effectKind = pending?.effect?.kind ?? null;
    const event = pushSkillVisualEvent(this, userId, result);
    Object.assign(result, {
      id: event.id,
      startedAt: event.startedAt,
      duration: event.duration,
      direction: event.direction,
    });
    return result;
  };
}
