export const CRAFT_STATE_STORAGE_KEY = 'clbwz_craft_state_v1';
const STORAGE_KEY = CRAFT_STATE_STORAGE_KEY;

export class CraftStateStore {
  constructor() {
    this.state = this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return {
            ...parsed,
            pity:
              parsed.pity && typeof parsed.pity === 'object' && !Array.isArray(parsed.pity)
                ? parsed.pity
                : {},
          };
        }
      }
    } catch {
      /* ignore */
    }
    return { pity: {} };
  }

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
  }

  hasPity(cardId) {
    return !!this.state.pity[Number(cardId)];
  }

  setPity(cardId) {
    this.state.pity[Number(cardId)] = true;
    this.save();
  }

  clearPity(cardId) {
    delete this.state.pity[Number(cardId)];
    this.save();
  }
}
