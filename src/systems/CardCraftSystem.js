import craftRules from '../data/craftRules.json';
import {
  ASCEND_MAX_QUALITY,
  CRAFTABLE_MAX_QUALITY,
  formatCraftCardName,
  isCraftableCard,
  resolveCraftQuality,
} from '../core/constants.js';

export class CardCraftSystem {
  constructor(db, materialRegistry) {
    this.db = db;
    this.materials = materialRegistry;
    this.rules = craftRules;
  }

  getCraftableCards() {
    return this.db.cards
      .filter((card) => this.isSmithyCraftable(card))
      .sort((a, b) => a.quality - b.quality || a.id - b.id);
  }

  isSmithyCraftable(card) {
    return Boolean(card?.isExperienceCard || isCraftableCard(card));
  }

  getTierRule(quality) {
    const q = Math.min(CRAFTABLE_MAX_QUALITY, Math.max(1, quality));
    return this.rules.tierRules[String(q)];
  }

  /** 成功后目标/升变/歪 三档概率，保证合计 100% */
  getOutcomeRates(tier, highTier = false) {
    let targetRate = tier.targetRate;
    let ascendRate = tier.ascendRate;
    let wrongRate = tier.wrongRate;

    if (highTier) {
      const bonus = this.rules.highTierBonus.ascendRate;
      ascendRate += bonus;
      if (wrongRate >= bonus) {
        wrongRate -= bonus;
      } else {
        const left = bonus - wrongRate;
        wrongRate = 0;
        targetRate = Math.max(0, targetRate - left);
      }
    }

    const sum = targetRate + ascendRate + wrongRate;
    if (sum > 0 && Math.abs(sum - 1) > 1e-6) {
      targetRate /= sum;
      ascendRate /= sum;
      wrongRate /= sum;
    }

    return { targetRate, ascendRate, wrongRate };
  }

  getPreview(targetCardId, { useCharm, useDna, highTier, craftState }) {
    const card = this.db.getById(targetCardId);
    if (!this.isSmithyCraftable(card)) return null;
    const level = Math.min(CRAFTABLE_MAX_QUALITY, card.quality);
    const tier = this.getTierRule(level);
    let successRate = tier.successRate;
    if (craftState?.hasPity(card.id)) successRate = 1;
    if (useCharm) successRate = Math.min(1, successRate + this.rules.charmBonus.successRate);
    const outcomes = card.isExperienceCard
      ? { targetRate: 1, ascendRate: 0, wrongRate: 0 }
      : this.getOutcomeRates(tier, highTier);
    return {
      successRate,
      ...outcomes,
      tier: card.quality,
      level,
      canAscend: outcomes.ascendRate > 0,
      ascendToQuality: level < ASCEND_MAX_QUALITY ? level + 1 : null,
    };
  }

  hasMaterials(inventory, level, { useCharm, useDna }) {
    const cfg = this.materials.getLevelConfig(level);
    if (!cfg) return false;
    const need = this.rules.materialsPerCraft;
    if (inventory.countItem(cfg.parchment) < need.parchment) return false;
    if (inventory.countItem(cfg.gem) < need.gem) return false;
    if (useCharm && inventory.countItem(cfg.charm) < 1) return false;
    if (useDna && inventory.countItem(cfg.dna) < 1) return false;
    return true;
  }

  craft(targetCardId, inventory, cardInventory, craftState, opts = {}) {
    const { useCharm = false, useDna = false, highTier = false } = opts;
    const target = this.db.getById(targetCardId);
    if (!this.isSmithyCraftable(target)) {
      return { ok: false, error: '金卡/红卡及更高品质不可制作' };
    }

    const level = Math.min(CRAFTABLE_MAX_QUALITY, target.quality);
    const cfg = this.materials.getLevelConfig(level);
    if (!this.hasMaterials(inventory, level, { useCharm, useDna })) {
      return { ok: false, error: '材料不足' };
    }

    if (cardInventory.getFreeSlots() < 1) {
      return { ok: false, error: '卡牌背包已满，请先扩容或整理后再制作' };
    }

    const tier = this.getTierRule(level);
    let successRate = tier.successRate;
    if (craftState.hasPity(target.id)) successRate = 1;
    if (useCharm) successRate = Math.min(1, successRate + this.rules.charmBonus.successRate);

    const need = this.rules.materialsPerCraft;
    const consumeCore = () => {
      inventory.consumeItem(cfg.parchment, need.parchment);
      inventory.consumeItem(cfg.gem, need.gem);
    };

    const success = Math.random() < successRate;

    if (!success) {
      if (useCharm) {
        inventory.consumeItem(cfg.charm, 1);
        return { ok: true, result: 'fail_protected', message: '制作失败，保护符已消耗，材料已保留' };
      }
      consumeCore();
      const compensateLevel = Math.max(1, level - 1);
      const compCfg = this.materials.getLevelConfig(compensateLevel);
      if (compCfg) {
        inventory.addItem(compCfg.gem, this.rules.failureCompensate);
      }
      return {
        ok: true,
        result: 'fail',
        message: `制作失败，材料已消耗，补偿 ${compensateLevel} 级宝石 x${this.rules.failureCompensate}`,
      };
    }

    consumeCore();
    if (useCharm) inventory.consumeItem(cfg.charm, 1);
    const dnaConsumed = useDna;
    if (dnaConsumed) inventory.consumeItem(cfg.dna, 1);

    const { targetRate, ascendRate, wrongRate } = target.isExperienceCard
      ? { targetRate: 1, ascendRate: 0, wrongRate: 0 }
      : this.getOutcomeRates(tier, highTier);
    const roll = Math.random();
    let outcome = 'target';
    let resultCardId = target.id;
    let dnaRefunded = false;

    if (ascendRate > 0 && roll < ascendRate) {
      outcome = 'ascend';
      resultCardId = this.pickAscendCard(level, target.id);
      if (dnaConsumed) {
        inventory.addItem(cfg.dna, 1);
        dnaRefunded = true;
      }
    } else if (dnaConsumed || roll < ascendRate + targetRate) {
      outcome = 'target';
      resultCardId = target.id;
    } else if (wrongRate > 0) {
      outcome = 'wrong';
      resultCardId = this.pickRandomCard(level, target.id);
    }

    const craftQuality = target.isExperienceCard ? 1 : this.rollCraftQuality(useCharm);
    const addRes = cardInventory.addCard(resultCardId, 0, { craftQuality, strengthLv: 0 });
    if (!addRes.ok) {
      inventory.addItem(cfg.parchment, need.parchment);
      inventory.addItem(cfg.gem, need.gem);
      if (useCharm) inventory.addItem(cfg.charm, 1);
      if (dnaConsumed && !dnaRefunded) inventory.addItem(cfg.dna, 1);
      return { ok: false, error: addRes.error ?? '卡牌背包已满，材料已退还' };
    }

    if (outcome === 'wrong') craftState.setPity(target.id);
    else craftState.clearPity(target.id);

    const resultCard = this.db.getById(resultCardId);
    const outcomeLabel =
      outcome === 'target' ? '制作成功' : outcome === 'ascend' ? '升变' : '歪了';
    const dnaNote = dnaRefunded ? '，DNA 已返还' : '';
    const displayName = resultCard
      ? (resultCard.isExperienceCard ? resultCard.name : formatCraftCardName(craftQuality, resultCard.name))
      : '';
    const cqInfo = resolveCraftQuality(craftQuality);
    return {
      ok: true,
      result: outcome,
      outcome,
      cardId: resultCardId,
      cardName: resultCard?.name,
      displayName,
      craftQuality,
      craftQualityInfo: cqInfo,
      dnaRefunded,
      message: resultCard?.isExperienceCard
        ? `制作成功：${displayName}`
        : `${outcomeLabel}：${displayName}(${cqInfo.baseLabel}底座)${dnaNote}`,
    };
  }

  /** 成功后底座品质概率公示(各制作等级共用；保护符提升高品质权重) */
  getCraftQualityPreview(useCharm = false) {
    const rows = this.getCraftQualityWeights(useCharm);
    const total = rows.reduce((s, w) => s + w.weight, 0);
    return rows.map((w) => ({
      id: w.id,
      name: w.name,
      color: w.color,
      weight: w.weight,
      rate: total > 0 ? w.weight / total : 0,
    }));
  }

  pickRandomCard(quality, excludeId) {
    const pool = this.getCraftableCards().filter(
      (c) => !c.isExperienceCard && c.quality === quality && c.id !== excludeId,
    );
    if (!pool.length) {
      const fallback = this.getCraftableCards().filter((c) => !c.isExperienceCard && c.quality === quality);
      if (fallback.length) return fallback[Math.floor(Math.random() * fallback.length)].id;
      return excludeId;
    }
    return pool[Math.floor(Math.random() * pool.length)].id;
  }

  /** 升变产出：可出金卡(5)，不出红卡(6) */
  pickAscendCard(fromLevel, excludeId) {
    const targetQ = fromLevel + 1;
    if (targetQ > ASCEND_MAX_QUALITY) return excludeId;
    const pool = this.db
      .getCollectibleCards()
      .filter((c) => c.quality === targetQ && c.id !== excludeId);
    if (!pool.length) {
      const fallback = this.db.getCollectibleCards().filter((c) => c.quality === targetQ);
      if (fallback.length) return fallback[Math.floor(Math.random() * fallback.length)].id;
      return excludeId;
    }
    return pool[Math.floor(Math.random() * pool.length)].id;
  }

  rollCraftQuality(useCharm) {
    const weights = this.getCraftQualityWeights(useCharm);
    const total = weights.reduce((s, w) => s + w.weight, 0);
    let r = Math.random() * total;
    for (const w of weights) {
      r -= w.weight;
      if (r <= 0) return w.id;
    }
    return 1;
  }

  getCraftQualityWeights(useCharm = false) {
    const highQualityMult = useCharm ? 1 + this.rules.charmBonus.qualityWeight : 1;
    return this.rules.craftQualityWeights.map((w) => ({
      ...w,
      // 保护符只提高优秀及以上底座权重；给所有档位同乘系数不会改变概率。
      weight: w.weight * (w.id >= 2 ? highQualityMult : 1),
    }));
  }
}
