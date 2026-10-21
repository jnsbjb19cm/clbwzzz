import assert from 'node:assert/strict';
import * as R from '../src/data/EndlessAdventureRules.js';
import { EndlessRunStore } from '../src/core/EndlessRunStore.js';
await import('../server/battle/PvpBattle.js');
const { CardDatabase } = await import('../src/core/CardDatabase.js');
const { createEndlessBattle } = await import('../src/battle/EndlessBattleAdapter.js');
const db = new CardDatabase();
let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log('PASS', name); }
const trial = seed => R.createEndlessRun({ mode: 'trial', seed });
const expedition = seed => R.createEndlessRun({ mode: 'expedition', seed });
// 把任何"可继续"的界面状态推进到 ready（营地→离开、契约→选一项、远征路线→选战斗）。
function toReady(input) {
  let run = input;
  for (let guard = 0; guard < 8; guard += 1) {
    if (run.phase === 'ready') return run;
    if (run.phase === 'camp') { run = R.leaveRunCamp(run); continue; }
    if (run.phase === 'contract') { run = R.chooseRunContract(run, 'swift'); continue; }
    if (run.phase === 'route') {
      run = R.chooseRunRoute(run, R.runRoutes(run).find(route => route.kind === 'battle').id); continue;
    }
    throw new Error(`无法从 ${run.phase} 推进到 ready`);
  }
  throw new Error('toReady guard');
}
function win(input, { hp = 900, bountyStats } = {}) {
  const battle = R.beginRunBattle(toReady(input));
  return R.settleRunBattle(battle, { attempt: battle.attempt, won: true, baseHp: hp, bountyStats });
}

test('contract arrives after every tenth cleared battle in both modes', () => {
  let run = trial('contracts');
  for (let index = 1; index <= 10; index += 1) {
    run = win(run);
    if (index < 10) assert.notEqual(run.phase, 'contract', `step ${index}`);
  }
  assert.equal(run.phase, 'contract');
  assert.equal(run.cleared, 10);
  const choices = R.runContractChoices(run);
  assert.deepEqual(choices.map(c => c.id).sort(), ['mending', 'swift', 'volley']);
  const goldBefore = run.gold;
  const next = R.chooseRunContract(run, 'swift');
  assert.deepEqual(next.contracts, ['swift']);
  assert.equal(next.gold, goldBefore + 60);
  // 10 也是 5 的倍数：签完契约仍然进入五层营地（换卡/修复机会不丢）。
  assert.equal(next.phase, 'camp');
  assert.equal(next.swapsLeft, 1);
  assert.equal(next.campRepaired, false);

  let journey = expedition('contracts-expedition');
  for (let index = 1; index <= 10; index += 1) journey = win(journey);
  assert.equal(journey.phase, 'contract');
  assert.equal(R.chooseRunContract(journey, 'mending').phase, 'route');
});

test('contracts stack with caps and only change enemy mechanics', () => {
  const run = { ...trial('caps'), contracts: Array(10).fill('swift') };
  const mods = R.runContractModifiers(run);
  assert.equal(mods.speed, .6);
  const mixed = R.runContractModifiers({ ...trial('mix'), contracts: ['volley', 'volley', 'volley', 'volley', 'mending'] });
  assert.equal(mixed.rangedAtk, .54);
  assert.equal(mixed.regen, .015);
  assert.deepEqual(R.runContractModifiers({ ...trial('none') }), { speed: 0, rangedAtk: 0, regen: 0 });
});

test('bounty selection is ready-phase only, toggleable, and harmless when failed', () => {
  const run = trial('bounty');
  assert.deepEqual(R.runBountyChoices(run).map(b => b.id).sort(), ['flawless', 'focused', 'spread']);
  const picked = R.chooseRunBounty(run, 'flawless');
  assert.equal(picked.bounty, 'flawless');
  assert.equal(R.chooseRunBounty(picked, 'flawless').bounty, null, '再次点击同一赏金等于取消');
  assert.throws(() => R.chooseRunBounty({ ...run, phase: 'route' }, 'flawless'));
  const goldBefore = run.gold;
  const failed = win({ ...run, bounty: 'flawless' }, { bountyStats: { lanes: [2], cardIds: [1], baseDamage: 120 } });
  assert.equal(failed.bounty, null, '结算后清空本场赏金');
  assert.ok(failed.gold >= goldBefore, '赏金失败不扣金币');
  assert.ok(failed.journal.some(line => line.includes('赏金未达成')));
});

test('bounty conditions read real battle stats and pay out once', () => {
  const base = trial('bounty-pay');
  const flawlessRun = win({ ...base, bounty: 'flawless' }, { bountyStats: { lanes: [1], cardIds: [1, 2], baseDamage: 0 } });
  assert.ok(flawlessRun.journal.some(line => line.includes('赏金达成「无瑕防线」')));
  const expected = base.gold + 25 + Math.min(75, 2) + 80;
  assert.equal(flawlessRun.gold, expected);
  const spreadRun = win({ ...base, bounty: 'spread' }, { bountyStats: { lanes: [0, 2, 4], cardIds: [1], baseDamage: 30 } });
  assert.ok(spreadRun.journal.some(line => line.includes('赏金达成「三路并进」')));
  const focusedRun = win({ ...base, bounty: 'focused' }, { bountyStats: { lanes: [1], cardIds: [1, 2, 3, 4], baseDamage: 10 } });
  assert.ok(focusedRun.journal.some(line => line.includes('赏金达成「精兵简政」')));
  const overuse = win({ ...base, bounty: 'focused' }, { bountyStats: { lanes: [1], cardIds: [1, 2, 3, 4, 5], baseDamage: 10 } });
  assert.ok(overuse.journal.some(line => line.includes('赏金未达成「精兵简政」')));
  assert.equal(R.runBountyMet('flawless', { baseDamage: 0 }), true);
  assert.equal(R.runBountyMet('flawless', { baseDamage: 1 }), false);
  assert.equal(R.runBountyMet('spread', { lanes: [0, 1] }), false);
  assert.equal(R.runBountyMet('focused', { cardIds: [] }), false);
});

test('five-floor scout previews the band and the elite floor', () => {
  const scout = R.runScout({ ...trial('scout'), floor: 1 }, db);
  assert.equal(scout.bandStart, 1);
  assert.equal(scout.bandEnd, 5);
  assert.equal(scout.floors.length, 5);
  assert.equal(scout.eliteFloor, null);
  assert.ok(scout.enemies.length > 0 && scout.enemies.every(e => e.count > 0 && e.name));
  const eliteScout = R.runScout({ ...trial('scout'), floor: 7 }, db);
  assert.equal(eliteScout.bandStart, 6);
  assert.equal(eliteScout.bandEnd, 10);
  assert.equal(eliteScout.eliteFloor, 10);
  const expeditionScout = R.runScout({ ...expedition('scout-e'), battles: 9 }, db);
  assert.equal(expeditionScout.bandStart, 6);
  assert.equal(expeditionScout.eliteFloor, 10);
});

test('old saves without the new fields keep working', () => {
  const legacy = trial('legacy');
  delete legacy.contracts;
  delete legacy.bounty;
  assert.deepEqual(R.runContractModifiers(legacy), { speed: 0, rangedAtk: 0, regen: 0 });
  assert.ok(R.runScout(legacy, db).floors.length === 5);
  const settled = win(legacy);
  assert.equal(settled.phase, 'ready');
  assert.equal(settled.contracts, undefined);
});

test('store accepts the contract phase and the new optional fields', () => {
  const data = new Map(), storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  const store = new EndlessRunStore('C', { storage, currentOwner: () => 'C' });
  const run = { ...trial('store'), phase: 'contract', contracts: ['swift'], bounty: null, cleared: 10 };
  const battle = { ...run, phase: 'battle', attempt: 'x' };
  store.save(battle);
  assert.equal(store.read().runs.trial.phase, 'battle');
  const legacy = { ...trial('store-legacy'), phase: 'ready' };
  delete legacy.contracts; delete legacy.bounty;
  store.save(legacy);
  assert.equal(store.read().runs.trial.contracts, undefined);
});

test('real engine applies contract mechanics and exposes bounty stats', () => {
  const run = { ...trial('engine-contract'), contracts: ['swift', 'volley', 'mending'] };
  const { engine, contract } = createEndlessBattle(db, run);
  assert.deepEqual(contract, R.runContractModifiers(run));
  const plain = createEndlessBattle(db, trial('engine-plain')).engine;
  // 移速契约：只加敌方移动倍率。
  const enemy = engine.spawnSummon(3, 2, 8, 'enemy');
  const playerUnit = engine.spawnSummon(3, 2, 1, 'player');
  assert.ok(engine.getMoveSpeedMult(enemy) >= 1.2);
  assert.equal(engine.getMoveSpeedMult(playerUnit), 1);
  const plainEnemy = plain.spawnSummon(3, 2, 8, 'enemy');
  assert.equal(plain.getMoveSpeedMult(plainEnemy), 1);
  // 齐射契约：远程敌军攻击被放大（与不带契约的同一张卡对比）。
  const ranged = engine.spawnSummon(1, 3, 8, 'enemy');
  const plainRanged = plain.spawnSummon(1, 3, 8, 'enemy');
  assert.ok(ranged.isRanged() && plainRanged.isRanged());
  assert.ok(Math.abs(ranged.atk - plainRanged.atk * 1.18) < .05, `${ranged.atk} vs ${plainRanged.atk}`);
  // 复苏契约：敌方每 2 秒回血，玩家单位不回。
  enemy.hp = enemy.maxHp = 1000; enemy.hp = 200; playerUnit.hp = playerUnit.maxHp = 1000; playerUnit.hp = 200;
  engine.tick(2.1);
  assert.ok(enemy.hp > 200 && enemy.hp <= 1000);
  assert.equal(playerUnit.hp, 200);
  // 赏金统计：部署路数/卡种/基地伤害。
  assert.deepEqual(engine.endlessStats.lanes, []);
  assert.equal(typeof engine.endlessStats.baseDamage, 'number');
});

console.log(JSON.stringify({ passed }));
