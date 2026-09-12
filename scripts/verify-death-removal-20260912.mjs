// 回归验证：卡牌受到致命攻击死亡后的表现（2026-09-12 用户要求）
//
//   ① 没有死亡动画的卡牌 → 死亡后**直接消除**，不再站着当 2 秒尸体
//   ② 有死亡动画的卡牌   → 播完自己的死亡动画再消失（不受影响）
//   ③ 素材未加载（服务端/未知）→ 保持原来的 2 秒占位（联机死亡时序不受影响）
//   ④ 自爆且没有死亡动画的卡牌 → 不补那 0.45 秒
//   ⑤ 致命伤害跳出的伤害数字只扣到 0（显示剩余血量，不显示溢出值）
//
// 用法： node scripts/verify-death-removal-20260912.mjs
import assert from 'node:assert/strict';
import { BattleEngine } from '../src/battle/BattleEngine.js';
import { BattleUnit } from '../src/battle/BattleUnit.js';
import { unitAnimPlayer } from '../src/battle/UnitAnimPlayer.js';
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
const makeEngine = () => new BattleEngine(db, 1, [], null, { skillLoadout: [], heroMpMax: 100, trainingMode: true, talentBonus: null });

// 用假素材包模拟三种情况（避免测试依赖真实素材/网络）
const RES_NO_DEATH = '90001';   // 只有待机，没有 death
const RES_HAS_DEATH = '90002';  // 有 6 帧 death @12fps = 0.5 秒
const RES_UNKNOWN = '90003';    // 没有加载过 → 无法判断
const RES_LONG_DEATH = '90004'; // 有 24 帧 death @12fps → 2 秒（≥ 数字存活 0.9 秒）
unitAnimPlayer.ready.set(RES_NO_DEATH, { meta: { animations: { idle: { frames: [1, 2], frameRate: 12 } } } });
unitAnimPlayer.ready.set(RES_LONG_DEATH, {
  meta: { animations: { idle: { frames: [1, 2], frameRate: 12 }, death: { frames: Array.from({ length: 24 }, (_, i) => i + 1), frameRate: 12 } } },
});
unitAnimPlayer.ready.set(RES_HAS_DEATH, {
  meta: { animations: { idle: { frames: [1, 2], frameRate: 12 }, death: { frames: [1, 2, 3, 4, 5, 6], frameRate: 12 } } },
});

function makeUnit(engine, { res, uid, hp = 30, team = 'enemy', cardId = 1, lane = 0, col = 0 } = {}) {
  const unit = new BattleUnit({ card: { id: cardId, name: `测试${res}`, atk: 10, hp }, lane, col, team });
  unit.res = Number(res);
  unit.uid = uid;
  engine.units.push(unit);
  return unit;
}

console.log('=== 1. 没有死亡动画 → 死亡后直接消除 ===');
{
  const engine = makeEngine();
  const unit = makeUnit(engine, { res: RES_NO_DEATH, uid: 1 });
  console.log(`   deathAnimState(${RES_NO_DEATH}) = ${unitAnimPlayer.deathAnimState(RES_NO_DEATH)}`);
  unit.takeDamage(500, engine.time);
  engine.onUnitDeath(unit);
  console.log(`   死亡后 _deathUntil - time = ${(unit._deathUntil ?? 0) - engine.time} 秒`);
  engine.tick(0.05);
  check('素材已加载且无 death 帧时被判为"没有死亡动画"', () => {
    assert.equal(unitAnimPlayer.deathAnimState(RES_NO_DEATH), false);
  });
  check('死亡时 _deathUntil = 当前时间（不占位）', () => {
    assert.equal(unit._deathUntil, 0, `_deathUntil=${unit._deathUntil}`);
    assert.equal(unit._noDeathAnim, true);
  });
  check('下一帧就从 engine.units 里消失（不再站着 2 秒）', () => {
    assert.equal(engine.units.some((u) => u.uid === 1), false, `units=${engine.units.map((u) => u.uid)}`);
  });
}

console.log('=== 2. 有死亡动画 → 播完动画再消失 ===');
{
  const engine = makeEngine();
  const unit = makeUnit(engine, { res: RES_HAS_DEATH, uid: 2, lane: 1 });
  unit.takeDamage(500, engine.time);
  engine.onUnitDeath(unit);
  const linger = (unit._deathUntil ?? 0) - engine.time;
  console.log(`   死亡后 _deathUntil - time = ${linger} 秒（death 6 帧 @12fps = 0.5 秒）`);
  check('死亡动画时长未被改动（0.5 秒）', () => {
    assert.ok(Math.abs(linger - 0.5) < 1e-6, `实际 ${linger}`);
  });
  check('动画播放期间单位仍在场上', () => {
    engine.tick(0.05);
    assert.equal(engine.units.some((u) => u.uid === 2), true);
  });
  check('动画放完后单位消失', () => {
    for (let i = 0; i < 15; i += 1) engine.tick(0.05); // 累计 0.8 秒
    assert.equal(engine.units.some((u) => u.uid === 2), false);
  });
}

console.log('=== 3. 素材没加载过 → 保持原来的占位时长（服务端/联机安全）===');
{
  const engine = makeEngine();
  const unit = makeUnit(engine, { res: RES_UNKNOWN, uid: 3, lane: 2 });
  console.log(`   deathAnimState(${RES_UNKNOWN}) = ${unitAnimPlayer.deathAnimState(RES_UNKNOWN)}`);
  unit.takeDamage(500, engine.time);
  engine.onUnitDeath(unit);
  const linger = (unit._deathUntil ?? 0) - engine.time;
  console.log(`   死亡后 _deathUntil - time = ${linger} 秒`);
  check('无法判断时返回 null（不改判定）', () => {
    assert.equal(unitAnimPlayer.deathAnimState(RES_UNKNOWN), null);
  });
  check('保持 2 秒占位（联机服务端发的 deathUntil 逻辑不变）', () => {
    assert.equal(linger, 2, `实际 ${linger}`);
  });
}

console.log('=== 4. 自爆 + 没有死亡动画 → 不补 0.45 秒 ===');
{
  const engine = makeEngine();
  const noAnim = makeUnit(engine, { res: RES_NO_DEATH, uid: 4, cardId: 40, lane: 3 });
  engine.finishSuicideUnit(noAnim);
  const lingerNoAnim = (noAnim._deathUntil ?? 0) - engine.time;
  const engine2 = makeEngine();
  const withAnim = makeUnit(engine2, { res: RES_HAS_DEATH, uid: 5, cardId: 40, lane: 4 });
  engine2.finishSuicideUnit(withAnim);
  const lingerAnim = (withAnim._deathUntil ?? 0) - engine2.time;
  console.log(`   自爆(无动画) 占位 ${lingerNoAnim} 秒；自爆(有动画) 占位 ${lingerAnim} 秒`);
  check('自爆且无死亡动画 → 直接消除', () => {
    assert.equal(lingerNoAnim, 0, `实际 ${lingerNoAnim}`);
  });
  check('自爆但有死亡动画 → 仍然保留动画时长', () => {
    assert.ok(lingerAnim > 0, `实际 ${lingerAnim}`);
  });
}

console.log('=== 5. 致命伤害的伤害数字只扣到 0 ===');
{
  const engine = makeEngine();
  const lethal = makeUnit(engine, { res: RES_NO_DEATH, uid: 6, hp: 30, lane: 0 });
  engine.floats = [];
  engine.skills.hitUnit(lethal, 500);
  const float = engine.floats.at(-1);
  console.log(`   30 血挨 500 → 伤害数字 ${float?.amount}（单位 hp=${lethal.hp}）`);
  check('显示 -30（剩余血量），不显示 -500', () => {
    assert.equal(float?.amount, -30, `实际 ${float?.amount}`);
  });

  const engine2 = makeEngine();
  const normal = makeUnit(engine2, { res: RES_NO_DEATH, uid: 7, hp: 60, lane: 1 });
  engine2.floats = [];
  engine2.skills.hitUnit(normal, 45);
  const float2 = engine2.floats.at(-1);
  console.log(`   60 血挨 45 → 伤害数字 ${float2?.amount}`);
  check('非致命伤害数字不受影响', () => {
    assert.equal(float2?.amount, -45, `实际 ${float2?.amount}`);
  });
}

console.log('=== 6. 血量最低扣到 0（不出现负血量）===');
{
  const engine = makeEngine();
  const unit = makeUnit(engine, { res: RES_NO_DEATH, uid: 8, hp: 30 });
  const dealt = unit.takeDamage(500, engine.time);
  console.log(`   30 血挨 500 → hp=${unit.hp}，takeDamage 返回 ${dealt}，lastDamageDealt=${unit.lastDamageDealt}`);
  check('hp 被夹到 0', () => {
    assert.equal(unit.hp, 0, `hp=${unit.hp}`);
  });
  check('返回值仍是本次伤害（吸血/反射基数不变）', () => {
    assert.equal(dealt, 500, `返回 ${dealt}`);
  });
  check('"实际扣掉的血量"仍是 30（伤害数字用）', () => {
    assert.equal(unit.lastDamageDealt, 30, `lastDamageDealt=${unit.lastDamageDealt}`);
  });
}

console.log('=== 7. 瞬间消除时伤害数字仍要画出来 ===');
{
  // 显示层模块依赖浏览器环境，这里补最小 stub 后动态导入
  globalThis.window = globalThis;
  globalThis.performance = globalThis.performance ?? { now: () => 0 };
  globalThis.Audio = class { play() { return Promise.resolve(); } pause() {} };
  globalThis.Image = class { addEventListener() {} set src(_v) {} };
  globalThis.document = { createElement: () => ({ getContext: () => ({}), addEventListener() {} }) };

  const { BattleRenderer } = await import('../src/battle/BattleRenderer.js');
  const { gameSettings } = await import('../src/core/GameSettingsStore20260910.js');
  await import('../src/ui/BattleDisplayRuntime20260911.js').then((m) => m.installBattleDisplayRuntime20260911());

  gameSettings.set('showDamageNumbers', true);

  const engine = makeEngine();
  const unit = makeUnit(engine, { res: RES_NO_DEATH, uid: 9, hp: 30, lane: 2, col: 5 });
  // 只走 takeDamage + onUnitDeath 的路径（例如反射伤害/吞噬）：没有 engine.floats，
  // 伤害数字完全依赖挂在单位身上的 pop —— 单位一被瞬间消除就会丢。
  unit.takeDamage(500, engine.time);
  engine.onUnitDeath(unit);
  const orphans = engine.__orphanDamagePops20260911 ?? [];
  console.log(`   单位残留 pop=${unit.__damagePops20260911?.length ?? 0}，引擎级队列=${orphans.length}（${orphans.map((p) => p.amount).join(',')}）`);
  check('致命一击的数字被搬到引擎级队列', () => {
    assert.equal(orphans.length, 1, `实际 ${orphans.length}`);
    assert.equal(orphans[0].amount, 30, `实际 ${orphans[0].amount}`);
    assert.equal(orphans[0].lane, 2);
    assert.equal(orphans[0].col, 5);
  });

  // 用一个只记录调用的假 ctx 调真实 drawFloats，确认数字确实会被画出来
  const drawn = [];
  const fakeCtx = {
    font: '', textAlign: '', textBaseline: '', lineWidth: 0, strokeStyle: '', fillStyle: '',
    save() {}, restore() {},
    fillText(text) { drawn.push(String(text)); },
    strokeText(text) { drawn.push(String(text)); },
    drawImage() {},
  };
  const fakeRenderer = {
    battleAtlasImage: null,
    requestBattleAtlas() {},
    _effectSliceStart: () => 0,
    isBaseFloat: () => false,
  };
  BattleRenderer.prototype.drawFloats.call(fakeRenderer, fakeCtx, engine);
  console.log(`   drawFloats 画出的数字：${JSON.stringify(drawn)}`);
  check('已经被消除的单位，数字仍然画在场上', () => {
    assert.ok(drawn.includes('-30'), `实际画出 ${JSON.stringify(drawn)}`);
  });
  // 冻结死亡（尸体窗口只有 0.16 秒）的数字同样不能丢
  const engine2 = makeEngine();
  const frozen = makeUnit(engine2, { res: RES_NO_DEATH, uid: 10, hp: 30, lane: 3, col: 5 });
  frozen.frozenUntil = 99;
  frozen.takeDamage(500, engine2.time);
  engine2.onUnitDeath(frozen);
  const orphans2 = engine2.__orphanDamagePops20260911 ?? [];
  console.log(`   冻结死亡：尸体窗口 ${Number((frozen._deathUntil - engine2.time).toFixed(2))} 秒，引擎级队列=${orphans2.length}`);
  check('冻结死亡（0.16 秒窗口）的数字也搬到引擎级队列', () => {
    assert.equal(orphans2.length, 1, `实际 ${orphans2.length}`);
    assert.equal(orphans2[0].amount, 30);
  });

  // 有死亡动画、窗口够长（2 秒）的单位：不搬，仍按单位绘制（避免出现两份数字）
  const engine3 = makeEngine();
  const shortAnim = makeUnit(engine3, { res: RES_HAS_DEATH, uid: 11, hp: 30, lane: 4, col: 5 });
  shortAnim.takeDamage(500, engine3.time);
  engine3.onUnitDeath(shortAnim);
  const orphans3 = engine3.__orphanDamagePops20260911 ?? [];
  console.log(`   死亡动画只有 0.5 秒（< 数字 0.9 秒）：引擎级队列=${orphans3.length}`);
  check('窗口短于数字存活时长 → 也要搬（否则数字只能显示一半就没了）', () => {
    assert.equal(orphans3.length, 1, `实际 ${orphans3.length}`);
  });

  const engine4 = makeEngine();
  const animated = makeUnit(engine4, { res: RES_LONG_DEATH, uid: 12, hp: 30, lane: 6, col: 5 });
  animated.takeDamage(500, engine4.time);
  engine4.onUnitDeath(animated);
  console.log(`   死亡动画 2 秒（≥ 数字 0.9 秒）：窗口 ${Number((animated._deathUntil - engine4.time).toFixed(2))} 秒，引擎级队列=${(engine4.__orphanDamagePops20260911 ?? []).length}`);
  check('窗口足够长时不搬（数字不会重复画两份）', () => {
    assert.equal((engine4.__orphanDamagePops20260911 ?? []).length, 0);
    assert.equal(animated.__damagePops20260911?.length, 1, '数字应仍挂在单位身上');
  });

  check('单位确实已经从 units 里消失', () => {
    engine.tick(0.05);
    assert.equal(engine.units.some((u) => u.uid === 9), false);
  });
}

console.log('=== 8. 死亡必有"结算数字"（不产飘字的死法也要有）===');
{
  // 反射/吞噬这类路径：直接 takeDamage + onUnitDeath，从来不产飘字
  const engine = makeEngine();
  const victim = makeUnit(engine, { res: RES_NO_DEATH, uid: 20, hp: 12.5, lane: 1, col: 4 });
  engine.floats = [];
  victim.takeDamage(99, engine.time);
  engine.onUnitDeath(victim);
  const floats = engine.floats.map((f) => Number(f.amount));
  console.log(`   不产飘字的死法：死亡后飘字 ${JSON.stringify(floats)}`);
  check('死亡时补出结算数字（= 实际扣掉的 12.5）', () => {
    assert.deepEqual(floats, [-12.5]);
  });

  // 正常击杀（同一帧已经飘过）→ 不能重复
  const engine2 = makeEngine();
  const victim2 = makeUnit(engine2, { res: RES_NO_DEATH, uid: 21, hp: 30, lane: 1, col: 4 });
  engine2.floats = [];
  engine2.applyCardHit(makeUnit(engine2, { res: 1, uid: 22, hp: 100, atk: 0 }, 'player', 1, 5), victim2, 30, { ranged: true });
  const afterHit = engine2.floats.map((f) => Number(f.amount));
  engine2.onUnitDeath(victim2);
  const afterDeath = engine2.floats.map((f) => Number(f.amount));
  console.log(`   已有飘字的击杀：命中后 ${JSON.stringify(afterHit)} → 死亡后 ${JSON.stringify(afterDeath)}`);
  check('已经飘过数字的死亡不重复飘（只有一个 -30）', () => {
    assert.deepEqual(afterDeath, afterHit, '死亡不应再加一个数字');
    assert.deepEqual(afterDeath, [-30]);
  });
}

console.log(failures.length ? `\n${failures.length} 项未通过` : '\n全部通过');
process.exit(failures.length ? 1 : 0);
