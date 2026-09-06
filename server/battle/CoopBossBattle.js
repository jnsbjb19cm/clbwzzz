// 先建立无头浏览器环境，再动态载入客户端共用战斗引擎。
import './PvpBattle.js';
import { sanitizeCustomCardName } from '../../src/core/constants.js';

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
const {
  getSkillResolutionDelay,
  getSkillVisualDuration,
} = await import('../../src/battle/SkillAnimationConfig.js');
const { BOSS_DIFFICULTY_MULT, getBossById } = await import('../../src/data/bossList.js');

const PLAYER_BASE_HP = 3000;
const BLUE_STATIC_COLS = new Set([0, 1, 2, 3, 4]);
const BLUE_MOVABLE_COLS = new Set([0, 1, 2]);
const HIDDEN_ENEMY_BASE_HP = 999_999_999;
const DEFAULT_BOSS_SKILL_IDS = {
  boss_dot: [539, 538, 522],
  boss_gravo: [522, 538, 523, 527],
  boss_fire: [537, 522, 538],
  boss_forest: [527, 538, 522],
  boss_ice: [503, 522, 537],
};

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function normalizeInstance(payload = {}) {
  const craftQuality = Math.max(1, Math.min(5, Math.round(Number(payload.craftQuality) || 1)));
  // 与普通 PVE / 权威 PVP 同步：保留真实 8+ 星，只规范为非负整数。
  const strengthLv = Math.max(0, Math.round(Number(payload.strengthLv ?? payload.star) || 0));
  return {
    craftQuality,
    strengthLv,
    star: strengthLv,
    customName: sanitizeCustomCardName(payload.customName),
    attributeRoll: payload.attributeRoll && typeof payload.attributeRoll === 'object'
      ? {
          atk: Math.max(-20, Math.min(20, Number(payload.attributeRoll.atk) || 0)),
          hp: Math.max(-20, Math.min(20, Number(payload.attributeRoll.hp) || 0)),
          cd: Math.max(-20, Math.min(20, Number(payload.attributeRoll.cd) || 0)),
        }
      : null,
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
  if (lane < 0 || lane > 4 || col < 0 || col > 11) throw new Error('技能目标位置无效');
  return { lane, col };
}

function animState(engine, unit) {
  const now = engine.time;
  if (!unit.alive) return 'death';
  if (unit.stunnedUntil && now < unit.stunnedUntil) return 'stun';
  if (unit.frozenUntil && now < unit.frozenUntil) return 'frozen';
  if (unit._forcedAnimState && now < Number(unit._forcedAnimUntil || 0)) return unit._forcedAnimState;
  if (unit._burrowTargetCol != null) return 'underMoving';
  if (unit._aerialLandingRequested || unit._baseLandingRequested) return 'toGround';
  if (unit.attackingBase || (unit._attackAnimUntil && now < unit._attackAnimUntil)) return 'attacking';
  if (unit._jumpUntil && now < unit._jumpUntil) return 'jump';
  if (unit.isFlying?.()) return 'flying';
  if (unit.isMovable?.() && Math.abs(Number(unit.col) - Number(unit._prevRenderX ?? unit.col)) > 0.00001) {
    return 'moving';
  }
  return 'default';
}

export class CoopBossBattle {
  constructor({ roomId, members, db, bossId, difficulty }) {
    this.mode = 'boss';
    this.roomId = Number(roomId);
    this.db = db;
    this.members = members.map((member) => ({
      userId: Number(member.userId),
      nickname: member.nickname || '玩家',
      team: 'blue',
    }));
    this.teamBlue = this.members;
    this.teamRed = [];
    this.bossInfo = getBossById(bossId);
    if (!this.bossInfo) throw new Error('BOSS数据不存在');
    this.difficulty = String(difficulty || this.bossInfo.difficulty || '简单');
    this.difficultyMult = Number(BOSS_DIFFICULTY_MULT[this.difficulty]) || 1;

    this.engine = new BattleEngine(db, 1, [], null, {
      trainingMode: false,
      pvp: false,
    });
    this.engine.onBurrowReturn = (unit) => this.refundBurrowReturn(unit);
    this.engine.pvp = false;
    this.engine.coopBoss = true;
    this.engine.stage = {
      stage_id: 1,
      stage_name: `${this.bossInfo.name}：${this.difficulty}`,
      enemy_name: this.bossInfo.name,
      enemy_res: Number(this.bossInfo.cardId),
      hp: PLAYER_BASE_HP,
    };
    this.engine.wave.queue = [];
    this.engine.wave.done = true;
    this.engine.wave.totalWaves = 1;
    this.engine.totalWaves = 1;
    this.engine.waveNumber = 1;
    this.engine.heroMaxHp = PLAYER_BASE_HP;
    this.engine.heroHp = PLAYER_BASE_HP;
    this.engine.enemyHeroMaxHp = HIDDEN_ENEMY_BASE_HP;
    this.engine.enemyHeroHp = HIDDEN_ENEMY_BASE_HP;
    this.engine.units = [];
    this.engine.projectiles = [];
    this.engine.floats = [];
    this.engine.status = 'playing';

    this.resources = new Map();
    this.skillStates = new Map();
    for (const member of this.members) {
      this.resources.set(member.userId, { sun: RESOURCE_START, food: RESOURCE_START });
      this.skillStates.set(member.userId, {
        loadout: normalizeSkillLoadout(db, DEFAULT_SKILL_LOADOUT),
        mp: HERO_MP_START,
        maxMp: HERO_MP_MAX,
        mpTimer: 0,
        cooldowns: {},
        pending: [],
      });
    }

    this.uidSeq = 200000;
    this.resourceTimer = 0;
    this.status = 'playing';
    this.winner = null;
    this.visualEvents = [];
    this.visualEventSeq = 0;
    this.bossSpecialTimer = 0;
    this.bossSpecialCount = 0;
    this.pendingBossSkills = [];
    this.bossMinionTimer = 0;
    this.bossMinionCount = 0;
    this.spawnBoss();
    this.installBossDamageRoute();
  }

  spawnBoss() {
    const card = this.db.getById(Number(this.bossInfo.cardId));
    if (!card) throw new Error(`BOSS卡牌${this.bossInfo.cardId}不存在`);
    const lane = Math.max(0, Math.min(4, Math.floor(Number(this.bossInfo.lane ?? 2))));
    const col = Math.max(0, Math.min(11, Number(this.bossInfo.col ?? 10)));
    const unit = new BattleUnit({ card, lane, col, team: 'enemy' });
    unit.uid = ++this.uidSeq;
    unit.isBoss = true;
    unit.pvpBoss = true;
    unit.bossScale = Math.max(1, Number(this.bossInfo.displayScale) || 4);
    if (this.bossInfo.immobile !== false) {
      unit.moveSpeed = 0;
      unit._bossImmobile = true;
      unit.attackingBase = false;
    }
    unit.maxHp = Math.max(1, round2(Number(this.bossInfo.hp) * this.difficultyMult));
    unit.baseMaxHp = unit.maxHp;
    unit.hp = unit.maxHp;
    unit.atk = Math.max(1, round2(Number(this.bossInfo.atk) * this.difficultyMult));
    unit.atkTimer = Math.max(0.5, Number(this.bossInfo.cd) || 10);
    this.bossUnit = unit;
    this.engine.units.push(unit);
    this.engine.initUnitSpawnFade?.(unit);
    this.syncBossHud();
  }

  installBossDamageRoute() {
    const originalDamageBase = this.engine.damageBase.bind(this.engine);
    this.engine.damageBase = (side, amount) => {
      const damage = Math.max(0, round2(amount));
      const boss = this.bossUnit;
      if (side === 'enemy' && damage > 0 && boss?.alive) {
        const dealt = round2(boss.takeDamage(damage, this.engine.time));
        if (dealt > 0) {
          this.engine.spawnImpactFx?.(boss.lane, boss.col, dealt, boss.res);
          this.engine.spawnFloat?.(boss.lane, boss.col, -dealt);
          this.engine.pushLog?.(`【${boss.name}】-${dealt} HP`);
        }
        if (!boss.alive && !boss._deathUntil) this.engine.onUnitDeath(boss);
        this.syncBossHud();
        return dealt;
      }
      return originalDamageBase(side, damage);
    };
  }

  activeBossMinions() {
    return this.engine.units.filter((unit) =>
      unit.alive && unit.team === 'enemy' && unit.pvpBossMinion === true);
  }

  spawnBossMinion() {
    if (!this.bossUnit?.alive) return null;
    const cardIds = Array.isArray(this.bossInfo.minionCardIds)
      ? this.bossInfo.minionCardIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)
      : [];
    if (!cardIds.length) return null;
    const cap = Math.max(1, Math.floor(Number(this.bossInfo.minionCap) || 6));
    if (this.activeBossMinions().length >= cap) return null;

    const cardId = cardIds[this.bossMinionCount % cardIds.length];
    const card = this.db.getById(cardId);
    if (!card) return null;
    const lane = this.bossMinionCount % 5;
    const col = Math.max(0, Math.min(11, Number(this.bossInfo.minionSpawnCol ?? 10)));
    const unit = new BattleUnit({ card, lane, col, team: 'enemy' });
    unit.uid = ++this.uidSeq;
    unit.pvpBossMinion = true;
    unit.pvpOwnerUserId = null;
    // BOSS 难度也影响召唤物，但不让小怪属性膨胀到盖过 BOSS 本体。
    const minionMult = 1 + Math.max(0, this.difficultyMult - 1) * 0.5;
    unit.maxHp = Math.max(1, round2(unit.maxHp * minionMult));
    unit.baseMaxHp = unit.maxHp;
    unit.hp = unit.maxHp;
    unit.atk = Math.max(1, round2(unit.atk * minionMult));
    this.engine.units.push(unit);
    this.engine.initUnitSpawnFade?.(unit);
    this.engine.pushDeployEffect?.(lane, col, Math.max(1, Number(unit.craftQuality) || 1));
    this.engine.pushLog?.(`【${this.bossInfo.name}】召唤 ${card.name}`);
    this.bossMinionCount += 1;
    this.pushVisualEvent({
      kind: 'boss-summon',
      team: 'red',
      skillId: 0,
      effectKind: 'boss-summon',
      target: { lane, col },
      duration: 0.8,
    });
    return unit;
  }

  tickBossMinions(dt) {
    if (!this.bossUnit?.alive) return;
    const interval = Math.max(3, Number(this.bossInfo.minionInterval) || 8);
    this.bossMinionTimer += Math.max(0, Number(dt) || 0);
    while (this.bossMinionTimer + 1e-9 >= interval) {
      this.bossMinionTimer -= interval;
      this.spawnBossMinion();
    }
  }

  syncBossHud() {
    const boss = this.bossUnit;
    this.engine.enemyHeroMaxHp = boss?.maxHp ?? 1;
    this.engine.enemyHeroHp = boss?.alive ? Math.max(0, boss.hp) : 0;
  }

  teamOf(userId) {
    return this.members.some((member) => member.userId === Number(userId)) ? 'blue' : null;
  }

  resourcesOf(userId) {
    const id = Number(userId);
    if (!this.resources.has(id)) this.resources.set(id, { sun: RESOURCE_START, food: RESOURCE_START });
    return this.resources.get(id);
  }

  publicResources(userId) {
    const resource = this.resourcesOf(userId);
    return { sun: round2(resource.sun), food: round2(resource.food) };
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
    return usesFoodCost(card) ? { sun: 0, food: amount } : { sun: amount, food: 0 };
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

  deploy(userId, payload = {}) {
    if (this.status !== 'playing') throw new Error('战斗已结束');
    if (!this.teamOf(userId)) throw new Error('你不是本房间玩家');
    const lane = Math.floor(Number(payload.lane));
    const col = Math.floor(Number(payload.col));
    if (lane < 0 || lane > 4 || col < 0 || col > 11) throw new Error('放置位置无效');

    const card = this.db.getById(Number(payload.cardId));
    if (!card || card.isActiveSkill?.() || Number(card.type) === 4) {
      throw new Error('卡牌不存在或不能直接部署');
    }
    const movable = Number(card.moveSpeed) > 0;
    if (!(movable ? BLUE_MOVABLE_COLS : BLUE_STATIC_COLS).has(col)) {
      throw new Error(movable ? '可移动卡牌只能放在己方靠基地3列' : '不可移动卡牌只能放在己方5列');
    }

    const ownFixed = this.engine.getUnitsAt(lane, col).some((unit) =>
      unit.alive && unit.team === 'player' && !unit.isMovable?.());
    if (!movable && ownFixed) throw new Error('该格已有己方不可移动单位');

    const resource = this.resourcesOf(userId);
    const cost = this.deployCost(card);
    if (resource.sun < cost.sun || resource.food < cost.food) {
      const name = cost.food > 0 ? '食物' : '阳光';
      const amount = cost.food > 0 ? cost.food : cost.sun;
      throw new Error(`${name}不足(需要 ${amount})`);
    }
    resource.sun -= cost.sun;
    resource.food -= cost.food;

    const unit = new BattleUnit({ card, lane, col, team: 'player', instance: normalizeInstance(payload) });
    unit.uid = ++this.uidSeq;
    unit.pvpOwnerUserId = Number(userId);
    this.engine.initUnitSpawnFade?.(unit);
    this.engine.units.push(unit);
    this.engine.pushDeployEffect?.(lane, col, unit.craftQuality);
    return { unit: this.publicUnit(unit), resources: this.publicResources(userId) };
  }

  castSkill(userId, payload = {}) {
    if (this.status !== 'playing') throw new Error('战斗已结束');
    if (!this.teamOf(userId)) throw new Error('你不是本房间玩家');
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
    const duration = getSkillVisualDuration(skillId, 0.9);
    const applyAt = this.engine.time + getSkillResolutionDelay(skillId, 0.9);
    state.pending.push({ userId: Number(userId), skillId, card, effect, target, applyAt });
    const event = this.pushVisualEvent({
      kind: 'skill',
      userId: Number(userId),
      team: 'blue',
      skillId,
      effectKind: effect.kind,
      target,
      duration,
    });
    return {
      ...event,
      applyAt: round2(applyAt),
      skill: this.publicSkillState(userId),
    };
  }

  pushVisualEvent({ kind, userId = null, team, skillId, effectKind, target = null, duration = 0.9 }) {
    const event = {
      id: ++this.visualEventSeq,
      kind,
      userId,
      team,
      skillId: Number(skillId),
      effectKind,
      target: target ? { ...target } : null,
      startedAt: round2(this.engine.time),
      duration: round2(duration),
      repeatCount: Number(skillId) === 517 ? 2 : 1,
      direction: team === 'red' ? -1 : 1,
    };
    this.visualEvents.push(event);
    if (this.visualEvents.length > 64) this.visualEvents.splice(0, this.visualEvents.length - 64);
    return event;
  }

  applyPlayerSkill(cast) {
    this.engine.skills.applyEffect(cast.skillId, cast.effect, cast.target, cast.card);
  }

  tickPlayerStates(dt) {
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
        if (this.engine.time + 1e-6 >= cast.applyAt) this.applyPlayerSkill(cast);
        else waiting.push(cast);
      }
      state.pending = waiting;
    }
  }

  tickResources(dt) {
    this.resourceTimer += dt;
    while (this.resourceTimer >= RESOURCE_REGEN_INTERVAL) {
      this.resourceTimer -= RESOURCE_REGEN_INTERVAL;
      for (const resource of this.resources.values()) {
        resource.sun = Math.min(MAX_RESOURCE, resource.sun + RESOURCE_REGEN);
        resource.food = Math.min(MAX_RESOURCE, resource.food + RESOURCE_REGEN);
      }
    }
  }

  castBossSpecial() {
    const boss = this.bossUnit;
    if (!boss?.alive) return;
    const configured = Array.isArray(this.bossInfo.skillIds) ? this.bossInfo.skillIds : [];
    const skillIds = configured.length >= 2
      ? configured.map(Number).filter((id) => getSkillEffect(id))
      : (DEFAULT_BOSS_SKILL_IDS[this.bossInfo.id] ?? [527, 538, 522]);
    const skillId = skillIds[this.bossSpecialCount % skillIds.length];
    const effect = getSkillEffect(skillId) ?? {};
    const duration = getSkillVisualDuration(skillId, 0.9);
    const players = this.engine.units.filter((unit) => unit.alive && unit.team === 'player');
    const minions = this.activeBossMinions();
    let target = null;

    if (skillId === 523 && players.length) {
      const laneCounts = new Map();
      for (const unit of players) laneCounts.set(unit.lane, (laneCounts.get(unit.lane) || 0) + 1);
      const lane = [...laneCounts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
      target = { lane, col: 2 };
    }

    this.pushVisualEvent({
      kind: 'boss-skill',
      team: 'red',
      skillId,
      effectKind: effect.kind ?? 'boss-skill',
      target,
      duration,
    });
    this.bossSpecialCount += 1;

    if (skillId === 503) {
      for (const unit of players) {
        unit.frozenUntil = Math.max(Number(unit.frozenUntil) || 0, this.engine.time + effect.freezeSec);
        unit.slowedUntil = Math.max(
          Number(unit.slowedUntil) || 0,
          this.engine.time + effect.freezeSec + effect.slowSec,
        );
      }
      return;
    }
    if (skillId === 537) {
      this.pendingBossSkills.push({
        skillId,
        effect,
        applyAt: this.engine.time + getSkillResolutionDelay(skillId, 0.9),
      });
      return;
    }
    if (skillId === 539) {
      for (const unit of players) {
        unit.dots ??= [];
        unit.dots.push({
          kind: 'curse',
          dps: effect.dps * this.difficultyMult,
          every: 1,
          until: this.engine.time + effect.duration,
        });
        unit.damageTakenBonus = Math.max(
          Number(unit.damageTakenBonus) || 0,
          effect.vulnerability,
        );
        unit.damageTakenBonusUntil = this.engine.time + effect.duration;
      }
      return;
    }
    if (skillId === 538) {
      for (const unit of [boss, ...minions]) {
        const healed = unit.heal((unit === boss ? 70 : effect.amount) * this.difficultyMult);
        if (healed > 0) this.engine.spawnFloat(unit.lane, unit.col, healed);
        unit.hots ??= [];
        unit.hots.push({
          amount: effect.hotAmount * this.difficultyMult,
          every: effect.hotEvery,
          nextAt: this.engine.time + effect.hotEvery,
          until: this.engine.time + effect.duration,
        });
      }
      return;
    }
    if (skillId === 522) {
      for (const unit of minions) {
        unit.tempAtkBonus = Math.max(Number(unit.tempAtkBonus) || 0, effect.amount * this.difficultyMult);
        unit.atkBuffUntil = Math.max(
          Number(unit.atkBuffUntil) || 0,
          this.engine.time + effect.duration,
        );
      }
      return;
    }
    if (skillId === 523) {
      for (const unit of players.filter((entry) => entry.lane === target?.lane)) {
        this.engine.skills.hitUnit(unit, effect.damage * this.difficultyMult);
      }
      return;
    }
    if (skillId === 527) {
      const living = players.filter((unit) => unit.alive);
      for (const unit of living) {
        this.engine.skills.hitUnit(unit, effect.damage * this.difficultyMult);
      }
      const focus = living
        .filter((unit) => unit.alive)
        .sort((a, b) => Number(b.maxHp) - Number(a.maxHp) || Number(a.uid) - Number(b.uid))[0];
      if (focus) {
        this.engine.skills.hitUnit(focus, effect.damage * living.length * this.difficultyMult);
      }
    }
  }

  tickPendingBossSkills() {
    if (!this.pendingBossSkills.length) return;
    const waiting = [];
    for (const cast of this.pendingBossSkills) {
      if (this.engine.time + 1e-6 < cast.applyAt) {
        waiting.push(cast);
        continue;
      }
      if (cast.skillId !== 537) continue;
      for (const unit of this.engine.units.filter((entry) => entry.alive && entry.team === 'player')) {
        this.engine.skills.hitUnit(unit, cast.effect.damage * this.difficultyMult);
        if (!unit.alive) continue;
        unit.dots ??= [];
        unit.dots.push({
          kind: 'burn',
          dps: cast.effect.burnDps * this.difficultyMult,
          every: 1,
          until: this.engine.time + cast.effect.burnSec,
        });
      }
    }
    this.pendingBossSkills = waiting;
  }

  getBossSkillInterval() {
    const base = Math.max(5, Number(this.bossInfo.cd) || 10);
    if (this.difficulty === '困难') return Math.max(4, base * 0.6);
    if (this.difficulty === '普通') return Math.max(5, base * 0.8);
    return base;
  }

  tick(dt) {
    if (this.status !== 'playing') return;
    const step = Math.max(0, Number(dt) || 0);
    // 敌方“基地”只是命中入口；damageBase(enemy) 已被重定向到真实 BOSS 实体。
    this.engine.enemyHeroHp = HIDDEN_ENEMY_BASE_HP;
    this.engine.enemyHeroMaxHp = HIDDEN_ENEMY_BASE_HP;
    this.engine.status = 'playing';
    this.engine.tick(step);
    this.tickPlayerStates(step);
    this.tickPendingBossSkills();
    this.tickResources(step);
    this.tickBossMinions(step);

    this.bossSpecialTimer += step;
    const interval = this.getBossSkillInterval();
    if (this.bossSpecialTimer >= interval) {
      this.bossSpecialTimer %= interval;
      this.castBossSpecial();
    }

    if (!this.bossUnit?.alive || this.bossUnit.hp <= 0) {
      this.status = 'finished';
      this.winner = 'blue';
      this.engine.status = 'win';
    } else if (this.engine.heroHp <= 0) {
      this.status = 'finished';
      this.winner = 'red';
      this.engine.status = 'lose';
    } else {
      this.status = 'playing';
      this.engine.status = 'playing';
    }
    this.syncBossHud();
  }

  publicUnit(unit) {
    const state = animState(this.engine, unit);
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
      state,
      animState: state,
      animUntil: round2(Math.max(
        Number(unit._attackAnimUntil) || 0,
        Number(unit._jumpUntil) || 0,
        Number(unit._forcedAnimUntil) || 0,
        Number(unit.stunnedUntil) || 0,
        Number(unit.frozenUntil) || 0,
      )),
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
      attackingBase: Boolean(unit.attackingBase),
      boss: Boolean(unit.isBoss || unit.pvpBoss),
      bossScale: unit.isBoss || unit.pvpBoss ? Math.max(1, Number(unit.bossScale) || Number(this.bossInfo.displayScale) || 4) : 1,
      bossMinion: Boolean(unit.pvpBossMinion),
    };
  }

  snapshot() {
    this.syncBossHud();
    const now = Number(this.engine.time) || 0;
    return {
      mode: 'boss',
      t: round2(now),
      status: this.status,
      winner: this.winner,
      title: `${this.bossInfo.name}：${this.difficulty}`,
      boss: {
        id: this.bossInfo.id,
        name: this.bossInfo.name,
        difficulty: this.difficulty,
        cardId: Number(this.bossInfo.cardId),
        hp: round2(this.bossUnit?.hp ?? 0),
        maxHp: round2(this.bossUnit?.maxHp ?? 1),
        atk: round2(this.bossUnit?.atk ?? 0),
        lane: Number(this.bossUnit?.lane ?? this.bossInfo.lane ?? 2),
        col: Number(this.bossUnit?.col ?? this.bossInfo.col ?? 10),
        displayScale: Math.max(1, Number(this.bossInfo.displayScale) || 4),
      },
      heroHp: {
        blue: round2(this.engine.heroHp),
        red: round2(this.bossUnit?.hp ?? 0),
      },
      players: this.members.map((member) => ({ ...member })),
      units: this.engine.units
        .filter((unit) => unit.alive || (unit._deathUntil && now < unit._deathUntil))
        .map((unit) => this.publicUnit(unit)),
      lootDrops: (this.engine.lootDrops ?? []).map((drop) => ({ ...drop })),
      logs: this.engine.logs?.slice(-5) ?? this.engine.log?.slice(-5) ?? [],
      visualEvents: this.visualEvents.filter(
        (event) => now - Number(event.startedAt || 0) <= Math.max(5, Number(event.duration || 0) + 1),
      ),
      coopBossVersion: 'coop-boss-v2',
    };
  }
}
