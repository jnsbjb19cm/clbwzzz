import { BattleEngine } from './BattleEngine.js';
import { getMoveColPerSec } from './BattleConfig.js';

const PATCH_FLAG = Symbol.for('clbwz.trainingBaseThreatFix20260905');

function normalAdvanceDir(unit) {
  return unit?.team === 'player' ? 1 : -1;
}

function baseThreatsBehind(engine, unit, lane = unit?.lane) {
  if (!engine?.trainingMode || !unit?.alive) return [];
  const dir = normalAdvanceDir(unit);
  return engine.units
    .filter((target) => (
      target?.alive
      && target.team !== unit.team
      && target.lane === lane
      && target.attackingBase === true
      && (Number(target.col) - Number(unit.col)) * dir < -0.05
      && engine.isValidEnemyTarget(unit, target)
    ))
    .sort((a, b) => Math.abs(Number(a.col) - Number(unit.col)) - Math.abs(Number(b.col) - Number(unit.col)));
}

function attackReach(unit) {
  return Math.max(1, Number(unit?.range) || 1) + 0.75;
}

export function installTrainingBaseThreatFix20260905() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  // 原目标搜索只沿“向敌方基地”的方向找目标。敌军一旦穿过我方单位并进入基地，
  // 就会落在所有我方单位身后，导致射手和近战都彻底丢失目标。
  const previousGetEnemiesInLane = BattleEngine.prototype.getEnemiesInLane;
  BattleEngine.prototype.getEnemiesInLane = function getEnemiesInLaneWithTrainingBaseDefense20260905(unit, lane) {
    const found = previousGetEnemiesInLane.call(this, unit, lane);
    if (!this.trainingMode || !unit?.alive) return found;

    const reach = attackReach(unit);
    for (const target of baseThreatsBehind(this, unit, lane)) {
      const dist = Math.abs(Number(target.col) - Number(unit.col));
      if (dist > reach) continue;
      if (!found.some((entry) => entry.unit?.uid === target.uid)) {
        found.push({ unit: target, dist });
      }
    }
    return found;
  };

  // 可移动卡牌若已经越过了入侵者，需要掉头回防；否则即使目标系统允许“向后看”，
  // 近战仍会继续向右走，永远追不上正在我方基地里攻击的软泥怪。
  const previousUpdateUnitMovement = BattleEngine.prototype.updateUnitMovement;
  BattleEngine.prototype.updateUnitMovement = function updateUnitMovementWithTrainingBaseDefense20260905(dt) {
    if (!this.trainingMode) return previousUpdateUnitMovement.call(this, dt);

    const held = [];
    const frameDt = Math.max(0, Number(dt) || 0);
    try {
      for (const unit of this.units) {
        if (!unit?.alive || !unit.isMovable?.() || unit.attackingBase) continue;
        const threat = baseThreatsBehind(this, unit, unit.lane)[0];
        if (!threat) continue;

        const originalMoveSpeed = unit.moveSpeed;
        held.push([unit, originalMoveSpeed]);

        const distance = Math.abs(Number(threat.col) - Number(unit.col));
        const reach = attackReach(unit);
        const movementLocked = Boolean(
          unit._aerialLandingRequested
          || (unit._attackAnimUntil && this.time < unit._attackAnimUntil)
          || unit.isFrozen?.(this.time)
          || unit.isStunned?.(this.time)
        );

        if (!movementLocked && distance > reach) {
          const slowFactor = unit.slowedUntil && this.time < unit.slowedUntil ? 0.45 : 1;
          const auraMult = Number(this.getMoveSpeedMult?.(unit)) || 1;
          const speed = getMoveColPerSec(originalMoveSpeed) * slowFactor * auraMult;
          if (speed > 0 && frameDt > 0) {
            const safeReach = Math.max(0.65, reach - 0.18);
            const step = Math.min(speed * frameDt, Math.max(0, distance - safeReach));
            const backDir = Math.sign(Number(threat.col) - Number(unit.col));
            unit.col += backDir * step;
            unit.renderX = unit.col;
            unit.renderY = unit.lane;
          }
        }

        // 本帧的回防位移已经由上面处理，临时置 0 防止原移动逻辑又向敌方基地走回去。
        unit.moveSpeed = 0;
      }

      return previousUpdateUnitMovement.call(this, dt);
    } finally {
      for (const [unit, moveSpeed] of held) unit.moveSpeed = moveSpeed;
    }
  };

  if (typeof window !== 'undefined') {
    window.__verifyTrainingBaseThreatFix20260905 = (engine) => ({
      enabled: Boolean(engine?.trainingMode),
      threats: (engine?.units ?? []).filter((unit) => unit?.alive && unit.attackingBase).map((unit) => ({
        uid: unit.uid,
        team: unit.team,
        lane: unit.lane,
        col: unit.col,
      })),
    });
  }
}
