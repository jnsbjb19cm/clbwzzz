import assert from 'node:assert/strict';

// Node verification does not play audio, but BattleSkillSystem imports the browser audio manager.
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

// Contract requested on 2026-09-06: 雷鳴之箭 resolves exactly 2 seconds after cast.
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

// 圣盾术 is truly instant: same resolveCast call must update allies, not wait for the next battle tick.
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

// 铁壳功 is also instant and protects the player base from damage during its duration.
{
  const engine = makeEngine();
  const skills = new BattleSkillSystem(engine, { getById: (id) => CARDS.get(Number(id)) ?? null });
  const cast = skills.resolveCast(547);
  assert.equal(cast.ok, true);
  assert.equal(engine.heroBaseInvulnerableUntil, 10, '铁壳功 should protect the player base immediately for 10 seconds');
  assert.equal(skills.pendingCasts.some((entry) => Number(entry.skillId) === 547), false, '铁壳功 must not wait in pending casts');

  BattleEngine.prototype.damageBase.call(engine, 'player', 50);
  assert.equal(engine.heroHp, 100, '铁壳功 should block player-base damage while active');

  engine.time = 10.001;
  BattleEngine.prototype.damageBase.call(engine, 'player', 50);
  assert.equal(engine.heroHp, 50, 'player base should take damage again after 铁壳功 expires');
}

console.log('PASS user request 20260906: skill timing semantics');
