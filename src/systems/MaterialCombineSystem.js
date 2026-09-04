export class MaterialCombineSystem {
  constructor(materialRegistry) {
    this.materials = materialRegistry;
  }

  canCombine(inventory, type, fromLevel) {
    const chain = this.materials.getMaterialChain(type);
    const from = chain.find((c) => c.level === fromLevel);
    const to = chain.find((c) => c.level === fromLevel + 1);
    if (!from || !to) return { ok: false, error: '已达最高等级' };
    const ratio = this.materials.getCombineRatio();
    const have = inventory.countItem(from.itemId);
    if (have < ratio) return { ok: false, error: `需要 ${ratio} 个低级材料` };
    return { ok: true, fromId: from.itemId, toId: to.itemId, ratio, toLevel: to.level };
  }

  combine(inventory, type, fromLevel) {
    const check = this.canCombine(inventory, type, fromLevel);
    if (!check.ok) return check;
    inventory.consumeItem(check.fromId, check.ratio);
    if (!inventory.addItem(check.toId, 1)) {
      inventory.addItem(check.fromId, check.ratio);
      return { ok: false, error: '背包已满，合成材料未消耗' };
    }
    const item = this.materials.getItem(check.toId);
    return { ok: true, itemName: item?.name ?? '', toLevel: check.toLevel };
  }
}
