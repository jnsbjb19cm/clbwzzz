/**
 * 卡牌进化/升星系统 - 对应 cardEvo.xml
 */
export class CardEvoSystem {
  constructor(db) {
    this.db = db;
  }

  getStarExpRequired(quality, currentStar) {
    const next = this.db.getEvoConfig(quality, currentStar + 1);
    return next?.need_exp ?? null;
  }

  getExpGainOnFeed(quality, star) {
    const cfg = this.db.getEvoConfig(quality, star);
    return cfg?.add_exp ?? 0;
  }

  canEvolve(quality, currentStar, currentExp) {
    const required = this.getStarExpRequired(quality, currentStar);
    if (required === null) return false;
    return currentExp >= required;
  }

  getMaxStar() {
    return 6;
  }
}