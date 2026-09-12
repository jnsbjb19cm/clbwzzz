// 回归验证：受击致死时，伤害数字只显示「实际扣掉的血量」，不显示溢出伤害；
// 同时保证战斗数值（扣血、applyCardHit/hitUnit 返回值、吸血基数）完全不变。
// 用法： node scripts/verify-damage-number-overkill-20260911.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

globalThis.Audio = class {
  play() { return Promise.resolve(); }
  pause() {}
  addEventListener() {}
  cloneNode() { return this; }
  load() {}
};
globalThis.window = globalThis;
globalThis.Image = class { addEventListener() {} set src(_v) {} };
globalThis.fetch = async () => ({ ok: false });
globalThis.document = { createElement: () => ({ getContext: () => ({}), addEventListener() {} }) };
globalThis.performance = globalThis.performance ?? { now: () => 0 };

const { BattleEngine } = await import(pathToFileURL(join(ROOT, 'src/battle/BattleEngine.js')));
const { BattleUnit } = await import(pathToFileURL(join(ROOT, 'src/battle/BattleUnit.js')));
const { Card } = await import(pathToFileURL(join(ROOT, 'src/core/Card.js')));

const rawCards = require(join(ROOT, 'src/data/card.json'));
class FakeDb {
  constructor() {
    this.cards = rawCards.map((raw) => new Card(raw));
    this.cardMap = new Map(this.cards.map((card) => [card.id, card]));
    this.stages = [{ stage_id: 1, stage_name: 'test', hp: 999, enemy_res: 5 }];
  }
  getById(id) { return this.cardMap.get(Number(id)); }
}

function makeEngine() {
  const db = new FakeDb();
  const engine = new BattleEngine(db, 1, [], null, { trainingMode: true, pvp: true });
  engine.pvp = true;
  engine.time = 10;
  return engine;
}

function newUnit(db, cardId, team, lane, col, hp) {
  const unit = new BattleUnit({ card: db.getById(cardId), lane, col, team });
  unit.hp = unit.maxHp = hp;
  return unit;
}

function damageFloatsFor(engine, unit) {
  return (engine.floats ?? [])
    .filter((f) => Number(f.lane) === Number(unit.lane) && Math.abs(Number(f.col) - Number(unit.col)) < 0.01)
    .map((f) => Number(f.amount))
    .filter((a) => a < 0)
    .map((a) => -a);
}

const failures = [];
// 注意：必须 await —— 之前是 `try { fn() }`，异步回调里抛错只会变成未处理的 Promise，
// 断言被静默跳过（本轮就是靠这个才发现"字形断言"一直是假通过）。
async function check(name, fn) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.log(`  FAIL ${name}\n       ${String(error.message).split('\n')[0]}`);
  }
}

console.log('受击致死：伤害数字 = 实际扣掉的血量');

// 1) 统一命中入口（近战/远程共用）applyCardHit
await check('applyCardHit: 30 血挨 500 → 伤害数字 30', () => {
  const engine = makeEngine();
  const attacker = newUnit(engine.db, 3, 'player', 2, 8, 800);
  const victim = newUnit(engine.db, 2, 'enemy', 2, 9, 30);
  engine.units = [attacker, victim];
  engine.applyCardHit(attacker, victim, 500);
  assert.deepEqual(damageFloatsFor(engine, victim), [30]);
});

// 2) 技能命中入口 BattleSkillSystem.hitUnit（走 engine.hitUnit 桥）
await check('hitUnit: 12 血挨 999 → 伤害数字 12', () => {
  const engine = makeEngine();
  const victim = newUnit(engine.db, 2, 'enemy', 1, 5, 12);
  engine.units = [victim];
  const skills = engine.skills;
  if (!skills || typeof skills.hitUnit !== 'function') throw new Error('engine.skills.hitUnit 不存在');
  skills.hitUnit(victim, 999);
  assert.deepEqual(damageFloatsFor(engine, victim), [12]);
});

// 3) 自爆：受害者致死时同样只显示实际扣血
await check('自爆: 20 血挨 500 → 伤害数字 20', () => {
  const engine = makeEngine();
  const bomber = newUnit(engine.db, 61, 'player', 2, 5, 500);
  const victim = newUnit(engine.db, 2, 'enemy', 2, 5, 20);
  bomber.atk = 500;
  engine.units = [bomber, victim];
  engine.trySuicideBomber(bomber);
  assert.deepEqual(damageFloatsFor(engine, victim), [20]);
});

// 4) 战斗数值必须不变：命中入口返回值不变、吸血基数不变、血量下限为 0
await check('战斗数值不变：返回值 / 吸血基数 / 0 血下限', () => {
  const engine = makeEngine();
  const attacker = newUnit(engine.db, 3, 'player', 2, 8, 800);
  const victim = newUnit(engine.db, 2, 'enemy', 2, 9, 30);
  engine.units = [attacker, victim];
  const dealt = engine.applyCardHit(attacker, victim, 500);
  assert.equal(dealt, 500, `applyCardHit 返回值应保持 500，实际 ${dealt}`);
  // 2026-09-12：按用户要求血量最低扣到 0（不再留下 -470 的负血）。
  // 返回值（吸血/反射基数）仍是本次伤害值，实际扣血仍是 30，这两点没变。
  assert.equal(victim.hp, 0, `血量应夹到 0，实际 ${victim.hp}`);
  assert.equal(victim.lastDamageDealt, 30, `实际扣血应仍是 30，实际 ${victim.lastDamageDealt}`);
  assert.equal(victim.alive, false, '致死后 alive 应为 false');
  // 直接调用 takeDamage 仍返回本次伤害，供其它战斗特性使用
  const fresh = newUnit(engine.db, 2, 'enemy', 0, 0, 10);
  assert.equal(fresh.takeDamage(77, 10), 77, 'takeDamage 返回值不应改变');
  assert.equal(fresh.hp, 0, `10 血挨 77 应夹到 0，实际 ${fresh.hp}`);
});

// 5) 未致死时显示的就是本次伤害
await check('未致死：伤害数字 = 本次伤害', () => {
  const engine = makeEngine();
  const attacker = newUnit(engine.db, 3, 'player', 2, 8, 800);
  const victim = newUnit(engine.db, 2, 'enemy', 2, 9, 500);
  engine.units = [attacker, victim];
  engine.applyCardHit(attacker, victim, 120);
  assert.deepEqual(damageFloatsFor(engine, victim), [120]);
});

// 6) 伤害数字浮层（设置页开关那条路径）也必须拿到实际扣血
await check('BattleUnit 记录实际扣血（供伤害数字浮层使用）', () => {
  const engine = makeEngine();
  const victim = newUnit(engine.db, 2, 'enemy', 0, 0, 25);
  victim.takeDamage(400, 10);
  assert.equal(victim.lastDamageDealt, 25, `lastDamageDealt 应为 25，实际 ${victim.lastDamageDealt}`);
  const full = newUnit(engine.db, 2, 'enemy', 0, 0, 100);
  full.takeDamage(40, 10);
  assert.equal(full.lastDamageDealt, 40, '未致死时应等于本次伤害');
  const immune = newUnit(engine.db, 2, 'enemy', 0, 0, 100);
  immune.invulnUntil = 99;
  immune.takeDamage(50, 10);
  assert.equal(immune.lastDamageDealt, 0, '无敌时不应产生伤害数字');
});

// 5) 小数血量：剩余 3.2 血挨 25 → 飘字要显示 -3.2（不再四舍五入成 -3）
await check('小数扣血：剩余 3.2 挨 25 → 飘字 3.2（不四舍五入）', () => {
  const engine = makeEngine();
  const victim = newUnit(engine.db, 2, 'enemy', 0, 3, 3.2);
  engine.units = [victim];
  engine.applyCardHit(engine.units[0], victim, 25);
  assert.deepEqual(damageFloatsFor(engine, victim), [3.2], '飘字数值应为 3.2');
});

// 6) 小数飘字的绘制：图集字形要画到小数点(number_*_d)
await check('飘字渲染：3.2 会画数字 3 + 小数点字形', async () => {
  const { BattleRenderer } = await import(pathToFileURL(join(ROOT, 'src/battle/BattleRenderer.js')));
  const atlas = require(join(ROOT, 'src/data/atlas/preload_battle.json'));
  const parts = atlas.parts ?? atlas.sprites ?? atlas;
  const rectOf = (name) => parts.find((p) => p.name === name);
  const digit3 = rectOf('number_r_3');
  const dot = rectOf('number_r_d');
  if (!digit3 || !dot) throw new Error('图集缺少 number_r_3 / number_r_d');

  const engine = makeEngine();
  engine.floats = [{ lane: 0, col: 3, amount: -3.2, life: 1, y: 0 }];
  const draws = [];
  const fakeCtx = {
    font: '', textAlign: '', textBaseline: '', fillStyle: '',
    save() {}, restore() {}, fillText() {},
    drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) { draws.push({ sx, sy, sw, sh, dx, dy, dw, dh }); },
  };
  BattleRenderer.prototype.drawFloats.call({
    battleAtlasImage: {},
    requestBattleAtlas() {},
    _effectSliceStart: () => 0,
    isBaseFloat: () => false,
  }, fakeCtx, engine);
  const drewDigit3 = draws.some((d) => d.sx === digit3.x && d.sy === digit3.y);
  const dotDraw = draws.find((d) => d.sx === dot.x && d.sy === dot.y);
  console.log(`   绘制的字形数=${draws.length}（数字3=${drewDigit3}，小数点=${Boolean(dotDraw)}）`);
  assert.ok(drewDigit3, '应画出数字 3');
  assert.ok(dotDraw, '应画出小数点（number_r_d）');
  assert.equal(draws.length, 4, `共 4 个字形（减号 + 3 + 小数点 + 2），实际 ${draws.length}`);

  // 小数点必须落在基线上。居中的话会卡在数字中间、看起来像减号（用户看到的 "-2-5"）。
  const digitDraw = draws.find((d) => d.sx === digit3.x && d.sy === digit3.y);
  const digitBottom = digitDraw.dy + digitDraw.dh;
  const dotBottom = dotDraw.dy + dotDraw.dh;
  console.log(`   数字底边=${digitBottom.toFixed(1)} 小数点底边=${dotBottom.toFixed(1)} 中心差=${(dotBottom - digitBottom).toFixed(1)}`);
  assert.ok(Math.abs(dotBottom - digitBottom) < 1.5, `小数点底边应贴合数字底边，实际差 ${(dotBottom - digitBottom).toFixed(1)}`);
  assert.ok(dotDraw.dy > digitDraw.dy, '小数点应低于数字顶部（不能居中当减号）');
});

// 7) 负数小数：-2.5（用户报告"-2-5"的那种数字）
await check('飘字渲染：-2.5 画成 减号+2+小数点+5，且小数点贴基线', async () => {
  const { BattleRenderer } = await import(pathToFileURL(join(ROOT, 'src/battle/BattleRenderer.js')));
  const atlas = require(join(ROOT, 'src/data/atlas/preload_battle.json'));
  const parts = atlas.sprites ?? atlas.parts ?? atlas;
  const rectOf = (name) => parts.find((p) => p.name === name);
  const engine = makeEngine();
  engine.floats = [{ lane: 0, col: 3, amount: -2.5, life: 1, y: 0 }];
  const draws = [];
  const fakeCtx = {
    font: '', textAlign: '', textBaseline: '', fillStyle: '',
    save() {}, restore() {}, fillText() {},
    drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) { draws.push({ sx, sy, dx, dy, dw, dh }); },
  };
  BattleRenderer.prototype.drawFloats.call({
    battleAtlasImage: {}, requestBattleAtlas() {}, _effectSliceStart: () => 0, isBaseFloat: () => false,
  }, fakeCtx, engine);
  const names = draws.map((d) => parts.find((p) => p.x === d.sx && p.y === d.sy)?.name ?? '?');
  console.log(`   -2.5 画出的字形：${names.join(' ')}`);
  assert.deepEqual(names, ['number_r_sub', 'number_r_2', 'number_r_d', 'number_r_5'], `实际 ${names.join(' ')}`);
  const dot = draws[2]; const five = draws[3];
  assert.ok(Math.abs((dot.dy + dot.dh) - (five.dy + five.dh)) < 1.5, '小数点底边应贴合数字底边');
  assert.ok(dot.dy + dot.dh / 2 > five.dy + five.dh / 2, '小数点必须在数字中心线以下（否则像减号）');
});

console.log(failures.length ? `\n${failures.length} 项未通过` : '\n全部通过');
process.exit(failures.length ? 1 : 0);
