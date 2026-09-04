/**
 * 对攻击动作明显撞到烘焙画布边缘的单位做“大画布 + 多列图集”重烘焙。
 *
 * 为什么单独做这一步：
 * - 旧单位图集每帧通常只有 220x220，蘑菇仙人 res=58 的攻击帧连续出现
 *   right=219 / top=0，说明像素在烘焙阶段已经被切掉；运行时再放宽裁剪也无法找回。
 * - 直接把 130 帧 * 800px 纵向堆叠会得到 104000px 高图集，容易超过浏览器/GPU限制。
 * - 因此这里把大帧按多列排列，frame x/y 都写入 JSON，运行时无需额外改协议。
 *
 * 默认只重烘焙已确认有问题的 res=58：
 *   node scripts/rebake-wide-unit-animations.mjs
 *
 * 指定单位：
 *   node scripts/rebake-wide-unit-animations.mjs 58 56 77
 *
 * Debug 全量（只用于排查，不建议提交生成物）：
 *   node scripts/rebake-wide-unit-animations.mjs --all
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { XMLParser } from 'fast-xml-parser';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import sharp from 'sharp';
import {
  bakeAnimationFrames,
  collectAllDisplayNames,
  mergeBoundsList,
  padBounds,
  parseArmature,
  renderFrame,
  resolveBakeAnimations,
  toArray,
} from './lib/dragonbones-bake.mjs';
import { chromaKeyRgbaBuffer } from './lib/chroma-key.mjs';
import {
  MERGE_BOUNDS_RES,
  PER_FRAME_BOUNDS_RES,
  scaleBoostForRes,
  anchorYForRes,
} from './lib/unit-display-tuning.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SKELETON = path.join(ROOT, 'assets/assets/dySkeletonXML/soldier_skeleton.xml');
const ATLAS_JSON = path.join(ROOT, 'src/data/atlas/dyload_soldier.json');
const CARD_JSON = path.join(ROOT, 'src/data/card.json');
const ATLAS_DIR = path.join(ROOT, 'assets/atlas');
const OUT_DIR = path.join(ROOT, 'assets/sprites/unit_anim');

const FRAME_RATE = 12;
// 600px was still too short for several extreme death/attack poses (for
// example res 41/62/101/116). Once a source pose touches this debug canvas,
// the later compact pass cannot recover the missing pixels.
const WIDE_FRAME_SIZE = 800;
const EXTRA_WIDE_FRAME_SIZE = new Map([
  [116, 1000],
]);
const MAX_SHEET_HEIGHT = 12_000;
const DEFAULT_WIDE_RES = [58];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false,
  trimValues: true,
});

function imagePath(base) {
  const file = path.join(ATLAS_DIR, `${base}.png`);
  return fs.existsSync(file) ? file : null;
}

function isPngAtlas(atlasPath) {
  return /\.png$/i.test(atlasPath ?? '');
}

function findSprite(sprites, name) {
  return sprites.find((sprite) => sprite.name === name);
}

function chromaOptionsForSprite(name) {
  const value = String(name ?? '');
  if (/^soldier(2|4|5|8|18|19|21|25|31|32|54)-/.test(value)) {
    return { threshold: 20, defringe: false, soften: false };
  }
  if (/^soldier27-/.test(value) || /^soldier57-/.test(value)) {
    return { threshold: 20, defringe: false, soften: false };
  }
  return { threshold: 22 };
}

async function cropSprite(atlasPath, sprite) {
  if (!sprite?.width || !sprite?.height) return null;
  const frameW = sprite.frameWidth ?? sprite.width;
  const frameH = sprite.frameHeight ?? sprite.height;
  const frameX = sprite.frameX ?? 0;
  const frameY = sprite.frameY ?? 0;

  const crop = await sharp(atlasPath)
    .extract({
      left: Math.max(0, sprite.x),
      top: Math.max(0, sprite.y),
      width: sprite.width,
      height: sprite.height,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // 与主烘焙脚本一致：PNG 图集已经有正确 alpha，不能再次按黑底色键抠图，
  // 否则眼睛、描边、法杖暗部会被误删。
  if (!isPngAtlas(atlasPath)) {
    const chroma = chromaOptionsForSprite(sprite.name);
    chromaKeyRgbaBuffer(crop.data, crop.info.width, crop.info.height, chroma);
  }

  const pasteX = frameX < 0 ? -frameX : frameX;
  const pasteY = frameY < 0 ? -frameY : frameY;
  const canvas = createCanvas(frameW, frameH);
  const ctx = canvas.getContext('2d');
  const tmp = createCanvas(crop.info.width, crop.info.height);
  const tmpCtx = tmp.getContext('2d');
  const imageData = tmpCtx.createImageData(crop.info.width, crop.info.height);
  imageData.data.set(crop.data);
  tmpCtx.putImageData(imageData, 0, 0);
  ctx.drawImage(tmp, pasteX, pasteY);
  return loadImage(canvas.toBuffer('image/png'));
}

async function chromaFrameBuffer(pngBuffer) {
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // 合成帧只清理画布边缘的残留黑底，不做 defringe，保留角色内部深色细节。
  chromaKeyRgbaBuffer(data, info.width, info.height, {
    threshold: 22,
    defringe: false,
    soften: false,
  });
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  }).png().toBuffer();
}

async function measurePngBounds(pngBuffer) {
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let left = info.width;
  let right = -1;
  let top = info.height;
  let bottom = -1;
  let opaque = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] <= 32) continue;
      opaque += 1;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (opaque < 60 || right < left) return null;
  return { left, top, right, bottom, opaque };
}

async function buildSpriteMap(atlasPath, sprites, displayNames) {
  const map = new Map();
  for (const name of displayNames) {
    const sprite = findSprite(sprites, name);
    if (!sprite) continue;
    try {
      const image = await cropSprite(atlasPath, sprite);
      if (image) map.set(name, image);
    } catch {
      // 单个部件失败不应中断整张卡；与主烘焙脚本保持相同行为。
    }
  }
  return map;
}

function armatureNamesForRes(res) {
  const value = String(res);
  return [`MC${value}`, `soldier${value}/元件 1--${value}`, `soldier${value}/元件 1`];
}

function buildViewTypeMap(cards) {
  const map = new Map();
  for (const card of cards) {
    if (Number.isFinite(card.res)) map.set(Number(card.res), card.card_view_type ?? 0);
  }
  return map;
}

const SYNTHETIC_MOVING = {
  57: { source: 'default', excludeBones: ['图层 11', '图层 12', '图层 13', '图层 14'] },
};

const BAKE_EXCLUDE_BONES = {
  4: {
    default: ['bullet'],
    moving: ['bullet'],
    attacking: ['bullet'],
  },
  25: {
    default: ['bullet'],
    moving: ['bullet'],
    attacking: ['bullet'],
  },
  57: {
    default: ['图层 11', '图层 12', '图层 13', '图层 14'],
  },
};

const BOUNDS_PAD_RES = new Map([
  [2, 20], [4, 18], [5, 10], [7, 10], [12, 24], [18, 12], [19, 32], [21, 20],
  [25, 18], [27, 8], [32, 32], [38, 14], [40, 20], [45, 24], [54, 12], [57, 22], [114, 14],
]);

function sheetPlacement(index, frameW, frameH, totalFrames) {
  const rowsPerColumn = Math.max(1, Math.floor(MAX_SHEET_HEIGHT / frameH));
  const columns = Math.ceil(totalFrames / rowsPerColumn);
  const rows = Math.min(totalFrames, rowsPerColumn);
  const column = Math.floor(index / rowsPerColumn);
  const row = index % rowsPerColumn;
  return {
    x: column * frameW,
    y: row * frameH,
    sheetW: columns * frameW,
    sheetH: rows * frameH,
  };
}

async function bakeWideRes(res, armatureRaw, atlasPath, sprites, armByName, viewTypeMap) {
  const arm = parseArmature(armatureRaw, `MC${res}`);
  const displayNames = collectAllDisplayNames(arm, armByName);
  const spriteMap = await buildSpriteMap(atlasPath, sprites, displayNames);
  if (spriteMap.size < 1) return null;

  const bakeList = resolveBakeAnimations(arm);
  const syntheticMoving = SYNTHETIC_MOVING[res];
  if (syntheticMoving && !bakeList.some((entry) => entry.key === 'moving')) {
    bakeList.push({ key: 'moving', source: syntheticMoving.source, synthetic: true });
  }

  const canvasSize = EXTRA_WIDE_FRAME_SIZE.get(res) ?? WIDE_FRAME_SIZE;
  const anchorY = anchorYForRes(res, viewTypeMap);
  const bakedAnims = {};

  for (const { key, source, synthetic } of bakeList) {
    const animDef = arm.animations[source];
    const frameIndices = bakeAnimationFrames(arm, source, spriteMap, 1);
    const bakeExclude = BAKE_EXCLUDE_BONES[res]?.[key] ?? BAKE_EXCLUDE_BONES[res]?.[source];
    const excludeBones = bakeExclude
      ? new Set(bakeExclude)
      : (synthetic && key === 'moving' && syntheticMoving?.excludeBones)
        ? new Set(syntheticMoving.excludeBones)
        : null;
    const renderOptions = {
      armByName,
      armName: `MC${res}`,
      skipShadow: false,
      skipBullet: true,
      excludeBones,
    };
    const frames = [];

    for (const frameIndex of frameIndices) {
      const canvas = createCanvas(canvasSize, canvasSize);
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvasSize, canvasSize);
      ctx.save();
      ctx.translate(canvasSize / 2, canvasSize * anchorY);
      renderFrame(ctx, arm, source, frameIndex, spriteMap, renderOptions);
      ctx.restore();
      const buffer = await chromaFrameBuffer(canvas.toBuffer('image/png'));
      const bounds = await measurePngBounds(buffer);
      if (!bounds || bounds.opaque < 60) continue;
      frames.push({ buffer, bounds });
    }

    if (frames.length) {
      const animScale = animDef?.scale ?? 1;
      bakedAnims[key] = {
        frameRate: Math.max(4, FRAME_RATE * animScale),
        frames,
        loop: key === 'default' || key === 'moving' || key === 'flying'
          || /^default_\d+$/.test(key),
      };
    }
  }

  const idleKey = bakedAnims.default
    ? 'default'
    : bakedAnims.flying
      ? 'flying'
      : Object.keys(bakedAnims).find((key) => key.startsWith('default_'));
  if (!idleKey) return null;

  const isFlyingUnit = viewTypeMap.get(res) === 6;
  const boundsPad = BOUNDS_PAD_RES.get(res) ?? 6;
  let uniformBounds;
  if (isFlyingUnit) {
    uniformBounds = padBounds(
      bakedAnims[idleKey].frames[0].bounds,
      boundsPad,
      canvasSize,
      canvasSize,
    );
  } else if (MERGE_BOUNDS_RES.has(res)) {
    const allBounds = [];
    for (const animation of Object.values(bakedAnims)) {
      for (const frame of animation.frames) allBounds.push(frame.bounds);
    }
    uniformBounds = mergeBoundsList(allBounds, boundsPad, canvasSize, canvasSize);
  } else {
    uniformBounds = padBounds(
      bakedAnims[idleKey].frames[0].bounds,
      boundsPad,
      canvasSize,
      canvasSize,
    );
  }

  const drawFootY = {};
  for (const [key, data] of Object.entries(bakedAnims)) {
    const bounds = data.frames[0]?.bounds;
    if (bounds) drawFootY[key] = (bounds.bottom + 1) / canvasSize;
  }

  const totalFrames = Object.values(bakedAnims)
    .reduce((sum, animation) => sum + animation.frames.length, 0);
  if (!totalFrames) return null;
  const firstPlacement = sheetPlacement(0, canvasSize, canvasSize, totalFrames);
  const sheet = createCanvas(firstPlacement.sheetW, firstPlacement.sheetH);
  const sheetCtx = sheet.getContext('2d');

  const idleFrameBounds = bakedAnims[idleKey]?.frames?.[0]?.bounds;
  const footOpaqueInset = (res === 114 && idleFrameBounds && uniformBounds)
    ? Math.max(0, uniformBounds.bottom - idleFrameBounds.bottom)
    : 0;

  const meta = {
    res,
    frameW: canvasSize,
    frameH: canvasSize,
    sheetLayout: {
      mode: 'columns',
      maxHeight: MAX_SHEET_HEIGHT,
      width: firstPlacement.sheetW,
      height: firstPlacement.sheetH,
    },
    uniformBounds,
    drawFootY: Object.keys(drawFootY).length ? drawFootY : undefined,
    footOpaqueInset,
    scaleBoost: scaleBoostForRes(res, viewTypeMap),
    usePerFrameBounds: PER_FRAME_BOUNDS_RES.has(res),
    flying: isFlyingUnit,
    hasSkeletonShadow: arm.slots.some((slot) =>
      slot.name === '影子'
      || slot.parent === '影子'
      || slot.displays?.some((display) => display.name === '影子')
    ),
    hpAnims: bakeList
      .filter((entry) => entry.hpThreshold != null && !entry.isAttack && !entry.isEffect)
      .map((entry) => entry.key),
    attackHpAnims: bakeList.filter((entry) => entry.isAttack).map((entry) => entry.key),
    animations: {},
  };

  let globalFrameIndex = 0;
  for (const { key, hpThreshold, isAttack } of bakeList) {
    const data = bakedAnims[key];
    if (!data) continue;
    const rects = [];
    for (const frame of data.frames) {
      const image = await loadImage(frame.buffer);
      const placement = sheetPlacement(globalFrameIndex, canvasSize, canvasSize, totalFrames);
      sheetCtx.drawImage(image, placement.x, placement.y, canvasSize, canvasSize);
      rects.push({
        x: placement.x,
        y: placement.y,
        w: canvasSize,
        h: canvasSize,
        bounds: frame.bounds,
      });
      globalFrameIndex += 1;
    }
    meta.animations[key] = {
      frameRate: data.frameRate,
      frames: rects,
      loop: data.loop,
      releaseFrame: (isAttack || key === 'attacking' || key.startsWith('attacking_'))
        ? (res === 20
          ? Math.min(rects.length - 1, 9)
          : Math.max(1, Math.round(rects.length * 0.42)))
        : undefined,
      hpThreshold: hpThreshold ?? undefined,
      isAttack: isAttack ?? undefined,
    };
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${res}.png`), sheet.toBuffer('image/png'));
  fs.writeFileSync(path.join(OUT_DIR, `${res}.json`), JSON.stringify(meta, null, 2));
  return meta;
}

function updateManifest(rebaked) {
  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  let manifest = { generatedAt: new Date().toISOString(), baked: [], missing: [], skippedAnim: [] };
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      // 使用空 manifest 继续，避免陈旧/损坏 manifest 阻断修复。
    }
  }
  manifest.generatedAt = new Date().toISOString();
  manifest.baked = [...new Set([...(manifest.baked ?? []), ...rebaked])].sort((a, b) => a - b);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

async function main() {
  const atlasPath = imagePath('soldier');
  if (!atlasPath) throw new Error('缺少 assets/atlas/soldier.png');
  if (!fs.existsSync(SKELETON)) throw new Error('缺少 soldier_skeleton.xml');

  const skeleton = parser.parse(fs.readFileSync(SKELETON, 'utf8'));
  const armatures = toArray(skeleton.dragonBones?.armature);
  const armByName = new Map(armatures.map((armature) => [armature.name, armature]));
  const soldierAtlas = JSON.parse(fs.readFileSync(ATLAS_JSON, 'utf8'));
  const cards = JSON.parse(fs.readFileSync(CARD_JSON, 'utf8'));
  const viewTypeMap = buildViewTypeMap(cards);
  const allRes = [...new Set(cards.map((card) => Number(card.res)).filter(Number.isFinite))]
    .sort((a, b) => a - b);

  const numericArgs = process.argv.slice(2)
    .filter((arg) => !arg.startsWith('--'))
    .map(Number)
    .filter(Number.isFinite);
  const requested = process.argv.includes('--all')
    ? allRes
    : (numericArgs.length ? numericArgs : DEFAULT_WIDE_RES);

  const rebaked = [];
  for (const res of requested) {
    let armatureRaw = null;
    for (const name of armatureNamesForRes(res)) {
      if (armByName.has(name)) {
        armatureRaw = armByName.get(name);
        break;
      }
    }
    if (!armatureRaw) {
      console.warn(`  wide bake res=${res}: 无骨骼，跳过`);
      continue;
    }
    const meta = await bakeWideRes(
      res,
      armatureRaw,
      atlasPath,
      soldierAtlas.sprites,
      armByName,
      viewTypeMap,
    );
    if (!meta) {
      console.warn(`  wide bake res=${res}: 无有效帧，跳过`);
      continue;
    }
    rebaked.push(res);
    const attackFrames = Object.entries(meta.animations)
      .filter(([key, animation]) => key === 'attacking' || key.startsWith('attack_') || animation.isAttack)
      .flatMap(([, animation]) => animation.frames);
    const edgeHits = attackFrames.filter((frame) => {
      const bounds = frame.bounds;
      return bounds
        && (bounds.left <= 2
          || bounds.top <= 2
          || bounds.right >= meta.frameW - 3
          || bounds.bottom >= meta.frameH - 3);
    });
    if (edgeHits.length) {
      console.warn(`  wide bake res=${res}: 仍有 ${edgeHits.length} 个攻击帧接近 ${canvasSize}px 边缘，请继续检查源骨骼`);
    }
    console.log(`  wide bake res=${res}: ${meta.frameW}x${meta.frameH}, sheet ${meta.sheetLayout.width}x${meta.sheetLayout.height}`);
  }

  if (rebaked.length) updateManifest(rebaked);
  console.log(`  wide unit animations 完成: ${rebaked.join(', ') || 'none'}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
