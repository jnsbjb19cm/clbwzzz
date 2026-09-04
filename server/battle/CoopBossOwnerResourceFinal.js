import { CoopBossBattle } from './CoopBossBattle.js';

const PATCH_FLAG = Symbol.for('clbwzzz.coopBossOwnerResourceFinal');

function bindBattle(instance) {
  if (instance?.engine) instance.engine.__authorityBattle = instance;
}

export function installCoopBossOwnerResourceFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  for (const methodName of ['deploy', 'castSkill', 'tick', 'snapshot']) {
    const previous = CoopBossBattle.prototype[methodName];
    CoopBossBattle.prototype[methodName] = function coopBossWithOwnerResources(...args) {
      bindBattle(this);
      return previous.apply(this, args);
    };
  }
}
