// 2026-10-10：专属 DNA 的图标在道具图集 items.png 里（图集条目名 = 数据库的 item_img，如 30015），
// 所以这里需要图集数据与图集图 URL。
import itemAtlasData from '../data/atlas/preload_items.json';

const ITEM_ATLAS = new Map(itemAtlasData.sprites.map((sprite) => [String(sprite.name), sprite]));
export const ITEM_SHEET_URL = new URL('../../assets/atlas/items.png', import.meta.url).href;

export const SMITHY_MATERIAL_ART = Object.freeze({
  parchment: [
    new URL('../../resources/img/parchment1.png', import.meta.url).href,
    new URL('../../resources/img/parchment2.png', import.meta.url).href,
    new URL('../../resources/img/parchment3.png', import.meta.url).href,
    new URL('../../resources/img/parchment4.png', import.meta.url).href,
  ],
  dna: [
    // 2026-10-10（用户澄清）：**原来的顺序就是对的**（DNA1/2/3/4 = 1/2/3/4 级）。
    // 上一版是我误以为 3/4 级反了，自己把它们换掉了 —— 现在改回原样，以后别再动这四行。
    new URL('../../resources/img/DNA1.webp', import.meta.url).href,   // 1 级
    new URL('../../resources/img/DNA2.webp', import.meta.url).href,   // 2 级
    new URL('../../resources/img/DNA3.webp', import.meta.url).href,   // 3 级
    new URL('../../resources/img/DNA4.webp', import.meta.url).href,   // 4 级
  ],
  charm: [
    new URL('../../resources/img/PTL1.png', import.meta.url).href,
    new URL('../../resources/img/PTL2.png', import.meta.url).href,
    new URL('../../resources/img/PTL3.png', import.meta.url).href,
    new URL('../../resources/img/PTL4.png', import.meta.url).href,
  ],
  gem: new URL('../../resources/img/gem.png', import.meta.url).href,
  clover: new URL('../../resources/img/clover.png', import.meta.url).href,
  powder: new URL('../../resources/img/powder.png', import.meta.url).href,
});

export const SMITHY_GEM_SPRITE = Object.freeze({
  sheetWidth: 2172,
  sheetHeight: 724,
  cellWidth: 543,
  cellHeight: 724,
  levels: 4,
});

const GEM_LEVEL_BY_ITEM_ID = Object.freeze({
  50011: 1,
  50012: 2,
  50013: 3,
  50014: 4,
});

export function getCraftMaterialImage(itemId) {
  const id = Number(itemId);
  // 2026-10-10（用户：「你根本没改，你现在的还是原来的一个4级通用DNA图标、一个3级DNA通用图标」）：
  // **这就是真因** —— 专属 DNA（30001~30058，如 带刀侍卫DNA=30015）以前在这里就被这张常量图拦下了，
  // 返回的是"通用 DNA webp"，所以背包里永远显示通用图，图集里那张**专属图**根本没机会用上。
  // 现在专属 DNA 一律返回 null，让调用方继续往下走，命中图集 ITEM_ATLAS 里 300xx 的专属图标。
  const dna = cardDnaItem(id);
  if (dna) return null;
  if (id >= 50001 && id <= 50004) return SMITHY_MATERIAL_ART.parchment[id - 50001];
  if (id >= 50031 && id <= 50034) return SMITHY_MATERIAL_ART.dna[id - 50031];   // 通用 DNA（1~4 级）
  if (id >= 50021 && id <= 50024) return SMITHY_MATERIAL_ART.charm[id - 50021];
  return null;
}

/**
 * 专属 DNA 在图集里的那一格（供需要 <img>/背景图的地方使用）。
 * 图集条目名 = 数据库里的 item_img（例：带刀侍卫DNA → 30015）。
 */
export function getCraftMaterialAtlasSprite(itemId) {
  const id = Number(itemId);
  // 数据库里每条 DNA 的 item_img 就是它自己（例：带刀侍卫DNA 30015 → item_img 30015），
  // 所以先按道具自己的 id / item_img 查图集；不依赖 cardDnaItem
  //（有些 DNA 对应的卡不在「可合成」列表里，那样会查不到）。
  const dna = cardDnaItem(id);
  const keys = [String(dna?.item_img ?? id), String(id), String(dna?.item_id ?? id)];
  for (const key of keys) {
    const sprite = ITEM_ATLAS.get(key);
    if (!sprite) continue;
    return {
      image: ITEM_SHEET_URL,
      x: Number(sprite.x) || 0,
      y: Number(sprite.y) || 0,
      width: Math.max(1, Number(sprite.width) || 45),
      height: Math.max(1, Number(sprite.height) || 45),
    };
  }
  return null;
}

export function getCraftMaterialSprite(itemId) {
  const id = Number(itemId);
  const level = GEM_LEVEL_BY_ITEM_ID[id];
  if (!level) return null;
  return {
    type: 'gem',
    level,
    image: SMITHY_MATERIAL_ART.gem,
    x: (level - 1) * SMITHY_GEM_SPRITE.cellWidth,
    y: 0,
    width: SMITHY_GEM_SPRITE.cellWidth,
    height: SMITHY_GEM_SPRITE.cellHeight,
    sheetWidth: SMITHY_GEM_SPRITE.sheetWidth,
    sheetHeight: SMITHY_GEM_SPRITE.sheetHeight,
  };
}

export function getCraftMaterialSpriteStyle(sprite) {
  if (!sprite || sprite.type !== 'gem') return '';
  const offset = ((Number(sprite.level) - 1) / (SMITHY_GEM_SPRITE.levels - 1)) * 100;
  // gem.png 是 4 个 543×724 单元横向拼接。旧样式把 543×724 强制塞进 72×72
  // 再按 400% 宽度裁切，会截掉宝石顶部/底部。这里按真实单元纵横比完整显示每一级。
  const displayHeight = 72;
  const displayWidth = Math.round(displayHeight * SMITHY_GEM_SPRITE.cellWidth / SMITHY_GEM_SPRITE.cellHeight);
  return [
    `width:${displayWidth}px`,
    `height:${displayHeight}px`,
    `background-image:url(${sprite.image})`,
    `background-size:${SMITHY_GEM_SPRITE.levels * 100}% 100%`,
    `background-position:${offset}% 0`,
    'background-repeat:no-repeat',
  ].join(';');
}
import { cardDnaItem } from '../core/CardDna.js';
