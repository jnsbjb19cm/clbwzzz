import { CoopBossBattle } from './CoopBossBattle.js';

const PATCH_FLAG = Symbol.for('clbwzzz.coopBossOwnerResourceFinal');

function bindBattle(instance) {
  if (instance?.engine) instance.engine.__authorityBattle = instance;
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function installCoopBossOwnerResourceFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  for (const methodName of ['deploy', 'castSkill', 'tick']) {
    const previous = CoopBossBattle.prototype[methodName];
    CoopBossBattle.prototype[methodName] = function coopBossWithOwnerResources(...args) {
      bindBattle(this);
      return previous.apply(this, args);
    };
  }

  const previousSnapshot = CoopBossBattle.prototype.snapshot;
  CoopBossBattle.prototype.snapshot = function coopBossSnapshotWithOwnerResources(...args) {
    bindBattle(this);
    const snapshot = previousSnapshot.apply(this, args);
    if (!snapshot || typeof snapshot !== 'object') return snapshot;

    snapshot.resourcesByUser = Object.fromEntries(
      [...this.resources.entries()].map(([userId, resource]) => [
        String(userId),
        {
          sun: round2(resource?.sun),
          food: round2(resource?.food),
        },
      ]),
    );

    snapshot.skillsByUser = Object.fromEntries(
      [...this.skillStates.keys()].map((userId) => [
        String(userId),
        this.publicSkillState(userId),
      ]),
    );

    return snapshot;
  };
}
