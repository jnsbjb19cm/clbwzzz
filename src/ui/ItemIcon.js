import itemAtlas from '../data/atlas/preload_items.json';
import { ItemDatabase } from '../core/ItemDatabase.js';
import { getCraftMaterialImage, getCraftMaterialSprite } from './SmithyMaterialArtwork.js';
import { getItemExtensionSprite, ITEM_EXTENSION_URL } from './ItemExtensionSprites.js';

const items = new ItemDatabase();
const sprites = new Map(itemAtlas.sprites.map(sprite => [String(sprite.name), sprite]));

// Every inventory/reward surface uses the same item definition and crop, without an API request.
export function itemIconMarkup(itemId, size = 48) {
  const id = Number(itemId);
  const side = Math.max(16, Math.min(128, Number(size) || 48));
  const box = `display:inline-flex;position:relative;overflow:hidden;flex-shrink:0;vertical-align:middle;align-items:center;justify-content:center;width:${side}px;height:${side}px`;
  const image = getCraftMaterialImage(id);
  if (image) return `<span data-item-icon="${id}" style="${box}"><img src="${image}" alt="" draggable="false" style="width:100%;height:100%;object-fit:contain"></span>`;
  const gem = getCraftMaterialSprite(id);
  const extension = getItemExtensionSprite(id);
  const sprite = gem ?? extension ?? sprites.get(String(items.getById(id)?.img ?? id)) ?? sprites.get(String(id)) ?? sprites.get('-1');
  if (!sprite) return `<span data-item-icon="${id}" style="${box}">物</span>`;
  const url = gem?.image ?? (extension ? ITEM_EXTENSION_URL : '/atlas/items.png');
  const scale = Math.min(side / sprite.width, side / sprite.height);
  return `<span data-item-icon="${id}" style="${box}"><i data-item-art style="display:block;width:${sprite.width}px;height:${sprite.height}px;position:absolute;left:50%;top:50%;background:url('${url}') no-repeat -${sprite.x}px -${sprite.y}px;transform:translate(-50%,-50%) scale(${scale});transform-origin:center"></i></span>`;
}
