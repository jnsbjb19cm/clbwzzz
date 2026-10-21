import { ENDLESS_VERSION } from '../data/EndlessAdventureRules.js';
const BASE = 'clbwz_endless_runs_v1';
const PHASES = new Set(['ready', 'route', 'event', 'camp', 'contract', 'battle', 'ended']);
const empty = owner => ({ version: ENDLESS_VERSION, owner, runs: {}, best: {} });
export class EndlessRunStore {
  constructor(owner, { storage = globalThis.localStorage, currentOwner = () => owner } = {}) {
    this.owner = String(owner || ''); this.storage = storage; this.currentOwner = currentOwner;
    if (!this.owner) throw new Error('请先登录后开始挑战');
    this.key = `${BASE}#u${this.owner}`;
  }
  assertOwner() { if (String(this.currentOwner() || '') !== this.owner) throw new Error('账号已切换，请重新进入挑战'); }
  read() {
    this.assertOwner();
    const text = this.storage.getItem(this.key);
    if (!text) return empty(this.owner);
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('本机挑战存档损坏，请先备份后清理该模式存档'); }
    if (!data || data.version !== ENDLESS_VERSION || data.owner !== this.owner) throw new Error('挑战存档版本或所属账号不符');
    if (!data.runs || typeof data.runs !== 'object' || Array.isArray(data.runs) || !data.best || typeof data.best !== 'object' || Array.isArray(data.best)) throw new Error('挑战存档不完整，未加载');
    for (const run of Object.values(data.runs || {})) {
      if (!run || !PHASES.has(run.phase) || !Array.isArray(run.deck) || !Array.isArray(run.roster)
        || !Array.isArray(run.items) || !Array.isArray(run.journal) || run.roster.length > 60 || run.items.length > 12
        || !run.deck.length || run.deck.length > 10 || !Number.isFinite(run.baseHp)
        || !Number.isFinite(run.gold) || run.gold < 0 || !Number.isInteger(run.step) || run.step < 1
        || !['trial', 'expedition'].includes(run.mode) || !Number.isInteger(run.floor) || run.floor < 1
        || !Number.isInteger(run.battles) || run.battles < 0 || !Number.isInteger(run.cleared) || run.cleared < 0
        || !Number.isFinite(run.baseMaxHp) || run.baseMaxHp <= 0 || run.baseHp < 0 || run.baseHp > run.baseMaxHp
        || new Set(run.deck).size !== run.deck.length || new Set(run.roster.map(c => c?.uid)).size !== run.roster.length
        || run.roster.some(c => !c || !c.uid || !Number.isInteger(c.cardId))
        // 第二批字段：旧存档没有它们，按空值兼容；有就做基本形状校验。
        || (run.contracts !== undefined && (!Array.isArray(run.contracts) || run.contracts.length > 24 || run.contracts.some(id => typeof id !== 'string')))
        || (run.bounty !== undefined && run.bounty !== null && typeof run.bounty !== 'string')
        || (run.phase === 'event' && !['reward','neutral','negative','shop'].includes(run.event?.kind))
        || run.deck.some(uid => !run.roster.some(c => c.uid === uid))) throw new Error('挑战存档不完整，未加载');
    }
    return data;
  }
  save(run) {
    this.assertOwner(); const data = this.read();
    data.runs[run.mode] = run;
    const key = `${run.mode}:${run.source === 'owned' ? 'owned' : 'standard'}`;
    data.best[key] = Math.max(data.best[key] || 0, run.cleared);
    this.storage.setItem(this.key, JSON.stringify(data));
    return run;
  }
}
