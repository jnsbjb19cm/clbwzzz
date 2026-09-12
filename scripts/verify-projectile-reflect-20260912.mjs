// 回归验证：子弹被反弹时必须真的生成一颗反向直线子弹（2026-09-12 用户要求）
//
//  卡牌 27 战盔巨头怪：projectileReflectChance 0.35 / reflectRatio 1 → 远程子弹会被弹回去
//  卡牌 21 巨盾核桃卫兵 / 87 荆棘战士：meleeReflectChance → 近战反射仍是即时伤害（不产子弹）
//
// 用法： node scripts/verify-projectile-reflect-20260912.mjs
import assert from 'node:assert/strict';
import { BattleEngine } from '../src/battle/BattleEngine.js';
import { BattleUnit } from '../src/battle/BattleUnit.js';
import { installBattleRuleConvergence20260830 } from '../src/battle/BattleRuleConvergence20260830.js';
import { installBattleUserRules20260903 } from '../src/battle/BattleUserRules20260903.js';

installBattleRuleConvergence20260830();
installBattleUserRules20260903();

const failures = [];
function check(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.log(`  FAIL ${name}\n       ${String(error.message).split('\n')[0]}`);
  }
}

const db = { stages: [{ stage_id: 1, hp: 1000 }], getById: () => null };
const makeEngine = () => new BattleEngine(db, 1, [], null, { trainingMode: true, talentBonus: null });

function makeUnit(engine, cardId, team, lane, col, { hp = 500, atk = 0 } = {}) {
  const unit = new BattleUnit({
    card: { id: cardId, name: `卡${cardId}`, atk, hp, res: cardId, spriteRes: String(cardId) },
    lane,
    col,
    team,
  });
  unit.uid = ++engine.__verifyUid;
  engine.units.push(unit);
  return unit;
}
function withAlwaysReflect(fn) {
  const original = Math.random;
  Math.random = () => 0; // 让 35% 的反射必定触发
  try { return fn(); } finally { Math.random = original; }
}

console.log('=== 1. 远程子弹被反弹 → 真的生成一颗反向直线子弹 ===');
{
  const engine = makeEngine();
  engine.__verifyUid = 0;
  const shooter = makeUnit(engine, 1, 'player', 2, 8);
  const reflector = makeUnit(engine, 27, 'enemy', 2, 9);
  const shooterHpBefore = shooter.hp;

  engine.fireProjectile(shooter, reflector, 10, { trajectory: 'straight', targetUid: reflector.uid });
  const bullet = engine.projectiles.at(-1);
  bullet.launched = true;
  const bulletCountBefore = engine.projectiles.length;

  withAlwaysReflect(() => engine.resolveProjectileImpact(bullet, reflector));

  const bounced = engine.projectiles.at(-1);
  console.log(`   原子弹 owner=${bullet.owner} → 反弹子弹 owner=${bounced?.owner} trajectory=${bounced?.trajectory} `
    + `startCol=${bounced?.startCol} hitCol=${bounced?.hitCol} damage=${bounced?.damage} reflected=${bounced?.reflected}`);
  check('确实多出了一颗子弹（是真的弹回去，不是只扣血）', () => {
    assert.equal(engine.projectiles.length, bulletCountBefore + 1, '应新增一颗反弹子弹');
    assert.notEqual(bounced, bullet, '反弹子弹应是新对象');
  });
  check('反弹子弹归属防守方阵营 + 直线弹道', () => {
    assert.equal(bounced.owner, 'enemy');
    assert.equal(bounced.trajectory, 'straight');
  });
  check('反弹子弹朝攻击者飞（hitCol 在反方向）', () => {
    assert.equal(bounced.targetUid, shooter.uid, `targetUid=${bounced.targetUid}`);
    assert.ok(bounced.hitCol < bounced.startCol, `startCol=${bounced.startCol} hitCol=${bounced.hitCol}`);
  });
  check('反弹伤害 = 实际扣血 × reflectRatio(1)', () => {
    assert.equal(bounced.damage, 10, `damage=${bounced.damage}`);
  });
  check('反弹时不再立刻扣攻击者血（伤害由弹回的子弹结算）', () => {
    assert.equal(shooter.hp, shooterHpBefore, `hp=${shooter.hp}`);
  });
  check('标记 reflected=true（供防乒乓判断）', () => {
    assert.equal(bounced.reflected, true);
  });

  // 弹回的子弹命中攻击者 → 伤害在此刻结算
  bounced.launched = true;
  const countBeforeImpact = engine.projectiles.length;
  withAlwaysReflect(() => engine.resolveProjectileImpact(bounced, shooter));
  console.log(`   弹回的子弹命中攻击者：hp ${shooterHpBefore} → ${shooter.hp}；子弹数 ${countBeforeImpact} → ${engine.projectiles.length}`);
  check('弹回的子弹命中后攻击者真的掉血', () => {
    assert.equal(shooterHpBefore - shooter.hp, 10, `实际扣 ${shooterHpBefore - shooter.hp}`);
  });
  check('攻击者收到的是"反弹回来的子弹"，不会再弹一次（防乒乓）', () => {
    assert.equal(engine.projectiles.length, countBeforeImpact, '不应再生成第二颗反弹子弹');
  });
}

console.log('=== 2. 近战反射仍然是即时伤害（不产子弹）===');
{
  const engine = makeEngine();
  engine.__verifyUid = 0;
  const attacker = makeUnit(engine, 1, 'player', 2, 8);
  const reflectMelee = makeUnit(engine, 87, 'enemy', 2, 9);
  const hpBefore = attacker.hp;
  const bulletCountBefore = engine.projectiles.length;
  withAlwaysReflect(() => engine.applyCardHit(attacker, reflectMelee, 10, { ranged: false }));
  console.log(`   近战打荆棘战士：攻击者 hp ${hpBefore} → ${attacker.hp}；子弹数 ${bulletCountBefore} → ${engine.projectiles.length}`);
  check('近战反射立刻扣攻击者血（0.5 倍 → 5）', () => {
    assert.equal(hpBefore - attacker.hp, 5, `实际扣 ${hpBefore - attacker.hp}`);
  });
  check('近战反射不生成子弹', () => {
    assert.equal(engine.projectiles.length, bulletCountBefore);
  });
}

console.log('=== 3. 反弹子弹沿用被打回子弹的形状（sourcePattern）===');
{
  const engine = makeEngine();
  engine.__verifyUid = 0;
  const attacker = makeUnit(engine, 1, 'player', 2, 8);
  const reflector = makeUnit(engine, 27, 'enemy', 2, 9);
  withAlwaysReflect(() => engine.applyCardHit(attacker, reflector, 10, {
    ranged: true,
    sourcePattern: { kind: 'row_splash', radius: 1 },
  }));
  const bounced = engine.projectiles.at(-1);
  console.log(`   反弹子弹 attackPattern = ${JSON.stringify(bounced?.attackPattern)}`);
  check('溅射子弹弹回去仍是溅射（形状沿用）', () => {
    assert.equal(bounced?.attackPattern?.kind, 'row_splash');
  });

  const engine2 = makeEngine();
  engine2.__verifyUid = 0;
  const attacker2 = makeUnit(engine2, 1, 'player', 2, 8);
  const reflector2 = makeUnit(engine2, 27, 'enemy', 2, 9);
  withAlwaysReflect(() => engine2.applyCardHit(attacker2, reflector2, 10, { ranged: true }));
  const plain = engine2.projectiles.at(-1);
  console.log(`   普通子弹反弹后 attackPattern = ${JSON.stringify(plain?.attackPattern)}`);
  check('原本没有形状的子弹，弹回去是单目标直线', () => {
    assert.equal(plain?.attackPattern, null);
  });
}

console.log('=== 4. 反射倍率：21 巨盾核桃卫兵 0.5 倍 ===');
{
  const engine = makeEngine();
  engine.__verifyUid = 0;
  const shooter = makeUnit(engine, 1, 'player', 2, 8);
  const shield = makeUnit(engine, 21, 'enemy', 2, 9);
  engine.fireProjectile(shooter, shield, 20, { trajectory: 'straight', targetUid: shield.uid });
  const bullet = engine.projectiles.at(-1);
  bullet.launched = true;
  withAlwaysReflect(() => engine.resolveProjectileImpact(bullet, shield));
  const bounced = engine.projectiles.at(-1);
  console.log(`   20 点子弹被巨盾弹回：反弹伤害 = ${bounced?.damage}`);
  check('反弹伤害 = 20 × 0.5 = 10', () => {
    assert.equal(bounced?.damage, 10, `实际 ${bounced?.damage}`);
  });
}

console.log('=== 5. 反弹子弹靠引擎 tick 真的飞回去并命中攻击者 ===');
{
  const engine = makeEngine();
  engine.__verifyUid = 0;
  const shooter = makeUnit(engine, 1, 'player', 2, 8);
  const reflector = makeUnit(engine, 27, 'enemy', 2, 9);
  const hpBefore = shooter.hp;
  engine.fireProjectile(shooter, reflector, 10, { trajectory: 'straight', targetUid: reflector.uid });
  const bullet = engine.projectiles.at(-1);
  bullet.launched = true;
  withAlwaysReflect(() => engine.resolveProjectileImpact(bullet, reflector));
  const bounced = engine.projectiles.at(-1);
  const startCol = bounced.startCol;
  let frames = 0;
  for (; frames < 120 && shooter.hp >= hpBefore; frames += 1) engine.tick(0.05);
  console.log(`   反弹子弹从 col ${startCol} 飞回攻击者（col ${shooter.col}），${frames} 帧后命中：hp ${hpBefore} → ${shooter.hp}`);
  check('反弹子弹靠飞行命中攻击者（不是瞬间结算）', () => {
    assert.ok(frames > 0, '不应该在创建的那一帧就命中');
    assert.equal(hpBefore - shooter.hp, 10, `实际扣 ${hpBefore - shooter.hp}`);
  });
  check('命中后子弹被回收', () => {
    assert.equal(engine.projectiles.filter((p) => p === bounced).length, 0);
  });
}

console.log(failures.length ? `\n${failures.length} 项未通过` : '\n全部通过');
process.exit(failures.length ? 1 : 0);
