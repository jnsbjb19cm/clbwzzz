import { BattleEngine } from './BattleEngine.js';
import { Projectile } from './Projectile.js';
import { unitAnimPlayer } from './UnitAnimPlayer.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleMushroomProjectileFinal');
const MUSHROOM_RES = 58;

function isValidMushroomTarget(engine, source, target) {
  if (!target?.alive || target.team === source.team || target.isLowTarget?.()) return false;
  return typeof engine.isValidEnemyTarget === 'function'
    ? engine.isValidEnemyTarget(source, target)
    : true;
}

function pushVisualToxicProjectile(engine, source, target, delay) {
  const alreadyExists = (engine.projectiles ?? []).some(
    (projectile) => projectile.visualOnly
      && Number(projectile.sourceRes) === MUSHROOM_RES
      && projectile.sourceUid === source.uid
      && projectile.targetUid === target.uid
      && !projectile.done,
  );
  if (alreadyExists) return;

  const hitCol = source.team === 'player' ? target.col - 0.42 : target.col + 0.42;
  engine.projectiles.push(new Projectile({
    owner: source.team,
    lane: source.lane,
    startCol: source.col,
    hitLane: target.lane,
    hitCol,
    resolveCol: hitCol,
    damage: 0,
    trajectory: 'straight',
    targetUid: target.uid,
    sourceUid: source.uid,
    sourceRes: MUSHROOM_RES,
    icon: '●',
    delay,
    visualOnly: true,
    pierce: true,
  }));
}

export function installBattleMushroomProjectileFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousTryMushroomAttack = BattleEngine.prototype.tryMushroomAttack;
  BattleEngine.prototype.tryMushroomAttack = function tryMushroomAttackWithToxicProjectiles(unit) {
    // 蘑菇仙人攻击直接作用于敌方全体（原实现），不生成小毒子弹
    return previousTryMushroomAttack.call(this, unit);
  };
  const previousUpdateProjectiles = BattleEngine.prototype.updateProjectiles;
  BattleEngine.prototype.updateProjectiles = function updateProjectilesWithVisualImpact(dt) {
    const visualFlights = (this.projectiles ?? []).filter(
      (projectile) => projectile.visualOnly && !projectile.done,
    );

    const result = previousUpdateProjectiles.call(this, dt);

    for (const projectile of visualFlights) {
      if (!projectile.done || projectile._visualImpactDone) continue;
      projectile._visualImpactDone = true;
      this.spawnImpactFx?.(
        projectile.hitLane,
        projectile.resolveCol ?? projectile.hitCol,
        0,
        projectile.sourceRes,
      );
    }
    return result;
  };
}
