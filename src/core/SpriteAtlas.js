const cache = new Map();
const SPRITE_CACHE_BUST = '20260625f';

/** 卡牌立绘(UI 用) */
export function cardSpriteUrl(res) {
  return `/sprites/cards/${String(res)}.png?v=${SPRITE_CACHE_BUST}`;
}

/** 战场单位精灵 */
export function unitSpriteUrl(res) {
  return `/sprites/units/${String(res)}.png?v=${SPRITE_CACHE_BUST}`;
}

/** 子弹精灵(按 res 裁切) */
export function bulletSpriteUrl(res) {
  return `/sprites/bullets/${String(res)}.png`;
}

/** 卡牌部件(底座、槽位背景等) */
export function partSpriteUrl(name) {
  return `/sprites/parts/${name}.png`;
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** soldier 图集多为动画小帧，小于此尺寸则战场用卡牌立绘 */
const MIN_BATTLE_W = 64;
const MIN_BATTLE_H = 64;
const MIN_BATTLE_AREA = 4000;

function isDisplayQuality(img) {
  if (!img) return false;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  return w >= MIN_BATTLE_W && h >= MIN_BATTLE_H && w * h >= MIN_BATTLE_AREA;
}

const fillRatioCache = new WeakMap();
const opaqueBoundsCache = new WeakMap();

/** 立绘非透明像素外接框(图像坐标) */
export function getOpaqueBounds(img) {
  if (!img) return null;
  if (opaqueBoundsCache.has(img)) return opaqueBoundsCache.get(img);

  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return null;

  const canvas = document.createElement('canvas');
  canvas.width = iw;
  canvas.height = ih;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, iw, ih).data;
  let left = iw;
  let right = 0;
  let top = ih;
  let bottom = 0;
  let found = false;

  for (let y = 0; y < ih; y++) {
    for (let x = 0; x < iw; x++) {
      if (data[(y * iw + x) * 4 + 3] > 32) {
        found = true;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }

  const bounds = found ? { left, top, right, bottom, width: iw, height: ih } : null;
  opaqueBoundsCache.set(img, bounds);
  return bounds;
}

/** drawContained 实际绘制矩形 */
export function calcContainedRect(img, boxX, boxY, boxW, boxH) {
  if (!img) {
    return { dx: boxX, dy: boxY, dw: boxW, dh: boxH, scale: 1, iw: boxW, ih: boxH };
  }
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.min(boxW / iw, boxH / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = boxX + (boxW - dw) / 2;
  const dy = boxY + (boxH - dh) / 2;
  return { dx, dy, dw, dh, scale, iw, ih };
}

/**
 * 立绘脚底锚点：光环应贴在非透明区域底边正下方
 * @returns {{ centerX: number, footY: number, bodyWidth: number }}
 */
export function calcFootAnchor(img, boxX, boxY, boxW, boxH, { flipX = false } = {}) {
  const { dx, dy, dw, dh, scale, iw, ih } = calcContainedRect(img, boxX, boxY, boxW, boxH);
  const ob = getOpaqueBounds(img);

  if (!ob) {
    return { centerX: dx + dw / 2, footY: dy + dh, bodyWidth: dw };
  }

  let left = dx + ob.left * scale;
  let right = dx + (ob.right + 1) * scale;
  const top = dy + ob.top * scale;
  const footY = dy + (ob.bottom + 1) * scale;

  if (flipX) {
    const flippedLeft = dx + (iw - ob.right - 1) * scale;
    const flippedRight = dx + (iw - ob.left) * scale;
    left = flippedLeft;
    right = flippedRight;
  }

  return {
    centerX: (left + right) / 2,
    footY,
    bodyWidth: right - left,
    top,
  };
}

/** 非透明像素占画布比例，用于识别仅一条弧线等残缺士兵帧 */
function getOpaqueFillRatio(img) {
  if (!img) return 0;
  if (fillRatioCache.has(img)) return fillRatioCache.get(img);

  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return 0;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;

  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 32) opaque += 1;
  }
  const ratio = opaque / (w * h);
  fillRatioCache.set(img, ratio);
  return ratio;
}

function pickBattleSprite(unitImg, cardImg) {
  if (!cardImg) return unitImg;
  if (!unitImg) return cardImg;

  const uw = unitImg.naturalWidth || unitImg.width;
  const uh = unitImg.naturalHeight || unitImg.height;
  const aspect = uw / Math.max(1, uh);
  const unitFill = getOpaqueFillRatio(unitImg);
  const cardFill = getOpaqueFillRatio(cardImg);

  const unitSparse = unitFill < 0.14 || unitFill < cardFill * 0.5;
  const unitBadShape = aspect > 2.6 || aspect < 0.38;
  const unitTooSmall = !isDisplayQuality(unitImg) || uw * uh < (cardImg.naturalWidth || 1) * (cardImg.naturalHeight || 1) * 0.45;

  if (unitSparse || unitBadShape || unitTooSmall) return cardImg;
  return unitImg;
}

/**
 * 战场 Canvas：优先完整士兵帧；残缺/稀疏帧回退卡牌立绘(与图鉴一致)
 */
export class SpriteAtlas {
  /** 卡牌立绘 PNG(resources/img 裁切，战场/UI 统一路径) */
  static async loadCard(res) {
    const key = `card:${String(res)}`;
    if (cache.has(key)) return cache.get(key);

    const promise = loadImage(cardSpriteUrl(res));
    cache.set(key, promise);
    return promise;
  }

  /** 战场单位帧(不混卡牌立绘，避免与烘焙动画叠成静态重影) */
  static async loadUnit(res) {
    const key = `unit:${String(res)}`;
    if (cache.has(key)) return cache.get(key);

    const promise = loadImage(unitSpriteUrl(res));
    cache.set(key, promise);
    return promise;
  }

  static async load(res) {
    const key = String(res);
    if (cache.has(key)) return cache.get(key);

    const promise = (async () => {
      const [unitImg, cardImg] = await Promise.all([
        SpriteAtlas.loadUnit(res),
        SpriteAtlas.loadCard(res),
      ]);
      return pickBattleSprite(unitImg, cardImg) ?? unitImg ?? cardImg;
    })();

    cache.set(key, promise);
    return promise;
  }

  static async loadPart(name) {
    const key = `part:${name}`;
    if (cache.has(key)) return cache.get(key);

    const promise = loadImage(partSpriteUrl(name));
    cache.set(key, promise);
    return promise;
  }

  static async loadBullet(res) {
    const key = `bullet:${res}`;
    if (cache.has(key)) return cache.get(key);

    const promise = (async () => {
      let img = await loadImage(bulletSpriteUrl(res));
      if (!img) img = await loadImage('/sprites/bullets/default.png');
      return img;
    })();

    cache.set(key, promise);
    return promise;
  }

  static draw(ctx, img, x, y, w, h) {
    if (img) {
      ctx.drawImage(img, x, y, w, h);
      return;
    }
    ctx.fillStyle = '#334155';
    ctx.fillRect(x, y, w, h);
  }

  /** 等比缩放居中，适合竖版卡牌立绘；flipX 用于敌方朝左 */
  static drawContained(ctx, img, x, y, w, h, { flipX = false } = {}) {
    if (!img) {
      ctx.fillStyle = '#334155';
      ctx.fillRect(x, y, w, h);
      return;
    }
    const { dx, dy, dw, dh } = calcContainedRect(img, x, y, w, h);

    if (flipX) {
      ctx.save();
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, dw, dh);
      ctx.restore();
      return;
    }
    ctx.drawImage(img, dx, dy, dw, dh);
  }
}