import { CoopBossBattle } from './CoopBossBattle.js';
const { createEndlessBattle } = await import('../../src/battle/EndlessBattleAdapter.js');

// The normal multiplayer authority and snapshot protocol, with one owner and
// the finite endless encounter rules. No local client engine decides the result.
export class EndlessRoomBattle extends CoopBossBattle {
  constructor({ roomId, members, db, run, mapId }) {
    if (members.length !== 1) throw new Error('无尽挑战暂时仅支持单人');
    super({ roomId, members, db, mode: 'pve', stageId: 1, mapId });
    const prepared = createEndlessBattle(db, run);
    this.engine = prepared.engine;
    this.endless = run;
    this.ownerId = Number(members[0].userId);
    this.engine.__authorityBattle = this;
    this.engine.onBurrowReturn = unit => this.refundBurrowReturn(unit);
    const resource = { sun: this.engine.sunlight, food: this.engine.food };
    this.resources.set(this.ownerId, resource);
    // Both unit-generated resources and engine regen share one source of truth.
    for (const [field, key] of [['sunlight', 'sun'], ['food', 'food']]) {
      Object.defineProperty(this.engine, field, { configurable: true,
        get: () => resource[key], set: value => { resource[key] = value; } });
    }
    this.setSkillLoadout(this.ownerId, []);
  }
  setSkillLoadout(userId) { return super.setSkillLoadout(userId, [], 100); }
  setPlayerTalentBonus() { return {}; }
  castSkill() { throw new Error('本次无尽挑战不使用局外英雄技能'); }
  publicSkillState(userId) {
    return { ...super.publicSkillState(userId),
      deployCooldowns: Object.fromEntries(this.engine.deck.map((entry, i) => [String(entry.card.id), this.engine.cooldowns[i] || 0])),
      deploySlotCooldowns: [...this.engine.cooldowns] };
  }
  async deploy(userId, payload = {}) {
    if (Number(userId) !== this.ownerId || this.status !== 'playing') throw new Error('当前不能部署');
    if (this.deployPending) throw new Error('正在部署，请稍候');
    const index = Number(payload.handIndex), lane = Number(payload.lane), col = Number(payload.col);
    if (!Number.isInteger(index) || !this.engine.deck[index] || this.engine.deck[index].card.id !== Number(payload.cardId)
      || !Number.isInteger(lane) || lane < 0 || lane > 4 || !Number.isInteger(col) || col < 0 || col > 11) throw new Error('部署位置或本局卡槽无效');
    this.deployPending = true;
    const before = new Set(this.engine.units);
    try {
      if (!await this.engine.deploy(lane, col, index)) throw new Error(this.engine.lastDeployError || '冷却、资源或位置不允许部署');
      const units = this.engine.units.filter(unit => !before.has(unit) && unit.team === 'player');
      for (const unit of units) unit.pvpOwnerUserId = this.ownerId;
      return { unit: units[0] ? this.publicUnit(units[0]) : null, resources: this.publicResources(userId) };
    } finally { this.deployPending = false; }
  }
  tick(dt) {
    if (this.status !== 'playing') return;
    this.engine.tick(Math.max(0, Math.min(.2, Number(dt) || 0)));
    if (this.engine.status !== 'playing') {
      this.status = 'finished';
      this.winner = this.engine.status === 'win' ? 'blue' : 'red';
    }
  }
  pveSnapshot(now) {
    return { ...super.pveSnapshot(now), endless: {
      mode: this.endless.mode, attempt: this.endless.attempt, floor: this.endless.floor,
      result: this.status === 'finished' ? { attempt: this.endless.attempt, won: this.winner === 'blue',
        baseHp: this.engine.heroHp, bountyStats: this.engine.endlessStats } : null,
    } };
  }
}
