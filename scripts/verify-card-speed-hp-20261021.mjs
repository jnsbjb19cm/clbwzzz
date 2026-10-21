/**
 * 2026-10-21 卡牌调整回归：
 * 1) 飞鞋怪(#23) / 跳跃大耳怪(#31)：首次攻击触发前移速 0.65 格/秒（档位 4），
 *    首次攻击（首次接触击晕 / 首次接敌跳跃 / 首次普通出手）后回落到 0.5 格/秒（档位 3）。
 * 2) 3级卡「树精守卫」(#68) 基础生命 120 → 80。
 */
import assert from 'node:assert/strict';
// BattleEngine 的移动/首次攻击路径会调用 audio.playSfx；Node 里补一个静音 Audio 实现。
globalThis.Audio = class {
  constructor() { this.volume = 0; this.currentTime = 0; }
  play() { return Promise.resolve(); }
  pause() {}
  addEventListener() {}
  removeEventListener() {}
  cloneNode() { return this; }
  load() {}
};
const { CardDatabase } = await import('../src/core/CardDatabase.js');
const { BattleEngine } = await import('../src/battle/BattleEngine.js');
const { TICK_INTERVAL, getMoveColPerSec, getUnitMoveBucket, markFirstAttackTriggered, getCardMoveSpeedOptions } = await import('../src/battle/BattleConfig.js');
const db = new CardDatabase();
let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log('PASS', name); }

function makeEngine() {
  const inventory = {
    getSlots: () => [{ cardId: 1 }, { cardId: 2 }, { cardId: 3 }, { cardId: 7 }],
    findFirstInstance: (id) => ({ index: 0, slot: { cardId: id } }),
  };
  const engine = new BattleEngine(db, db.stages[0].stage_id, [0, 1, 2, 3], inventory, { trainingMode: true });
  engine.units = [];
  engine.projectiles = [];
  engine.wave.tick = () => {};
  return engine;
}

function addUnit(engine, cardId, lane, col, team = 'player') {
  const unit = engine.spawnSummon(cardId, lane, col, team);
  unit.hp = unit.maxHp = 100000;
  return unit;
}

function advance(engine, ticks) {
  for (let i = 0; i < ticks; i += 1) engine.tick(TICK_INTERVAL);
}

test('speed buckets map to 0.65 / 0.5 col/s', () => {
  assert.equal(getMoveColPerSec(4), 0.65);
  assert.equal(getMoveColPerSec(3), 0.5);
});

test('only 飞鞋怪/跳跃大耳怪 get the first-attack speed buckets', () => {
  assert.equal(getUnitMoveBucket({ cardId: 23, moveSpeed: 3 }), 4);
  assert.equal(getUnitMoveBucket({ cardId: 31, moveSpeed: 3 }), 4);
  assert.equal(getUnitMoveBucket({ cardId: 23, moveSpeed: 3, _firstAttackTriggered: true }), 3);
  assert.equal(getUnitMoveBucket({ cardId: 31, moveSpeed: 3, _firstAttackTriggered: true }), 3);
  // 其他可移动卡不受影响
  assert.equal(getUnitMoveBucket({ cardId: 3, moveSpeed: 3 }), 3);
  assert.equal(getUnitMoveBucket({ cardId: 3, moveSpeed: 3, _firstAttackTriggered: true }), 3);
  assert.equal(getUnitMoveBucket({ cardId: 2, moveSpeed: 0 }), 0);
  // mark 只对这两张卡生效
  const other = { cardId: 3, moveSpeed: 3 };
  markFirstAttackTriggered(other);
  assert.equal(other._firstAttackTriggered, undefined);
});

test('level-3 card 树精守卫 base HP is 80', () => {
  const card = db.getById(68);
  assert.equal(card.name, '树精守卫');
  assert.equal(card.quality, 3, '树精守卫应为 3 级卡');
  assert.equal(card.hp, 80);
  assert.equal(card.atk, 0);
});

test('gallery move-speed options expose both tiers only for the two dual-speed cards', () => {
  const flyer = getCardMoveSpeedOptions(db.getById(23));
  const jumper = getCardMoveSpeedOptions(db.getById(31));
  for (const options of [flyer, jumper]) {
    assert.ok(Array.isArray(options) && options.length === 2);
    assert.deepEqual(options.map(option => option.key), ['beforeFirstAttack', 'afterFirstAttack']);
    assert.deepEqual(options.map(option => option.colPerSec), [0.65, 0.5]);
    assert.deepEqual(options.map(option => option.label), ['首次攻击前', '首次攻击后']);
  }
  assert.equal(getCardMoveSpeedOptions(db.getById(7)), null, '普通移动卡不应有双档');
  assert.equal(getCardMoveSpeedOptions(db.getById(2)), null, '防御卡不应有双档');
});

test('飞鞋怪 moves at 0.65 col/s before first attack, 0.5 after', () => {
  const engine = makeEngine();
  const unit = addUnit(engine, 23, 2, 1);
  const start = unit.col;
  advance(engine, 10);
  const fastDelta = (unit.col - start) / 10;
  assert.ok(Math.abs(fastDelta - 0.65 * TICK_INTERVAL) < 1e-6, `首次攻击前每 tick 位移 ${fastDelta}，应为 ${0.65 * TICK_INTERVAL}`);
  markFirstAttackTriggered(unit);
  const mid = unit.col;
  advance(engine, 10);
  const slowDelta = (unit.col - mid) / 10;
  assert.ok(Math.abs(slowDelta - 0.5 * TICK_INTERVAL) < 1e-6, `首次攻击后每 tick 位移 ${slowDelta}，应为 ${0.5 * TICK_INTERVAL}`);
});

test('跳跃大耳怪 moves at 0.65 col/s before first attack, 0.5 after', () => {
  const engine = makeEngine();
  const unit = addUnit(engine, 31, 2, 1);
  const start = unit.col;
  advance(engine, 10);
  const fastDelta = (unit.col - start) / 10;
  assert.ok(Math.abs(fastDelta - 0.65 * TICK_INTERVAL) < 1e-6, `首次攻击前每 tick 位移 ${fastDelta}，应为 ${0.65 * TICK_INTERVAL}`);
  markFirstAttackTriggered(unit);
  const mid = unit.col;
  advance(engine, 10);
  const slowDelta = (unit.col - mid) / 10;
  assert.ok(Math.abs(slowDelta - 0.5 * TICK_INTERVAL) < 1e-6, `首次攻击后每 tick 位移 ${slowDelta}，应为 ${0.5 * TICK_INTERVAL}`);
});

test('other movable cards keep their card move speed', () => {
  // 7 号西瓜太郎 move_speed=3（0.5 格/秒），不在提速名单里。
  const engine = makeEngine();
  const unit = addUnit(engine, 7, 2, 1);
  const start = unit.col;
  advance(engine, 10);
  const delta = (unit.col - start) / 10;
  assert.ok(Math.abs(delta - 0.5 * TICK_INTERVAL) < 1e-6, `西瓜太郎每 tick 位移 ${delta}，应为 ${0.5 * TICK_INTERVAL}`);
});

test('跳跃大耳怪 first jump marks first attack and drops to 0.5', () => {
  const engine = makeEngine();
  const jumper = addUnit(engine, 31, 2, 1);
  const blocker = addUnit(engine, 2, 2, 4, 'enemy');
  blocker.hp = blocker.maxHp = 100000;
  let guard = 0;
  while (!jumper._jumpedOnce && guard < 120) { engine.tick(TICK_INTERVAL); guard += 1; }
  assert.equal(jumper._jumpedOnce, true, '跳跃大耳怪应触发首次跳跃');
  assert.equal(jumper._firstAttackTriggered, true, '首次跳跃后应标记首次攻击已触发');
  // 等待跳跃落地后测移速
  guard = 0;
  while ((jumper._jumpUntil || 0) > engine.time && guard < 120) { engine.tick(TICK_INTERVAL); guard += 1; }
  const start = jumper.col;
  advance(engine, 6);
  const delta = (jumper.col - start) / 6;
  assert.ok(Math.abs(delta - 0.5 * TICK_INTERVAL) < 1e-6 || delta === 0, `跳跃后每 tick 位移 ${delta}，应为 ${0.5 * TICK_INTERVAL}（若仍被阻挡可为 0）`);
});

test('飞鞋怪 first contact stun marks first attack and drops to 0.5', () => {
  const engine = makeEngine();
  const flyer = addUnit(engine, 23, 2, 1);
  addUnit(engine, 2, 2, 5, 'enemy');
  let guard = 0;
  while (!flyer._firstContactStun && guard < 150) { engine.tick(TICK_INTERVAL); guard += 1; }
  assert.equal(flyer._firstContactStun, true, '飞鞋怪应触发首次接触击晕');
  assert.equal(flyer._firstAttackTriggered, true, '首次接触攻击后应标记首次攻击已触发');
  assert.equal(getUnitMoveBucket(flyer), 3);
});

console.log(JSON.stringify({ passed }));
