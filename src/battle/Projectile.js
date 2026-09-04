import {
  AIR,
  GROUND,
  getUnitAttackLayerMask,
  projectileCanHitTargetLayer,
} from './CombatLayerRules.js';

let pid = 0;

/** 子弹平面飞行速度（格/秒） */
export const PROJECTILE_SPEED = 6;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, finite(value)));
}

/**
 * 高抛弹道高度在“发射时”确定，之后即使目标移动也不重新计算。
 * 这样不会出现追踪目标时弧线突然塌陷/抬升；中程投掷至少抬高约 2.2 个格高。
 */
export function getProjectileArcHeight(startCol, hitCol) {
  const start = Number(startCol);
  const end = Number(hitCol);
  const distance = Number.isFinite(start) && Number.isFinite(end)
    ? Math.abs(end - start)
    : 0;
  return Math.min(4.2, Math.max(2.2, 1.72 + distance * 0.18));
}

/**
 * 普通直线弹 / 抛物线弹采用“发射后自主飞行”的模型：
 *
 * - start/end 在构造时锁定；外部后来改 hitCol/hitLane 不会重建已经飞出的轨迹；
 * - straight：固定平面速度积分；
 * - parabola：固定平面速度 + 独立 z 初速度/重力，逐 dt 积分出真正二次抛物线；
 * - 只有明确的 homing 类弹道以后才应该拥有追踪逻辑，不能让所有远程弹默认追踪。
 *
 * 这个状态划分对应经典 PvZ 实现中“普通运动 / lobbed / homing 分开处理”的思路，
 * 但这里使用项目自己的连续 dt 和格坐标实现。
 */
export class Projectile {
  constructor({
    owner, lane, startCol, hitLane, hitCol, damage,
    trajectory = 'straight', color, targetUid = null, targetBase = null,
    sourceUid, sourceRes = null, icon = '●', resolveCol = null, delay = 0,
    attackPattern = null, attackerCol = 0, attackerLane = 0, visualOnly = false,
    pierce = false, targetLayerMask = null, source = null,
  }) {
    this.id = ++pid;
    this.owner = owner;
    this.lane = lane;
    this.startCol = startCol;
    this.sourceCol = startCol;
    this.sourceLane = lane;
    this.hitLane = hitLane;
    this.hitCol = hitCol;
    this.resolveCol = resolveCol ?? hitCol;
    this.damage = damage;
    this.trajectory = trajectory;
    this.color = color ?? (owner === 'player' ? '#4ade80' : '#f87171');
    this.targetUid = targetUid;
    this.targetBase = targetBase;
    this.sourceUid = sourceUid;
    this.sourceRes = sourceRes;
    this.icon = icon;
    this.delay = Math.max(0, Number(delay) || 0);
    this.launched = this.delay <= 0;
    this.progress = 0;
    this.flightT = 0;
    this.done = false;
    this.x = startCol;
    this.y = lane;
    this.arcOffset = 0;
    this.attackPattern = attackPattern;
    this.attackerCol = attackerCol;
    this.attackerLane = attackerLane;
    this.visualOnly = visualOnly;
    this.pierce = pierce;
    this.targetLayerMask = Number(targetLayerMask == null
      ? (source ? getUnitAttackLayerMask(source) : trajectory === 'parabola' ? GROUND | AIR : GROUND)
      : targetLayerMask) & (GROUND | AIR);
    this.collidedUnit = null;
    this._travelledDistance = 0;

    // ── immutable launch solution ──
    this.flightStartCol = finite(startCol);
    this.flightStartLane = finite(lane);
    this.flightEndCol = finite(hitCol, this.flightStartCol);
    this.flightEndLane = finite(hitLane, this.flightStartLane);
    const dx = this.flightEndCol - this.flightStartCol;
    const dy = this.flightEndLane - this.flightStartLane;
    this._flightDistance = Math.hypot(dx, dy);
    this._flightDuration = this._flightDistance > 1e-6
      ? this._flightDistance / PROJECTILE_SPEED
      : 0;
    this._flightElapsed = 0;
    this._flightVx = this._flightDuration > 0 ? dx / this._flightDuration : 0;
    this._flightVy = this._flightDuration > 0 ? dy / this._flightDuration : 0;

    this._arcHeight = trajectory === 'parabola'
      ? getProjectileArcHeight(this.flightStartCol, this.flightEndCol)
      : 0;
    this._arcVelocity = trajectory === 'parabola' && this._flightDuration > 0
      ? (4 * this._arcHeight) / this._flightDuration
      : 0;
    this._arcAcceleration = trajectory === 'parabola' && this._flightDuration > 0
      ? (-8 * this._arcHeight) / (this._flightDuration * this._flightDuration)
      : 0;
  }

  update(dt) {
    if (this.done) return;
    let travelDt = Math.max(0, finite(dt));

    if (this.delay > 0) {
      if (travelDt <= this.delay) {
        this.delay -= travelDt;
        return;
      }
      travelDt -= this.delay;
      this.delay = 0;
      this.launched = true;
    }

    if (!this.launched) this.launched = true;

    // flightT 是子弹素材 yidong 动画的独立播放时钟；延迟阶段不走，真正离膛后才推进。
    // 物理路线改为 launch-owned 后仍必须保留这个时间轴，否则位置正确但子弹贴图会停帧。
    this.flightT += travelDt;

    if (!(this._flightDuration > 1e-6)) {
      this.x = this.flightEndCol;
      this.y = this.flightEndLane;
      this.progress = 1;
      this.arcOffset = 0;
      this.done = true;
      return;
    }

    this._flightElapsed = Math.min(
      this._flightDuration,
      this._flightElapsed + travelDt,
    );
    const t = this._flightElapsed;
    const progress = clamp01(t / this._flightDuration);

    // 平面位置只由发射时解出的速度决定，绝不再读取可变 hitCol/hitLane。
    this.x = this.flightStartCol + this._flightVx * t;
    this.y = this.flightStartLane + this._flightVy * t;
    this.progress = progress;
    this._travelledDistance = this._flightDistance * progress;

    if (this.trajectory === 'parabola') {
      // z(t)=v0*t+1/2*a*t²；v0=4h/T，a=-8h/T²，顶点恰好在 T/2、高度 h。
      this.arcOffset = Math.max(
        0,
        this._arcVelocity * t + 0.5 * this._arcAcceleration * t * t,
      );
    } else {
      this.arcOffset = 0;
    }

    if (progress >= 1 - 1e-9) {
      this.x = this.flightEndCol;
      this.y = this.flightEndLane;
      this.progress = 1;
      this.arcOffset = 0;
      this.done = true;
    }
  }
}

/* ── splash helper ── */
function isProjectileTarget(proj, unit, engine) {
  if (typeof engine?.isProjectileCollisionTarget === 'function') {
    return engine.isProjectileCollisionTarget(proj, unit);
  }
  return Boolean(unit?.alive)
    && unit.team !== proj.owner
    && !unit.isLowTarget?.()
    && !unit.isTunnelProtected?.()
    && !(proj.trajectory === 'parabola' && unit.pvpNeutral === true)
    && projectileCanHitTargetLayer(proj, unit);
}

function splashVictims(proj, primary, engine) {
  const p = proj.attackPattern;
  const dir = proj.owner === 'player' ? 1 : -1;
  const ctr = Math.round(primary.col);
  const selfC = Math.round(proj.attackerCol);
  const selfL = proj.attackerLane;
  const es = engine.units.filter(u => isProjectileTarget(proj, u, engine));
  const check = (u) => {
    const c = Math.round(u.col);
    const dl = Math.abs(u.lane - primary.lane);
    const dc = Math.abs(c - ctr);
    const ah = dir * (c - selfC);
    switch (p.kind) {
      case 'forward':     return u.lane === selfL && ah >= -0.15 && ah <= p.cells + 0.5;
      case 'row_splash':  return u.lane === primary.lane && dc <= p.radius;
      case 'col_splash':  return Math.abs(u.lane - primary.lane) <= p.radius && Math.abs(c - ctr) <= 0.5;
      case 'square':      return dl <= p.radius && dc <= p.radius;
      case 'square_self': return Math.abs(u.lane - selfL) <= p.radius && Math.abs(c - selfC) <= p.radius;
      case 'x':           return dl === dc && dl <= p.radius;
      case 'cross':       return (dl === 0 || dc === 0) && Math.max(dl, dc) <= p.radius;
      case 'rect':        return dl <= p.laneRadius && dir*(c-ctr) >= -p.colBack && dir*(c-ctr) <= p.colForward;
      default:            return u.uid === primary.uid;
    }
  };
  const v = es.filter(check);
  if (primary.alive && !v.some(u => u.uid === primary.uid)) v.unshift(primary);
  return v;
}

export function resolveProjectileHit(proj, engine, collisionTarget = null) {
  if (proj.visualOnly) return;
  if (proj.targetBase) {
    const dmg = engine.damageBase(proj.targetBase, proj.damage);
    const floatCol = proj.resolveCol ?? proj.hitCol;
    engine.spawnImpactFx?.(proj.hitLane, floatCol, proj.damage, proj.sourceRes);
    if (dmg > 0) engine.spawnFloat(proj.hitLane, floatCol, -dmg);
    return;
  }

  let primary = [proj.collidedUnit, collisionTarget].find(
    (unit) => isProjectileTarget(proj, unit, engine),
  ) ?? engine.units.find(u =>
    u.uid === proj.targetUid
    && isProjectileTarget(proj, u, engine));
  if (!primary) {
    const dl = Math.round(proj.hitLane), dc = Math.round(proj.resolveCol ?? proj.hitCol);
    const v = engine.getUnitsAt(dl, dc).filter(u => isProjectileTarget(proj, u, engine));
    if (v.length) primary = v[0];
  }

  // 正式战斗统一交给 BattleEngine 结算。impact 也由该入口统一创建，
  // 避免这里先 spawn 一次、resolveProjectileImpact 内又 spawn 一次造成重复特效和额外绘制。
  if (primary && typeof engine.resolveProjectileImpact === 'function') {
    engine.resolveProjectileImpact(proj, primary);
    return;
  }

  // 无 BattleEngine 的兼容回退。
  if (primary && proj.attackPattern && proj.attackPattern.kind !== 'all') {
    engine.spawnImpactFx?.(primary.lane, primary.col, proj.damage, proj.sourceRes);
    for (const vic of splashVictims(proj, primary, engine)) {
      if (!vic.alive) continue;
      const a = vic.takeDamage(proj.damage, engine.time);
      if (a > 0) engine.spawnFloat(vic.lane, vic.col, -a);
      if (!vic.alive) engine.onUnitDeath(vic);
    }
    return;
  }

  if (primary) {
    engine.spawnImpactFx?.(primary.lane, primary.col, proj.damage, proj.sourceRes);
    const a = primary.takeDamage(proj.damage, engine.time);
    if (a > 0) engine.spawnFloat(primary.lane, primary.col, -a);
    if (!primary.alive) engine.onUnitDeath(primary);
    return;
  }

  const dc = Math.round(proj.resolveCol ?? proj.hitCol);
  const dl = Math.round(proj.hitLane);
  if (proj.owner === 'player' && dc >= 11) {
    const floatCol = proj.resolveCol ?? proj.hitCol;
    engine.spawnImpactFx?.(dl, floatCol, proj.damage, proj.sourceRes);
    const d = engine.damageBase('enemy', proj.damage);
    if (d > 0) engine.spawnFloat(dl, floatCol, -d);
  } else if (proj.owner === 'enemy' && dc <= 0) {
    const floatCol = proj.resolveCol ?? proj.hitCol;
    engine.spawnImpactFx?.(dl, floatCol, proj.damage, proj.sourceRes);
    const d = engine.damageBase('player', proj.damage);
    if (d > 0) engine.spawnFloat(dl, floatCol, -d);
  }
}
