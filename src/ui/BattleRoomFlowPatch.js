import { BattleEngine } from '../battle/BattleEngine.js';
import { TRAINING_STAGE_VALUE } from '../battle/BattleConfig.js';
import { BattleView } from './BattleView.js';
import { DeckSelectView } from './DeckSelectView.js';

let installed = false;

export function installBattleRoomFlowPatch() {
  if (installed) return;
  installed = true;

  const originalRender = BattleView.prototype.render;

  BattleView.prototype.render = function renderWithBossRoom(root) {
    if (!this.boss || this.phase !== 'deck-select') {
      return originalRender.call(this, root);
    }

    this.viewRoot = root;
    this.stopLoop();
    this.deckSlots =
      DeckSelectView.loadSavedDeck(this.cardInventory, this.db) ??
      DeckSelectView.defaultDeckSlots(this.cardInventory, this.db);

    this.deckSelect.render(root, {
      db: this.db,
      cardInventory: this.cardInventory,
      deckSlots: this.deckSlots,
      stageId: this.trainingMode ? TRAINING_STAGE_VALUE : this.stageId,
      stages: this.db.stages.slice(0, 20),
      mode: 'boss',
      onConfirm: async (slots, stageId, options = {}) => {
        await this.enterBattle(slots, stageId, { ...options, boss: this.boss });
      },
      onBack: () => this.onNavigate?.('main'),
    });
  };

  BattleView.prototype.enterBattle = async function enterServerReadyBattle(
    deckSlots,
    stageId,
    options = {},
  ) {
    const { trainingMode = false, boss = this.boss ?? null } = options;
    this.deckSlots = deckSlots;
    this.stageId = stageId;
    this.trainingMode = trainingMode;
    DeckSelectView.saveDeck(deckSlots, this.cardInventory);
    this.phase = 'fighting';
    this.engine = new BattleEngine(this.db, stageId, deckSlots, this.cardInventory, {
      skillLoadout: this.heroSkills?.getLoadout() ?? [],
      heroMpMax: this.heroSkills?.getMpMax() ?? 100,
      trainingMode,
      boss,
    });
    await this.renderBattle(this.viewRoot);
  };
}
