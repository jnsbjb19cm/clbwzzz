import craftMaterialsJson from '../data/craftMaterials.json';
import craftRules from '../data/craftRules.json';
import { Item } from './Item.js';

export class CraftMaterialRegistry {
  constructor() {
    this.config = craftMaterialsJson;
    this.itemMap = new Map(
      craftMaterialsJson.items.map((raw) => [raw.item_id, new Item(raw)]),
    );
    this.levelMap = new Map(craftMaterialsJson.levels.map((l) => [l.level, l]));
  }

  getItem(id) {
    return this.itemMap.get(Number(id));
  }

  getLevelConfig(level) {
    return this.levelMap.get(Number(level));
  }

  getMaterialId(level, type) {
    return this.getLevelConfig(level)?.[type] ?? null;
  }

  getStarterItems() {
    return Object.entries(this.config.starterCounts).map(([itemId, count]) => ({
      itemId: Number(itemId),
      count,
    }));
  }

  getCombineRatio() {
    return this.config.combineRatio ?? 10;
  }

  /**
   * 2026-10-09：幸运四叶草 —— 制作卡牌时勾选消耗，本次升变概率 +5% 绝对（从「歪」扣除）。
   * 数值与道具基准 id 都在 craftRules.json 的 cloverBonus 里，调参不用改代码。
   */
  getCloverBonus() {
    return Number(craftRules.cloverBonus?.ascendRate) || 0;
  }

  /** 四叶草按卡牌等级匹配：1~4 级 → 60110~60113（itemBaseId 60109 + 等级）。 */
  getCloverItemId(level) {
    const base = Number(craftRules.cloverBonus?.itemBaseId) || 60109;
    const lv = Math.max(1, Math.min(4, Math.floor(Number(level) || 1)));
    return base + lv;
  }

  /**
   * 材料类型链：parchment / gem / charm / dna / powder。
   * 只取该类型真实存在的等级 —— 强化粉可到 5 级，其余材料最高 4 级（level 5 没有它们的 itemId）。
   */
  getMaterialChain(type) {
    return this.config.levels
      .filter((l) => l[type] != null)
      .map((l) => ({ level: l.level, itemId: l[type] }));
  }
}