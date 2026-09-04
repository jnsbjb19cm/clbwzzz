// PvpBattle 先建立无头浏览器环境并载入 BattleEngine，随后再载入共用战斗补丁。
import './PvpBattle.js';

const { BattleEngine } = await import('../../src/battle/BattleEngine.js');
const { unitAnimPlayer } = await import('../../src/battle/UnitAnimPlayer.js');
const { installBattleAttackTimingFix } = await import('../../src/ui/BattleAttackTimingFix.js');
const { installBattleRound3Rules } = await import('../../src/battle/BattleRound3Rules.js');
const { installProjectileImpactAlignmentFinal } = await import('../../src/battle/ProjectileImpactAlignmentFinal.js');
const { CoopBossBattle } = await import('./CoopBossBattle.js');
const { installBattlePlacementRound3 } = await import('./BattlePlacementRound3.js');
const { installBossSummonRules20260819 } = await import('./BossSummonRules20260819.js');
const { installPvpProjectileReleaseCalibrationFinal } = await import('./PvpProjectileReleaseCalibrationFinal.js');
const { installPvpBaseDamageSymmetryFinal } = await import('./PvpBaseDamageSymmetryFinal.js');

const PATCH_FLAG = Symbol.for('clbwzzz.pvpGameplayInstall');
const COMMANDER_PATCH_FLAG = Symbol.for('clbwzzz.bossCommanderOnlyFinal');
const ANIMATION_START_PATCH_FLAG = Symbol.for('clbwzzz.pvpAuthoritativeAnimationStartFinal');
const FLY_SHOE_SERVER_PATCH_FLAG = Symbol.for('clbwzzz.pvpFlyShoeHeadlessSpecialFinal');

function installAuthoritativeAnimationStartTracking() {
  if (globalThis[ANIMATION_START_PATCH_FLAG]) return;
  globalThis[ANIMATION_START_PATCH_FLAG] = true;

  const previousTriggerState = unitAnimPlayer.triggerState;
  unitAnimPlayer.triggerState = function triggerStateWithAuthoritativeStart(unit, engine, state, duration) {
    if (unit && engine) unit._forcedAnimStartedAt = Number(engine.time) || 0;
    return previousTriggerState.call(this, unit, engine, state, duration);
  };
}

function installFlyShoeHeadlessSpecialRule() {
  if (globalThis[FLY_SHOE_SERVER_PATCH_FLAG]) return;
  globalThis[FLY_SHOE_SERVER_PATCH_FLAG] = true;

  const previousTryFirstContactStun = BattleEngine.prototype.tryFirstContactStun;
  BattleEngine.prototype.tryFirstContactStun = function tryFirstContactStunWithHeadlessVisualState(unit, ...args) {
    const hadContact = Boolean(unit?._firstContactStun);
    const result = previousTryFirstContactStun.call(this, unit, ...args);

    // 服务端故意不加载 PNG/JSON 动画包，所以 core 的 hasAnimState(23, secondAttackStatus)
    // 在 headless authority 中会是 false。眩晕结算仍发生，但若不补这个“状态协议”，
    // 客户端永远收不到 forcedToken/secondAttackStatus，表现上就像多人飞鞋特殊攻击失效。
    if (result && !hadContact && Number(unit?.cardId) === 23 && unit._firstContactStun) {
      const duration = 0.85;
      unit._forcedAnimState = 'secondAttackStatus';
      unit._forcedAnimStartedAt = Number(this.time) || 0;
      unit._forcedAnimUntil = Math.max(Number(unit._forcedAnimUntil) || 0, this.time + duration);
    }
    return result;
  };
}

function installBossCommanderOnlyRule() {
  if (globalThis[COMMANDER_PATCH_FLAG]) return;
  globalThis[COMMANDER_PATCH_FLAG] = true;

  const previousSpawnBoss = CoopBossBattle.prototype.spawnBoss;
  CoopBossBattle.prototype.spawnBoss = function spawnBossWithCommanderContract(...args) {
    const result = previousSpawnBoss.apply(this, args);
    const unit = this.bossUnit;
    if (unit && this.bossInfo?.commanderOnly === true) {
      unit.bossCommanderOnly = true;
      unit.atk = 0;
      unit.atkSpeed = 0;
      unit.atkTimer = 999;
      unit.attackingBase = false;
      unit._attackAnimUntil = 0;
    }
    return result;
  };

  // Commander 是纯展示/指挥模型：从所有普通战斗 seam 中剔除。
  const previousIsValidEnemyTarget = BattleEngine.prototype.isValidEnemyTarget;
  BattleEngine.prototype.isValidEnemyTarget = function isValidEnemyTargetWithoutCommander(attacker, enemy) {
    if (enemy?.bossCommanderOnly === true) return false;
    return previousIsValidEnemyTarget.call(this, attacker, enemy);
  };

  const previousBlocksMovement = BattleEngine.prototype.blocksMovement;
  BattleEngine.prototype.blocksMovement = function blocksMovementWithoutCommander(blocker, mover) {
    if (blocker?.bossCommanderOnly === true) return false;
    return previousBlocksMovement.call(this, blocker, mover);
  };

  const previousContactEnemies = BattleEngine.prototype.contactEnemies;
  BattleEngine.prototype.contactEnemies = function contactEnemiesWithoutCommander(unit) {
    return previousContactEnemies.call(this, unit).filter((enemy) => enemy?.bossCommanderOnly !== true);
  };

  // 普通直线/抛物线弹的扫掠碰撞也不能撞到 commander。
  const previousUpdateProjectiles = BattleEngine.prototype.updateProjectiles;
  BattleEngine.prototype.updateProjectiles = function updateProjectilesWithoutCommander(dt) {
    const commanders = (this.units ?? []).filter((unit) => unit?.bossCommanderOnly === true);
    if (!commanders.length) return previousUpdateProjectiles.call(this, dt);
    const originalUnits = this.units;
    this.units = originalUnits.filter((unit) => unit?.bossCommanderOnly !== true);
    try {
      return previousUpdateProjectiles.call(this, dt);
    } finally {
      this.units = originalUnits;
    }
  };

  const previousTryAttack = BattleEngine.prototype.tryAttack;
  BattleEngine.prototype.tryAttack = function tryAttackWithBossCommanderRule(unit, ...args) {
    if (unit?.bossCommanderOnly === true) {
      unit.attackingBase = false;
      unit._attackAnimUntil = 0;
      return false;
    }
    return previousTryAttack.call(this, unit, ...args);
  };
}

/**
 * 服务端权威战斗必须使用和单机/客户端验证相同的攻击出手帧逻辑。
 * scripts/verify-card-specials.mjs 也以该补丁作为全部特殊攻击的基准实现。
 */
export function installPvpGameplayFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;
  installAuthoritativeAnimationStartTracking();
  installFlyShoeHeadlessSpecialRule();
  installBattleAttackTimingFix();
  installProjectileImpactAlignmentFinal();
  installBossCommanderOnlyRule();
  // PvpBattle 用 trainingMode 关闭 PVE 波次，但 PVP 双方基地必须仍可对称受伤。
  // 将它纳入统一 gameplay installer，避免测试/服务端入口因外部安装顺序不同而行为分叉。
  installPvpBaseDamageSymmetryFinal();
  installPvpProjectileReleaseCalibrationFinal();
  installBattleRound3Rules();
  installBattlePlacementRound3();
  installBossSummonRules20260819();
}
