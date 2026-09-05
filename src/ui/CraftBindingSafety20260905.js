import { CardCraftSystem } from '../systems/CardCraftSystem.js';

const PATCH_FLAG = Symbol.for('clbwz.craftBindingSafety20260905');

/**
 * 制作失败补偿、DNA 升变返还也必须继承本次实际消耗材料的绑定状态，
 * 防止通过“制作→返还/补偿”把绑定材料洗成非绑定材料。
 *
 * 注意：此补丁必须在 EconomyInventoryRules20260905 之后安装，
 * 这样才能使用 binding-aware inventory API，并包裹已经实现“绑定材料制作绑定卡”的 craft。
 */
export function installCraftBindingSafety20260905() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const originalCraft = CardCraftSystem.prototype.craft;
  CardCraftSystem.prototype.craft = function craftBindingSafety20260905(
    targetCardId,
    inventory,
    cardInventory,
    craftState,
    opts = {},
  ) {
    const target = this.db.getById(targetCardId);
    const level = target ? Math.min(4, Math.max(1, Number(target.quality) || 1)) : 1;
    const cfg = this.materials.getLevelConfig(level);
    const need = this.rules.materialsPerCraft;

    // 先按实际“非绑定优先、绑定补足”的消费规则判断本次是否会动到绑定材料。
    const coreUsesBound = Boolean(cfg && (
      inventory.wouldConsumeBound?.(cfg.parchment, need.parchment)
      || inventory.wouldConsumeBound?.(cfg.gem, need.gem)
    ));
    const dnaUsesBound = Boolean(
      cfg && opts.useDna && inventory.wouldConsumeBound?.(cfg.dna, 1),
    );

    const result = originalCraft.call(
      this,
      targetCardId,
      inventory,
      cardInventory,
      craftState,
      opts,
    );

    // 升变时原系统会返还 1 个 DNA；若本次消耗的是绑定 DNA，返还也必须仍为绑定。
    if (result?.ok && result?.dnaRefunded && dnaUsesBound && cfg?.dna) {
      const converted = inventory.consumeItemDetailed?.(cfg.dna, 1, { bound: false });
      if (converted?.ok) inventory.addItem(cfg.dna, 1, { bound: true });
    }

    // 普通制作失败会补偿低一级宝石。只要核心制作材料中出现绑定，补偿宝石也绑定。
    if (result?.ok && result?.result === 'fail' && coreUsesBound) {
      const compensateLevel = Math.max(1, level - 1);
      const compCfg = this.materials.getLevelConfig(compensateLevel);
      const amount = Math.max(0, Math.floor(Number(this.rules.failureCompensate) || 0));
      if (compCfg?.gem && amount > 0) {
        const converted = inventory.consumeItemDetailed?.(compCfg.gem, amount, { bound: false });
        if (converted?.ok) inventory.addItem(compCfg.gem, amount, { bound: true });
      }
    }

    return result;
  };
}
