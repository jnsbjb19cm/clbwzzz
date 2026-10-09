import { WAVE_FIRST_DELAY, WAVE_INTERVAL, getAttackCooldown } from './BattleConfig.js';
import { buildEnemyStageRoster } from './EnemyStageRoster.js';
import { adventureWaveTemplate } from '../data/AdventureCampaign.js';
import { adventureWaveInterval } from '../data/AdventureStageDesign.js';

export class WaveManager {
  constructor(stage, db, { trainingMode = false, randomMode = false } = {}) {
    this.stage = stage;
    this.db = db;
    this.trainingMode = trainingMode;
    this.elapsed = 0;
    if (trainingMode) {
      this.queue = [];
      this.done = true;
      this.totalWaves = 0;
      this.nextWaveHint = 0;
      return;
    }

    this.stageId = stage.stage_id ?? 1;
    this.adventureTemplate = adventureWaveTemplate(stage);
    this.adventureCycle = 0;
    if (this.adventureTemplate) {
      this.queue = [];
      this.done = false;
      this.totalWaves = Infinity;
      this.waveCount = 0;
      this.nextBuildTime = WAVE_FIRST_DELAY;
      this.appendAdventureCycle();
      this.nextWaveHint = WAVE_FIRST_DELAY;
      return;
    }
    this.roster = buildEnemyStageRoster(stage, db, { randomMode });
    this.attackers = this.roster.filter((entry) => !entry.defense);
    this.defenses = this.roster.filter((entry) => entry.defense);
    this.boss = db.getById(stage.enemy_res) ?? db.getById(5);
    this.queue = this.buildQueue();
    this.done = false;
    this.totalWaves = Infinity;
    this.nextWaveHint = WAVE_FIRST_DELAY;
    this.waveCount = 9;
  }

  buildQueue() {
    const waves = [];
    let time = WAVE_FIRST_DELAY;

    // Enemy planting: all selected defensive types are placed at their configured columns.
    for (let index = 0; index < Math.min(6, this.defenses.length); index++) {
      const entry = this.defenses[index];
      waves.push({
        // Defensive planting is a setup sequence, not a stack of simultaneous spawns.
        time: time + index * 0.7,
        isWaveStart: false,
        waveIndex: 0,
        count: Math.min(4, entry.count),
        card: entry.card,
        isBoss: false,
        isDefense: true,
        col: entry.col,
      });
    }
    // Leave a clear breathing room after the setup before wave 1 arrives.
    time += Math.min(8, Math.max(5, Math.min(6, this.defenses.length) * 0.7 + 5));

    const attackPool = this.attackers.length ? this.attackers : this.roster;
    for (let waveIndex = 1; waveIndex <= 8; waveIndex++) {
      const entry = attackPool[(waveIndex - 1) % attackPool.length];
      const rarityCap = (entry.card.quality ?? 1) >= 5 ? 2 : 5;
      waves.push({
        time,
        isWaveStart: true,
        waveIndex,
        count: Math.min(rarityCap, entry.count ?? 1),
        card: entry.card,
        isBoss: false,
        col: entry.col,
      });
      time += WAVE_INTERVAL;
    }

    if (!this.stage.adventure) waves.push({
      time: time + 4,
      isWaveStart: true,
      waveIndex: 9,
      card: this.boss,
      isBoss: true,
      count: 1,
      lane: 2,
      col: 11,
    });
    this.nextBuildTime = time + WAVE_INTERVAL + 4;
    return waves;
  }

  appendWaves() {
    let time = this.nextBuildTime;
    const newWaves = [];

    // Replant defensive cards every cycle so the enemy maintains a formation.
    // 每轮补充多个防御类型；第 1 个固定为前排肉盾(defenses[0]，如核桃卫兵)，
    // 其余轮流补充，确保被消灭的不可移动卡能重新摆上。
    const defenseCount = Math.min(3, this.defenses.length);
    for (let d = 0; d < defenseCount; d++) {
      const defense = d === 0
        ? this.defenses[0]
        : this.defenses[(this.waveCount + d) % this.defenses.length];
      newWaves.push({
        time,
        isWaveStart: false,
        waveIndex: this.waveCount,
        card: defense.card,
        isBoss: false,
        isDefense: true,
        count: Math.min(3, defense.count ?? 1),
        col: defense.col,
      });
      time += 1.2;
    }
    time += 5;

    if (this.waveCount % 5 === 0 && !this.stage.adventure) {
      newWaves.push({
        time,
        isWaveStart: true,
        waveIndex: this.waveCount + 1,
        card: this.boss,
        isBoss: true,
        count: 1,
        lane: 2,
        col: 11,
      });
      time += WAVE_INTERVAL + 2;
      this.waveCount++;
    }

    const attackPool = this.attackers.length ? this.attackers : this.roster;
    for (let i = 0; i < 5; i++) {
      this.waveCount++;
      const entry = attackPool[this.waveCount % attackPool.length];
      const rarityCap = (entry.card.quality ?? 1) >= 5 ? 3 : 5;
      newWaves.push({
        time,
        isWaveStart: true,
        waveIndex: this.waveCount,
        count: Math.min(rarityCap, entry.count ?? 1),
        card: entry.card,
        isBoss: false,
        col: entry.col,
      });
      time += WAVE_INTERVAL;
    }

    this.nextBuildTime = time;
    this.queue.push(...newWaves);
    this.queue.sort((a, b) => a.time - b.time);
  }

  appendAdventureCycle() {
    // 2026-10-09：2-4 / 3-4 波次稍微延后（关卡级覆盖，其它关仍是 WAVE_INTERVAL）
    const interval = adventureWaveInterval(this.stage) ?? WAVE_INTERVAL;
    for (const [index, entries] of this.adventureTemplate.entries()) {
      const dps = (id) => { const c = this.db.getById(id); return (c?.atk || 0) / getAttackCooldown(c?.atkSpeed || 0); };
      const referenceDps = entries.reduce((sum, [id,,, reference]) => sum + dps(reference ?? id), 0);
      const actualDps = entries.reduce((sum, [id]) => sum + dps(id), 0);
      const attackScale = actualDps > 0 ? referenceDps / actualDps : 1;
      entries.forEach(([cardId, row, column, referenceCardId], entryIndex) => {
        const card = this.db.getById(cardId);
        if (!card) throw new Error(`Missing adventure card ${cardId}`);
        this.queue.push({ time: this.nextBuildTime + index * interval, card,
          count: 1, lane: row - 1, col: column + 6, isBoss: false,
          referenceCardId, adventureAttackScale: referenceCardId ? attackScale : 1,
          isWaveStart: entryIndex === 0, waveIndex: this.adventureCycle * 5 + index + 1 });
      });
    }
    this.adventureCycle++;
    this.waveCount = this.adventureCycle * 5;
    this.nextBuildTime += 5 * interval;
  }

  tick(dt, onSpawn) {
    if (this.done) return;
    this.elapsed += dt;
    if (this.adventureTemplate) {
      while (this.nextBuildTime <= this.elapsed || this.queue.length === 0) this.appendAdventureCycle();
      while (this.queue.length && this.queue[0].time <= this.elapsed) onSpawn({ ...this.queue.shift() });
      this.nextWaveHint = Math.max(0, (this.queue[0]?.time ?? this.nextBuildTime) - this.elapsed);
      return;
    }
    if (!this.trainingMode && this.queue.length < 3 && this.waveCount < 25) this.appendWaves();
    const upcoming = this.queue.find((wave) => wave.time > this.elapsed);
    this.nextWaveHint = upcoming ? upcoming.time - this.elapsed : 0;
    while (this.queue.length && this.queue[0].time <= this.elapsed) {
      onSpawn({ ...this.queue.shift() });
    }
    // Mark done when queue empty and wave limit reached
    if (this.queue.length === 0 && this.waveCount >= 25) {
      this.done = true;
    }
  }
}
