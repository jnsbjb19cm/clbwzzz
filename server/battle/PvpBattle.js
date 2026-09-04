import { sanitizeCustomCardName } from '../../src/core/constants.js';

/**
 * 服务端权威 PVP 对战(3v3 / 2v2 / 1v1 可配)。
 *
 * - 无头运行客户端 BattleEngine，由服务端作为唯一权威推进战斗。
 * - 蓝队在左半场(col 0-4)，红队在右半场(col 7-11)。
 * - 每名玩家独立拥有阳光、食物、MP、技能冷却和卡牌部署资源。
 * - 胜负：一方基地(heroHp / enemyHeroHp)被攻破即失败。
 */
globalThis.Audio = class {
  play() { return Promise.resolve(); }
  pause() {}
  addEventListener() {}
  cloneNode() { return this; }
  load() {}
};
globalThis.window = globalThis;
globalThis.Image = class {
  addEventListener() {}
  set src(_value) {}
};
globalThis.fetch = async () => ({ ok: false });
globalThis.document = {
  createElement: () => ({
    getContext: () => ({}),
    addEventListener() {},
  }),
};
globalThis.performance = globalThis.performance ?? { now: () => 0 };

const { BattleEngine } = await import('../../src/battle/BattleEngine.js');
const { BattleUnit } = await import('../../src/battle/BattleUnit.js');
const {
  MAX_RESOURCE,
  RESOURCE_REGEN,
  RESOURCE_REGEN_INTERVAL,
  RESOURCE_START,
  usesFoodCost,
} = await import('../../src/battle/BattleConfig.js');
const {
  DEFAULT_SKILL_LOADOUT,
  HERO_MP_MAX,
  HERO_MP_REGEN,
  HERO_MP_REGEN_INTERVAL,
  HERO_MP_START,
  SKILL_SLOT_COUNT,
  getSkillCooldownSec,
  getSkillEffect,
  getSkillMpCost,
  isActiveSkillCard,
} = await import('../../src/core/SkillRegistry.js');
const { getSkillResolutionDelay } = await import('../../src/battle/SkillAnimationConfig.js');

const TEAM_TO_SIDE = { blue: 'player', red: 'enemy' };
const BLUE_COLS = [0, 1, 2, 3, 4];
const RED_COLS = [7, 8, 9, 10, 11];
const BASE_HP = 3000;

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function normalizeInstance(payload = {}) {
  const craftQuality = Math.max(1, Math.min(5, Math.round(Number(payload.craftQuality) || 1)));
  const strengthLv = Math.max(0, Math.min(6, Math.round(Number(payload.strengthLv ?? payload.star) || 0)));
  const attributeRoll = payload.attributeRoll && typeof payload.attributeRoll === 'object'
    ? {
        atk: Math.max(-20, Math.min(20, Number(payload.attributeRoll.atk) || 0)),
        hp: Math.max(-20, Math.min(20, Number(payload.attributeRoll.hp) || 0)),
        cd: Math.max(-20, Math.min(20, Number(payload.attributeRoll.cd) || 0)),
      }
    : null;
  return {
    craftQuality,
    strengthLv,
    star: strengthLv,
    customName: sanitizeCustomCardName(payload.customName),
    attributeRoll,
    awakened: Boolean(payload.awakened),
  };
}

function normalizeSkillLoadout(db, value) {
  const source = Array.isArray(value) ? value : DEFAULT_SKILL_LOADOUT;
  return Array.from({ length: SKILL_SLOT_COUNT }, (_, index) => {
    const id = Number(source[index]);
    if (!Number.isInteger(id) || id <= 0) return null;
    const card = db.getById(id);
    return card && isActiveSkillCard(card) && getSkillEffect(id) ? id : null;
  });
}

function normalizeTarget(effect, target) {
  if (!effect?.needsTarget) return null;
  const lane = Math.floor(Number(target?.lane));
  const col = Math.floor(Number(target?.col));
  if (lane < 0 || lane > 4 || col < 0 || col > 11) {
    throw new Error('技能目标位置无效');
  }
  return { lane, col };
}

export class PvpBattle {
  constructor({ roomId, mapId, teamBlue, teamRed, db }) {
    this.roomId = roomId;
    this.mapId = mapId;
    this.db = db;
    this.teamBlue = teamBlue;
    this.teamRed = teamRed;
    this.engine = new BattleEngine(db, 1, [], null, {
      trainingMode: true,
      pvp: true,
    });
    this.engine.onBurrowReturn = (unit) => this.refundBurrowReturn(unit);
    this.engine.pvp = true;
    this.engine.heroMaxHp = BASE_HP;
    this.engine.heroHp = BASE_HP;
    this.engine.enemyHeroMaxHp = BASE_HP;
    this.engine.enemyHeroHp = BASE_HP;
    this.resources = new Map();
    this.skillStates = new Map();
    this.skillFields = [];
    for (const member of [...teamBlue, ...teamRed]) {
      const userId = Number(member.userId);
      this.resources.set(userId, {
        sun: RESOURCE_START,
        food: RESOURCE_START,
      });
      this.skillStates.set(userId, {
        loadout: normalizeSkillLoadout(db, DEFAULT_SKILL_LOADOUT),
        mp: HERO_MP_START,
        maxMp: HERO_MP_MAX,
        mpTimer: 0,
        cooldowns: {},
        pending: [],
      });
    }
    this.resourceTimer = 0;
    this.status = 'playing';
    this.winner = null;
    this.lastSnapshot = null;
    this.uidSeq = 100000;
  }

  teamOf(userId) {
    if (this.teamBlue.some((member) => Number(member.userId) === Number(userId))) return 'blue';
    if (this.teamRed.some((member) => Number(member.userId) === Number(userId))) return 'red';
    return null;
  }

  resourcesOf(userId) {
    const id = Number(userId);
    if (!this.resources.has(id)) {
      this.resources.set(id, { sun: RESOURCE_START, food: RESOURCE_START });
    }
    return this.resources.get(id);
  }

  publicResources(userId) {
    const resource = this.resourcesOf(userId);
    return {
      sun: round2(resource.sun),
      food: round2(resource.food),
    };
  }

  skillStateOf(userId) {
    const id = Number(userId);
    if (!this.skillStates.has(id)) {
      this.skillStates.set(id, {
        loadout: normalizeSkillLoadout(this.db, DEFAULT_SKILL_LOADOUT),
        mp: HERO_MP_START,
        maxMp: HERO_MP_MAX,
        mpTimer: 0,
        cooldowns: {},
        pending: [],
      });
    }
    return this.skillStates.get(id);
  }

  setSkillLoadout(userId, loadout, maxMp = HERO_MP_MAX) {
    if (!this.teamOf(userId)) throw new Error('你不是本房间玩家');
    const state = this.skillStateOf(userId);
    state.loadout = normalizeSkillLoadout(this.db, loadout);
    state.maxMp = Math.max(HERO_MP_MAX, Math.min(500, Math.round(Number(maxMp) || HERO_MP_MAX)));
    state.mp = Math.min(state.maxMp, state.mp);
    return this.publicSkillState(userId);
  }

  publicSkillState(userId) {
    const state = this.skillStateOf(userId);
    const cooldowns = {};
    for (const skillId of state.loadout.filter(Boolean)) {
      cooldowns[skillId] = round2(state.cooldowns[skillId] ?? 0);
    }
    return {
      loadout: [...state.loadout],
      mp: round2(state.mp),
      maxMp: round2(state.maxMp),
      cooldowns,
    };
  }

  deployCost(card) {
    const amount = Math.max(0, Number(card.cost) || 0);
    return usesFoodCost(card)
      ? { sun: 0, food: amount }
      : { sun: amount, food: 0 };
  }

  refundBurrowReturn(unit) {
    if (!unit?._burrowRefundPending || unit._burrowRefunded) return false;
    const ownerUserId = Number(unit.pvpOwnerUserId);
    const resource = this.resources.get(ownerUserId);
    const card = this.db.getById(Number(unit.cardId));
    if (!resource || !card) return false;
    const refund = this.deployCost(card);
    resource.sun = Math.min(MAX_RESOURCE, resource.sun + refund.sun);
    resource.food = Math.min(MAX_RESOURCE, resource.food + refund.food);
    unit._burrowRefundPending = false;
    unit._burrowRefunded = true;
    return true;
  }

  validCol(team, col) {
    const columns = team === 'blue' ? BLUE_COLS : RED_COLS;
    return columns.includes(Number(col));
  }

  deploy(userId, payload = {}) {
    if (this.status !== 'playing') throw new Error('战斗已结束');
    const team = this.teamOf(userId);
    if (!team) throw new Error('你不是本房间玩家');

    const lane = Math.floor(Number(payload.lane));
    const col = Math.floor(Number(payload.col));
    if (lane < 0 || lane > 4) throw new Error('行数无效');
    if (!this.validCol(team, col)) throw new Error('只能在己方半场放置');

    const card = this.db.getById(Number(payload.cardId));
    if (!card || card.isActiveSkill?.() || Number(card.type) === 4) {
      throw new Error('卡牌不存在或不能直接部署');
    }
    const movable = Number(card.moveSpeed) > 0;

    const resource = this.resourcesOf(userId);
    const cost = this.deployCost(card);
    if (resource.sun < cost.sun || resource.food < cost.food) {
      const name = cost.food > 0 ? '食物' : '阳光';
      const amount = cost.food > 0 ? cost.food : cost.sun;
      throw new Error(`${name}不足(需要 ${amount})`);
    }

    const side = TEAM_TO_SIDE[team];
    const ownFixed = this.engine.getUnitsAt(lane, col).some((unit) =>
      unit.alive && unit.team === side && !unit.isMovable?.());
    if (!movable && ownFixed) {
      throw new Error('该格已有己方不可移动单位');
    }

    resource.sun -= cost.sun;
    resource.food -= cost.food;

    const instance = normalizeInstance(payload);
    const unit = new BattleUnit({ card, lane, col, team: side, instance });
    unit.uid = ++this.uidSeq;
    unit.pvpOwnerUserId = Number(userId);
    this.engine.initUnitSpawnFade(unit);
    this.engine.units.push(unit);
    this.engine.pushDeployEffect?.(lane, col, unit.craftQuality);
    this.engine.pushLog(`【${card.name}】部署 → 第${lane + 1}路 ${col}列(${team})`);

    return {
      unit: this.publicUnit(unit),
      resources: this.publicResources(userId),
    };
  }

  castSkill(userId, payload = {}) {
    if (this.status !== 'playing') throw new Error('战斗已结束');
    const team = this.teamOf(userId);
    if (!team) throw new Error('你不是本房间玩家');
    const skillId = Number(payload.skillId);
    const state = this.skillStateOf(userId);
    if (!state.loadout.includes(skillId)) throw new Error('该技能未装备');

    const card = this.db.getById(skillId);
    const effect = getSkillEffect(skillId);
    if (!card || !isActiveSkillCard(card) || !effect) throw new Error('技能无效');
    const target = normalizeTarget(effect, payload.target);
    const mpCost = getSkillMpCost(card);
    if (state.mp < mpCost) throw new Error(`MP不足(需要 ${mpCost})`);
    const cooldown = Number(state.cooldowns[skillId]) || 0;
    if (cooldown > 0) throw new Error(`技能冷却中(${Math.ceil(cooldown)}秒)`);

    state.mp -= mpCost;
    state.cooldowns[skillId] = getSkillCooldownSec(card);
    const applyAt = this.engine.time + getSkillResolutionDelay(skillId, 0.9);
    state.pending.push({ skillId, card, effect, target, team, applyAt });
    this.engine.pushLog(`技能【${card.name}】已释放(${team})`);

    return {
      userId: Number(userId),
      team,
      skillId,
      target,
      applyAt: round2(applyAt),
      skill: this.publicSkillState(userId),
    };
  }

  withTeamPerspective(team, callback) {
    if (team === 'blue') return callback();
    const engine = this.engine;
    for (const unit of engine.units) {
      unit.team = unit.team === 'player' ? 'enemy' : 'player';
    }

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
      for (const unit of engine.units) {
        unit.team = unit.team === 'player' ? 'enemy' : 'player';
      }
    }
  }

  applySkillCast(cast) {
    if (cast.effect.kind === 'fire_wall') {
      this.skillFields.push({
        kind: 'fire_wall',
        targetTeam: cast.team === 'blue' ? 'enemy' : 'player',
        col: cast.target.col,
        dps: Number(cast.effect.dps) || 0,
        until: this.engine.time + (Number(cast.effect.duration) || 0),
      });
      return;
    }

    this.withTeamPerspective(cast.team, () => {
      this.engine.skills.applyEffect(cast.skillId, cast.effect, cast.target, cast.card);
    });
  }

  tickPlayerSkills(dt) {
    for (const state of this.skillStates.values()) {
      state.mpTimer += dt;
      while (state.mpTimer >= HERO_MP_REGEN_INTERVAL) {
        state.mpTimer -= HERO_MP_REGEN_INTERVAL;
        state.mp = Math.min(state.maxMp, state.mp + HERO_MP_REGEN);
      }
      for (const skillId of Object.keys(state.cooldowns)) {
        state.cooldowns[skillId] = Math.max(0, state.cooldowns[skillId] - dt);
      }

      const waiting = [];
      for (const cast of state.pending) {
        if (this.engine.time + 1e-6 >= cast.applyAt) this.applySkillCast(cast);
        else waiting.push(cast);
      }
      state.pending = waiting;
    }
  }

  tickSkillFields(dt) {
    const now = this.engine.time;
    this.skillFields = this.skillFields.filter((field) => {
      if (now >= field.until) return false;
      if (field.kind === 'fire_wall') {
        for (const unit of [...this.engine.units]) {
          if (!unit.alive || unit.team !== field.targetTeam) continue;
          if (Math.abs(unit.col - field.col) < 0.55) {
            this.engine.skills.applyContinuousDamage(unit, field.dps * dt);
          }
        }
      }
      return true;
    });
  }

  publicUnit(unit) {
    const now = Number(this.engine.time) || 0;
    return {
      uid: unit.uid,
      cardId: unit.cardId,
      res: unit.res,
      team: unit.team,
      lane: unit.lane,
      col: unit.col,
      hp: round2(unit.hp),
      maxHp: round2(unit.maxHp),
      atk: round2(unit.atk),
      craftQuality: unit.craftQuality,
      strengthLv: unit.strengthLv,
      customName: unit.customName || null,
      alive: unit.alive !== false,
      slowedUntil: round2(unit.slowedUntil),
      frozenUntil: round2(unit.frozenUntil),
      stunnedUntil: round2(unit.stunnedUntil),
      dots: (Array.isArray(unit.dots) ? unit.dots : [])
        .filter((dot) => Number(dot?.until) > now)
        .map((dot) => ({
          kind: String(dot.kind ?? ''),
          dps: round2(dot.dps),
          every: round2(dot.every),
          until: round2(dot.until),
        })),
      deathStartedAt: unit._deathAnimStartedAt == null ? null : round2(unit._deathAnimStartedAt),
      deathUntil: unit._deathUntil == null ? null : round2(unit._deathUntil),
      ownerUserId: unit.pvpOwnerUserId ?? null,
      state: !unit.alive
        ? 'death'
        : unit.stunnedUntil && this.engine.time < unit.stunnedUntil
        ? 'stun'
        : unit.frozenUntil && this.engine.time < unit.frozenUntil
          ? 'frozen'
          : 'idle',
    };
  }

  tick(dt) {
    if (this.status !== 'playing') return;
    this.engine.tick(dt);
    this.tickPlayerSkills(dt);
    this.tickSkillFields(dt);

    this.resourceTimer += dt;
    while (this.resourceTimer >= RESOURCE_REGEN_INTERVAL) {
      this.resourceTimer -= RESOURCE_REGEN_INTERVAL;
      for (const resource of this.resources.values()) {
        resource.sun = Math.min(MAX_RESOURCE, resource.sun + RESOURCE_REGEN);
        resource.food = Math.min(MAX_RESOURCE, resource.food + RESOURCE_REGEN);
      }
    }

    if (this.engine.enemyHeroHp <= 0 || this.engine.heroHp <= 0) {
      this.status = 'finished';
      this.winner = this.engine.enemyHeroHp <= 0 ? 'blue' : 'red';
    }
  }

  snapshot() {
    const engine = this.engine;
    const resourcesByUser = Object.fromEntries(
      [...this.resources.entries()].map(([userId, resource]) => [
        String(userId),
        { sun: round2(resource.sun), food: round2(resource.food) },
      ]),
    );
    const skillsByUser = Object.fromEntries(
      [...this.skillStates.keys()].map((userId) => [String(userId), this.publicSkillState(userId)]),
    );

    this.lastSnapshot = {
      t: round2(engine.time),
      status: this.status,
      winner: this.winner,
      heroHp: {
        blue: round2(engine.heroHp),
        red: round2(engine.enemyHeroHp),
      },
      resourcesByUser,
      skillsByUser,
      units: engine.units
        .filter((unit) => unit.alive || (unit._deathUntil && engine.time < unit._deathUntil))
        .map((unit) => this.publicUnit(unit)),
      lootDrops: (engine.lootDrops ?? []).map((drop) => ({ ...drop })),
      logs: engine.logs?.slice(-5) ?? engine.log?.slice(-5) ?? [],
    };
    return this.lastSnapshot;
  }
}
