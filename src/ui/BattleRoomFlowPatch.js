import { BattleEngine } from '../battle/BattleEngine.js';
import { TRAINING_STAGE_VALUE } from '../battle/BattleConfig.js';
import { BattleView } from './BattleView.js';
import { DeckSelectView } from './DeckSelectView.js';
import { battleDeckGroup20260912, loadBattleDeckSlots20260911 } from './DeckGroupPreference20260911.js';
import { installRoomLifetimeClientPatch } from './RoomLifetimeClientPatch.js';

let installed = false;

export function installBattleRoomFlowPatch() {
  if (installed) return;
  installed = true;
  installRoomLifetimeClientPatch();

  const originalRender = BattleView.prototype.render;

  BattleView.prototype.render = function renderWithBossRoom(root) {
    if (!this.boss || this.phase !== 'deck-select') {
      return originalRender.call(this, root);
    }

    this.viewRoot = root;
    this.stopLoop();
    // 2026-09-11：按玩家选中的卡组取卡组（无参调用会落到默认组）。
    this.deckSlots = loadBattleDeckSlots20260911(this.cardInventory, this.db);

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

    // 这副牌属于哪一组，跟牌一起带进来
    this.deckGroup = battleDeckGroup20260912(this, options?.deckGroup ?? null);
    if (this.cardInventory) this.cardInventory.__activeDeckGroup20260907 = this.deckGroup;
    // 训练营（尤其是剧情教程的 6 张临时卡）绝不能覆盖玩家保存的正式战团。
    if (!trainingMode) {
      DeckSelectView.saveDeck(deckSlots, this.cardInventory, this.deckGroup);
    }

    this.phase = 'fighting';
    this.engine = new BattleEngine(this.db, stageId, deckSlots, this.cardInventory, {
      skillLoadout: this.heroSkills?.getLoadout() ?? [],
      heroMpMax: this.heroSkills?.getMpMax() ?? 100,
      trainingMode,
      trainingFreeRes: this.trainingFreeRes,
      boss,
      pvp: Boolean(this.pvp),
      talentBonus: this.talentBonusForBattle?.() ?? null,
    });
    await this.renderBattle(this.viewRoot);
  };
}
