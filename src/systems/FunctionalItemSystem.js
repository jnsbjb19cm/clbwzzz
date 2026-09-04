import { sanitizeCustomCardName } from '../core/constants.js';

export const CARD_PICKER_FUNCTIONAL_ITEMS = new Set([80, 81, 82, 83, 88, 89, 90]);
export const DIRECT_FUNCTIONAL_ITEMS = new Set([84, 85, 86, 87, 91, 92]);

const _BOOK_KIND = Object.freeze({
  84: 'attack',
  85: 'defense',
  86: 'support',
});

const CRAFT_QUALITY_NAMES = Object.freeze({
  1: '劣质',
  2: '普通',
  3: '精良',
  4: '完美',
  5: '传说',
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cloneInventoryState(inventory) {
  if (!inventory?.state) return null;
  return JSON.parse(JSON.stringify(inventory.state));
}

function restoreInventoryState(inventory, state) {
  if (!inventory || !state) return;
  inventory.state = state;
  inventory.save?.();
}

export function functionalItemPickerCount(itemId) {
  return Number(itemId) === 89 ? 2 : 1;
}

export function isFunctionalCardPickerItem(itemId) {
  return CARD_PICKER_FUNCTIONAL_ITEMS.has(Number(itemId));
}

export function isDirectFunctionalItem(itemId) {
  return DIRECT_FUNCTIONAL_ITEMS.has(Number(itemId));
}

export function randomAttributeRoll(random = Math.random) {
  const one = () => Math.floor(random() * 24) - 8;
  return { atk: one(), hp: one(), cd: one() };
}

export function applyFunctionalCardItem({
  itemId,
  itemSlotIndex,
  slot,
  card,
  second = null,
  name = '',
  inventory,
  cardInventory,
  random = Math.random,
}) {
  const id = Number(itemId);
  if (!slot || !card) return { ok: false, error: '卡牌不存在' };
  if (!isFunctionalCardPickerItem(id)) return { ok: false, error: '该道具不是卡牌选择型功能道具' };

  let message = '';
  if (id === 80) {
    const r = random();
    slot.craftQuality = r < 0.08 ? 5 : r < 0.23 ? 4 : r < 0.43 ? 3 : r < 0.68 ? 2 : 1;
    message = `「${slot.customName || card.name}」制作品质洗练为 ${CRAFT_QUALITY_NAMES[slot.craftQuality]}`;
  } else if (id === 81) {
    slot.attributeRoll = randomAttributeRoll(random);
    const roll = slot.attributeRoll;
    message = `属性洗练完成：攻击 ${roll.atk >= 0 ? '+' : ''}${roll.atk}% / 生命 ${roll.hp >= 0 ? '+' : ''}${roll.hp}% / 冷却优化 ${roll.cd >= 0 ? '+' : ''}${roll.cd}%`;
  } else if (id === 82) {
    if ((slot.craftQuality ?? 1) >= 5) return { ok: false, error: '该卡牌制作品质已达最高' };
    slot.craftQuality = Math.min(5, (slot.craftQuality ?? 1) + 1);
    message = `「${slot.customName || card.name}」制作品质提升为 ${CRAFT_QUALITY_NAMES[slot.craftQuality]}`;
  } else if (id === 83) {
    slot.craftQuality = 5;
    slot.awakened = true;
    message = `「${slot.customName || card.name}」已完成逆天觉醒`;
  } else if (id === 88) {
    const spent = { ...(slot.powderSpent ?? {}) };
    const total = Object.values(spent).reduce((sum, count) => sum + Math.max(0, Math.floor(finite(count))), 0);
    if (total <= 0 && (slot.strengthLv ?? 0) <= 0) {
      return { ok: false, error: '该卡牌没有可重置的强化记录' };
    }
    const inventorySnapshot = cloneInventoryState(inventory);
    for (const [powderId, count] of Object.entries(spent)) {
      const amount = Math.max(0, Math.floor(finite(count)));
      if (amount <= 0) continue;
      if (!inventory?.addItem?.(Number(powderId), amount)) {
        restoreInventoryState(inventory, inventorySnapshot);
        return { ok: false, error: '道具背包空间不足，无法安全返还强化粉' };
      }
    }
    slot.strengthLv = 0;
    slot.star = 0;
    slot.powderSpent = {};
    message = `强化已重置，返还 ${total} 个强化粉`;
  } else if (id === 89) {
    if (!second || second === slot) return { ok: false, error: '经验来源和接收卡不能相同' };
    const amount = Math.max(0, Math.floor(finite(slot.exp)));
    if (amount <= 0) return { ok: false, error: '来源卡没有可转移经验' };
    second.exp = Math.max(0, Math.floor(finite(second.exp))) + amount;
    slot.exp = 0;
    message = `已转移 ${amount} 点卡牌经验`;
  } else if (id === 90) {
    const nextName = sanitizeCustomCardName(name);
    if (!nextName) return { ok: false, error: '请输入新的卡牌名称' };
    slot.customName = nextName;
    message = `卡牌已更名为「${nextName}」`;
  }

  if (!inventory?.consumeAt?.(itemSlotIndex, 1)) {
    return { ok: false, error: '功能道具扣除失败' };
  }
  cardInventory?.save?.();
  return { ok: true, message };
}

export function useDirectFunctionalItem({
  item,
  slotIndex,
  inventory,
  player,
  heros = null,
}) {
  const id = Number(item?.id);
  if (!isDirectFunctionalItem(id)) return { ok: false, error: '该道具不是直接使用型功能道具' };

  if (_BOOK_KIND[id]) {
    const kind = _BOOK_KIND[id];
    player.BookPoints ??= { attack: 0, defense: 0, support: 0 };
    player.BookPoints[kind] = Math.max(0, Math.floor(finite(player.BookPoints[kind]))) + 1;
    player.extraTalentPoints = Math.max(0, Math.floor(finite(player.extraTalentPoints))) + 1;
    if (!inventory?.consumeAt?.(slotIndex, 1)) return { ok: false, error: '技能书扣除失败' };
    const label = { attack: '攻击', defense: '防御', support: '辅助' }[kind];
    return { ok: true, message: `${label}技能书生效：额外天赋点 +1` };
  }

  if (id === 87) {
    if (!heros?.resetTalents) return { ok: false, error: '技能系统尚未载入，不能使用遗忘卷轴' };
    const refund = Math.max(0, Math.floor(finite(heros.resetTalents())));
    player.extraTalentPoints = Math.max(0, Math.floor(finite(player.extraTalentPoints))) + refund;
    if (!inventory?.consumeAt?.(slotIndex, 1)) return { ok: false, error: '遗忘卷轴扣除失败' };
    return {
      ok: true,
      message: refund > 0
        ? `技能已重置，并返还 ${refund} 点额外天赋点`
        : '技能已重置，技能栏恢复默认',
    };
  }

  if (id === 91) {
    player.buffs ??= {};
    const shield = Math.max(1, finite(item.effectValue, 20));
    player.buffs.pveShield = Math.max(finite(player.buffs.pveShield), shield);
    if (!inventory?.consumeAt?.(slotIndex, 1)) return { ok: false, error: '觉醒石扣除失败' };
    return { ok: true, message: `羁绊觉醒：下一场PVE获得 ${shield}% 基地生命护盾` };
  }

  if (id === 92) {
    const before = inventory?.getSlotCount?.() ?? 0;
    const amount = Math.max(1, finite(item.effectValue, 10));
    const expand = inventory?.expandBySlots ?? inventory?.expandBy;
    const result = typeof expand === 'function'
      ? expand.call(inventory, amount)
      : { ok: false, error: '背包不支持扩容' };
    if (!result?.ok) return result ?? { ok: false, error: '背包扩容失败' };
    const added = (inventory?.getSlotCount?.() ?? before) - before;
    if (added <= 0) return { ok: false, error: '背包已达上限' };
    if (!inventory?.consumeAt?.(slotIndex, 1)) return { ok: false, error: '扩容符扣除失败' };
    return { ok: true, message: `道具背包永久 +${added} 格，当前 ${inventory.getSlotCount()} 格` };
  }

  return { ok: false, error: '该功能道具尚未配置直接使用逻辑' };
}
