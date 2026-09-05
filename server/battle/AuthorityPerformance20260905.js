import { PvpBattle } from './PvpBattle.js';
import { CoopBossBattle } from './CoopBossBattle.js';

const PATCH_FLAG = Symbol.for('clbwz.authorityPerformance20260905');
const AUTHORITY_SIM_STEP = 1 / 30;
const MAX_PRESENTATION_DOT_KINDS = 6;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function compactPresentationDots(dots, now) {
  if (!Array.isArray(dots) || dots.length <= MAX_PRESENTATION_DOT_KINDS) return dots ?? [];
  const byKind = new Map();
  for (const dot of dots) {
    if (finite(dot?.until) <= now) continue;
    const kind = String(dot?.kind ?? 'dot');
    const previous = byKind.get(kind);
    if (!previous) {
      byKind.set(kind, { ...dot });
      continue;
    }
    // 客户端权威模式只用 dots 做状态表现，不用它本地结算伤害。
    // 合并同类状态可显著缩小多人/多目标快照，不影响服务端真实 DOT 队列。
    previous.until = Math.max(finite(previous.until), finite(dot.until));
    previous.dps = Math.max(finite(previous.dps), finite(dot.dps));
    previous.every = Math.min(
      Math.max(0.05, finite(previous.every, 1)),
      Math.max(0.05, finite(dot.every, 1)),
    );
  }
  return [...byKind.values()].slice(0, MAX_PRESENTATION_DOT_KINDS);
}

function markSnapshotDirty(battle) {
  battle.__authorityPerfRevision20260905 = (battle.__authorityPerfRevision20260905 ?? 0) + 1;
  battle.__authorityPerfSnapshot20260905 = null;
}

function patchBattleClass(BattleClass) {
  const proto = BattleClass?.prototype;
  if (!proto || proto.__authorityPerfPatched20260905) return;
  proto.__authorityPerfPatched20260905 = true;

  const previousTick = proto.tick;
  if (typeof previousTick === 'function') {
    proto.tick = function tickAt30Hz20260905(dt) {
      this.__authorityPerfAccum20260905 = finite(this.__authorityPerfAccum20260905) + Math.max(0, finite(dt));
      if (this.__authorityPerfAccum20260905 + 1e-9 < AUTHORITY_SIM_STEP) return;
      const runDt = Math.min(0.1, this.__authorityPerfAccum20260905);
      this.__authorityPerfAccum20260905 = 0;
      const result = previousTick.call(this, runDt);
      markSnapshotDirty(this);
      return result;
    };
  }

  const previousPublicUnit = proto.publicUnit;
  if (typeof previousPublicUnit === 'function') {
    proto.publicUnit = function publicUnitCached20260905(unit) {
      const now = finite(this.engine?.time);
      if (unit?.__authorityPublicUnitTime20260905 === now && unit.__authorityPublicUnitCache20260905) {
        return unit.__authorityPublicUnitCache20260905;
      }
      const result = previousPublicUnit.call(this, unit);
      if (result && Array.isArray(result.dots)) {
        result.dots = compactPresentationDots(result.dots, now);
      }
      if (unit) {
        unit.__authorityPublicUnitTime20260905 = now;
        unit.__authorityPublicUnitCache20260905 = result;
      }
      return result;
    };
  }

  const previousSnapshot = proto.snapshot;
  if (typeof previousSnapshot === 'function') {
    proto.snapshot = function snapshotCached20260905() {
      const time = finite(this.engine?.time);
      const revision = finite(this.__authorityPerfRevision20260905);
      const cached = this.__authorityPerfSnapshot20260905;
      if (cached && cached.time === time && cached.revision === revision) return cached.value;
      const value = previousSnapshot.call(this);
      this.__authorityPerfSnapshot20260905 = { time, revision, value };
      return value;
    };
  }

  for (const methodName of [
    'deploy',
    'castSkill',
    'setSkillLoadout',
    'refundBurrowReturn',
  ]) {
    const previous = proto[methodName];
    if (typeof previous !== 'function') continue;
    proto[methodName] = function markMutation20260905(...args) {
      const result = previous.apply(this, args);
      markSnapshotDirty(this);
      return result;
    };
  }
}

export function installAuthorityPerformance20260905() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;
  patchBattleClass(PvpBattle);
  patchBattleClass(CoopBossBattle);
}

export const AUTHORITY_PERFORMANCE_20260905 = Object.freeze({
  simulationHz: 30,
  maxPresentationDotKinds: MAX_PRESENTATION_DOT_KINDS,
});
