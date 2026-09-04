import { BattleView } from './BattleView.js';
import { TALENT_NODE_MAP } from '../core/TalentRegistry.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleTalentAuthority20260830');

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function calculateTalentBonus(view) {
  const out = {
    hp: 0,
    // heroSkills.getMpMax() 已经把 MP 天赋计入 heroMpMax；这里必须为 0，避免 BattleEngine 再加一次。
    mp: 0,
    globalAtkPct: 0,
    globalHpPct: 0,
    lowBaseAtkPct: 0,
    lowBaseDamageReductionPct: 0,
    scarecrowAtkPct: 0,
    dandelionHpPct: 0,
    dandelionHealPct: 0,
  };

  try {
    const ids = view.heroSkills?.unlockedTalents ?? new Set();
    for (const id of ids) {
      const node = TALENT_NODE_MAP.get(id);
      if (!node) continue;
      out.hp += finite(node.hpBonus);

      if (id === 'passive_gamble') {
        out.lowBaseAtkPct += finite(node.cardAtkPct);
        continue;
      }
      if (id === 'passive_tough') {
        out.lowBaseDamageReductionPct += finite(node.damageReductionPct);
        continue;
      }
      if (id === 'passive_war') {
        out.scarecrowAtkPct += finite(node.cardAtkPct);
        continue;
      }
      if (id === 'passive_gift') {
        out.dandelionHpPct += finite(node.cardHpPct);
        // 描述明确为“蒲公英系治疗效果 +50%”。
        out.dandelionHealPct += 50;
        continue;
      }

      out.globalAtkPct += finite(node.cardAtkPct);
      out.globalHpPct += finite(node.cardHpPct);
    }
  } catch {
    // 天赋异常不能阻止进入战斗。
  }

  // 兼容仍读取旧字段的模块，但这里只暴露真正的“全局”部分。
  out.atkPct = out.globalAtkPct;
  out.hpPct = out.globalHpPct;
  return out;
}

function installResourceProperties(engine) {
  if (!engine || engine.__pvpResourcePropertyGuard20260830) return;
  engine.__pvpResourcePropertyGuard20260830 = true;

  const state = {
    sunlight: finite(engine.sunlight),
    food: finite(engine.food),
  };

  for (const key of ['sunlight', 'food']) {
    Object.defineProperty(engine, key, {
      configurable: true,
      enumerable: true,
      get() {
        return state[key];
      },
      set(value) {
        const next = Number(value);
        if (!Number.isFinite(next)) return;
        const expected = key === 'sunlight'
          ? Number(this.__pvpExpectedSun20260830)
          : Number(this.__pvpExpectedFood20260830);
        if (this.__pvpPersonalResourceAuthority20260830 && Number.isFinite(expected)) {
          // AuthoritySync 的 legacy energy 路径会把 food 错写成 sun；只允许服务器个人资源值通过。
          if (Math.abs(next - expected) > 1e-6) return;
        }
        state[key] = next;
      },
    });
  }
}

function applyDeployCooldowns(view, snapshot) {
  const map = snapshot?.skill?.deployCooldowns;
  if (!view?.engine?.deck || !map || typeof map !== 'object') return;
  for (let index = 0; index < view.engine.deck.length; index += 1) {
    const cardId = Number(view.engine.deck[index]?.card?.id);
    if (!Number.isFinite(cardId)) continue;
    view.engine.cooldowns[index] = Math.max(0, finite(map[String(cardId)], 0));
  }
}

function removePhasedUnits(view, snapshot) {
  if (!view?.engine) return;
  const phased = new Set((snapshot?.phaseOutUids ?? []).map(Number).filter(Number.isFinite));
  view.__pvpPhaseOutUids20260830 = phased;
  if (!phased.size) return;
  view.engine.units = (view.engine.units ?? []).filter((unit) =>
    !phased.has(Number(unit.__authorityUid ?? unit.uid)),
  );
  for (const unit of view.engine.units ?? []) {
    if (phased.has(Number(unit.lockedTargetUid))) unit.lockedTargetUid = null;
  }
}

function rememberPersonalSnapshot(view, snapshot) {
  if (!view?.pvp || !view.engine || !snapshot) return;
  if (view.pvp?.spectator) return; // 观战没有个人资源/部署冷却
  const resources = snapshot.resources;
  if (resources) {
    const sun = Math.max(0, finite(resources.sun, view.engine.sunlight));
    const food = Math.max(0, finite(resources.food, view.engine.food));
    view.engine.__pvpExpectedSun20260830 = sun;
    view.engine.__pvpExpectedFood20260830 = food;
    view.engine.__pvpPersonalResourceAuthority20260830 = true;
    view.engine.sunlight = sun;
    view.engine.food = food;
  }

  // AuthoritySync / ResourceFinal 都是同步 listener；微任务在两者之后收口最终状态。
  queueMicrotask(() => {
    if (!view.engine) return;
    if (resources) {
      view.engine.sunlight = Math.max(0, finite(resources.sun, view.engine.sunlight));
      view.engine.food = Math.max(0, finite(resources.food, view.engine.food));
    }
    applyDeployCooldowns(view, snapshot);
    removePhasedUnits(view, snapshot);
    view.lastHandKey = '';
    if (view.viewRoot) {
      view.renderHand?.(view.viewRoot);
      view.syncCooldownOverlay?.(view.viewRoot);
      view.syncHud?.(view.viewRoot);
    }
  });
}

function installPreAuthorityListeners(view) {
  if (!view?.pvp || !view.pvpSocket?.on || view.__authorityConvergencePreInstalled20260830) return;
  view.__authorityConvergencePreInstalled20260830 = true;
  installResourceProperties(view.engine);
  view.__authorityConvergenceSnapshotUnsub20260830 = view.pvpSocket.on(
    'pvp:authority:snapshot',
    (snapshot) => rememberPersonalSnapshot(view, snapshot),
  );
  view.__authorityConvergenceFinishedUnsub20260830 = view.pvpSocket.on(
    'pvp:authority:finished',
    (snapshot) => rememberPersonalSnapshot(view, snapshot),
  );
}

export function installBattleTalentAuthority20260830() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  BattleView.prototype.talentBonusForBattle = function talentBonusForBattleConverged() {
    return calculateTalentBonus(this);
  };

  // 注册顺序很重要：initPvpSocket 在 renderBattle 基层中最先创建 socket。
  // 这里挂入的 snapshot listener 会先于后续 AuthoritySync / ResourceFinal listener 注册，
  // 因而可以先记录正确的个人 sun/food，再阻止 legacy food=energy 覆盖。
  const previousInitPvpSocket = BattleView.prototype.initPvpSocket;
  BattleView.prototype.initPvpSocket = function initPvpSocketWithAuthorityConvergence(...args) {
    const result = previousInitPvpSocket.apply(this, args);
    installPreAuthorityListeners(this);
    return result;
  };

  const previousDestroy = BattleView.prototype.destroy;
  BattleView.prototype.destroy = function destroyAuthorityConvergence(...args) {
    this.__authorityConvergenceSnapshotUnsub20260830?.();
    this.__authorityConvergenceFinishedUnsub20260830?.();
    this.__authorityConvergenceSnapshotUnsub20260830 = null;
    this.__authorityConvergenceFinishedUnsub20260830 = null;
    this.__authorityConvergencePreInstalled20260830 = false;
    return previousDestroy.apply(this, args);
  };
}
