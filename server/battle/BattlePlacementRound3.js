import { CoopBossBattle } from './CoopBossBattle.js';
import { PvpBattle } from './PvpBattle.js';
import { sanitizeCustomCardName } from '../../src/core/constants.js';

const { BattleEngine } = await import('../../src/battle/BattleEngine.js');
const { BattleUnit } = await import('../../src/battle/BattleUnit.js');
const { installBossSummonRules20260819 } = await import('./BossSummonRules20260819.js');

const PATCH_FLAG = Symbol.for('clbwzzz.battlePlacementRound3');
const ALIEN_SENTINEL_CARD_ID = 38;
const ALIEN_SENTINEL_DELAY = 5;
const ALIEN_SENTINEL_DAMAGE = 1000;

function finiteInt(value) {
  return Math.floor(Number(value));
}

function sameCell(aLane, aCol, bLane, bCol) {
  return finiteInt(aLane) === finiteInt(bLane) && finiteInt(aCol) === finiteInt(bCol);
}

function isRealImmobileCard(unit) {
  return Boolean(
    unit?.alive
    && !unit.pvpNeutral
    && unit.bossCommanderOnly !== true
    && !unit.isMovable?.(),
  );
}

function enemyUnitsInCell(battle, lane, col, side) {
  return battle.engine.getUnitsAt(lane, col).filter((unit) =>
    unit?.alive
    && !unit.pvpNeutral
    && unit.bossCommanderOnly !== true
    && unit.team !== side,
  );
}

function validateLatestCellRule(battle, lane, col, side, card, movable) {
  const units = battle.engine.getUnitsAt(lane, col).filter((unit) =>
    unit?.alive && !unit.pvpNeutral && unit.bossCommanderOnly !== true,
  );

  // 最终规则：可移动卡在合法的己方三列内允许同格叠放。
  // 己方可移动/不可移动单位、敌方普通单位都不额外占用“可移动卡部署格”。
  if (movable) return;

  if (Number(card.id) === ALIEN_SENTINEL_CARD_ID) {
    if (!enemyUnitsInCell(battle, lane, col, side).some((unit) => !unit.isMovable?.())) {
      throw new Error('外星哨兵只能放置在敌方不可移动单位的格子上');
    }
    return;
  }

  // 普通不可移动卡只与不可移动卡互斥；可移动卡可以和它同格。
  if (units.some(isRealImmobileCard)) throw new Error('该格已有不可移动卡牌');
}

function validatePvpColumns(team, movable, col, cardId) {
  if (col < 0 || col > 11) throw new Error('放置位置无效');
  const sentinel = Number(cardId) === ALIEN_SENTINEL_CARD_ID;
  if (movable) {
    if (team === 'blue' && col > 2) throw new Error('可移动卡牌只能放在己方靠基地3列');
    if (team === 'red' && col < 9) throw new Error('可移动卡牌只能放在己方靠基地3列');
    return;
  }
  // 普通不可移动卡只能放己方五列；外星哨兵是敌方不可移动格部署例外。
  if (sentinel) return;
  if (team === 'blue' && col > 4) throw new Error('不可移动卡牌只能放在己方5列');
  if (team === 'red' && col < 7) throw new Error('不可移动卡牌只能放在己方5列');
}

function normalizeInstance(payload = {}) {
  const craftQuality = Math.max(1, Math.min(5, Math.round(Number(payload.craftQuality) || 1)));
  const strengthLv = Math.max(0, Math.min(6, Math.round(Number(payload.strengthLv ?? payload.star) || 0)));
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

function withLegacyPvpColumnBypass(battle, enabled, callback) {
  if (!enabled) return callback();
  const previousValidCol = battle.validCol;
  battle.validCol = () => true;
  try {
    return callback();
  } finally {
    battle.validCol = previousValidCol;
  }
}

function withLegacyOwnFixedBypass(battle, lane, col, side, enabled, callback) {
  if (!enabled) return callback();
  const engine = battle.engine;
  const previousGetUnitsAt = engine.getUnitsAt;
  engine.getUnitsAt = function getUnitsAtWithoutLegacyOwnFixed(queryLane, queryCol) {
    const units = previousGetUnitsAt.call(this, queryLane, queryCol);
    if (!sameCell(queryLane, queryCol, lane, col)) return units;
    return units.filter((unit) => !(unit?.alive && unit.team === side && !unit.isMovable?.()));
  };
  try {
    return callback();
  } finally {
    engine.getUnitsAt = previousGetUnitsAt;
  }
}

function findDeployedUnit(battle, publicUnit) {
  const uid = Number(publicUnit?.uid);
  return battle.engine.units.find((unit) => Number(unit.uid) === uid) ?? null;
}

function armAlienSentinel(battle, unit, lane, col) {
  if (!unit || Number(unit.cardId) !== ALIEN_SENTINEL_CARD_ID) return;
  unit._alienSentinelLane = lane;
  unit._alienSentinelCol = col;
  unit._alienSentinelResolveAt = battle.engine.time + ALIEN_SENTINEL_DELAY;
  unit._alienSentinelResolved = false;
}

function resolveAlienSentinels(battle) {
  const engine = battle.engine;
  for (const sentinel of [...engine.units]) {
    if (!sentinel?.alive || Number(sentinel.cardId) !== ALIEN_SENTINEL_CARD_ID) continue;
    if (sentinel._alienSentinelResolved || !Number.isFinite(sentinel._alienSentinelResolveAt)) continue;
    if (engine.time + 1e-6 < sentinel._alienSentinelResolveAt) continue;

    sentinel._alienSentinelResolved = true;
    const lane = finiteInt(sentinel._alienSentinelLane ?? sentinel.lane);
    const col = finiteInt(sentinel._alienSentinelCol ?? sentinel.col);
    const victim = engine.getUnitsAt(lane, col)
      .filter((unit) =>
        unit?.alive
        && unit.team !== sentinel.team
        && unit.pvpNeutral !== true
        && unit.bossCommanderOnly !== true
        && !unit.isMovable?.(),
      )
      .sort((a, b) => Number(a.uid) - Number(b.uid))[0];
    if (!victim) {
      engine.pushLog?.('【外星哨兵】5秒吸取结束，但原格已无敌方不可移动单位');
    } else {
      const hpBefore = Number(victim.hp) || 0;
      victim.takeDamage(Math.max(ALIEN_SENTINEL_DAMAGE, hpBefore), engine.time);
      const dealt = Math.max(0, hpBefore - (Number(victim.hp) || 0));
      if (dealt > 0) engine.spawnFloat?.(victim.lane, victim.col, -dealt);
      engine.pushLog?.(`【外星哨兵】吸走 ${victim.name}`);
      if (!victim.alive) engine.onUnitDeath?.(victim);
    }

    // 吸取是一次性行为：无论目标是否仍在原格，结算后哨兵都立即消失。
    sentinel.hp = 0;
    sentinel.alive = false;
    sentinel._deathUntil = engine.time;
    engine.onUnitDeath?.(sentinel);
  }
}

function deployBossSentinelAnywhere(battle, userId, payload, card, lane, col) {
  const resource = battle.resourcesOf(userId);
  const cost = battle.deployCost(card);
  if (resource.sun < cost.sun || resource.food < cost.food) {
    const name = cost.food > 0 ? '食物' : '阳光';
    const amount = cost.food > 0 ? cost.food : cost.sun;
    throw new Error(`${name}不足(需要 ${amount})`);
  }
  resource.sun -= cost.sun;
  resource.food -= cost.food;

  const unit = new BattleUnit({ card, lane, col, team: 'player', instance: normalizeInstance(payload) });
  unit.uid = ++battle.uidSeq;
  unit.pvpOwnerUserId = Number(userId);
  battle.engine.initUnitSpawnFade?.(unit);
  battle.engine.units.push(unit);
  battle.engine.pushDeployEffect?.(lane, col, unit.craftQuality);
  return { unit: battle.publicUnit(unit), resources: battle.publicResources(userId) };
}

export function installBattlePlacementRound3() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousTryAbduct = BattleEngine.prototype.tryAbduct;
  BattleEngine.prototype.tryAbduct = function tryAbductWithoutLegacyPvpSentinel(unit, ...args) {
    if (Number(unit?.cardId) === ALIEN_SENTINEL_CARD_ID && Number.isFinite(unit?._alienSentinelResolveAt)) {
      return false;
    }
    return previousTryAbduct.call(this, unit, ...args);
  };

  const previousPvpDeploy = PvpBattle.prototype.deploy;
  PvpBattle.prototype.deploy = function deployWithLatestPlacementRule(userId, payload = {}) {
    const team = this.teamOf(userId);
    if (!team) return previousPvpDeploy.call(this, userId, payload);
    const card = this.db.getById(Number(payload.cardId));
    if (!card) return previousPvpDeploy.call(this, userId, payload);
    const lane = finiteInt(payload.lane);
    const col = finiteInt(payload.col);
    if (lane < 0 || lane > 4) throw new Error('行数无效');
    const movable = Number(card.moveSpeed) > 0;
    const sentinel = Number(card.id) === ALIEN_SENTINEL_CARD_ID;
    validatePvpColumns(team, movable, col, card.id);
    const side = team === 'red' ? 'enemy' : 'player';
    validateLatestCellRule(this, lane, col, side, card, movable);

    const result = withLegacyPvpColumnBypass(this, sentinel, () =>
      withLegacyOwnFixedBypass(this, lane, col, side, sentinel, () =>
        previousPvpDeploy.call(this, userId, payload)));
    if (sentinel) armAlienSentinel(this, findDeployedUnit(this, result.unit), lane, col);
    return result;
  };

  const previousPvpTick = PvpBattle.prototype.tick;
  PvpBattle.prototype.tick = function tickWithAlienSentinelAuthority(dt) {
    const result = previousPvpTick.call(this, dt);
    resolveAlienSentinels(this);
    return result;
  };

  const previousBossDeploy = CoopBossBattle.prototype.deploy;
  CoopBossBattle.prototype.deploy = function deployBossWithLatestPlacementRule(userId, payload = {}) {
    if (this.status !== 'playing') throw new Error('战斗已结束');
    if (!this.teamOf(userId)) throw new Error('你不是本房间玩家');
    const lane = finiteInt(payload.lane);
    const col = finiteInt(payload.col);
    if (lane < 0 || lane > 4 || col < 0 || col > 11) throw new Error('放置位置无效');
    const card = this.db.getById(Number(payload.cardId));
    if (!card || card.isActiveSkill?.() || Number(card.type) === 4) {
      return previousBossDeploy.call(this, userId, payload);
    }
    const movable = Number(card.moveSpeed) > 0;
    const sentinel = Number(card.id) === ALIEN_SENTINEL_CARD_ID;
    if (movable && col > 2) throw new Error('可移动卡牌只能放在己方靠基地3列');
    if (!movable && !sentinel && col > 4) throw new Error('不可移动卡牌只能放在己方5列');
    validateLatestCellRule(this, lane, col, 'player', card, movable);

    let result;
    if (sentinel && col > 4) {
      result = deployBossSentinelAnywhere(this, userId, payload, card, lane, col);
    } else if (sentinel) {
      result = withLegacyOwnFixedBypass(this, lane, col, 'player', true, () =>
        previousBossDeploy.call(this, userId, payload));
    } else {
      result = previousBossDeploy.call(this, userId, payload);
    }
    if (sentinel) armAlienSentinel(this, findDeployedUnit(this, result.unit), lane, col);
    return result;
  };

  const previousBossTick = CoopBossBattle.prototype.tick;
  CoopBossBattle.prototype.tick = function tickBossWithAlienSentinelAuthority(dt) {
    const result = previousBossTick.call(this, dt);
    resolveAlienSentinels(this);
    return result;
  };

  installBossSummonRules20260819();
}
