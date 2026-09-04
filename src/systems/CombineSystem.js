/**
 * 卡牌合成系统 - 对应 combine_card.xml
 */
export class CombineSystem {
  constructor(db) {
    this.db = db;
  }

  getOptions(quality) {
    return this.db.combineTable
      .filter((r) => r.card_quality === quality)
      .sort((a, b) => a.num - b.num);
  }

  getSuccessRate(quality, materialCount) {
    const rule = this.db.getCombineRate(quality, materialCount);
    return rule?.rate ?? 0;
  }

  getSilverCost(quality, materialCount) {
    const rule = this.db.getCombineRate(quality, materialCount);
    return rule?.consume_silver ?? 0;
  }
}