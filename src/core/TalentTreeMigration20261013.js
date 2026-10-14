import { TALENT_TREE_REVISION, TALENT_SKILL_IDS } from './TalentRegistry.js';
import { DEFAULT_SKILL_LOADOUT } from './SkillRegistry.js';

// Regular points are returned by clearing spent nodes. Previously consumed extra
// points stay in this document so the refund is atomic and account-scoped.
export function migrateTalentState(state = {}) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) state = {};
  if (Number(state.talentRevision) >= TALENT_TREE_REVISION) return state;
  return {
    ...state,
    talentRevision: TALENT_TREE_REVISION,
    previousTalents: Array.isArray(state.unlockedTalents) ? [...state.unlockedTalents] : [],
    talentPointCredit: Math.max(0, Number(state.talentPointCredit) || 0) + Math.max(0, Number(state.consumedExtra) || 0),
    consumedExtra: 0,
    unlockedTalents: ['core'],
    loadout: DEFAULT_SKILL_LOADOUT.map(id => TALENT_SKILL_IDS.has(id) ? null : id),
  };
}
