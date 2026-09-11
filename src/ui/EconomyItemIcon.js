import { BagView } from './BagView.js';
import { ItemDatabase } from '../core/ItemDatabase.js';

export const economyItemDb = new ItemDatabase();

// Share the backpack's material, gem-sheet, extension and item-atlas mappings.
export function economyItemIcon(itemId, size = 48) {
  const item = economyItemDb.getById(Number(itemId)) ?? { id: Number(itemId) };
  const icon = BagView.prototype.itemIcon.call({}, item);
  return `<span class="economy-art" style="width:${size}px;height:${size}px" aria-hidden="true"><span class="economy-art-canvas" style="transform:scale(${size / 72})">${icon}</span></span>`;
}
