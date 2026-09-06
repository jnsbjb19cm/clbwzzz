import assert from 'node:assert/strict';

// Headless browser shims shared by client/server battle modules.
globalThis.Audio = class {
  play() { return Promise.resolve(); }
  pause() {}
  addEventListener() {}
  cloneNode() { return this; }
  load() {}
};
globalThis.window = globalThis;
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};
globalThis.Image = class {
  addEventListener() {}
  set src(_value) {}
};
globalThis.fetch = async () => ({ ok: false, json: async () => null });
globalThis.document = {
  hidden: false,
  createElement: () => ({
    width: 1,
    height: 1,
    getContext: () => ({
      clearRect() {},
      drawImage() {},
      fillRect() {},
    }),
    addEventListener() {},
  }),
  addEventListener() {},
  removeEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
};
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { userAgent: 'node' },
});

const { BattleEngine } = await import('../src/battle/BattleEngine.js');
const { BattleUnit } = await import('../src/battle/BattleUnit.js');
const { unitAnimPlayer } = await import('../src/battle/UnitAnimPlayer.js');
const { installBattleMeleeContactFinal } = await import('../src/battle/BattleMeleeContactFinal.js');
const { PvpBattle } = await import('../server/battle/PvpBattle.js');
const { CoopBossBattle } = await import('../server/battle/CoopBossBattle.js');

function makeCard(id, overrides = {}) {
  return {
    id,
    name: `测试卡${id}`,
    spriteRes: id,
    atk: 20,
    hp: 120,
    cooldown: 8,
    atkSpeed: 6,
    moveSpeed: 2,
    atkStyle: 7,
    viewType: 2,
    quality: 2,
    type: 1,
    cost: 1,
    card_category: 0,
    atk_rate: 1,
    ...overrides,
  };
}

const meleeCard = makeCard(9001);
const targetCard = makeCard(9002, {
  atk: 0,
  atkSpeed: 0,
  moveSpeed: 0,
  atkStyle: 1,
  viewType: 3,
  type: 2,
});
const starterOne = makeCard(1, { moveSpeed: 0, atkStyle: 2, viewType: 1 });
const starterTwo = makeCard(2, { moveSpeed: 0, atkStyle: 1, viewType: 3, type: 2 });
const bossCard = makeCard(75, { moveSpeed: 0, atkStyle: 2, viewType: 1, hp: 5000 });
const cards = new Map([meleeCard, targetCard, starterOne, starterTwo, bossCard].map((card) => [card.id, card]));
const stage = {
  stage_id: 1,
  stage_name: '回归测试',
  map_id: 1,
  stage_num: 1,
  enemy_res: 75,
  hp: 100,
};
const db = {
  stages: [stage],
  getById(id) { return cards.get(Number(id)) ?? null; },
};

// Seam 1: PVE public combat path. A one-cell melee target must be attackable.
installBattleMeleeContactFinal();
const engine = new BattleEngine(db, 1, [], null, { trainingMode: true });
engine.time = 10;
engine.spawnFloat = () => {};
engine.pushLog = () => {};
engine.resolveMeleeImpact = (_attacker, target, damage) => target.takeDamage(damage, engine.time);
unitAnimPlayer.triggerAttack = () => true;
unitAnimPlayer.resolveAttackDuration = () => 0.1;

const attacker = new BattleUnit({ card: meleeCard, lane: 2, col: 3.0, team: 'player' });
const defender = new BattleUnit({ card: targetCard, lane: 2, col: 3.8, team: 'enemy' });
attacker.atkTimer = 0;
engine.units = [attacker, defender];
const defenderHpBefore = defender.hp;
assert.equal(
  engine.tryAttack(attacker),
  true,
  'PVE movable melee must attack a valid enemy within its one-cell melee range',
);
assert.ok(
  defender.hp < defenderHpBefore,
  'PVE movable melee attack must resolve damage instead of being blocked by a narrower contact-only gate',
);

// Seam 2: authoritative PVP deployment must preserve the real star level.
const pvp = new PvpBattle({
  roomId: 1,
  mapId: 1,
  teamBlue: [{ userId: 101, nickname: '蓝方' }],
  teamRed: [{ userId: 202, nickname: '红方' }],
  db,
});
const pvpDeploy = pvp.deploy(101, {
  cardId: meleeCard.id,
  lane: 0,
  col: 0,
  craftQuality: 5,
  strengthLv: 12,
  star: 12,
});
assert.equal(
  pvpDeploy.unit.strengthLv,
  12,
  'PVP authoritative deploy must not clamp 8+ star cards back to 6/7 stars',
);

// Seam 3: authoritative co-op BOSS deployment must preserve the same star level.
const boss = new CoopBossBattle({
  roomId: 2,
  members: [{ userId: 303, nickname: '玩家' }],
  db,
  bossId: 'boss_dot',
  difficulty: '简单',
});
const bossDeploy = boss.deploy(303, {
  cardId: meleeCard.id,
  lane: 0,
  col: 0,
  craftQuality: 5,
  strengthLv: 12,
  star: 12,
});
assert.equal(
  bossDeploy.unit.strengthLv,
  12,
  'BOSS authoritative deploy must preserve 8+ star cards exactly like normal PVE',
);

console.log('Battle sync regression: OK');
