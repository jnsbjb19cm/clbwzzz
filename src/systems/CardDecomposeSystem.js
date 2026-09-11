import craftRules from '../data/craftRules.json';

const DECK_KEY = 'battle_deck_ids';

/** 5 级强化粉：品质 5 及以上的卡牌分解只返还它，不再产 5 级羊皮纸/宝石/碎片。 */
export const LEVEL5_POWDER_ITEM_ID = 10005;
const LEVEL5_POWDER_QUALITY = 5;

function cardQuality(card) {
  return Math.max(1, Math.min(5, Math.trunc(Number(card?.quality) || 1)));
}

export class CardDecomposeSystem {
  constructor(db, materialRegistry) {
    this.db = db;
    this.materials = materialRegistry;
    this.rules = craftRules.decomposeBase;
  }

  getDeckIds() {
    try {
      const raw = localStorage.getItem(DECK_KEY);
      if (!raw) return [];
      const ids = JSON.parse(raw);
      return Array.isArray(ids) ? ids.map(Number) : [];
    } catch {
      return [];
    }
  }

  /** 品质 5 及以上的卡牌：只返还 5 级强化粉。 */
  static level5PowderReward(count = 1) {
    return {
      gem: 0,
      gemId: null,
      parchmentChance: 0,
      parchmentId: null,
      pieceItemId: null,
      pieceCount: 0,
      powderId: LEVEL5_POWDER_ITEM_ID,
      powderCount: Math.max(1, Math.trunc(Number(count) || 1)),
    };
  }

  preview(slot, card) {
    if (!slot || !card) return null;
    if (cardQuality(card) >= LEVEL5_POWDER_QUALITY) {
      // 与服务端 /player/smithy/decompose 保持一致：5 级卡只给 5 级强化粉。
      return CardDecomposeSystem.level5PowderReward(1);
    }
    const base = this.rules[String(card.quality)] ?? this.rules['1'];
    const craftBonus = (slot.craftQuality ?? 1) >= 3 ? 1 : 0;
    const piece = this.db.pieceTable.find((p) => p.card_id === card.id);
    const matLevel = Math.min(4, Math.max(1, card.quality));
    const gemId = this.materials.getMaterialId(matLevel, 'gem');
    const parchmentId = this.materials.getMaterialId(matLevel, 'parchment');
    return {
      gem: base.gem + craftBonus,
      gemId,
      parchmentChance: base.parchmentChance,
      parchmentId,
      pieceItemId: piece?.item_id ?? null,
      pieceCount: piece ? Math.max(1, Math.floor(piece.need_num / 4)) : 0,
      powderId: null,
      powderCount: 0,
    };
  }

  canDecompose(cardInventory, index) {
    const slot = cardInventory.getSlots()[index];
    if (!slot) return { ok: false, error: '未选择卡牌' };
    const card = this.db.getById(slot.cardId);
    if (!card) return { ok: false, error: '无效卡牌' };
    return { ok: true, slot, card, preview: this.preview(slot, card) };
  }

  decompose(inventory, cardInventory, index) {
    const check = this.canDecompose(cardInventory, index);
    if (!check.ok) return check;

    const { slot, card, preview: pv } = check;
    cardInventory.removeAt(index);

    if (pv.powderId && pv.powderCount > 0) {
      inventory.addItem(pv.powderId, pv.powderCount);
    } else {
      if (pv.gemId) inventory.addItem(pv.gemId, pv.gem);
      if (pv.parchmentId && Math.random() < pv.parchmentChance) {
        inventory.addItem(pv.parchmentId, 1);
      }
      if (pv.pieceItemId && pv.pieceCount > 0) {
        inventory.addItem(pv.pieceItemId, pv.pieceCount);
      }
    }

    return {
      ok: true,
      message: `已分解「${card.name}」`,
      rewards: pv,
    };
  }
}
