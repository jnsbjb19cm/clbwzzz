import cardsJson from '../data/card.json';
import cardEvoJson from '../data/cardEvo.json';
import combineCardJson from '../data/combine_card.json';
import meltingCardJson from '../data/meltingCard.json';
import pieceRewardJson from '../data/pieceReward.json';
import stageInfoJson from '../data/stageInfo.json';
import cardPartsAtlas from '../data/atlas/preload_cardParts.json';
import card1Atlas from '../data/atlas/preload_card1.json';
import { Card } from './Card.js';

/**
 * 卡牌数据库 - 加载并索引所有游戏配置
 */
export class CardDatabase {
  constructor() {
    this.cards = cardsJson.map((raw) => new Card(raw));
    this.cardMap = new Map(this.cards.map((c) => [c.id, c]));
    this.evoTable = cardEvoJson;
    this.combineTable = combineCardJson;
    this.meltingTable = meltingCardJson;
    this.pieceTable = pieceRewardJson;
    this.stages = stageInfoJson;
    this.atlases = {
      card1: card1Atlas,
      cardParts: cardPartsAtlas,
    };
  }

  getById(id) {
    return this.cardMap.get(Number(id));
  }

  getVisibleCards() {
    return this.cards.filter((c) => c.galleryVisible);
  }

  getCollectibleCards() {
    return this.cards.filter((c) => c.isCollectible());
  }

  getExperienceCards() {
    return this.cards.filter((c) => c.isExperienceCard);
  }

  getByQuality(quality) {
    return this.getVisibleCards().filter((c) => c.quality === quality);
  }

  getByType(type) {
    return this.getVisibleCards().filter((c) => c.type === type);
  }

  search(keyword) {
    const q = keyword.trim().toLowerCase();
    if (!q) return this.getVisibleCards();
    return this.getVisibleCards().filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        String(c.id).includes(q) ||
        (c.desc && c.desc.includes(keyword)),
    );
  }

  /** 获取卡牌立绘在图集中的坐标 */
  getSpriteFrame(res) {
    const key = String(res);
    return this.atlases.card1.sprites.find((s) => s.name === key) ?? null;
  }

  /** 升星经验配置 */
  getEvoConfig(quality, star) {
    return this.evoTable.find(
      (e) => e.card_quality === quality && e.star === star,
    );
  }

  /** 合成成功率 */
  getCombineRate(quality, materialCount) {
    return this.combineTable.find(
      (r) => r.card_quality === quality && r.num === materialCount,
    );
  }

  /** 兑换 */
  getPieceReward(itemId) {
    return this.pieceTable.find((p) => p.item_id === itemId);
  }

  getStats() {
    const visible = this.getVisibleCards();
    return {
      total: this.cards.length,
      visible: visible.length,
      byQuality: Object.fromEntries(
        [1, 2, 3, 4, 5, 6].map((q) => [
          q,
          visible.filter((c) => c.quality === q).length,
        ]),
      ),
      byType: Object.fromEntries(
        [1, 2, 3, 4].map((t) => [
          t,
          visible.filter((c) => c.type === t).length,
        ]),
      ),
      stages: this.stages.length,
    };
  }
}
