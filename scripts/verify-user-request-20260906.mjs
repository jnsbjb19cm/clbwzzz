import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.Audio = class {
  constructor() { this.paused = true; this.volume = 1; this.currentTime = 0; }
  cloneNode() { return new globalThis.Audio(); }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  addEventListener() {}
  removeEventListener() {}
};

const { getSkillResolutionDelay } = await import('../src/battle/SkillAnimationConfig.js');
const { BattleSkillSystem } = await import('../src/systems/BattleSkillSystem.js');
const { BattleEngine } = await import('../src/battle/BattleEngine.js');

function skillCard(id, name) {
  return {
    id,
    name,
    card_id: id,
    card_name: name,
    category: 2,
    card_category: 2,
    cost: 0,
    cooldown: 20,
  };
}

const CARDS = new Map([
  [518, skillCard(518, '圣盾术')],
  [527, skillCard(527, '雷鳴之箭!')],
  [547, skillCard(547, '铁壳功')],
]);

function makeEngine() {
  return {
    status: 'playing',
    trainingMode: true,
    heroMp: 100,
    heroMpMax: 100,
    heroHp: 100,
    heroMaxHp: 100,
    enemyHeroHp: 100,
    enemyHeroMaxHp: 100,
    time: 0,
    units: [],
    activeFields: [],
    skillTargetError: '',
    cancelPlacing() {},
    pushSkillEffect() {},
    pushLog() {},
    spawnFloat() {},
    onUnitDeath() {},
    getUnitGridCol(unit) { return Math.round(unit.col); },
    getUnitsAt(lane, col) {
      return this.units.filter((unit) => unit.alive && unit.lane === lane && Math.round(unit.col) === Math.round(col));
    },
    damageBase(side, amount) {
      return BattleEngine.prototype.damageBase.call(this, side, amount);
    },
  };
}

function makeUnit({ team, lane = 2, col = 4, hp = 200 } = {}) {
  return {
    team,
    lane,
    col,
    hp,
    maxHp: hp,
    alive: true,
    isBoss: false,
    pvpBoss: false,
    bossCommanderOnly: false,
    isLowTarget() { return false; },
    takeDamage(amount) {
      const applied = Math.min(this.hp, Math.max(0, Number(amount) || 0));
      this.hp -= applied;
      if (this.hp <= 0) this.alive = false;
      return applied;
    },
    heal(amount) {
      const before = this.hp;
      this.hp = Math.min(this.maxHp, this.hp + Math.max(0, Number(amount) || 0));
      return this.hp - before;
    },
  };
}

assert.equal(getSkillResolutionDelay(527), 2, '雷鳴之箭 should resolve exactly 2 seconds after release');

{
  const engine = makeEngine();
  const enemy = makeUnit({ team: 'enemy', lane: 1, col: 6, hp: 200 });
  engine.units.push(enemy);
  const skills = new BattleSkillSystem(engine, { getById: (id) => CARDS.get(Number(id)) ?? null });

  const cast = skills.resolveCast(527, { lane: 1, col: 6 });
  assert.equal(cast.ok, true);
  assert.equal(enemy.hp, 200, '雷鳴之箭 must not damage on cast');

  engine.time = 1.999;
  skills.tick(1.999);
  assert.equal(enemy.hp, 200, '雷鳴之箭 must still be pending before 2 seconds');

  engine.time = 2;
  skills.tick(0.001);
  assert.equal(enemy.hp, 80, '雷鳴之箭 should apply its 120 damage at 2 seconds');

  engine.time = 3;
  skills.tick(1);
  assert.equal(enemy.hp, 80, '雷鳴之箭 must resolve only once');
}

{
  const engine = makeEngine();
  const ally = makeUnit({ team: 'player', hp: 100 });
  engine.units.push(ally);
  const skills = new BattleSkillSystem(engine, { getById: (id) => CARDS.get(Number(id)) ?? null });
  const cast = skills.resolveCast(518);
  assert.equal(cast.ok, true);
  assert.equal(ally.invulnUntil, 10, '圣盾术 should become active immediately for 10 seconds');
  assert.equal(skills.pendingCasts.some((entry) => Number(entry.skillId) === 518), false, '圣盾术 must not wait in pending casts');
}

{
  const engine = makeEngine();
  const skills = new BattleSkillSystem(engine, { getById: (id) => CARDS.get(Number(id)) ?? null });
  const cast = skills.resolveCast(547);
  assert.equal(cast.ok, true);
  assert.equal(engine.heroBaseInvulnerableUntil, 10, '铁壳功 should protect the player base immediately for 10 seconds');
  assert.equal(skills.pendingCasts.some((entry) => Number(entry.skillId) === 547), false, '铁壳功 must not wait in pending casts');

  engine.damageBase('player', 50);
  assert.equal(engine.heroHp, 100, '铁壳功 should block player-base damage while active');

  engine.time = 10.001;
  engine.trainingMode = false;
  engine.damageBase('player', 50);
  assert.equal(engine.heroHp, 50, 'player base should take damage again after 铁壳功 expires');
}

{
  const memory = new Map();
  globalThis.localStorage = {
    getItem(key) { return memory.has(key) ? memory.get(key) : null; },
    setItem(key, value) { memory.set(key, String(value)); },
    removeItem(key) { memory.delete(key); },
  };

  const { installCardInventoryRemotePatch20260906 } = await import('../src/core/CardInventoryRemotePatch20260906.js');
  installCardInventoryRemotePatch20260906();
  const { CardInventoryStore } = await import('../src/core/CardInventoryStore.js');
  const fakeDb = {
    getById(id) {
      return {
        id: Number(id),
        quality: 1,
        isCollectible() { return true; },
        isInventoryCard() { return true; },
      };
    },
    getCollectibleCards() { return []; },
  };
  const store = new CardInventoryStore(fakeDb);

  assert.equal(typeof store.bindRemotePersistence, 'function', 'CardInventoryStore needs an authenticated remote persistence seam');
  assert.equal(typeof store.applyServerSnapshot, 'function', 'CardInventoryStore needs to restore authoritative server card state');
  assert.equal(typeof store.flushRemotePersistence, 'function', 'CardInventoryStore needs a deterministic way to flush queued remote saves');

  const pushed = [];
  store.bindRemotePersistence(async (payload) => { pushed.push(structuredClone(payload)); });
  store.state = {
    slotCount: 200,
    slots: Array.from({ length: 200 }, (_, index) => index === 0 ? {
      cardId: 23,
      star: 2,
      strengthLv: 2,
      craftQuality: 2,
      exp: 10,
      customName: null,
      awakened: false,
      attributeRoll: null,
      powderSpent: {},
    } : null),
  };

  assert.equal(store.updateSlot(0, {
    star: 5,
    strengthLv: 5,
    craftQuality: 4,
    exp: 345,
    customName: '飞鞋一号',
    awakened: true,
    attributeRoll: { atk: 12, hp: -3, cd: 7 },
    powderSpent: { 10001: 8, 10002: 4 },
  }), true);
  await store.flushRemotePersistence();

  assert.equal(pushed.length, 1, 'one local mutation should produce one authoritative card-library save');
  const saved = pushed[0].cards.find((card) => card.slotIndex === 0);
  assert.deepEqual(saved, {
    slotIndex: 0,
    cardId: 23,
    star: 5,
    craftQuality: 4,
    exp: 345,
    customName: '飞鞋一号',
    awakened: true,
    attributeRoll: { atk: 12, hp: -3, cd: 7 },
    powderSpent: { 10001: 8, 10002: 4 },
  });

  const reloaded = new CardInventoryStore(fakeDb);
  reloaded.applyServerSnapshot({ slotCount: 200, cards: [saved] });
  const restored = reloaded.getSlots()[0];
  assert.equal(restored.cardId, 23);
  assert.equal(restored.strengthLv, 5);
  assert.equal(restored.craftQuality, 4);
  assert.equal(restored.exp, 345);
  assert.equal(restored.customName, '飞鞋一号');
  assert.equal(restored.awakened, true);
  assert.deepEqual(restored.attributeRoll, { atk: 12, hp: -3, cd: 7 });
  assert.deepEqual(restored.powderSpent, { 10001: 8, 10002: 4 });

  const playerRouteSource = fs.readFileSync(new URL('../server/routes/player.js', import.meta.url), 'utf8');
  assert.match(
    playerRouteSource,
    /playerRouter\.put\(['"]\/card-inventory['"]/,
    'server must expose a normal authenticated card-inventory update endpoint',
  );
}

console.log('PASS user request 20260906: skill timing + authoritative card persistence');
