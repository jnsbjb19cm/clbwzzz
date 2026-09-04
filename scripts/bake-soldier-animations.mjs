/**
 * 将 soldier_skeleton.xml 中 MC{res} 动画烘焙为序列帧
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
import { shouldSkipAnimBake } from './lib/soldier-sprite-quality.mjs';
import { chromaKeyRgbaBuffer } from './lib/chroma-key.mjs';
import {
  MERGE_BOUNDS_RES,
  PER_FRAME_BOUNDS_RES,
  canvasSizeForRes,
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
const BASE_CANVAS = 220;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false,
  trimValues: true,
});

function imagePath(base) {
  const p = path.join(ATLAS_DIR, `${base}.png`);
  return fs.existsSync(p) ? p : null;
}

function isPngAtlas(atlasPath) {
  return /\.png$/i.test(atlasPath ?? '');
}

function findSprite(sprites, name) {
  return sprites.find((s) => s.name === name);
}

async function cropSprite(atlasPath, sprite) {
  if (!sprite?.width || !sprite?.height) return null;
  const fw = sprite.frameWidth ?? sprite.width;
  const fh = sprite.frameHeight ?? sprite.height;
  const fx = sprite.frameX ?? 0;
  const fy = sprite.frameY ?? 0;

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

  if (!isPngAtlas(atlasPath)) {
    const chromaOpts = chromaOptionsForSprite(sprite.name);
    chromaKeyRgbaBuffer(crop.data, crop.info.width, crop.info.height, chromaOpts);
  }

  const pasteX = fx < 0 ? -fx : fx;
  const pasteY = fy < 0 ? -fy : fy;
  const canvas = createCanvas(fw, fh);
  const ctx = canvas.getContext('2d');
  const tmp = createCanvas(crop.info.width, crop.info.height);
  const tctx = tmp.getContext('2d');
  const imgData = tctx.createImageData(crop.info.width, crop.info.height);
  imgData.data.set(crop.data);
  tctx.putImageData(imgData, 0, 0);
  ctx.drawImage(tmp, pasteX, pasteY);

  return loadImage(canvas.toBuffer('image/png'));
}

async function chromaFrameBuffer(pngBuffer) {
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // 仅清理画布四边黑底；勿对合成帧 defringe，否则会删掉贴透明区的瞳孔/描边
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
      if (data[(y * info.width + x) * 4 + 3] > 32) {
        opaque += 1;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (opaque < 60 || right < left) return null;
  return { left, top, right, bottom, opaque };
}

async function buildSpriteMap(atlasPath, sprites, displayNames) {
  const map = new Map();
  for (const name of displayNames) {
    const sp = findSprite(sprites, name);
    if (!sp) continue;
    try {
      const img = await cropSprite(atlasPath, sp);
      if (img) map.set(name, img);
    } catch {
      /* skip */
    }
  }
  return map;
}

function armatureNamesForRes(res) {
  const r = String(res);
  return [`MC${r}`, `soldier${r}/元件 1--${r}`, `soldier${r}/元件 1`];
}

function buildViewTypeMap(cards) {
  const map = new Map();
  for (const c of cards) {
    if (Number.isFinite(c.res)) map.set(Number(c.res), c.card_view_type ?? 0);
  }
  return map;
}

/** 牙/眼等内部深色：禁用 defringe 避免抠空 */
function chromaOptionsForSprite(name) {
  const n = String(name ?? '');
  if (/^soldier(2|4|5|8|18|19|21|25|31|32|54)-/.test(n)) {
    return { threshold: 20, defringe: false, soften: false };
  }
  if (/^soldier27-/.test(n) || /^soldier57-/.test(n)) {
    return { threshold: 20, defringe: false, soften: false };
  }
  return { threshold: 22 };
}

/** MC57 无 moving 骨骼：用 default 烘焙但排除环绕帧 */
const SYNTHETIC_MOVING = {
  57: { source: 'default', excludeBones: ['图层 11', '图层 12', '图层 13', '图层 14'] },
};

const BOUNDS_PAD_RES = new Map([
  [2, 20], [4, 18], [5, 10], [7, 10], [12, 24], [18, 12], [19, 32], [21, 20], [25, 18], [27, 8], [32, 32], [38, 14], [40, 20], [45, 24], [54, 12], [57, 22], [114, 14],
]);

/** 待机烘焙排除槽(与 dragonbones-bake.mjs 槽位规则对齐) */
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

async function bakeRes(res, armatureRaw, atlasPath, sprites, armByName, viewTypeMap) {
  const arm = parseArmature(armatureRaw, `MC${res}`);
  const displayNames = collectAllDisplayNames(arm, armByName);
  const spriteMap = await buildSpriteMap(atlasPath, sprites, displayNames);
  if (spriteMap.size < 1) return null;

  const bakeList = resolveBakeAnimations(arm);
  const synthMoving = SYNTHETIC_MOVING[res];
  if (synthMoving && !bakeList.some((b) => b.key === 'moving')) {
    bakeList.push({ key: 'moving', source: synthMoving.source, synthetic: true });
  }
  const bakedAnims = {};
  const canvasSize = canvasSizeForRes(res, viewTypeMap);
  const anchorY = anchorYForRes(res, viewTypeMap);
  for (const { key, source, synthetic } of bakeList) {
    const animDef = arm.animations[source];
    const frameIdxs = bakeAnimationFrames(arm, source, spriteMap, 1);
    const bakeExclude = BAKE_EXCLUDE_BONES[res]?.[key] ?? BAKE_EXCLUDE_BONES[res]?.[source];
    const excludeBones = bakeExclude
      ? new Set(bakeExclude)
      : (synthetic && key === 'moving' && synthMoving?.excludeBones)
        ? new Set(synthMoving.excludeBones)
        : null;
    const renderOpts = {
      armByName,
      armName: `MC${res}`,
      skipShadow: false,
      skipBullet: true,
      excludeBones,
    };
    const frames = [];
    for (const fi of frameIdxs) {
      const canvas = createCanvas(canvasSize, canvasSize);
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvasSize, canvasSize);
      ctx.save();
      ctx.translate(canvasSize / 2, canvasSize * anchorY);
      renderFrame(ctx, arm, source, fi, spriteMap, renderOpts);
      ctx.restore();
      const buf = await chromaFrameBuffer(canvas.toBuffer('image/png'));
      const bounds = await measurePngBounds(buf);
      if (!bounds || bounds.opaque < 60) continue;
      frames.push({ buf, bounds });
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
      : Object.keys(bakedAnims).find((k) => k.startsWith('default_'));
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
    for (const data of Object.values(bakedAnims)) {
      for (const fr of data.frames) allBounds.push(fr.bounds);
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

  const frameW = canvasSize;
  const frameH = canvasSize;
  const drawFootY = {};
  for (const [key, data] of Object.entries(bakedAnims)) {
    const b = data.frames[0]?.bounds;
    if (b) drawFootY[key] = (b.bottom + 1) / frameH;
  }
  let totalRows = 0;
  for (const a of Object.values(bakedAnims)) totalRows += a.frames.length;
  const sheet = createCanvas(frameW, frameH * totalRows);
  const sctx = sheet.getContext('2d');

  const idleFrameBounds = bakedAnims[idleKey]?.frames?.[0]?.bounds;
  const footOpaqueInset = (res === 114 && idleFrameBounds && uniformBounds)
    ? Math.max(0, uniformBounds.bottom - idleFrameBounds.bottom)
    : 0;

  const meta = {
    res,
    frameW,
    frameH,
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
    hpAnims: bakeList.filter((b) => b.hpThreshold != null && !b.isAttack && !b.isEffect).map((b) => b.key),
    attackHpAnims: bakeList.filter((b) => b.isAttack).map((b) => b.key),
    animations: {},
  };

  let row = 0;
  for (const { key, hpThreshold, isAttack } of bakeList) {
    const data = bakedAnims[key];
    if (!data) continue;
    const rects = [];
    for (const fr of data.frames) {
      const img = await loadImage(fr.buf);
      const y = row * frameH;
      sctx.drawImage(img, 0, y, frameW, frameH);
      rects.push({
        x: 0,
        y,
        w: frameW,
        h: frameH,
        bounds: fr.bounds,
      });
      row += 1;
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

  fs.writeFileSync(path.join(OUT_DIR, `${res}.png`), sheet.toBuffer('image/png'));
  fs.writeFileSync(path.join(OUT_DIR, `${res}.json`), JSON.stringify(meta, null, 2));
  return meta;
}

/** 烘焙全局状态特效骨架(vertigo 眩晕云 / freeze 冰冻 / bump 碰撞)，输出 {name}.png/json */
async function bakeGlobalArmature(name, atlasPath, sprites, armByName, { canvasSize = 200, anchorY = 0.5 } = {}) {
  const armRaw = armByName.get(name);
  if (!armRaw) {
    console.warn(`  ${name} 骨架缺失，跳过`);
    return;
  }
  const arm = parseArmature(armRaw, name);
  const displayNames = collectAllDisplayNames(arm, armByName);
  const spriteMap = await buildSpriteMap(atlasPath, sprites, displayNames);
  if (spriteMap.size < 1) {
    console.warn(`  ${name} 无可用贴图`);
    return;
  }
  const animDef = arm.animations?.default;
  const frameIdxs = bakeAnimationFrames(arm, 'default', spriteMap, 1);
  const frames = [];
  for (const fi of frameIdxs) {
    const canvas = createCanvas(canvasSize, canvasSize);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvasSize, canvasSize);
    ctx.save();
    ctx.translate(canvasSize / 2, canvasSize * anchorY);
    renderFrame(ctx, arm, 'default', fi, spriteMap, {
      armByName,
      armName: name,
      skipShadow: true,
      skipBullet: true,
    });
    ctx.restore();
    const buf = await chromaFrameBuffer(canvas.toBuffer('image/png'));
    const bounds = await measurePngBounds(buf);
    if (!bounds || bounds.opaque < 40) continue;
    frames.push({ buf, bounds });
  }
  if (!frames.length) return;
  const sheet = createCanvas(canvasSize, canvasSize * frames.length);
  const sctx = sheet.getContext('2d');
  const rects = [];
  for (let i = 0; i < frames.length; i++) {
    const img = await loadImage(frames[i].buf);
    const y = i * canvasSize;
    sctx.drawImage(img, 0, y, canvasSize, canvasSize);
    rects.push({ x: 0, y, w: canvasSize, h: canvasSize, bounds: frames[i].bounds });
  }
  const meta = {
    res: name,
    frameW: canvasSize,
    frameH: canvasSize,
    uniformBounds: padBounds(frames[0].bounds, 6, canvasSize, canvasSize),
    animations: {
      default: {
        frameRate: Math.max(4, FRAME_RATE * (animDef?.scale ?? 1)),
        frames: rects,
        loop: true,
      },
    },
  };
  fs.writeFileSync(path.join(OUT_DIR, `${name}.png`), sheet.toBuffer('image/png'));
  fs.writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify(meta, null, 2));
  console.log(`  baked ${name}(全局特效)`);
}

/** 烘焙弹道骨架(Bullet{res}：yidong 飞行 + baoza 爆炸)，输出 bullets/anim/{res}.json/png */
async function bakeBulletArmatures(atlasPath, sprites, armByName) {
  const names = [...armByName.keys()].filter((n) => /^Bullet\d+$/.test(n));
  const BULLET_OUT = path.join(ROOT, 'assets/sprites/bullets/anim');
  fs.mkdirSync(BULLET_OUT, { recursive: true });
  let count = 0;
  for (const name of names) {
    const num = name.replace('Bullet', '');
    const arm = parseArmature(armByName.get(name), name);
    const displayNames = collectAllDisplayNames(arm, armByName);
    const spriteMap = await buildSpriteMap(atlasPath, sprites, displayNames);
    if (spriteMap.size < 1) continue;
    // 画布 160：baoza 爆炸会向外扩张，72 会把爆炸裁掉(Bullet17/58 边界撞到 0/71)
    const canvasSize = 160;
    const anchorY = 0.5;
    const baked = {};
    for (const animName of ['yidong', 'baoza']) {
      const animDef = arm.animations?.[animName];
      if (!animDef) continue;
      const frameIdxs = bakeAnimationFrames(arm, animName, spriteMap, 1);
      const frames = [];
      for (const fi of frameIdxs) {
        const canvas = createCanvas(canvasSize, canvasSize);
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvasSize, canvasSize);
        ctx.save();
        ctx.translate(canvasSize / 2, canvasSize * anchorY);
        renderFrame(ctx, arm, animName, fi, spriteMap, {
          armByName,
          armName: name,
          skipShadow: true,
          skipBullet: false,
        });
        ctx.restore();
        const buf = await chromaFrameBuffer(canvas.toBuffer('image/png'));
        const bounds = await measurePngBounds(buf);
        if (!bounds || bounds.opaque < 20) continue;
        frames.push({ buf, bounds });
      }
      if (frames.length) baked[animName] = { frames, animDef };
    }
    if (!baked.yidong && !baked.baoza) continue;
    const total = (baked.yidong?.frames.length ?? 0) + (baked.baoza?.frames.length ?? 0);
    const sheet = createCanvas(canvasSize, canvasSize * total);
    const sctx = sheet.getContext('2d');
    const rects = {};
    let row = 0;
    for (const [key, data] of Object.entries(baked)) {
      rects[key] = [];
      for (const fr of data.frames) {
        const img = await loadImage(fr.buf);
        sctx.drawImage(img, 0, row * canvasSize, canvasSize, canvasSize);
        rects[key].push({ x: 0, y: row * canvasSize, w: canvasSize, h: canvasSize, bounds: fr.bounds });
        row += 1;
      }
    }
    const meta = { res: num, frameW: canvasSize, frameH: canvasSize, animations: {} };
    for (const [key, data] of Object.entries(baked)) {
      meta.animations[key] = {
        frameRate: Math.max(4, FRAME_RATE * (data.animDef?.scale ?? 1)),
        frames: rects[key],
        loop: key === 'yidong',
        duration: Math.max(0.01, (data.animDef?.duration ?? 1) / 24),
      };
    }
    fs.writeFileSync(path.join(BULLET_OUT, `${num}.png`), sheet.toBuffer('image/png'));
    fs.writeFileSync(path.join(BULLET_OUT, `${num}.json`), JSON.stringify(meta, null, 2));
    count += 1;
  }
  console.log(`  bullets 弹道烘焙 ${count} 个 -> assets/sprites/bullets/anim/`);
}

async function main() {
  const atlasPath = imagePath('soldier');
  if (!atlasPath) {
    console.error('缺少 soldier 图集');
    process.exit(1);
  }
  if (isPngAtlas(atlasPath)) {
    console.log('  烘焙图集源: PNG(保留 alpha，跳过子图抠图)');
  }

  const skeletonXml = fs.readFileSync(SKELETON, 'utf8');
  const skeleton = parser.parse(skeletonXml);
  const armatures = toArray(skeleton.dragonBones?.armature);
  const armByName = new Map(armatures.map((a) => [a.name, a]));

  const soldierAtlas = JSON.parse(fs.readFileSync(ATLAS_JSON, 'utf8'));
  const cards = JSON.parse(fs.readFileSync(CARD_JSON, 'utf8'));
  const resSet = new Set(cards.map((c) => Number(c.res)).filter((n) => Number.isFinite(n)));
  const viewTypeMap = buildViewTypeMap(cards);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  const prevManifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    : null;

  const manifest = {
    generatedAt: new Date().toISOString(),
    baked: [],
    missing: [],
    skippedAnim: [],
  };

  const onlyRes = process.argv.slice(2).map(Number).filter(Number.isFinite);
  const partial = onlyRes.length > 0;
  const vertigoOnly = process.argv.includes('--vertigo-only');

  // Global-effect-only runs must never erase the already baked unit catalog.
  if (vertigoOnly && prevManifest) {
    manifest.baked.push(...(prevManifest.baked ?? []));
    manifest.missing.push(...(prevManifest.missing ?? []));
    manifest.skippedAnim.push(...(prevManifest.skippedAnim ?? []));
  }

  if (vertigoOnly) {
    console.log('  --vertigo-only：仅烘焙全局眩晕动画，跳过单位动画');
  }

  for (const res of [...resSet].sort((a, b) => a - b)) {
    if (vertigoOnly) break;
    if (onlyRes.length && !onlyRes.includes(res)) continue;
    if (shouldSkipAnimBake(soldierAtlas.sprites, res)) {
      manifest.skippedAnim.push(res);
      for (const ext of ['.png', '.json']) {
        const p = path.join(OUT_DIR, `${res}${ext}`);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
      continue;
    }

    let armRaw = null;
    for (const name of armatureNamesForRes(res)) {
      if (armByName.has(name)) {
        armRaw = armByName.get(name);
        break;
      }
    }
    if (!armRaw) {
      manifest.missing.push(res);
      continue;
    }
    try {
      const meta = await bakeRes(res, armRaw, atlasPath, soldierAtlas.sprites, armByName, viewTypeMap);
      if (meta) manifest.baked.push(res);
      else manifest.missing.push(res);
    } catch (e) {
      console.error(`  bake res=${res} failed:`, e.message);
      manifest.missing.push(res);
    }
  }

  if (partial && prevManifest) {
    const touched = new Set([...manifest.baked, ...manifest.missing, ...manifest.skippedAnim]);
    // 老 manifest 可能为空或只记录上一次局部烘焙。以磁盘上的完整 png+json
    // 资源为事实来源补回未触碰卡牌，避免 `bake 18 20` 把清单缩成两三项。
    const existingUntouched = [...resSet].filter((res) => (
      !touched.has(res)
      && fs.existsSync(path.join(OUT_DIR, `${res}.json`))
      && fs.existsSync(path.join(OUT_DIR, `${res}.png`))
    ));
    for (const res of [...(prevManifest.baked ?? []), ...existingUntouched]) {
      if (!touched.has(res) && fs.existsSync(path.join(OUT_DIR, `${res}.json`))) {
        manifest.baked.push(res);
      }
    }
    for (const res of prevManifest.skippedAnim ?? []) {
      if (!touched.has(res)) manifest.skippedAnim.push(res);
    }
    manifest.baked = [...new Set(manifest.baked)].sort((a, b) => a - b);
    manifest.skippedAnim = [...new Set(manifest.skippedAnim)].sort((a, b) => a - b);
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  if (!vertigoOnly) {
    const rebaked = partial ? onlyRes.length : manifest.baked.length;
    console.log(`  单位动画 ${manifest.baked.length}(本次重烘焙 ${rebaked})-> assets/sprites/unit_anim/`);
    if (manifest.skippedAnim.length) {
      console.log(
        `  无效动画跳过 ${manifest.skippedAnim.length} 个: ${manifest.skippedAnim.slice(0, 12).join(', ')}${manifest.skippedAnim.length > 12 ? '…' : ''}`,
      );
    }
    if (manifest.missing.length) {
      console.log(`  无骨骼/烘焙失败: ${manifest.missing.length} 个 res`);
    }
  }

  // 全局状态特效(问题7/5：眩晕云、冰冻、碰撞)，不随单位循环
  for (const name of ['vertigo', 'freeze', 'bump']) {
    await bakeGlobalArmature(name, atlasPath, soldierAtlas.sprites, armByName);
  }

  // 品质光环(qualityLightCircle，原版品质光表现，替换手绘椭圆)
  await bakeGlobalArmature('qualityLightCircle', atlasPath, soldierAtlas.sprites, armByName);

  // 弹道骨架(yidong 飞行 + baoza 爆炸)
  await bakeBulletArmatures(atlasPath, soldierAtlas.sprites, armByName);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
