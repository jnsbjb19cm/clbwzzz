// 回归验证：2026-09-12 用户报告的一批战斗行为
//
//   ① 致命诅咒(539)：每秒 4 点（原 8）
//   ② 圣盾术(518)：持续 10 秒（原 5）
//   ③ 怪物吸尘器(34)：吸入=秒杀（立刻退场）+ 消化期 10 秒内不能攻击/再吞
//   ④ 外星哨兵(38)：吸走目标但**不冰冻**
//   ⑤ 热血火龙果(65)：走到接触敌方地面单位即自爆（不能停在 1 格外）
//   ⑥ 黑铁土豆雷(61)：不能被近战锁定（否则近战停在它前面、永远触发不了爆炸）
//   ⑦ 自爆 BOOM：40/61/65 自爆时 impactFx 带 boomRes（借用带 baoza 的子弹包）
//
// 用法： node scripts/verify-battle-fixes-20260912.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BattleEngine } from '../src/battle/BattleEngine.js';
import { BattleUnit } from '../src/battle/BattleUnit.js';
import { SKILL_EFFECTS } from '../src/core/SkillRegistry.js';
import { installBattleRuleConvergence20260830 } from '../src/battle/BattleRuleConvergence20260830.js';
import { installBattleUserRules20260903 } from '../src/battle/BattleUserRules20260903.js';

// node 环境桩：引擎会碰音频/画布相关 API
globalThis.Audio = class {
  constructor() {}
  play() { return Promise.resolve(); }
  pause() {}
  load() {}
  addEventListener() {}
  removeEventListener() {}
  cloneNode() { return new globalThis.Audio(); }
};
function makeCtx() {
  return {
    canvas: { width: 100, height: 100 },
    measureText: () => ({ width: 10 }),
    save() {}, restore() {}, beginPath() {}, closePath() {}, arc() {}, moveTo() {}, lineTo() {},
    fill() {}, stroke() {}, fillRect() {}, strokeRect() {}, clearRect() {}, drawImage() {},
    translate() {}, scale() {}, rotate() {}, setTransform() {}, clip() {},
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
    fillText() {}, strokeText() {}, setLineDash() {},
  };
}
function makeEl() {
  return {
    style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    children: [], firstChild: null, parentNode: null, width: 100, height: 100, textContent: '',
    getContext: () => makeCtx(), appendChild() {}, removeChild() {}, remove() {}, insertBefore() {},
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute: () => null,
    querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ width: 100, height: 100, left: 0, top: 0 }),
    cloneNode: () => makeEl(), play: () => Promise.resolve(), pause() {}, load() {},
  };
}
globalThis.document = {
  createElement: () => makeEl(), getElementById: () => null, querySelector: () => null,
  querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
  body: makeEl(), documentElement: makeEl(),
};
globalThis.window = globalThis.window ?? { addEventListener() {}, removeEventListener() {}, location: { href: '' } };
globalThis.performance = globalThis.performance ?? { now: () => Date.now() };
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame ?? ((cb) => setTimeout(() => cb(Date.now()), 16));
globalThis.cancelAnimationFrame = globalThis.cancelAnimationFrame ?? ((id) => clearTimeout(id));

installBattleRuleConvergence20260830();
installBattleUserRules20260903();

const RAW = JSON.parse(fs.readFileSync(new URL('../src/data/card.json', import.meta.url), 'utf8'));
const rawById = new Map(RAW.map((c) => [Number(c.card_id), c]));

function toCard(id) {
  const raw = rawById.get(Number(id));
  if (!raw) throw new Error(`卡 ${id} 不存在`);
  return {
    id: raw.card_id,
    name: raw.card_name,
    spriteRes: String(raw.res),
    atkStyle: raw.atk_style,
    viewType: raw.card_view_type,
    moveSpeed: raw.move_speed,
    atkSpeed: raw.atk_speed,
    type: raw.card_type,
    quality: raw.card_quality,
    atk_rate: raw.atk_rate,
    special_atk_effect: raw.special_atk_effect,
    effectSelf: raw.effectSelf,
    effectScope: raw.effectScope,
    card_atk: raw.card_atk,
    card_hp: raw.card_hp,
  };
}

const db = { stages: [{ stage_id: 1, hp: 100000 }], getById: (id) => toCard(id) };
const makeEngine = () => new BattleEngine(db, 1, [], null, {
  skillLoadout: [], heroMpMax: 100, trainingMode: true, talentBonus: null,
});

function spawn(engine, { id, team, lane = 0, col = 0, quality = 1, hp = null }) {
  const card = toCard(id);
  const unit = new BattleUnit({ card, lane, col, team, instance: { craftQuality: quality } });
  unit.res = String(card.spriteRes);
  if (hp != null) { unit.maxHp = hp; unit.baseMaxHp = hp; unit.hp = hp; }
  engine.units.push(unit);
  return unit;
}

const failures = [];
function check(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); } catch (error) {
    failures.push(name);
    console.log(`  FAIL ${name}\n       ${String(error.message).split('\n')[0]}`);
  }
}
const tick = (engine, seconds, dt = 0.05) => {
  for (let t = 0; t < seconds; t += dt) engine.tick(dt);
};

console.log('=== ① 致命诅咒数值 ===');
check('539 dps = 4（削弱后）', () => assert.equal(SKILL_EFFECTS[539].dps, 4));
check('539 仍持续 10 秒 + 中毒易伤 3', () => {
  assert.equal(SKILL_EFFECTS[539].duration, 10);
  assert.equal(SKILL_EFFECTS[539].vulnerability, 3);
});

console.log('=== ② 圣盾术时长 ===');
check('518 持续时间 = 10 秒', () => {
  assert.equal(SKILL_EFFECTS[518].duration, 10);
  assert.equal(SKILL_EFFECTS[518].debuffImmune, true);
});

console.log('=== ③ 怪物吸尘器(34)：3 秒放置 CD + 秒杀 + 25 秒膨胀消化 ===');
check('放下后 3 秒才可以吸入（放置 CD）', () => {
  const engine = makeEngine();
  const vacuum = spawn(engine, { id: 34, team: 'player', lane: 2, col: 6 });
  const victim = spawn(engine, { id: 1, team: 'enemy', lane: 2, col: 6, quality: 1, hp: 5000 });
  tick(engine, 2.5);
  assert.equal(victim.alive, true, '放下 2.5 秒内不应被吸入');
  assert.equal(engine.isDigestingSwallow(vacuum), false, '此时还没进入消化');
  tick(engine, 1.2);                                   // 跨过 3 秒
  assert.equal(victim.alive, false, '3 秒后应把靠近的目标吸入（秒杀）');
  assert.equal(engine.isDigestingSwallow(vacuum), true, '吸入后应进入消化期');
});
check('吸入即秒杀，且进入 25 秒消化期', () => {
  const engine = makeEngine();
  const vacuum = spawn(engine, { id: 34, team: 'player', lane: 2, col: 6 });
  const victim = spawn(engine, { id: 1, team: 'enemy', lane: 2, col: 6, quality: 1, hp: 5000 });
  tick(engine, 4);
  assert.equal(victim.alive, false, '被吞的单位应立刻死亡（秒杀）');
  assert.equal(engine.isDigestingSwallow(vacuum), true, '应进入消化期');
  const digestLeft = Number(vacuum._digestingUntil) - engine.time;
  assert.ok(digestLeft > 21 && digestLeft <= 25.05, `消化期应为 25 秒，实际剩余 ${digestLeft.toFixed(2)}`);
});
check('消化中保持"膨胀"姿态（停在最鼓的那一帧，25 秒内不变）', () => {
  const engine = makeEngine();
  const vacuum = spawn(engine, { id: 34, team: 'player', lane: 2, col: 6 });
  spawn(engine, { id: 1, team: 'enemy', lane: 2, col: 6, quality: 1, hp: 5000 });
  tick(engine, 4);
  assert.equal(vacuum._animHoldFrameState, 'attacking', '应处于"消化姿态"状态');
  assert.equal(Number(vacuum._animHoldFrame), 35, '应停在最鼓的 35 帧');
  assert.equal(vacuum._forcedAnimState, 'attacking', '应强制播放吞入动画');
  assert.ok(Number(vacuum._forcedAnimUntil) - engine.time > 20, '强制姿态要覆盖整个消化期');
  tick(engine, 5);
  assert.equal(Number(vacuum._animHoldFrame), 35, '消化中一直保持膨胀姿态');
  assert.equal(engine.isDigestingSwallow(vacuum), true, '这时仍在消化');
});
check('消化期间不能再吞（靠近的新单位不会被吃掉）', () => {
  const engine = makeEngine();
  const vacuum = spawn(engine, { id: 34, team: 'player', lane: 2, col: 6 });
  spawn(engine, { id: 1, team: 'enemy', lane: 2, col: 6, quality: 1, hp: 5000 });
  tick(engine, 4);
  const second = spawn(engine, { id: 1, team: 'enemy', lane: 2, col: 6, quality: 1, hp: 5000 });
  tick(engine, 3);
  assert.equal(second.alive, true, '消化期间不应把第二个单位也吞掉');
  assert.equal(second.hp, second.maxHp, '消化期间也不应攻击');
});
check('消化完毕：25 秒后回到待机并清掉膨胀姿态', () => {
  const engine = makeEngine();
  const vacuum = spawn(engine, { id: 34, team: 'player', lane: 2, col: 6 });
  spawn(engine, { id: 1, team: 'enemy', lane: 2, col: 6, quality: 1, hp: 5000 });
  tick(engine, 4);
  tick(engine, 23);
  assert.equal(engine.isDigestingSwallow(vacuum), true, '消化中途应仍在消化');
  tick(engine, 4);
  assert.equal(engine.isDigestingSwallow(vacuum), false, '超过 25 秒应结束消化');
  assert.equal(vacuum._animHoldFrame ?? null, null, '膨胀姿态应清掉');
  assert.equal(Number(vacuum._digestingUntil), 0, '消化状态应复位');
});
check('消化结束后恢复正常（可以再吞）', () => {
  const engine = makeEngine();
  const vacuum = spawn(engine, { id: 34, team: 'player', lane: 2, col: 6 });
  spawn(engine, { id: 1, team: 'enemy', lane: 2, col: 6, quality: 1, hp: 5000 });
  tick(engine, 4);
  tick(engine, 26);
  assert.equal(engine.isDigestingSwallow(vacuum), false, '消化应已结束');
  const next = spawn(engine, { id: 1, team: 'enemy', lane: 2, col: 6, quality: 1, hp: 5000 });
  tick(engine, 1);
  assert.equal(next.alive, false, '消化结束后可以再吞（秒杀）');
});

console.log('=== ④ 外星哨兵(38)：吸走但不冰冻 ===');
check('吸走目标不设置 frozenUntil', () => {
  const engine = makeEngine();
  const sentinel = spawn(engine, { id: 38, team: 'player', lane: 1, col: 5 });
  const victim = spawn(engine, { id: 1, team: 'enemy', lane: 1, col: 5, quality: 1 }); // 地面单位
  const handled = engine.tryAbduct(sentinel);
  assert.equal(handled, true, 'tryAbduct 应命中');
  assert.equal(Number(victim.frozenUntil) || 0, 0, `不应被冰冻，实际 frozenUntil=${victim.frozenUntil}`);
});

console.log('=== ⑤ 热血火龙果(65)：走到接触就自爆 ===');
check('range = 0（自爆卡必须走到接触）', () => {
  const engine = makeEngine();
  const bomber = spawn(engine, { id: 65, team: 'player', lane: 0, col: 2 });
  assert.equal(bomber.range, 0);
});
check('自爆单位不被"前面有敌人挡路"卡住', () => {
  const engine = makeEngine();
  const bomber = spawn(engine, { id: 65, team: 'player', lane: 0, col: 2 });
  const enemy = spawn(engine, { id: 1, team: 'enemy', lane: 0, col: 3 });
  assert.equal(engine.blocksMovement(enemy, bomber), false, '自爆单位应能走进敌人所在格');
  const normal = spawn(engine, { id: 1, team: 'player', lane: 1, col: 2 });
  const enemy2 = spawn(engine, { id: 1, team: 'enemy', lane: 1, col: 3 });
  assert.equal(engine.blocksMovement(enemy2, normal), true, '普通单位仍会被挡');
});
check('接触敌方地面单位 → 自爆并造成伤害（含 BOOM 特效）', () => {
  const engine = makeEngine();
  const bomber = spawn(engine, { id: 65, team: 'player', lane: 0, col: 4.4 });
  const target = spawn(engine, { id: 1, team: 'enemy', lane: 0, col: 5, quality: 1 });
  const hp0 = target.hp;
  const before = engine.impactFx.length;
  const exploded = engine.trySuicideBomber(bomber);
  assert.equal(exploded, true, '接触时应触发自爆');
  assert.equal(bomber.alive, false, '自爆后单位应消失');
  assert.ok(target.hp < hp0 || !target.alive, `目标应被炸到（hp ${hp0} → ${target.hp}）`);
  const fx = engine.impactFx.slice(before);
  assert.ok(fx.length, '应产生爆炸特效');
  assert.ok(fx[0].boomRes != null, `爆炸应带 BOOM 序列（boomRes=${fx[0].boomRes}）`);
});

console.log('=== ⑥ 黑铁土豆雷(61)：近战不再把它当目标 ===');
check('61 是低优先目标（不会被锁定）', () => {
  const engine = makeEngine();
  const mine = spawn(engine, { id: 61, team: 'enemy', lane: 0, col: 5 });
  const melee = spawn(engine, { id: 1, team: 'player', lane: 0, col: 2 });
  assert.equal(mine.isLowTarget(), true, '61 应不可被锁定');
  assert.equal(engine.isValidEnemyTarget(melee, mine), false, '近战不应把它当有效目标');
  assert.equal(engine.blocksMovement(mine, melee), false, '地雷也不应挡路（近战要走上去）');
});
check('近战踩上去 → 地雷爆炸并炸伤近战（含 BOOM 特效）', () => {
  const engine = makeEngine();
  const mine = spawn(engine, { id: 61, team: 'enemy', lane: 0, col: 5 });
  const melee = spawn(engine, { id: 1, team: 'player', lane: 0, col: 5.4, quality: 1 });
  const hp0 = melee.hp;
  const before = engine.impactFx.length;
  const exploded = engine.trySuicideBomber(mine);
  assert.equal(exploded, true, '近战踩上去应触发爆炸');
  assert.equal(mine.alive, false, '地雷爆炸后应消失');
  assert.ok(melee.hp < hp0 || !melee.alive, `近战应被炸到（hp ${hp0} → ${melee.hp}）`);
  const fx = engine.impactFx.slice(before);
  assert.ok(fx.length && fx[0].boomRes != null, `爆炸应带 BOOM 序列（${JSON.stringify(fx[0] ?? null)}）`);
});

console.log('=== ⑧ 空中相遇：飞行水蜜桃自爆 ===');
check('飞行单位相遇 → 水蜜桃锁定接触目标并自爆', () => {
  const engine = makeEngine();
  const peach = spawn(engine, { id: 40, team: 'player', lane: 0, col: 5 });
  const ninja = spawn(engine, { id: 12, team: 'enemy', lane: 0, col: 5.4 });
  assert.equal(peach.isFlying(), true, '40 应是飞行状态');
  const collided = engine.landCollidingAerialUnits(peach);
  assert.equal(collided, true, '相遇应触发空中接触');
  assert.equal(peach._aerialContactDetonate, true, '水蜜桃应进入"接触即爆"状态');
  assert.equal(String(peach._aerialContactTargetUid), String(ninja.uid), '应锁定撞到的那个敌人');
  const hp0 = ninja.hp;
  assert.equal(engine.trySuicideBomber(peach), true, '相遇后应自爆');
  assert.ok(ninja.hp < hp0 || !ninja.alive, `飞行忍者应被炸到（hp ${hp0} → ${ninja.hp}）`);
});

console.log('=== ⑨ 飞行忍者/幻.飞行忍者到基地 → 坠落并攻击基地 ===');
check('攻基地的飞行单位会落地（不再是飞行状态，能打基地）', () => {
  const engine = makeEngine();
  const ninja = spawn(engine, { id: 12, team: 'player', lane: 0, col: 11 });
  assert.equal(ninja.isFlying(), true, '一开始是飞行状态');
  // 引擎在"贴到敌基地"时会 requestAerialLanding(unit, { atBase: true })（见 updateUnitMovement/processBattleTick）
  ninja.attackingBase = true;
  engine.requestAerialLanding(ninja, { atBase: true });
  assert.equal(ninja._aerialLandingRequested, true, '应请求落地');
  assert.equal(ninja._baseLandingRequested, true, '应标记为"基地落地"');
  tick(engine, 2);
  assert.equal(ninja._aerialLanded, true, '落地动画结束后应成为地面单位');
  assert.equal(ninja.isFlying(), false, '落地后不再是飞行单位（这时才能攻击基地）');
});

check('幻.飞行忍者(45) 落地时触发十字分身', () => {
  const engine = makeEngine();
  const phantom = spawn(engine, { id: 45, team: 'player', lane: 1, col: 5 });
  engine.requestAerialLanding(phantom);
  tick(engine, 2);
  assert.equal(phantom._aerialLanded, true, '应已落地');
  assert.equal(phantom._phantomSplitDone, true, '落地应触发分身');
});

check('幻.飞行忍者(45) 碰到敌方飞行单位 → 落地（死了则不落地）', () => {
  const engine = makeEngine();
  const phantom = spawn(engine, { id: 45, team: 'player', lane: 0, col: 5 });
  const enemyFlyer = spawn(engine, { id: 12, team: 'enemy', lane: 0, col: 5.95 });   // 相邻(≈0.95格)
  assert.equal(engine.landCollidingAerialUnits(phantom), true, '相邻的敌方飞行单位应算"碰到"');
  assert.equal(phantom._aerialLandingRequested, true, '幻.飞行忍者应请求落地');
  assert.equal(enemyFlyer._aerialLandingRequested, true, '对面的飞行单位也要落地');
  tick(engine, 2);
  assert.equal(phantom._aerialLanded, true, '应完成落地');
  assert.equal(phantom.isFlying(), false, '落地后不再是飞行单位');
  // 死了就不谈落地
  const engine2 = makeEngine();
  const deadPhantom = spawn(engine2, { id: 45, team: 'player', lane: 0, col: 5 });
  spawn(engine2, { id: 12, team: 'enemy', lane: 0, col: 5.9 });
  deadPhantom.alive = false;
  assert.equal(engine2.landCollidingAerialUnits(deadPhantom), false, '已死亡的飞行单位不应触发落地');
});

console.log('=== ⑩ 番茄炸弹(500)：伤害时机按实测命中帧 ===');
check('500 结算延迟 = 动画 50%（原 42%，实测落地起爆在第 28~31/61 帧）', async () => {
  const cfg = await import('../src/battle/SkillAnimationConfig.js');
  const delay = cfg.getSkillResolutionDelay(500);
  const visual = cfg.getSkillVisualDuration(500);
  assert.ok(Math.abs(delay / visual - 0.50) < 1e-6, `实际比例 ${(delay / visual).toFixed(3)}`);
});

check('技能特效不会被"只画最新 N 个"的上限截断（气波尾段）', () => {
  const src = fs.readFileSync(new URL('../src/battle/BattleRenderer.js', import.meta.url), 'utf8');
  const start = src.indexOf('drawSkillFx(ctx, engine)');
  const body = src.slice(start, start + 600);
  assert.ok(start > 0, '应能定位 drawSkillFx');
  assert.ok(!body.includes('_effectSliceStart'), 'drawSkillFx 不应使用特效上限（否则长动画尾段会被丢掉）');
});

console.log(failures.length ? `\n${failures.length} 项未通过` : '\n全部通过');
process.exit(failures.length ? 1 : 0);
