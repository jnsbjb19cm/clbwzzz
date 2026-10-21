import { BattleEngine } from './BattleEngine.js';
import { buildEndlessEncounter, runModifiers, runContractModifiers } from '../data/EndlessAdventureRules.js';

// Only a run-local engine and copied card instances are changed.
export function createEndlessBattle(db, run) {
  const slots = run.roster.map(card => ({ ...card }));
  const inventory = { getSlots: () => slots, findFirstInstance: id => { const index = slots.findIndex(c => c.cardId === id); return index < 0 ? null : { index, slot: slots[index] }; } };
  const indices = run.deck.map(uid => slots.findIndex(c => c.uid === uid));
  if (indices.some(i => i < 0 || !db.getById(slots[i].cardId)?.isCollectible?.())) throw new Error('本局上阵卡牌无效');
  const encounter = buildEndlessEncounter(run, db), bonus = runModifiers(run), contract = runContractModifiers(run);
  const engine = new BattleEngine(db, db.stages[0].stage_id, indices, inventory, {
    lootEnabled: false, talentBonus: { hp: 0, mp: 0, atkPct: 0, hpPct: 0 }, skillLoadout: [], heroMpMax: 100,
  });
  engine.stage = { ...db.stages[0], adventure: undefined, endless: { mode: run.mode, floor: encounter.floor, scene: 'grass' },
    stage_id: run.mode === 'trial' ? -20001 : -20002, id: run.mode === 'trial' ? -20001 : -20002,
    stage_name: encounter.title, enemy_name: encounter.title, map_id: encounter.mapId, reward: '' };
  engine.units = []; engine.lootDrops = []; engine.lootEnabled = false;
  engine.heroMaxHp = run.baseMaxHp; engine.heroHp = run.baseHp;
  engine.enemyHeroMaxHp = engine.enemyHeroHp = encounter.enemyBaseHp;
  engine.sunlight += bonus.resource; engine.food += bonus.resource;
  // Cards are cloned so changes cannot leak to the shared CardDatabase or bag.
  engine.deck = engine.deck.map(entry => ({ ...entry, card: Object.assign(Object.create(Object.getPrototypeOf(entry.card)), entry.card,
    { atk: entry.card.atk * bonus.atk, hp: entry.card.hp * bonus.hp }) }));
  // 第二批：十层契约只改敌方机制。这里在真实引擎上包一层，不改基础攻击/生命成长。
  engine.endlessContract = contract;
  // 赏金统计：部署路数 / 用到的卡种 / 己方基地受到的伤害。
  const stats = { lanes: [], cardIds: [], baseDamage: 0 };
  engine.endlessStats = stats;
  const applyEnemyContract = unit => {
    if (!unit || unit.team !== 'enemy') return;
    if (contract.rangedAtk > 0 && unit.isRanged?.()) {
      unit.atk = Math.round(unit.atk * (1 + contract.rangedAtk) * 100) / 100;
    }
  };
  const deploy = engine.deploy.bind(engine);
  engine.deploy = async (lane, col, handIndex = engine.selectedHandIndex) => {
    const placed = await deploy(lane, col, handIndex);
    if (placed) {
      if (!stats.lanes.includes(lane)) stats.lanes.push(lane);
      const cardId = Number(engine.deck[handIndex]?.card?.id);
      if (Number.isFinite(cardId) && !stats.cardIds.includes(cardId)) stats.cardIds.push(cardId);
    }
    return placed;
  };
  const damageBase = engine.damageBase.bind(engine);
  engine.damageBase = (side, amount, ...args) => {
    const applied = damageBase(side, amount, ...args);
    // 只统计真正打到基地的伤害：减免到 0 或基地已破不算「损失生命」。
    if (side === 'player') stats.baseDamage += Math.max(0, Number(applied) || 0);
    return applied;
  };
  if (contract.speed > 0) {
    const moveMult = engine.getMoveSpeedMult.bind(engine);
    engine.getMoveSpeedMult = unit => moveMult(unit) * (unit?.team === 'enemy' ? 1 + contract.speed : 1);
  }
  let cursor = 0, elapsed = 0, nextSpawn = 6;
  const summon = engine.spawnSummon.bind(engine);
  engine.spawnSummon = (cardId, lane, col, team, ...args) => {
    if (team === 'enemy' && engine.units.filter(u => u.alive && u.team === 'enemy').length >= encounter.aliveCap) return null;
    const unit = summon(cardId, lane, col, team, ...args);
    applyEnemyContract(unit);
    return unit;
  };
  engine.totalWaves = Math.ceil(encounter.total / 6);
  engine.wave = { totalWaves: engine.totalWaves, done: false, queue: encounter.roster, nextWaveHint: nextSpawn,
    tick(dt) {
      elapsed += dt;
      if (cursor >= encounter.roster.length) { this.done = true; return; }
      if (elapsed < nextSpawn || engine.units.filter(u => u.alive && u.team === 'enemy').length >= encounter.aliveCap) return;
      const planned = encounter.roster[cursor], card = db.getById(planned.cardId), before = engine.units.length;
      let placed = false;
      for (let laneOffset = 0; laneOffset < 5 && !placed; laneOffset++) placed = engine.placeEnemyUnit(card, (planned.lane + laneOffset) % 5, false, planned.col);
      nextSpawn = elapsed + (placed ? 1.1 : .5); this.nextWaveHint = nextSpawn;
      if (!placed) return; // Retry blocked spawns; never silently drop enemies.
      for (const unit of engine.units.slice(before)) {
        unit.atk = Math.round(unit.atk * encounter.atkScale * 100) / 100;
        unit.hp = unit.maxHp = unit.baseMaxHp = Math.max(1, Math.round(unit.maxHp * encounter.hpScale * 100) / 100);
        applyEnemyContract(unit);
      }
      cursor++; engine.waveNumber = Math.ceil(cursor / 6);
      this.queue = encounter.roster.slice(cursor); this.done = cursor === encounter.roster.length;
    },
  };
  // 复苏之约：敌方每 2 秒回复 1.5% 最大生命（只回血，不复活）。
  if (contract.regen > 0) {
    const tick = engine.tick.bind(engine);
    let regenClock = 0;
    engine.tick = dt => {
      tick(dt);
      if (engine.status !== 'playing') return;
      regenClock += Math.max(0, Number(dt) || 0);
      while (regenClock >= 2) {
        regenClock -= 2;
        for (const unit of engine.units) {
          if (!unit.alive || unit.team !== 'enemy' || !(unit.hp > 0) || unit.hp >= unit.maxHp) continue;
          unit.hp = Math.min(unit.maxHp, unit.hp + unit.maxHp * contract.regen);
        }
      }
    };
  }
  const normalCheck = engine.checkEnd.bind(engine);
  engine.checkEnd = () => {
    normalCheck(); if (engine.status !== 'playing') return;
    if (engine.wave.done && !engine.units.some(u => u.alive && u.team === 'enemy')) { engine.status = 'win'; engine.pushLog('本层敌军已全部清除'); }
    else if (engine.time >= encounter.durationLimit) { engine.status = 'lose'; engine.pushLog('本层挑战超时（7 分钟）'); }
  };
  const sprites = engine.getBattleSpriteRes.bind(engine);
  engine.getBattleSpriteRes = () => { const set = sprites(); for (const row of encounter.roster) set.add(String(db.getById(row.cardId).spriteRes)); return set; };
  return { engine, inventory, indices, encounter, contract };
}
