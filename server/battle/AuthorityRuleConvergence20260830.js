import { calculateCardStats } from '../../src/battle/CardStatFormula.js';
import { HERO_MP_MAX } from '../../src/core/SkillRegistry.js';
import { PvpBattle } from './PvpBattle.js';
import { CoopBossBattle } from './CoopBossBattle.js';

const PATCH_FLAG = Symbol.for('clbwzzz.authorityRuleConvergence20260830');

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cooldownState(battle, userId) {
  battle.__deployCooldowns20260830 ??= new Map();
  const id = Number(userId);
  if (!battle.__deployCooldowns20260830.has(id)) {
    battle.__deployCooldowns20260830.set(id, new Map());
  }
  return battle.__deployCooldowns20260830.get(id);
}

function publicDeployCooldowns(battle, userId) {
  const now = finite(battle.engine?.time);
  const state = cooldownState(battle, userId);
  const out = {};
  for (const [cardId, until] of state) {
    const remaining = Math.max(0, finite(until) - now);
    if (remaining <= 1e-6) {
      state.delete(cardId);
      continue;
    }
    out[String(cardId)] = Math.round(remaining * 100) / 100;
  }
  return out;
}

function installForBattleClass(BattleClass) {
  if (!BattleClass?.prototype) return;

  const previousSetSkillLoadout = BattleClass.prototype.setSkillLoadout;
  BattleClass.prototype.setSkillLoadout = function setSkillLoadoutServerOwned(userId, loadout, _clientMaxMp) {
    // 服务器没有持久化天赋资料前，客户端不得自行声明 maxMp。
    return previousSetSkillLoadout.call(this, userId, loadout, HERO_MP_MAX);
  };

  BattleClass.prototype.publicDeployCooldowns = function publicDeployCooldownsForUser(userId) {
    return publicDeployCooldowns(this, userId);
  };

  const previousPublicSkillState = BattleClass.prototype.publicSkillState;
  BattleClass.prototype.publicSkillState = function publicSkillStateWithDeployCooldowns(userId) {
    return {
      ...previousPublicSkillState.call(this, userId),
      deployCooldowns: publicDeployCooldowns(this, userId),
    };
  };

  const previousDeploy = BattleClass.prototype.deploy;
  BattleClass.prototype.deploy = function deployWithServerCooldown(userId, payload = {}) {
    const cardId = Number(payload.cardId);
    const card = this.db?.getById?.(cardId);
    const now = finite(this.engine?.time);
    if (card) {
      const state = cooldownState(this, userId);
      const remaining = Math.max(0, finite(state.get(cardId)) - now);
      if (remaining > 1e-6) {
        throw new Error(`卡牌冷却中(${Math.ceil(remaining)}秒)`);
      }
    }

    const result = previousDeploy.call(this, userId, payload);
    if (!card || !result?.unit) return result;

    const stats = calculateCardStats(
      card,
      payload.craftQuality ?? 1,
      payload.strengthLv ?? payload.star ?? 0,
      payload.attributeRoll ?? null,
    );
    const cooldown = Math.max(0, finite(stats.cd));
    cooldownState(this, userId).set(cardId, now + cooldown);
    return {
      ...result,
      cooldown,
      deployCooldowns: publicDeployCooldowns(this, userId),
    };
  };

  const previousSnapshot = BattleClass.prototype.snapshot;
  BattleClass.prototype.snapshot = function snapshotWithPhaseOutContract(...args) {
    const snapshot = previousSnapshot.apply(this, args);
    const records = this.engine?.__phaseOutRecords20260830 ?? [];
    snapshot.phaseOutUids = records
      .filter((record) => finite(record.restoreAt) > finite(this.engine?.time))
      .map((record) => Number(record.uid))
      .filter(Number.isFinite);
    snapshot.authorityRuleVersion = 'authority-convergence-20260830';
    return snapshot;
  };
}

export function installAuthorityRuleConvergence20260830() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;
  installForBattleClass(PvpBattle);
  installForBattleClass(CoopBossBattle);
}
