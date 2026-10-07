import craftMaterialsJson from '../data/craftMaterials.json';
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
   * 材料类型链：parchment / gem / charm / dna / powder。
   * 只取该类型真实存在的等级 —— 强化粉可到 5 级，其余材料最高 4 级（level 5 没有它们的 itemId）。
   */
  getMaterialChain(type) {
    return this.config.levels
      .filter((l) => l[type] != null)
      .map((l) => ({ level: l.level, itemId: l[type] }));
  }
}