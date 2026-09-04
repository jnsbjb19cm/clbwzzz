import { BattleEngine } from './BattleEngine.js';
import {
  PLAYER_MOVABLE_MAX_COL,
  PLAYER_PLACE_MIN,
} from './BattleConfig.js';
import { unitAnimPlayer } from './UnitAnimPlayer.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleRound3Rules');
const ALIEN_SENTINEL_CARD_ID = 38;
const PLAYER_IMMOBILE_MAX_COL = 4;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isAuthorityBattle(engine) {
  return Boolean(engine?.pvp || engine?.coopBoss);
}

/**
 * 权威战斗的攻击节奏只约束“下一次攻击何时允许开始”。
 * 动画播放速度完全交给 UnitAnimPlayer，不再在这里改 draw 时钟、帧率或动画时长。
 */
function attackCooldownFloor(atkSpeed) {
  const speed = Math.max(0, finite(atkSpeed));
  if (speed <= 0) return 99;
  if (speed <= 1) return 4.0;
  if (speed <= 2) return 3.5;
  if (speed <= 3) return 3.1;
  if (speed <= 4) return 2.8;
  if (speed <= 5) return 2.65;
  return 2.55;
}

function exactPlayerPlacement(engine, lane, col, handIndex, options = {}) {
  const silent = options.silent === true;
  if (!silent) engine.lastDeployError = '';
  if (engine.status !== 'playing') {
    if (!silent) engine.lastDeployError = '战斗已结束';
    return false;
  }

  const entry = engine.deck?.[handIndex];
  const card = entry?.card;
  if (!card) return false;

  const row = Math.floor(Number(lane));
  const column = Math.floor(Number(col));
  if (row < 0 || row > 4 || column < 0 || column > 11) {
    if (!silent) engine.lastDeployError = '放置位置无效';
    return false;
  }

  const movable = Number(card.moveSpeed) > 0;
  const sentinel = Number(card.id) === ALIEN_SENTINEL_CARD_ID;
  if (movable && (column < PLAYER_PLACE_MIN || column > PLAYER_MOVABLE_MAX_COL)) {
    if (!silent) engine.lastDeployError = '可移动单位只能放在靠我方基地前三列';
    return false;
  }
  // 客户端坐标已经按当前玩家视角镜像，因此双方自己的 5×5 区域都表现为本地 col=0..4。
  // 外星哨兵保留“放到敌方单位格”的特殊例外。
  if (!movable && !sentinel && (column < PLAYER_PLACE_MIN || column > PLAYER_IMMOBILE_MAX_COL)) {
    if (!silent) engine.lastDeployError = '不可移动卡牌只能放在我方5×5区域';
    return false;
  }

  const cellUnits = (engine.getUnitsAt?.(row, column) ?? []).filter(
    (unit) => unit?.alive && !unit.pvpNeutral && unit.bossCommanderOnly !== true,
  );

  if (movable) {
    // 原规则：己方可移动单位占用同一移动部署格；己方不可移动卡、敌方单位都不占用。
    if (cellUnits.some((unit) => unit.team === 'player' && unit.isMovable?.())) {
      if (!silent) engine.lastDeployError = '该格已有己方可移动单位';
      return false;
    }
  } else if (sentinel) {
    if (!cellUnits.some((unit) => unit.team !== 'player' && !unit.isMovable?.())) {
      if (!silent) engine.lastDeployError = '外星哨兵只能放置在敌方不可移动单位的格子上';
      return false;
    }
  } else {
    // 普通不可移动卡只允许己方5×5；区域内只要已有不可移动卡就不能再次叠放。
    // 可移动单位不会占用不可移动卡的放置资格。
    if (cellUnits.some((unit) => !unit.isMovable?.())) {
      if (!silent) engine.lastDeployError = '该格已有不可移动卡牌';
      return false;
    }
  }

  if (!engine.trainingMode) {
    const cost = engine.getDeployCost?.(card) ?? { sun: 0, food: 0 };
    if (finite(engine.sunlight) < finite(cost.sun) || finite(engine.food) < finite(cost.food)) {
      if (!silent) engine.lastDeployError = '资源不足';
      return false;
    }
    if (finite(engine.cooldowns?.[handIndex]) > 0) {
      if (!silent) engine.lastDeployError = '卡牌冷却中';
      return false;
    }
  }
  return true;
}

export function installBattleRound3Rules() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousCanDeploy = BattleEngine.prototype.canDeploy;
  BattleEngine.prototype.canDeploy = function canDeployRound3(
    lane,
    col,
    handIndex = this.selectedHandIndex,
    options = {},
  ) {
    if (!this.pvp && !this.coopBoss) {
      return previousCanDeploy.call(this, lane, col, handIndex, options);
    }
    return exactPlayerPlacement(this, lane, col, handIndex, options);
  };

  const previousTryAttack = BattleEngine.prototype.tryAttack;
  BattleEngine.prototype.tryAttack = function tryAttackRound3Pacing(unit) {
    const attacked = previousTryAttack.call(this, unit);
    if (!attacked || !isAuthorityBattle(this) || !unit) return attacked;

    // 下一次攻击必须晚于完整攻击动画，并留出短恢复时间。
    // 攻速只改变攻击间隔，不再改变动画播放速度。
    const animationDuration = Math.max(0, unitAnimPlayer.resolveAttackDuration(unit));
    unit.atkTimer = Math.max(
      finite(unit.atkTimer),
      attackCooldownFloor(unit.atkSpeed),
      animationDuration + 0.24,
    );
    return attacked;
  };
}
