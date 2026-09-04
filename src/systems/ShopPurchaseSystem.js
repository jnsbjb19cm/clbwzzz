function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function purchaseShopItem({ itemDb, inventory, player, item, price }) {
  const amount = finite(price, NaN);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('商品价格配置无效');
  if (finite(player?.gold) < amount) throw new Error('金币不足');

  const effect = item?.effect;
  if (!effect?.type) throw new Error('商品效果配置缺失');

  // 可能失败的库存写入必须先成功，再扣款。
  if (effect.type === 'inventory') {
    const realItem = itemDb?.getById?.(effect.realId);
    if (!realItem) throw new Error(`道具ID ${effect.realId} 不存在于 ItemDatabase`);
    const count = Math.max(1, Math.floor(finite(effect.count, 1)));
    if (!inventory?.addItem?.(effect.realId, count)) throw new Error('道具背包已满');
    player.gold = finite(player.gold) - amount;
    return { ok: true, inventoryItemId: Number(effect.realId), count };
  }

  const beforeGold = finite(player.gold);
  player.gold = beforeGold - amount;
  try {
    switch (effect.type) {
      case 'gold':
        player.gold = finite(player.gold) + finite(effect.amount);
        break;
      case 'gem':
        player.gem = finite(player.gem) + finite(effect.amount);
        break;
      case 'honor':
        player.honor = finite(player.honor) + finite(effect.amount);
        break;
      case 'exp':
        player.exp = finite(player.exp) + finite(effect.amount);
        break;
      case 'stamina':
        player.stamina = Math.min(200, finite(player.stamina) + finite(effect.amount));
        break;
      case 'buff':
        player.buffs ??= {};
        if (['gold2x', 'gold3x', 'drop2x', 'revive'].includes(effect.key)) {
          player.buffs[effect.key] = finite(player.buffs[effect.key]) + finite(effect.val);
        } else {
          player.buffs[effect.key] = finite(effect.val);
        }
        break;
      default:
        throw new Error(`不支持的商品效果：${effect.type}`);
    }
  } catch (error) {
    player.gold = beforeGold;
    throw error;
  }

  return { ok: true };
}
