import {
  CELL_H,
  CELL_W,
  ENEMY_BASE_FRAC,
  FIELD_H,
  FIELD_W,
  LANES,
  PLAYER_BASE_FRAC,
  cellCenterX,
  cellCenterY,
  cellY,
  colFracToX,
  formatBattleDelta,
  fracColToCenterX,
  laneFracToY,
} from './BattleConfig.js';
import {
  normalizeCraftQuality,
  resolveCraftQuality,
} from '../core/constants.js';
import { SpriteAtlas, calcFootAnchor } from '../core/SpriteAtlas.js';
import { isEffectivelyFlying, unitAnimPlayer } from './UnitAnimPlayer.js';
import { skillAnimPlayer } from './SkillAnimPlayer.js';
import { guardBattleRuntime } from './BattleRuntimeDiagnostics.js';
import effectAtlas from '../data/atlas/preload_effect.json' with { type: 'json' };
import skillPosData from '../data/skillPosition.json' with { type: 'json' };
import battleAtlasData from '../data/atlas/preload_battle.json' with { type: 'json' };
import itemAtlasData from '../data/atlas/preload_items.json' with { type: 'json' };

// 技能动画位置(skillPosition.xml)：1=单格 2=全屏 4=格左右 5=英雄位 6=固定x
const SKILL_FX_POS = new Map();
for (const row of skillPosData) {
  if (row.position != null) SKILL_FX_POS.set(Number(row.cardId), Number(row.position));
}

// 伤害/治疗数字精灵(battle.atf：number_r_* 红=扣血，number_g_* 绿=回血)
const BATTLE_NUM_RECTS = new Map();
for (const s of battleAtlasData.sprites ?? []) {
  if (/^number_[rg]_/.test(s.name)) BATTLE_NUM_RECTS.set(s.name, s);
}
import {
  backColPortraitShiftX,
  CARD_FACE_OVERLAY,
  drawCardFaceOverlay,
  flyingAltitudeForRes,
  flyingBoxBoostForRes,
  frontColPortraitShiftX,
  isDeferredTopLayerUnit,
  isPlayerAttacking,
  RES_DRAW_SCALE,
  resNum,
  shouldDrawCardFaceOverlay,
} from './unitDisplayTuning.js';

const CACTUS_BULLET_RES = new Set([4, 25]);
const IMPACT_FRAMES = effectAtlas.sprites
  .filter((sprite) => sprite.name.startsWith('ball-flicker'))
  .sort((a, b) => a.name.localeCompare(b.name));
const FULL_SCREEN_SKILL_KINDS = new Set([
  'damage_all_enemies',
  'freeze_all_enemies',
  'heal_all_allies',
  'invuln_all_allies',
  'buff_atk_allies',
  'sacred_revival',
  'fatal_curse',
  'thunderstorm',
  'firebird',
]);

const PART_SPRITES = [
  'single_star_0',
  'single_star_1',
  'single_star_2',
  'single_star_3',
  'single_star_4',
  'single_star_5',
  'single_star_6',
];

const UNIT_DRAW_SCALE = 1.68;
const HEAVY_RENDER_FRAME_MS = 1000 / 30;
const HEAVY_UNIT_COUNT = 24;
const LOW_QUALITY_UNIT_COUNT = 20;
const LOW_QUALITY_EFFECT_COUNT = 40;
const EFFECT_DRAW_CAP_NORMAL = 64;
const EFFECT_DRAW_CAP_LOW = 24;

/** 传说级大型单位：战争古树 / 火龙 / 死神 */
const LARGE_UNIT_RES = new Set([55, 56, 57]);
const LARGE_UNIT_DRAW_SCALE = 1.78;
const LARGE_UNIT_DRAW_SCALE_57 = 1.62;
/** 脚钉在本行、头部可越界的巨型单位 */
const LANE_FOOT_ANCHOR_RES = new Set([35, 55, 56, 57, 114]);

function parseHexColor(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function getHaloColor(craftQuality) {
  return resolveCraftQuality(normalizeCraftQuality(craftQuality)).color;
}
const ITEM_RECTS = new Map(
  (itemAtlasData.sprites ?? []).map((sprite) => [Number(sprite.name), sprite]),
);

function drawFirebirdFx(ctx, fx, alpha) {
  const progress = Math.max(0, Math.min(1, Number(fx.t) / Math.max(0.001, Number(fx.duration))));
  const direction = Number(fx.direction) < 0 ? -1 : 1;
  const x = -FIELD_W * 0.14 + progress * FIELD_W * 1.28;
  const y = FIELD_H * (0.64 - Math.sin(progress * Math.PI) * 0.34);
  const flap = Math.sin(progress * Math.PI * 7);
  const wingLift = flap * FIELD_H * 0.055;
  const envelope = Math.min(1, progress / 0.08, (1 - progress) / 0.08);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = Math.max(0, alpha * envelope);
  ctx.translate(direction > 0 ? x : FIELD_W - x, y);
  ctx.scale(direction, 1);

  // Three animated flame tails.
  ctx.lineCap = 'round';
  for (let index = 0; index < 3; index += 1) {
    const sway = Math.sin(progress * Math.PI * 10 + index * 1.7);
    ctx.beginPath();
    ctx.moveTo(-24, 8 + index * 7);
    ctx.bezierCurveTo(
      -62, 20 + sway * 16,
      -112, -8 + index * 18 - sway * 10,
      -158 - index * 12, 22 + index * 13,
    );
    ctx.strokeStyle = index === 1 ? '#ffd86a' : '#f05a24';
    ctx.lineWidth = 15 - index * 3;
    ctx.globalAlpha = Math.max(0, alpha * envelope * (0.62 - index * 0.1));
    ctx.stroke();
  }

  // Broad feathered wings.
  ctx.globalAlpha = Math.max(0, alpha * envelope * 0.9);
  ctx.fillStyle = '#f36b21';
  ctx.beginPath();
  ctx.moveTo(-6, 2);
  ctx.bezierCurveTo(-42, -28, -82, -74 - wingLift, -136, -90 - wingLift);
  ctx.bezierCurveTo(-112, -42, -86, -20, -45, 6);
  ctx.bezierCurveTo(-84, -4, -116, 14, -145, 38);
  ctx.bezierCurveTo(-84, 34, -36, 22, -6, 12);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(5, 4);
  ctx.bezierCurveTo(45, -22, 88, -70 + wingLift, 142, -76 + wingLift);
  ctx.bezierCurveTo(113, -34, 86, -12, 48, 9);
  ctx.bezierCurveTo(88, 2, 119, 24, 146, 50);
  ctx.bezierCurveTo(82, 42, 36, 24, 5, 14);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#ffd159';
  ctx.lineWidth = 5;
  ctx.globalAlpha = Math.max(0, alpha * envelope * 0.82);
  for (let side = -1; side <= 1; side += 2) {
    for (let feather = 0; feather < 4; feather += 1) {
      ctx.beginPath();
      ctx.moveTo(side * 12, 7);
      ctx.quadraticCurveTo(
        side * (55 + feather * 17),
        -18 + feather * 13,
        side * (105 + feather * 11),
        -48 + feather * 22 + side * wingLift * 0.25,
      );
      ctx.stroke();
    }
  }

  // White-hot body, head and beak.
  ctx.globalAlpha = Math.max(0, alpha * envelope);
  ctx.fillStyle = '#fff2a1';
  ctx.beginPath();
  ctx.ellipse(7, 4, 39, 18, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffbd2e';
  ctx.beginPath();
  ctx.arc(40, -8, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(53, -10);
  ctx.lineTo(75, -4);
  ctx.lineTo(52, 1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#7c250e';
  ctx.beginPath();
  ctx.arc(44, -11, 2.4, 0, Math.PI * 2);
  ctx.fill();

  // Deterministic embers; no allocations or gradients on the render path.
  for (let index = 0; index < 12; index += 1) {
    const orbit = progress * 19 + index * 2.17;
    const ex = -35 - index * 10 + Math.sin(orbit) * 22;
    const ey = 18 + Math.cos(orbit * 1.3) * (16 + index * 1.4);
    ctx.globalAlpha = Math.max(0, alpha * envelope * (0.25 + (index % 3) * 0.17));
    ctx.fillStyle = index % 2 ? '#ffd86a' : '#ff5a1f';
    ctx.beginPath();
    ctx.arc(ex, ey, 2 + (index % 3), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  if (progress > 0.84) {
    const burst = (progress - 0.84) / 0.16;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = Math.sin(burst * Math.PI) * 0.22;
    ctx.fillStyle = '#ff6b22';
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    ctx.restore();
  }
}

function getUnitDrawScale(lane, res) {
  const n = resNum(res);
  let base;
  if (n === 57) base = UNIT_DRAW_SCALE * LARGE_UNIT_DRAW_SCALE_57;
  else if (LARGE_UNIT_RES.has(n)) base = UNIT_DRAW_SCALE * LARGE_UNIT_DRAW_SCALE;
  else base = UNIT_DRAW_SCALE * (RES_DRAW_SCALE[n] ?? 1);
  // 第一行(顶部)：缩小画幅避免高单位(火龙等)头顶被画布裁掉
  if (lane === 0) base *= 0.82;
  return base;
}

/** 攻击位移只由 XML 骨骼帧表现；渲染坐标不得额外推拉，否则动作结束会弹回。 */
function getUnitRenderCol(unit) {
  return unit.col;
}

/** 单色径向渐变椭圆(静态 qualityLightCircle，不叠星芒/溅射) */
function drawCraftQualityHalo(ctx, cx, footY, size, craftQuality) {
  const cq = normalizeCraftQuality(craftQuality);
  const color = getHaloColor(cq);
  const { r, g, b } = parseHexColor(color);
  const w = size;
  const h = size * 0.88;
  const ey = footY + h * 0.05;
  const centerAlpha = cq === 4 ? 0.82 : 0.75;

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, ey, w * 0.56, h * 0.46, 0, 0, Math.PI * 2);
  const grad = ctx.createRadialGradient(cx, footY, 0, cx, ey, w * 0.6);
  grad.addColorStop(0, `rgba(${r},${g},${b},${centerAlpha})`);
  grad.addColorStop(0.55, `rgba(${r},${g},${b},0.58)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0.16)`);
  ctx.fillStyle = grad;
  ctx.fill();

  // 品质描边（闪光加粗：所有品质都有描边，精良/完美更亮更粗）
  ctx.strokeStyle = `rgba(${r},${g},${b},${cq === 4 ? 0.9 : cq === 3 ? 0.7 : 0.5})`;
  ctx.lineWidth = cq === 4 ? 3.2 : cq === 3 ? 2.6 : 2;
  ctx.stroke();
  ctx.restore();
}

/** bump 骨骼单层椭圆(部署特效专用，平滑扩散非溅射) */
function drawBumpEllipse(ctx, cx, footY, rx, ry, color, alpha) {
  if (alpha <= 0.01) return;
  const { r, g, b } = parseHexColor(color);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.ellipse(cx, footY + ry * 0.12, rx, ry, 0, 0, Math.PI * 2);
  const grad = ctx.createRadialGradient(cx, footY, 0, cx, footY + ry * 0.1, Math.max(rx, ry));
  grad.addColorStop(0, `rgba(${r},${g},${b},0.9)`);
  grad.addColorStop(0.55, `rgba(${r},${g},${b},0.5)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();
}

/** 原版 bump 骨骼：双椭圆放大淡出 + 细环与中心闪白(召唤淡入同步) */
function drawBumpDeployVfx(ctx, fx) {
  const progress = 1 - fx.life / fx.maxLife;
  const cx = cellCenterX(fx.col);
  const footY = cellCenterY(fx.lane);
  const color = getHaloColor(normalizeCraftQuality(fx.craftQuality));
  const baseW = CELL_W * 0.26;
  const baseH = baseW * 0.52;
  const remain = fx.life / fx.maxLife;

  const layer2Scale = 0.5 + progress * 1.35;
  const layer2Alpha = progress < 0.45
    ? Math.min(1, progress / 0.2) * 0.5
    : remain * 0.45;

  const layer1Delay = 0.12;
  const layer1T = Math.max(0, (progress - layer1Delay) / (1 - layer1Delay));
  const layer1Scale = 0.55 + layer1T * 2.85;
  const layer1Alpha = remain * Math.min(1, layer1T / 0.2);

  drawBumpEllipse(ctx, cx, footY, baseW * layer2Scale, baseH * layer2Scale, color, layer2Alpha);
  drawBumpEllipse(ctx, cx, footY, baseW * layer1Scale, baseH * layer1Scale, color, layer1Alpha * 0.92);

  const ringT = Math.max(0, (progress - 0.05) / 0.35);
  const ringScale = 0.35 + ringT * 1.1;
  const ringAlpha = remain * Math.min(1, ringT / 0.15) * 0.55;
  drawBumpEllipse(ctx, cx, footY, baseW * ringScale, baseH * ringScale, '#ffffff', ringAlpha);

  if (progress < 0.18) {
    const flash = 1 - progress / 0.18;
    drawBumpEllipse(ctx, cx, footY, baseW * 0.42, baseH * 0.42, '#ffffff', flash * 0.72);
  }

  // 召唤法阵：双圆环 + 八角符文线（降低 alpha，保留下方椭圆扩散烟雾可见）
  ctx.save();
  const R = CELL_W * (0.3 + progress * 0.5);
  const a = Math.max(0, remain * 0.5);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, CELL_W * 0.045 * (1 - progress * 0.4));
  ctx.globalAlpha = a;
  ctx.beginPath();
  ctx.arc(cx, footY, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, footY, R * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  // 八角符文放射线
  for (let i = 0; i < 8; i += 1) {
    const ang = (Math.PI / 4) * i + progress * 0.6;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * R * 0.62, footY + Math.sin(ang) * R * 0.62);
    ctx.lineTo(cx + Math.cos(ang) * R, footY + Math.sin(ang) * R);
    ctx.stroke();
  }
  ctx.restore();
}

export class BattleRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.spriteCache = new Map();
    this.cardCache = new Map();
    this.bulletCache = new Map();
    this.partsCache = new Map();
    this.loadingRes = new Set();
    this.loadingBullets = new Set();
    this.effectAtlasImage = null;
    this.effectAtlasLoading = null;
    this.fxPacks = new Map();
    this.fxLoading = new Map();
    this.bulletAnims = new Map();
    this.bulletAnimLoading = new Map();
    this.battleAtlasImage = null;
    this.battleAtlasLoading = null;
    this.itemAtlasImage = null;
    this.itemAtlasLoading = null;
    this.hoverLane = -1;
    this.hoverCol = -1;
    this.forceLowQuality = false;
  }

  /** 加载战斗图集(伤害数字精灵等) */
  requestBattleAtlas() {
    if (this.battleAtlasImage) return Promise.resolve(this.battleAtlasImage);
    if (this.battleAtlasLoading) return this.battleAtlasLoading;
    this.battleAtlasLoading = new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        this.battleAtlasImage = image;
        this.battleAtlasLoading = null;
        resolve(image);
      };
      image.onerror = () => {
        this.battleAtlasLoading = null;
        resolve(null);
      };
      image.src = '/atlas/battle.png';
    });
    return this.battleAtlasLoading;
  }

  requestItemAtlas() {
    if (this.itemAtlasImage) return Promise.resolve(this.itemAtlasImage);
    if (this.itemAtlasLoading) return this.itemAtlasLoading;
    this.itemAtlasLoading = new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        this.itemAtlasImage = image;
        this.itemAtlasLoading = null;
        resolve(image);
      };
      image.onerror = () => {
        this.itemAtlasLoading = null;
        resolve(null);
      };
      image.src = '/items.png';
    });
    return this.itemAtlasLoading;
  }

  /** 加载弹道动画包(Bullet{res}：yidong 飞行 + baoza 爆炸) */
  requestBulletAnim(res) {
    const key = String(res);
    if (this.bulletAnims.has(key)) return Promise.resolve(this.bulletAnims.get(key));
    if (this.bulletAnimLoading.has(key)) return this.bulletAnimLoading.get(key);
    const bust = 'bullet-20260802b';
    const pending = Promise.all([
      fetch(`/sprites/bullets/anim/${key}.json?v=${bust}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = `/sprites/bullets/anim/${key}.png?v=${bust}`;
      }),
    ]).then(([meta, sheet]) => {
      const pack = meta && sheet ? { meta, sheet } : null;
      this.bulletAnims.set(key, pack);
      this.bulletAnimLoading.delete(key);
      return pack;
    });
    this.bulletAnimLoading.set(key, pending);
    return pending;
  }

  /** 绘制弹道动画包的一帧(yidong/baoza)，未加载时发起请求并返回 false */
  drawBulletAnimFrame(ctx, pack, animKey, cx, cy, size, elapsed, flipX = false, alpha = 1, loop = true, slowFactor = 0.55) {
    const anim = pack?.meta?.animations?.[animKey];
    if (!anim || !anim.frames?.length) return false;
    const rate = anim.frameRate || 12;
    const dur = Math.max(0.001, Number(anim.duration) || anim.frames.length / rate);
    // 弹道动画放慢(原版帧率高，直接播太快)；默认 ~55%
    const raw = Math.max(0, elapsed * slowFactor);
    const t = loop ? (raw % dur) : Math.min(dur - 0.001, raw);
    const fi = Math.min(anim.frames.length - 1, Math.max(0, Math.floor(t * rate)));
    const frame = anim.frames[fi];
    const b = frame.bounds;
    const w = b.right - b.left + 1;
    const h = b.bottom - b.top + 1;
    const scale = size / Math.max(w, h, 1);
    const dx = cx - ((b.left + b.right + 1) / 2) * scale;
    const dy = cy - ((b.top + b.bottom + 1) / 2) * scale;
    ctx.save();
    // 对于命中特效(baoza)关闭图像平滑以减少放大后的模糊感
    try { ctx.imageSmoothingEnabled = (animKey === 'baoza') ? false : true; } catch (e) {}
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    if (flipX) {
      ctx.translate(dx + frame.w * scale, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(pack.sheet, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w * scale, frame.h * scale);
    } else {
      ctx.drawImage(pack.sheet, frame.x, frame.y, frame.w, frame.h, dx, dy, frame.w * scale, frame.h * scale);
    }
    ctx.restore();
    return true;
  }

  /** 加载全局状态特效包(vertigo 眩晕云 / freeze 冰冻 / bump 碰撞) */
  requestGlobalFx(name) {
    if (this.fxPacks.has(name)) return Promise.resolve(this.fxPacks.get(name));
    if (this.fxLoading.has(name)) return this.fxLoading.get(name);
    const bust = 'fx-20260802';
    const pending = Promise.all([
      fetch(`/sprites/unit_anim/${name}.json?v=${bust}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = `/sprites/unit_anim/${name}.png?v=${bust}`;
      }),
    ]).then(([meta, sheet]) => {
      const pack = meta && sheet ? { meta, sheet } : null;
      this.fxPacks.set(name, pack);
      this.fxLoading.delete(name);
      return pack;
    });
    this.fxLoading.set(name, pending);
    return pending;
  }

  setHover(lane, col) {
    this.hoverLane = lane;
    this.hoverCol = col;
  }

  /** 特效队列过多时只绘制最近 N 条，避免几十上百个粒子/爆炸每帧全量重绘。 */
  _effectSliceStart(list) {
    if (!Array.isArray(list)) return 0;
    const cap = this._effectDrawCap || EFFECT_DRAW_CAP_NORMAL;
    return Math.max(0, list.length - cap);
  }

  requestSprite(res) {
    const key = String(res);
    if (this.spriteCache.has(key) || this.loadingRes.has(key)) return;
    this.loadingRes.add(key);
    SpriteAtlas.loadUnit(key).then((img) => {
      this.spriteCache.set(key, img);
      this.loadingRes.delete(key);
    });
  }

  requestBullet(res) {
    const key = String(res);
    if (this.bulletCache.has(key) || this.loadingBullets.has(key)) return;
    this.loadingBullets.add(key);
    SpriteAtlas.loadBullet(key).then((img) => {
      this.bulletCache.set(key, img);
      this.loadingBullets.delete(key);
    });
  }

  requestEffectAtlas() {
    if (this.effectAtlasImage) return Promise.resolve(this.effectAtlasImage);
    if (this.effectAtlasLoading) return this.effectAtlasLoading;
    this.effectAtlasLoading = new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        this.effectAtlasImage = image;
        this.effectAtlasLoading = null;
        resolve(image);
      };
      image.onerror = () => {
        this.effectAtlasLoading = null;
        resolve(null);
      };
      image.src = '/atlas/effect.png?v=20260801';
    });
    return this.effectAtlasLoading;
  }

  ensureSprites(engine) {
    void this.requestItemAtlas();
    const resSet = engine.getBattleSpriteRes();
    for (const res of resSet) {
      this.requestSprite(res);
      this.requestBullet(res);
    }
    unitAnimPlayer.ensureLoaded(resSet);
  }

  async preloadParts() {
    await Promise.all(
      PART_SPRITES.map(async (name) => {
        if (!this.partsCache.has(name)) {
          this.partsCache.set(name, await SpriteAtlas.loadPart(name));
        }
      }),
    );
  }

  async preloadForEngine(engine) {
    const resSet = engine.getBattleSpriteRes();
    await this.preloadParts();
    await unitAnimPlayer.preload(resSet);
    await Promise.all([
      this.requestEffectAtlas(),
      this.requestItemAtlas(),
      skillAnimPlayer.preload((engine.skillLoadout ?? []).filter(Boolean)),
      // 状态特效包(冰冻/眩晕/碰撞/品质光环)：预加载，避免首次出现时才请求，
      // 否则 1.5s 的冰冻/眩晕在特效包加载完成前就结束了(用户看到"特效没显示")。
      ...['freeze', 'vertigo', 'bump', 'qualityLightCircle'].map((name) => this.requestGlobalFx(name)),
      // 弹道动画包(Bullet{res} yidong/baoza)：预加载，避免首次发射子弹时无特效
      ...[...resSet].map((res) => this.requestBulletAnim(String(res))),
    ]);
    if (!this.bulletCache.has('default')) {
      const defaultBullet = await SpriteAtlas.loadBullet('default');
      this.bulletCache.set('default', defaultBullet);
    }
    await Promise.all(
      [...resSet].map(async (res) => {
        const key = String(res);
        if (!this.spriteCache.has(key)) {
          this.spriteCache.set(key, await SpriteAtlas.loadUnit(key));
          this.loadingRes.delete(key);
        }
        if (!this.bulletCache.has(key)) {
          this.bulletCache.set(key, await SpriteAtlas.loadBullet(key));
          this.loadingBullets.delete(key);
        }
        if (CARD_FACE_OVERLAY[Number(key)] && !this.cardCache.has(key)) {
          this.cardCache.set(key, await SpriteAtlas.loadCard(key));
        }
      }),
    );
  }

  /** @deprecated 使用 preloadForEngine */
  async preload(units) {
    for (const unit of units) this.requestSprite(unit.res);
  }

  resize() {
    // FIELD 尺寸与 place-grid-overlay 网格坐标一致(BattleConfig px 直映)，保证卡牌与格子对齐。
    // 打到基地(col 12+)的子弹/特效由绘制侧 clamp 到画布内(见 cellCenterX 调用处)，不再被拦断。
    this.canvas.width = FIELD_W;
    this.canvas.height = FIELD_H;
  }

  drawUnitName(ctx, x, y, w, name, team) {
    // 名字显示开关（localStorage clbwz_show_unit_names，默认开）
    if (typeof localStorage !== 'undefined' && localStorage.getItem('clbwz_show_unit_names') === '0') return;
    // 只要玩家开启“名称显示”，低画质/大军团/BOSS 模式都不再自动隐藏名称。
    const nameText = String(name ?? '').trim();
    if (!nameText) return;
    const label = nameText.length > 5 ? `${nameText.slice(0, 5)}…` : nameText;
    ctx.font = 'bold 9px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    const tw = ctx.measureText(label).width + 6;
    ctx.fillRect(x + w / 2 - tw / 2, y - 2, tw, 12);
    ctx.fillStyle = team === 'player' ? '#bbf7d0' : '#fecaca';
    ctx.fillText(label, x + w / 2, y + 8);
  }

  drawStrengthStars(ctx, unit, cx, footY, circleSize) {
    const level = Math.max(0, Math.floor(Number(unit.strengthLv) || 0));
    if (level <= 0) return;
    const rows = level > 7 ? [7, level - 7] : [level];
    const starSize = Math.max(9, Math.min(12, circleSize * 0.135));
    const firstY = footY + circleSize * 0.08;

    rows.forEach((rowStars, rowIndex) => {
      let remaining = rowStars;
      let x = cx - rowStars * starSize / 2;
      const y = firstY + rowIndex * (starSize + 1);
      while (remaining > 0) {
        const chunk = Math.min(6, remaining);
        const image = this.partsCache.get(`single_star_${chunk}`);
        if (image) SpriteAtlas.drawContained(ctx, image, x, y, chunk * starSize, starSize);
        x += chunk * starSize;
        remaining -= chunk;
      }
    });
  }

  drawDeployEffects(ctx, engine) {
    const list = engine.deployEffects ?? [];
    for (let i = this._effectSliceStart(list); i < list.length; i += 1) {
      drawBumpDeployVfx(ctx, list[i]);
    }
  }

  computeUnitLayout(engine, unit) {
    const isDying = !unit.alive && unit._deathUntil && engine.time < unit._deathUntil;
    if (!unit.alive && !isDying) return null;

    const cellTop = cellY(unit.lane);
    const cellBottom = cellTop + CELL_H;
    const renderCol = getUnitRenderCol(unit, engine);
    const cx = cellCenterX(renderCol);
    const cy = cellCenterY(unit.lane);
    const img = this.spriteCache.get(String(unit.res));
    const drawScale = getUnitDrawScale(unit.lane, unit.res);
    const flying = isEffectivelyFlying(unit);
    const flyBoost = flying ? flyingBoxBoostForRes(resNum(unit)) : 1;
    const portraitW = Math.min(CELL_W - 8, CELL_W * 0.88) * drawScale * flyBoost;
    const portraitH = (CELL_H - 24) * drawScale * flyBoost;
    const colShift = frontColPortraitShiftX(unit, portraitW)
      + backColPortraitShiftX(unit, portraitW);
    const portraitX = cx - portraitW / 2 + colShift;
    const res = resNum(unit);
    // 脚底贴格底(原 -12 使单位偏上；AS 单位脚底在格子底部)
    const laneFootY = cellBottom;
    const footY = laneFootY;
    let portraitY;
    if (flying) {
      const flyLift = flyingAltitudeForRes(res);
      portraitY = laneFootY - portraitH * (0.82 + flyLift * 0.42);
    } else {
      portraitY = laneFootY - portraitH;
    }
    const flipX = (unit.team === 'enemy') !== Boolean(unit._burrowFacingReversed);
    const anchor = calcFootAnchor(img, portraitX, portraitY, portraitW, portraitH, { flipX });
    const circleSize = Math.min(
      Math.max(anchor.bodyWidth * 1.2, CELL_W * 0.55),
      CELL_W * 0.95,
    );

    return {
      isDying,
      cellTop,
      cellBottom,
      cx,
      renderCol,
      portraitX,
      portraitY,
      portraitW,
      portraitH,
      img,
      laneFootY,
      footY,
      circleSize,
      flipX,
      flying,
      barW: CELL_W - 6,
      barX: cx - (CELL_W - 6) / 2,
      barY: cellBottom - 8,
    };
  }

  drawUnitHalo(ctx, unit, layout) {
    if (layout.isDying) return;
    drawCraftQualityHalo(ctx, layout.cx, layout.footY, layout.circleSize, unit.craftQuality);
    // 原版品质光环(qualityLightCircle 8帧闪烁，增强手绘椭圆为光束表现)
    const now = performance.now() / 1000;
    this.drawGlobalFxPack(
      ctx, 'qualityLightCircle',
      layout.cx, layout.footY - layout.circleSize * 0.3,
      layout.circleSize * 1.7,
      now,
    );
  }

  drawUnitCardFace(ctx, unit, layout, engine) {
    // 低画质：省掉每单位的卡牌脸覆盖层（这是高单位数下的一笔大开销）。
    if (this._lowQuality) return;
    const animReady = unitAnimPlayer.hasAnim(unit.res);
    if (!shouldDrawCardFaceOverlay(unit, engine, { animReady })) return;
    const cardImg = this.cardCache.get(String(unit.res));
    if (!cardImg) return;
    const { portraitX, portraitY, portraitW, portraitH, flipX } = layout;
    drawCardFaceOverlay(
      ctx, cardImg, unit, portraitX, portraitY, portraitW, portraitH, { flipX },
    );
  }

  drawUnitSprite(ctx, engine, unit, layout, { advanceClock = true } = {}) {
    const {
      portraitX, portraitY, portraitW, portraitH,
      flipX, laneFootY, footY, flying,
    } = layout;

    // 低画质：直接画静态精灵图，跳过逐帧动画计算（多单位时最贵）。
    if (this._lowQuality) {
      const staticImg = this.spriteCache.get(String(unit.res));
      if (staticImg) {
        ctx.save();
        let alpha = 1;
        if (unit._spawnFadeStart != null && unit._spawnFadeDur) {
          alpha = Math.min(1, Math.max(0, (engine.time - unit._spawnFadeStart) / unit._spawnFadeDur));
        }
        ctx.globalAlpha *= alpha;
        if (flipX) {
          ctx.translate(portraitX + portraitW, portraitY);
          ctx.scale(-1, 1);
          ctx.drawImage(staticImg, 0, 0, portraitW, portraitH);
        } else {
          ctx.drawImage(staticImg, portraitX, portraitY, portraitW, portraitH);
        }
        ctx.restore();
        return;
      }
    }

    unitAnimPlayer.draw(
      ctx, unit, engine, portraitX, portraitY, portraitW, portraitH,
      { flipX, footY: flying ? footY : laneFootY, advanceClock },
    );
  }

  drawUnitUi(ctx, unit, layout, engine) {
    if (layout.isDying) return;
    const {
      cellTop, portraitX, portraitW, cx, footY, circleSize, barW, barX, barY,
    } = layout;
    // 名字始终跟随设置显示；低画质时只省略星级等文字，不省略名称。
    this.drawUnitName(ctx, portraitX, cellTop + 2, portraitW, unit.customName || unit.name, unit.team);
    if (!this._lowQuality) this.drawStrengthStars(ctx, unit, cx, footY, circleSize);
    const hpPct = unit.hp / unit.maxHp;
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(barX, barY, barW, 5);
    ctx.fillStyle = unit.team === 'player' ? '#4ade80' : '#f87171';
    ctx.fillRect(barX, barY, barW * hpPct, 5);

    if (engine) this.drawStatusEffects(ctx, unit, engine, layout);
  }

  /** 状态特效：冰冻/减速/眩晕/中毒(问题5 + 问题7 视觉侧) */
  drawStatusEffects(ctx, unit, engine, layout) {
    const { cellTop, cx, footY, circleSize, portraitX, portraitY, portraitW, portraitH } = layout;
    const now = engine.time;
    const frozen = unit.frozenUntil && now < unit.frozenUntil;
    const stunned = unit.stunnedUntil && now < unit.stunnedUntil;
    const slowed = unit.slowedUntil && now < unit.slowedUntil;
    const poisoned = Array.isArray(unit.dots) && unit.dots.some((d) => d.until > now);

    // 深蓝蒙版：跟随角色 alpha 轮廓(离屏渲染单位当前帧 + source-in 填充深蓝)，
    // 让卡牌看起来真的陷入冰冻/减速，而不是整格方框或矩形
    const drawStatusMask = (alpha) => {
      const { portraitX, portraitY, portraitW, portraitH, flipX } = layout;
      const pw = Math.max(8, Math.ceil(portraitW));
      const ph = Math.max(8, Math.ceil(portraitH));
      let off = this._maskCanvas;
      if (!off) {
        off = this._maskCanvas = document.createElement('canvas');
        off.width = pw;
        off.height = ph;
      } else {
        off.width = pw;
        off.height = ph;
      }
      const octx = off.getContext('2d');
      octx.clearRect(0, 0, pw, ph);
      // 同帧渲染单位当前动画(不推进时钟)，x=0,y=0 画到离屏。
      // 注意：不能传 footY(主画布坐标，几百像素)，离屏仅 portrait 大小，
      // 传了会把单位画到画布外导致蒙版全空(减速/冰冻蓝色不显示的根因)。
      unitAnimPlayer.draw(octx, unit, engine, 0, 0, pw, ph, {
        flipX,
        advanceClock: false,
      });
      octx.globalCompositeOperation = 'source-in';
      octx.fillStyle = '#143c8c';
      octx.fillRect(0, 0, pw, ph);
      octx.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(off, portraitX, portraitY, portraitW, portraitH);
      ctx.restore();
    };

    if (frozen) {
      drawStatusMask(0.5);
      // 冰冻：freeze 冰晶覆盖在身体上(原版骨骼)
      if (!this.drawGlobalFxPack(ctx, 'freeze', cx, footY - circleSize * 0.5, circleSize * 1.5, now)) {
        ctx.save();
        ctx.globalAlpha = 0.32;
        ctx.fillStyle = '#7fd4ff';
        ctx.beginPath();
        ctx.arc(cx, footY - circleSize * 0.1, circleSize * 0.62, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#eaf8ff';
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('❄', cx, cellTop + 16);
      }
    } else if (slowed) {
      // 减速：暴风雪同款蓝色「整个卡牌变蓝」（蓝色覆盖整个肖像，无下方冰晶）
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = '#4aa8ff';
      ctx.fillRect(portraitX, portraitY, portraitW, portraitH);
      ctx.restore();
      // 蓝色光罩（更明显）
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#7fd4ff';
      ctx.beginPath();
      ctx.arc(cx, footY - circleSize * 0.1, circleSize * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      drawStatusMask(0.5);
      ctx.fillStyle = '#dff3ff';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('❄', cx, cellTop + 16);
    }

    if (stunned) {
      // 眩晕：vertigo 晕云(原版骨骼)
      if (!this.drawGlobalFxPack(ctx, 'vertigo', cx, cellTop + 8, circleSize * 1.9, now)) {
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#ffd94d';
        ctx.beginPath();
        ctx.arc(cx, footY - circleSize * 0.1, circleSize * 0.62, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#ffe27a';
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('💫', cx, cellTop + 16);
      }
    }

    if (poisoned) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#7fe06a';
      ctx.beginPath();
      ctx.arc(cx, footY - circleSize * 0.1, circleSize * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#b6f2a0';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('☠', cx, cellTop + 16);
    }
  }

  /** 绘制全局特效包的一帧(vertigo/freeze/bump)，未加载时发起请求并返回 false */
  drawGlobalFxPack(ctx, name, cx, cy, targetSize, elapsed) {
    const pack = this.fxPacks.get(name);
    if (!pack) {
      void this.requestGlobalFx(name);
      return false;
    }
    const anim = pack.meta.animations.default;
    const frames = anim.frames ?? [];
    if (!frames.length) return false;
    const rate = anim.frameRate || 12;
    const dur = Math.max(0.001, Number(anim.duration) || frames.length / rate);
    // 状态特效放慢到 ~70%
    const t = Math.max(0, elapsed * 0.7) % dur;
    const fi = Math.min(frames.length - 1, Math.max(0, Math.floor(t * rate)));
    const frame = frames[fi];
    const b = frame.bounds;
    const w = b.right - b.left + 1;
    const h = b.bottom - b.top + 1;
    const scale = targetSize / Math.max(w, h, 1);
    const dx = cx - ((b.left + b.right + 1) / 2) * scale;
    const dy = cy - ((b.top + b.bottom + 1) / 2) * scale;
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.drawImage(
      pack.sheet,
      frame.x, frame.y, frame.w, frame.h,
      dx, dy, frame.w * scale, frame.h * scale,
    );
    ctx.restore();
    return true;
  }

  /** 碰撞特效(bump)：单位撞到阻挡敌人时在接触点爆闪 */
  drawBumpFx(ctx, engine) {
    const list = engine.bumpFx ?? [];
    for (let i = this._effectSliceStart(list); i < list.length; i += 1) {
      const fx = list[i];
      const cx = cellCenterX(fx.col);
      const cy = cellCenterY(fx.lane);
      this.drawGlobalFxPack(ctx, 'bump', cx, cy, CELL_W * 1.3, fx.t);
    }
  }

  drawUnits(ctx, engine) {
    const sortUnits = (units) => [...units].sort(
      (a, b) => a.lane - b.lane
        || a.col - b.col
        || (isEffectivelyFlying(a) ? 1 : 0) - (isEffectivelyFlying(b) ? 1 : 0)
        || a.uid - b.uid,
    );
    const sortDeferredUnits = (units) => [...units].sort(
      (a, b) => a.lane - b.lane
        || (a.team === 'player' ? 1 : 0) - (b.team === 'player' ? 1 : 0)
        || a.col - b.col
        || a.uid - b.uid,
    );

    const alive = engine.units.filter(
      (u) => u.alive || (u._deathUntil && engine.time < u._deathUntil),
    );
    this._visibleUnitCount = alive.length;
    const ground = sortUnits(alive.filter(
      (u) => !isEffectivelyFlying(u) && !isDeferredTopLayerUnit(u),
    ));
    const deferredGround = sortDeferredUnits(alive.filter(
      (u) => !isEffectivelyFlying(u) && isDeferredTopLayerUnit(u),
    ));
    const aerial = sortUnits(alive.filter((u) => isEffectivelyFlying(u)));

    const layouts = new Map();
    const unitContext = (unit) => ({
      battleTime: engine?.time,
      tick: engine?.battleTick,
      uid: unit?.uid,
      cardId: unit?.cardId,
      res: unit?.res,
    });
    // 性能：生产环境跳过 per-unit try/catch（单位多时每帧数百次 guard 造成掉帧），
    // 仅当开启 __battleThrowRuntimeErrors 调试时才逐单位捕获。
    const debugGuard = globalThis.__battleThrowRuntimeErrors === true;
    const drawUnitPhase = (phase, unit, operation, fallback = undefined) =>
      debugGuard
        ? guardBattleRuntime(phase, unitContext(unit), operation, fallback)
        : operation();
    const ensureLayout = (unit) => {
      let layout = layouts.get(unit);
      if (!layout) {
        layout = drawUnitPhase(
          'renderer.unit-layout',
          unit,
          () => this.computeUnitLayout(engine, unit),
          null,
        );
        if (layout) layouts.set(unit, layout);
      }
      return layout;
    };

    for (const unit of alive) {
      const layout = ensureLayout(unit);
      if (layout && !isDeferredTopLayerUnit(unit)) {
        drawUnitPhase('renderer.unit-halo', unit, () => this.drawUnitHalo(ctx, unit, layout));
      }
    }
    for (const unit of ground) {
      const layout = layouts.get(unit);
      if (layout) drawUnitPhase('renderer.unit-sprite', unit, () => {
        this.drawUnitSprite(ctx, engine, unit, layout);
      });
    }
    this.drawProjectiles(ctx, engine);
    for (const unit of aerial) {
      const layout = layouts.get(unit);
      if (layout) drawUnitPhase('renderer.unit-sprite', unit, () => {
        this.drawUnitSprite(ctx, engine, unit, layout);
      });
    }
    for (const unit of alive) {
      const layout = layouts.get(unit);
      if (layout) drawUnitPhase('renderer.unit-ui', unit, () => {
        this.drawUnitUi(ctx, unit, layout, engine);
      });
    }
    for (const unit of alive) {
      const layout = layouts.get(unit);
      if (layout) drawUnitPhase('renderer.unit-card-face', unit, () => {
        this.drawUnitCardFace(ctx, unit, layout, engine);
      });
    }
    for (const unit of deferredGround) {
      const layout = layouts.get(unit);
      if (!layout) continue;
      drawUnitPhase('renderer.unit-halo', unit, () => this.drawUnitHalo(ctx, unit, layout));
      // 仅最终 pass 绘制一次，须推进动画时钟(advanceClock:false 会导致永远停在第 0 帧)
      drawUnitPhase('renderer.unit-sprite', unit, () => {
        this.drawUnitSprite(ctx, engine, unit, layout);
      });
    }
    for (const unit of alive) {
      if (layouts.has(unit)) unit._prevRenderX = unit.col;
    }
  }

  drawLootDrops(ctx, engine) {
    const now = Number(engine.time) || 0;
    for (const drop of engine.lootDrops ?? []) {
      const age = now - Number(drop.createdAt || 0);
      if (age < 0 || age > 3.2) continue;
      const appear = Math.min(1, age / 0.18);
      const fade = age > 2.55 ? Math.max(0, (3.2 - age) / 0.65) : 1;
      const alpha = appear * fade;
      const cx = cellCenterX(drop.col);
      const cy = cellCenterY(drop.lane) - 18 - Math.sin(age * 5.5) * 5 - Math.min(13, age * 5);
      const size = 42 + Math.sin(age * 6) * 2;
      const sprite = ITEM_RECTS.get(Number(drop.itemId));

      ctx.save();
      ctx.globalAlpha = alpha;
      const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, size * 0.82);
      glow.addColorStop(0, 'rgba(255,248,178,.92)');
      glow.addColorStop(0.48, 'rgba(117,218,255,.44)');
      glow.addColorStop(1, 'rgba(117,218,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.82, 0, Math.PI * 2);
      ctx.fill();
      if (this.itemAtlasImage && sprite) {
        ctx.drawImage(
          this.itemAtlasImage,
          sprite.x, sprite.y, sprite.width, sprite.height,
          cx - size / 2, cy - size / 2, size, size,
        );
      } else {
        ctx.translate(cx, cy);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#f8dd72';
        ctx.fillRect(-size * 0.28, -size * 0.28, size * 0.56, size * 0.56);
      }
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#fff6bd';
      ctx.strokeStyle = 'rgba(35,48,31,.92)';
      ctx.lineWidth = 3;
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeText('掉落', cx, cy + size * 0.68);
      ctx.fillText('掉落', cx, cy + size * 0.68);
      ctx.restore();
    }
  }

  drawProjectiles(ctx, engine) {
    const list = engine.projectiles;
    for (let i = this._effectSliceStart(list); i < list.length; i += 1) {
      const p = list[i];
      try {
      if (!p.launched) continue; // 未到动画出手帧的子弹不绘制
      const drawX = Math.min(colFracToX(p.x), FIELD_W - 10);
      const drawY = laneFracToY(p.y, p.arcOffset ?? 0);

      // 弹道动画：优先用原版 Bullet yidong 序列帧
      if (p.sourceRes != null) {
        const pack = this.bulletAnims.get(String(p.sourceRes));
        if (pack?.meta?.animations?.yidong) {
          const size = p.trajectory === 'parabola' ? 30 : 24;
          this.drawBulletAnimFrame(
            ctx, pack, 'yidong', drawX, drawY, size,
            p.flightT ?? 0, p.owner === 'enemy',
          );
          continue;
        }
        void this.requestBulletAnim(p.sourceRes);
      }

      const img = (p.sourceRes != null ? this.bulletCache.get(p.sourceRes) : null)
        ?? this.bulletCache.get('default');
      const size = p.trajectory === 'parabola' ? 28 : 22;

      if (img) {
        ctx.save();
        const bulletRes = p.sourceRes != null ? Number(p.sourceRes) : null;
        let angle;
        if (bulletRes != null && CACTUS_BULLET_RES.has(bulletRes) && p.trajectory === 'straight') {
          angle = p.owner === 'player' ? 0 : Math.PI;
        } else {
          angle = Math.atan2(
            p.hitCol - p.startCol,
            (p.hitLane - p.lane) * 0.35,
          );
        }
        ctx.translate(drawX, drawY);
        ctx.rotate(angle);
        SpriteAtlas.draw(ctx, img, -size / 2, -size / 2, size, size);
        ctx.restore();
        continue;
      }

      ctx.beginPath();
      ctx.arc(drawX, drawY, 8, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.icon ?? '●', drawX, drawY);
      } catch (cause) {
        guardBattleRuntime('renderer.projectile', {
          battleTime: engine?.time,
          tick: engine?.battleTick,
          uid: p?.uid,
          sourceRes: p?.sourceRes,
        }, () => {
          throw cause;
        });
      }
    }
  }

  isBaseFloat(col) {
    return (
      Math.abs(col - PLAYER_BASE_FRAC) < 0.08 ||
      Math.abs(col - ENEMY_BASE_FRAC) < 0.08
    );
  }

  drawFloats(ctx, engine) {
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    const atlasImg = this.battleAtlasImage;
    if (!atlasImg) void this.requestBattleAtlas();
    const list = engine.floats;
    for (let i = this._effectSliceStart(list); i < list.length; i += 1) {
      const f = list[i];
      const alpha = Math.min(1, f.life);
      // 基地伤害/回复也用同一套数字精灵(与卡牌相同字体)；位置 clamp 到画布内
      const cx = this.isBaseFloat(f.col)
        ? Math.min(fracColToCenterX(f.col), FIELD_W - 22)
        : fracColToCenterX(f.col);
      const cy = cellCenterY(f.lane) + f.y * 20;

      // 伤害/治疗数字精灵：红=扣血(-)，绿=回血(+)
      if (atlasImg) {
        const isHeal = f.amount > 0;
        const prefix = isHeal ? 'g' : 'r';
        const digits = String(Math.round(Math.abs(f.amount))).split('');
        const signRect = BATTLE_NUM_RECTS.get(isHeal ? 'number_g_add' : 'number_r_sub');
        if (digits.length) {
          const digitW = 13 * 0.85;
          const digitH = 18 * 0.85;
          // 加减号按原生宽高比缩小绘制(不拉伸到数字高度)
          const signScale = 0.85 * 0.7;
          const signW = (signRect ? (signRect.width ?? 11) : 11) * signScale;
          const signH = (signRect ? (signRect.height ?? 8) : 8) * signScale;
          let dx = cx - ((digits.length * digitW + signW) / 2);
          let drawn = 0;
          if (signRect) {
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.drawImage(
              atlasImg, signRect.x, signRect.y, signRect.width, signRect.height,
              dx, cy - signH / 2, signW, signH,
            );
            ctx.restore();
            dx += signW;
          }
          for (const ch of digits) {
            const rect = BATTLE_NUM_RECTS.get(`number_${prefix}_${ch}`);
            if (!rect) continue;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.drawImage(
              atlasImg, rect.x, rect.y, rect.width, rect.height,
              dx, cy - digitH / 2, digitW, digitH,
            );
            ctx.restore();
            dx += digitW;
            drawn += 1;
          }
          if (drawn) continue;
        }
      }
      ctx.fillStyle = f.amount > 0
        ? `rgba(74,222,128,${alpha})`
        : `rgba(248,113,113,${alpha})`;
      ctx.fillText(formatBattleDelta(f.amount), cx, cy);
    }
  }

  draw(engine) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let aliveUnits = 0;
    for (const unit of engine?.units ?? []) if (unit?.alive) aliveUnits += 1;
    const skillEffects = engine?.skillFx ?? engine?.skillEffects ?? [];
    const hasFullscreenSkill = skillEffects.some((effect) => (
      effect?.fullScreen === true
      || FULL_SCREEN_SKILL_KINDS.has(effect?.kind)
      || SKILL_FX_POS.get(Number(effect?.skillId)) === 2
    ));
    const effectCount = (engine?.floats?.length ?? 0)
      + (engine?.impactFx?.length ?? 0)
      + (engine?.bumpFx?.length ?? 0)
      + (engine?.deployEffects?.length ?? 0)
      + skillEffects.length
      + (engine?.projectiles?.length ?? 0);
    // 大军团/多特效时进入低画质：保留名称(由名字开关控制)，仅省略星级/卡牌脸等，并只绘制最上层的若干特效。
    this._lowQuality = this.forceLowQuality
      || aliveUnits >= LOW_QUALITY_UNIT_COUNT
      || hasFullscreenSkill
      || effectCount >= LOW_QUALITY_EFFECT_COUNT;
    this._effectDrawCap = this._lowQuality ? EFFECT_DRAW_CAP_LOW : EFFECT_DRAW_CAP_NORMAL;
    this._isBossBattle = Boolean(engine?.coopBoss || engine?.stage?.stage_type === 2);
    this._renderPerfAudit = {
      aliveUnits,
      effectCount,
      lowQuality: this._lowQuality,
      effectDrawCap: this._effectDrawCap,
      isBossBattle: this._isBossBattle,
    };
    const throttled = aliveUnits >= HEAVY_UNIT_COUNT || hasFullscreenSkill;
    if (throttled && this._lastHeavyDrawAt != null
      && now - this._lastHeavyDrawAt < HEAVY_RENDER_FRAME_MS) {
      return;
    }
    if (throttled) this._lastHeavyDrawAt = now;
    else this._lastHeavyDrawAt = null;

    const ctx = this.ctx;
    const { width, height } = this.canvas;
    const s = this.fieldScale || 1;
    const ox = this.fieldOffsetX || 0;
    const oy = this.fieldOffsetY || 0;
    // 战场等比放大(fieldScale 由 fitBattleScale 按 wrap/GRID_BODY contain 计算)：
    // canvas 属性 = battlefield-wrap 显示尺寸(1:1 无拉伸)，2D setTransform 等比放大战场，
    // 与 place-grid 网格(同 scale 同偏移)像素对齐，动画不压缩、坐标不位移。
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (s !== 1 || ox !== 0 || oy !== 0) {
      ctx.setTransform(s, 0, 0, s, ox, oy);
    }

    const renderPhase = (phase, operation) => guardBattleRuntime(phase, {
      battleTime: engine?.time,
      tick: engine?.battleTick,
    }, operation);
    renderPhase('renderer.ensure-sprites', () => this.ensureSprites(engine));
    // 部署法阵画在单位上层，避免被刚放置的单位模型遮挡（放置卡牌时地面召唤法阵应可见）
    renderPhase('renderer.units', () => this.drawUnits(ctx, engine));
    renderPhase('renderer.deploy-effects', () => this.drawDeployEffects(ctx, engine));
    renderPhase('renderer.loot-drops', () => this.drawLootDrops(ctx, engine));
    renderPhase('renderer.skill-effects', () => this.drawSkillFx(ctx, engine));
    renderPhase('renderer.impact-effects', () => this.drawImpactFx(ctx, engine));
    renderPhase('renderer.bump-effects', () => this.drawBumpFx(ctx, engine));
    renderPhase('renderer.floats', () => this.drawFloats(ctx, engine));

    // DEBUG：动画范围框(window.__debugAnimBounds = true 开启)
    // 绿框 = FIELD 战场区域；黄框 = canvas 可见区域(单位坐标系)
    if (globalThis.__debugAnimBounds) {
      ctx.save();
      ctx.lineWidth = 2 / Math.max(s, 0.0001);
      ctx.strokeStyle = 'rgba(0,255,0,0.9)';
      ctx.strokeRect(0, 0, FIELD_W, FIELD_H);
      ctx.strokeStyle = 'rgba(255,255,0,0.9)';
      ctx.strokeRect(-ox / Math.max(s, 0.0001), -oy / Math.max(s, 0.0001),
        width / Math.max(s, 0.0001), height / Math.max(s, 0.0001));
      ctx.restore();
    }

    if (engine.status !== 'playing') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, width / s, height / s);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** 技能释放动画：按 skillPosition 定位(2 全屏 / 4 格左右 / 1、5、6 单格)，全体技能覆盖全场。 */
  drawSkillFx(ctx, engine) {
    const list = engine.skillFx ?? engine.skillEffects ?? [];
    for (let i = this._effectSliceStart(list); i < list.length; i += 1) {
      const fx = list[i];
      try {
      const cx = cellCenterX(fx.col);
      const cy = cellCenterY(fx.lane);
      // 全屏技能(陨石雨等)到 10% 处才开始快速淡出：保持两遍完整播放，结束瞬间消失
      const fullScreen = fx.fullScreen
        || FULL_SCREEN_SKILL_KINDS.has(fx.kind)
        || SKILL_FX_POS.get(Number(fx.skillId)) === 2;
      const remain = 1 - fx.t / fx.duration;
      const alpha = fx.t < 0.05 ? fx.t / 0.05 : Math.min(1, remain / (fullScreen ? 0.1 : 0.15));
      if (fullScreen) {
        if (Number(fx.skillId) === 537 || fx.kind === 'firebird') {
          drawFirebirdFx(ctx, fx, alpha);
          continue;
        }
        const drawn = skillAnimPlayer.drawCover(
          ctx, fx.skillId, 0, 0, FIELD_W, FIELD_H, fx.t,
          alpha * 0.92, fx.loop === true,
        );
        // 技能动画资源缺失(fetch 404)时：canvas 旋转法阵 fallback（画在蘑菇位置，完整显示不截断）
        if (!drawn) {
          try {
            const R = CELL_W * (fx.kind === 'mushroom_bubble' ? 1.6 : 2.2);
            // 法阵中心 clamp 到画布内：蘑菇在左半场(col 0-4)时若画在格中心，
            // 法阵左半会超出画布被裁成"残缺"。clamp 保证整个法阵完整显示。
            const rawCx = Number.isFinite(fx.col) ? cellCenterX(fx.col) : FIELD_W / 2;
            const rawCy = Number.isFinite(fx.lane) ? cellCenterY(fx.lane) : FIELD_H / 2;
            const cx = Math.max(R * 1.05, Math.min(FIELD_W - R * 1.05, rawCx));
            const cy = Math.max(R * 1.05, Math.min(FIELD_H - R * 1.05, rawCy));
            const rot = fx.t * 2.4;
            const grow = Math.min(1, fx.t / 0.3);
            const total = Math.max(0.8, Number(fx.duration) || 1.5);
            const fade = Math.max(0, 1 - fx.t / total);
            const color = fx.kind === 'mushroom_bubble' ? '#8ef0a8' : '#c9a35f';
            const { r, g, b } = parseHexColor(color);
            const a = Math.max(0, Math.min(1, alpha)) * (0.3 + fade * 0.7) * Math.min(1, fx.t / 0.12);
            ctx.save();
            ctx.globalAlpha = a;
            ctx.lineWidth = 3.5;
            ctx.strokeStyle = `rgba(${r},${g},${b},0.95)`;
            ctx.beginPath();
            ctx.arc(cx, cy, R * grow, 0, Math.PI * 2);
            ctx.stroke();
            ctx.lineWidth = 2;
            ctx.strokeStyle = `rgba(${r},${g},${b},0.7)`;
            ctx.beginPath();
            ctx.arc(cx, cy, R * 0.62 * grow, rot, rot + Math.PI * 2);
            ctx.stroke();
            ctx.lineWidth = 1.6;
            ctx.strokeStyle = `rgba(${r},${g},${b},0.5)`;
            ctx.beginPath();
            for (let i = 0; i < 4; i++) {
              const ang = rot + i * Math.PI / 2;
              ctx.moveTo(cx, cy);
              ctx.lineTo(cx + Math.cos(ang) * R * grow, cy + Math.sin(ang) * R * grow);
            }
            ctx.stroke();
            ctx.restore();
          } catch (e) { /* fallback 绘制失败忽略 */ }
        }
        continue;
      }
      const size = CELL_W * Math.max(1.35, 1.35 + fx.radius * 1.35);
      // pos=4(格左右)：目标格左右两侧各播一份(如冰刺突袭)
      if (SKILL_FX_POS.get(Number(fx.skillId)) === 4) {
        skillAnimPlayer.draw(ctx, fx.skillId, cx - CELL_W * 0.85, cy, size * 0.9, fx.t, alpha, fx.loop === true);
        skillAnimPlayer.draw(ctx, fx.skillId, cx + CELL_W * 0.85, cy, size * 0.9, fx.t, alpha, fx.loop === true);
        continue;
      }
      skillAnimPlayer.draw(ctx, fx.skillId, cx, cy, size, fx.t, alpha, fx.loop === true);
      } catch (cause) {
        guardBattleRuntime('renderer.skill-effect', {
          battleTime: engine?.time,
          tick: engine?.battleTick,
          skillId: fx?.skillId,
          kind: fx?.kind,
        }, () => {
          throw cause;
        });
      }
    }
  }

  /** 命中特效：原版 Bullet baoza 弹道爆炸(慢放 0.55x，0.45s 寿命) */
  drawImpactFx(ctx, engine) {
    const list = engine.impactFx;
    for (let i = this._effectSliceStart(list); i < list.length; i += 1) {
      const fx = list[i];
      // col 12+ 基地命中点超出 FIELD 画布右缘：clamp 到画布内避免被裁拦断
      const cx = Math.min(cellCenterX(fx.col), FIELD_W - 24);
      const cy = cellCenterY(fx.lane);
      // 自爆卡(飞行水蜜桃40/黑铁土豆雷61/热血火龙果65)：大爆炸火环，保证自爆特效可见
      if (Number(fx.res) === 40 || Number(fx.res) === 61 || Number(fx.res) === 65) {
        const exp = Math.min(1, fx.t / 0.3);
        const fade = Math.max(0, 1 - fx.t / 1.0);
        ctx.save();
        ctx.globalAlpha = Math.max(0, fade);
        ctx.strokeStyle = '#ffb347';
        ctx.lineWidth = Math.max(3, CELL_W * 0.08 * (1 - exp * 0.4));
        ctx.beginPath();
        ctx.arc(cx, cy, CELL_W * (0.3 + exp * 0.95), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = Math.max(0, fade * 0.55);
        ctx.fillStyle = '#ff8c42';
        ctx.beginPath();
        ctx.arc(cx, cy, CELL_W * (0.22 + exp * 0.55), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      // 弹道爆炸：优先用原版 Bullet baoza 序列帧(按动画实际时长推进，播完淡出不冻结/不截断)
      if (fx.res != null) {
        const pack = this.bulletAnims.get(String(fx.res));
        if (pack?.meta?.animations?.baoza) {
          const anim = pack.meta.animations.baoza;
          const rate = anim.frameRate || 12;
          const animDur = Math.max(0.001, Number(anim.duration) || anim.frames.length / rate);
          // 默认 tuning
          let usedSlow = 0.52;
          let drawSlow = 0.55;
          let size = CELL_W * 1.05;
          let alphaMul = 1;

          // per-res visual tuning
          const IMPACT_TUNING = new Map([
            // 寒冰椰子：碎裂时贴图过重，降低 alpha
            [17, { alpha: 0.72 }],
            // 极·寒冰椰子：碎裂贴图更重 → 更透明
            [54, { alpha: 0.5 }],
            // 仙人掌：碎裂看着过糊且过长，缩小并加快(更快播放)
            [4, { scale: 0.75, slow: 1.3, alpha: 0.9 }],
            [25, { scale: 0.75, slow: 1.3, alpha: 0.9 }],
            // 花生射手：略微减弱 alpha 以降低模糊感
            [1, { alpha: 0.72 }],
            [18, { alpha: 0.8 }],
            // 南瓜投手：播放时间过长，加快
            [9, { slow: 0.6 }],
          ]);

          const tune = IMPACT_TUNING.get(Number(fx.res));
          if (tune) {
            if (tune.scale) size *= tune.scale;
            if (tune.slow != null) { usedSlow = tune.slow; drawSlow = tune.slow; }
            if (tune.alpha != null) alphaMul = tune.alpha;
          }

          const slowDur = animDur / Math.max(0.0001, usedSlow);
          const alpha = (fx.t >= slowDur
            ? Math.max(0, 1 - (fx.t - slowDur) / 0.12)
            : 1) * alphaMul;

          this.drawBulletAnimFrame(ctx, pack, 'baoza', cx, cy, size, fx.t, false, alpha, false, drawSlow);
          continue;
        }
        void this.requestBulletAnim(fx.res);
      }
      // 弹道爆炸包未就绪(加载中/失败)：画品质色冲击环，保证命中特效始终可见
      if (fx.res != null && !this.bulletAnims.get(String(fx.res))?.meta?.animations?.baoza) {
        const color = getHaloColor(fx.craftQuality ?? 2);
        const { r, g, b } = parseHexColor(color);
        const expand = Math.min(1, (fx.t / 0.5));
        const radius = CELL_W * 0.22 + expand * CELL_W * 0.4;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 0.9 - fx.t * 0.8);
        ctx.strokeStyle = `rgba(${r},${g},${b},1)`;
        ctx.lineWidth = Math.max(2, CELL_W * 0.07 * (1 - expand * 0.5));
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(${r},${g},${b},${Math.max(0, 0.3 - fx.t * 0.4)})`;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }
      // 无弹道爆炸包(如近战命中)：原版 ball-flicker 球体闪烁(dao effect.xml)，画在卡中间
      if (!this.effectAtlasImage || !IMPACT_FRAMES.length) {
        void this.requestEffectAtlas();
        continue;
      }
      {
        const progress = Math.max(0, Math.min(0.999, fx.t / 0.35));
        const frame = IMPACT_FRAMES[Math.floor(progress * IMPACT_FRAMES.length)];
        const fullW = frame.frameWidth ?? frame.width;
        const fullH = frame.frameHeight ?? frame.height;
        const scale = (CELL_W * 0.7) / Math.max(fullW, fullH, 1);
        const drawX = cx - fullW * scale / 2 - (frame.frameX ?? 0) * scale;
        const drawY = cy - fullH * scale / 2 - (frame.frameY ?? 0) * scale;
        ctx.save();
        ctx.globalAlpha *= Math.min(1, (1 - progress) * 2.2);
        ctx.drawImage(
          this.effectAtlasImage,
          frame.x, frame.y, frame.width, frame.height,
          drawX, drawY, frame.width * scale, frame.height * scale,
        );
        ctx.restore();
      }
    }
  }
}
