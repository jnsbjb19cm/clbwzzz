export const SMITHY_MATERIAL_ART = Object.freeze({
  parchment: [
    new URL('../../resources/img/parchment1.png', import.meta.url).href,
    new URL('../../resources/img/parchment2.png', import.meta.url).href,
    new URL('../../resources/img/parchment3.png', import.meta.url).href,
    new URL('../../resources/img/parchment4.png', import.meta.url).href,
  ],
  dna: [
    new URL('../../resources/img/DNA1.png', import.meta.url).href,
    new URL('../../resources/img/DNA2.png', import.meta.url).href,
    new URL('../../resources/img/DNA3.png', import.meta.url).href,
    new URL('../../resources/img/DNA4.png', import.meta.url).href,
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
  if (id >= 50001 && id <= 50004) return SMITHY_MATERIAL_ART.parchment[id - 50001];
  if (id >= 50031 && id <= 50034) return SMITHY_MATERIAL_ART.dna[id - 50031];
  if (id >= 50021 && id <= 50024) return SMITHY_MATERIAL_ART.charm[id - 50021];
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
