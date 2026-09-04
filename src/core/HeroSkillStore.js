import { DEFAULT_SKILL_LOADOUT, SKILL_SLOT_COUNT } from './SkillRegistry.js';
import {
  TALENT_NODE_MAP,
  TALENT_NODES,
  TALENT_SKILL_IDS,
  getTalentPointBudget,
} from './TalentRegistry.js';

const STORAGE_KEY = 'clbwz_hero_skills_v1';

function normalizeLoadout(slots) {
  if (!Array.isArray(slots)) return [...DEFAULT_SKILL_LOADOUT];
  const out = Array(SKILL_SLOT_COUNT).fill(null);
  for (let i = 0; i < SKILL_SLOT_COUNT; i++) {
    if (i >= slots.length) {
      out[i] = DEFAULT_SKILL_LOADOUT[i] ?? null;
      continue;
    }
    const id = Number(slots[i]);
    out[i] = Number.isInteger(id) && id > 0 ? id : null;
  }
  return out;
}

export class HeroSkillStore {
  constructor(cardDb) {
    this.cardDb = cardDb;
    const state = this.load();
    this.unlockedTalents = new Set(state.unlockedTalents);
    this.consumedExtra = Number(state.consumedExtra) || 0;
    this.loadout = state.loadout.map((skillId) => (
      skillId == null || this.isSkillUnlocked(skillId) ? skillId : null
    ));
    for (const defaultSkill of DEFAULT_SKILL_LOADOUT.filter(Boolean)) {
      if (this.loadout.includes(defaultSkill)) continue;
      const empty = this.loadout.indexOf(null);
      if (empty >= 0) this.loadout[empty] = defaultSkill;
    }
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const unlocked = Array.isArray(parsed.unlockedTalents)
          ? parsed.unlockedTalents.filter((id) => TALENT_NODE_MAP.has(id))
          : ['core'];
        if (!unlocked.includes('core')) unlocked.unshift('core');
        return {
          loadout: normalizeLoadout(parsed.loadout),
          unlockedTalents: unlocked,
        };
      }
    } catch {
      /* ignore invalid local save */
    }
    return {
      loadout: [...DEFAULT_SKILL_LOADOUT],
      unlockedTalents: ['core'],
    };
  }

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      loadout: this.loadout,
      unlockedTalents: [...this.unlockedTalents],
      consumedExtra: this.consumedExtra ?? 0,
    }));
  }

  getLoadout() {
    return [...this.loadout];
  }

  setSlot(index, skillId) {
    const i = Number(index);
    if (!Number.isInteger(i) || i < 0 || i >= SKILL_SLOT_COUNT) return false;
    const id = skillId ? Number(skillId) : null;
    if (id != null && (!Number.isInteger(id) || id <= 0)) return false;
    if (id != null && !this.isSkillUnlocked(id)) return false;
    this.loadout[i] = id;
    this.save();
    return true;
  }

  reset() {
    this.loadout = [...DEFAULT_SKILL_LOADOUT];
    this.save();
  }

  getSkillCards() {
    return this.cardDb.cards
      .filter((card) => card.isActiveSkill() && card.id >= 500 && card.id < 600)
      .sort((a, b) => a.id - b.id);
  }

  getUnlockedTalents() {
    return [...this.unlockedTalents];
  }

  isTalentUnlocked(nodeId) {
    return this.unlockedTalents.has(nodeId);
  }

  getSpentTalentPoints() {
    return TALENT_NODES.reduce(
      (sum, node) => sum + (this.unlockedTalents.has(node.id) ? Number(node.cost || 0) : 0),
      0,
    );
  }

  getAvailableTalentPoints(playerLevel, extraTalentPoints = 0) {
    return Math.max(0, getTalentPointBudget(playerLevel) - this.getSpentTalentPoints() + (extraTalentPoints || 0));
  }

  canUnlockTalent(nodeId, playerLevel, extraTalentPoints = 0) {
    const node = TALENT_NODE_MAP.get(nodeId);
    if (!node || this.unlockedTalents.has(nodeId)) return false;
    if (this.getAvailableTalentPoints(playerLevel, extraTalentPoints) < Number(node.cost || 0)) return false;
    return node.prerequisites.every((id) => this.unlockedTalents.has(id));
  }

  unlockTalent(nodeId, playerLevel, extraTalentPointsRef) {
    const extra = extraTalentPointsRef?.value || 0;
    if (!this.canUnlockTalent(nodeId, playerLevel, extra)) return false;
    // Consume extra points first
    if (extraTalentPointsRef && extra > 0) {
      const budget = getTalentPointBudget(playerLevel);
      const spent = this.getSpentTalentPoints();
      const regular = budget - spent;
      const needed = Number(TALENT_NODE_MAP.get(nodeId).cost || 0);
      const fromExtra = Math.min(extra, Math.max(0, needed - regular));
      extraTalentPointsRef.value = Math.max(0, extra - fromExtra);
      this.consumedExtra = (this.consumedExtra || 0) + fromExtra;
    }
    this.unlockedTalents.add(nodeId);
    this.save();
    return true;
  }

  resetTalents() {
    const refund = this.consumedExtra || 0;
    this.unlockedTalents = new Set(['core']);
    this.loadout = [...DEFAULT_SKILL_LOADOUT];
    this.consumedExtra = 0;
    this.save();
    return refund;
  }

  isSkillUnlocked(skillId) {
    const id = Number(skillId);
    if (!TALENT_SKILL_IDS.has(id)) return true;
    return TALENT_NODES.some(
      (node) => node.skillId === id && this.unlockedTalents.has(node.id),
    );
  }

  getHpBonus() {
    return TALENT_NODES.reduce(
      (sum, node) => sum + (this.unlockedTalents.has(node.id) ? Number(node.hpBonus || 0) : 0),
      0,
    );
  }

  getMpMax() {
    return 100 + TALENT_NODES.reduce(
      (sum, node) => sum + (this.unlockedTalents.has(node.id) ? Number(node.mpBonus || 0) : 0),
      0,
    );
  }
}
