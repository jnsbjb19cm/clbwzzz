import craftRules from '../data/craftRules.json';

const DECK_KEY = 'battle_deck_ids';

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

  preview(slot, card) {
    if (!slot || !card) return null;
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

    if (pv.gemId) inventory.addItem(pv.gemId, pv.gem);
    if (pv.parchmentId && Math.random() < pv.parchmentChance) {
      inventory.addItem(pv.parchmentId, 1);
    }
    if (pv.pieceItemId && pv.pieceCount > 0) {
      inventory.addItem(pv.pieceItemId, pv.pieceCount);
    }

    return {
      ok: true,
      message: `已分解「${card.name}」`,
      rewards: pv,
    };
  }
}