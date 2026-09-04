/**
 * DragonBones 2.3 烘焙：官方矩阵、timeline 绝对关键帧插值、仅动画图层
 */
import {
  applyMatrix, identityMatrix, invertMatrix, multiplyMatrix, transformToMatrix,
} from './db-matrix.mjs';

const DEFAULT_TRANSFORM = {
  x: 0, y: 0, skX: 0, skY: 0, scX: 1, scY: 1, pX: 0, pY: 0,
};

const DEG = Math.PI / 180;

export function toArray(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function fixArmatureSlotOrder(armName, arm) {
  if (armName === 'soldier27/身体27') {
    const order = { '图层 1': 0, '图层 4': 1, '图层 2': 2, '图层 3': 3 };
    for (const slot of arm.slots) {
      if (order[slot.name] != null) slot.z = order[slot.name];
    }
    arm.slots.sort((a, b) => a.z - b.z);
  }
}

export function parseArmature(armature, armName = null) {
  const bones = {};
  for (const b of toArray(armature.bone)) {
    bones[b.name] = {
      name: b.name,
      parent: b.parent ?? null,
      transform: parseTransform(b.transform),
    };
  }

  const slots = [];
  for (const s of toArray(armature.skin?.slot)) {
    const displays = toArray(s.display).map((d) => ({
      name: d.name,
      type: d.type ?? 'image',
      transform: parseTransform(d.transform),
    }));
    slots.push({
      name: s.name,
      parent: s.parent,
      z: Number(s.z ?? 0),
      displays,
    });
  }
  slots.sort((a, b) => a.z - b.z);

  const parsed = { bones, slots, animations: {} };

  const animations = parsed.animations;
  for (const anim of toArray(armature.animation)) {
    const timelines = {};
    for (const tl of toArray(anim.timeline)) {
      const frames = toArray(tl.frame).map((f) => ({
        duration: Number(f.duration ?? 1),
        z: Number(f.z ?? 0),
        displayIndex: f.displayIndex != null ? Number(f.displayIndex) : undefined,
        tweenEasing: f.tweenEasing,
        tweenRotate: f.tweenRotate != null && f.tweenRotate !== 'NaN'
          ? Number(f.tweenRotate)
          : undefined,
        transform: f.transform ? parseTransform(f.transform) : null,
        colorTransform: f.colorTransform ? parseColorTransform(f.colorTransform) : null,
      }));
      timelines[tl.name] = { offset: Number(tl.offset ?? 0), frames };
    }
    animations[anim.name] = {
      duration: Number(anim.duration ?? 1),
      scale: Number(anim.scale ?? 1),
      timelines,
    };
  }

  fixArmatureSlotOrder(armName, parsed);
  return parsed;
}

/** 攻击时仅裁 面包机1.png 贴图顶部内嵌面包(过大会缺投口上沿) */
const MC20_BODY_TOP_CLIP_FRAC = 0.10;
/** 攻击时 补间3 只露上半(半片面包在投口内) */
const MC20_BREAD_BOTTOM_CLIP_FRAC = 0.22;

/** MC20 待机用 图层4/5 驱动指针，但机体 frameZ 更高会挡住面包；用 7/8 叠层仅画指针 */
const MC20_POINTER_OVERLAY = [
  ['图层 4', '图层 7'],
  ['图层 5', '图层 8'],
];

/** 眼底 + 瞳孔/元件双层：display0 为底，display1 叠层(勿用 displayIndex=1 替换底图) */
const DUAL_DISPLAY_OVERLAY_BONES = {
  MC2: new Set(['6.png']),
  MC25: new Set(['图层 14', '图层 18', '图层 21']),
};

/** 嵌套 armature 脸：display[1] 为子骨架 */
const NESTED_FACE_ARMATURES = new Set([
  'soldier4/补间 19--4',
]);

/** 待机/攻击强制叠嵌套脸(仙人掌系) */
const NESTED_FACE_SLOTS = {
  MC4: ['图层 3'],
  MC25: ['图层 14', '图层 18', '图层 21'],
};

/** 仅低 HP 或时间轴显式 displayIndex=1 时才叠瞳孔层 */
function shouldOverlayDualDisplay(armName, animName, slot, sample) {
  if (armName === 'MC2' && slot.parent === '6.png') {
    if (MC2_PUPIL_OVERLAY_ANIMS.test(animName)) return false;
    return animName === 'default_40' || sample.displayIndex === 1;
  }
  return true;
}

function isNestedFaceSlot(armName, slot) {
  return NESTED_FACE_SLOTS[armName]?.includes(slot.parent)
    && slot.displays[1]?.type === 'armature';
}

/** MC38 待机从 attacking 采样环形体导致错位分离，禁用补画 */
function buildMc38DefaultRingOverlays() {
  return [];
}

function buildNestedFaceOverlays(armName, arm, animData, frameIndex, animName) {
  const bones = NESTED_FACE_SLOTS[armName];
  if (!bones?.length) return [];
  if (!isIdleAnimName(animName) && !isAttackAnimName(animName)) return [];
  const extras = [];
  for (const boneName of bones) {
    const slot = arm.slots.find((s) => s.parent === boneName);
    if (!slot || slot.displays.length < 2) continue;
    const faceDisplay = slot.displays[1];
    if (faceDisplay?.type !== 'armature') continue;
    const sample = getSlotSample(arm, animData, slot, frameIndex);
    if (sample.visible === false || sample.displayIndex === -1) continue;
    const entry = {
      slot,
      frameZ: (sample.frameZ ?? slot.z ?? 0) + 1,
      skinZ: slot.z,
      displayIndex: 1,
      colorTransform: null,
    };
    fixDrawListZOrder(armName, entry, animName);
    extras.push(entry);
  }
  return extras;
}

function buildDualDisplayOverlays(armName, arm, animData, frameIndex, animName) {
  const overlayBones = DUAL_DISPLAY_OVERLAY_BONES[armName];
  if (!overlayBones?.size) return [];
  const extras = [];
  for (const slot of arm.slots) {
    if (!overlayBones.has(slot.parent)) continue;
    if (slot.displays.length < 2) continue;
    if (isNestedFaceSlot(armName, slot)) continue;
    const inTimeline = animData?.timelines?.[slot.parent] != null;
    const supplemented = shouldSupplementBindPoseSlot(armName, animName, slot.parent);
    if (!inTimeline && !supplemented) continue;
    const sample = getSlotSample(arm, animData, slot, frameIndex);
    if (sample.visible === false || sample.displayIndex === -1) continue;
    if (!shouldOverlayDualDisplay(armName, animName, slot, sample)) continue;
    const entry = {
      slot,
      frameZ: (sample.frameZ ?? slot.z ?? 0) + 0.5,
      skinZ: slot.z,
      displayIndex: 1,
      colorTransform: sample.colorTransform ?? null,
    };
    fixDrawListZOrder(armName, entry, animName);
    extras.push(entry);
  }
  return extras;
}

function buildMc20PointerOverlays(armName, arm, animData, animName, frameIndex) {
  if (armName !== 'MC20') return [];
  /** 7/8 叠层会在主体后留下补间残影，改由嵌套骨骼 图层1 单独画机体 */
  if (animName === 'default') return [];
  const animatedKeys = new Set(Object.keys(animData?.timelines ?? {}));
  const extras = [];
  for (const [srcBone, destBone] of MC20_POINTER_OVERLAY) {
    if (!animatedKeys.has(srcBone) || animatedKeys.has(destBone)) continue;
    const destSlot = arm.slots.find((s) => s.parent === destBone);
    if (!destSlot) continue;
    const srcTl = animData.timelines[srcBone];
    const sample = sampleTimeline(srcTl, arm.bones, srcBone, frameIndex);
    if (sample.visible === false || sample.displayIndex === -1) continue;
    extras.push({
      slot: destSlot,
      frameZ: (destSlot.z ?? 0) + 0.5,
      skinZ: destSlot.z,
      overrideTransform: sample.transform,
      displayIndex: sample.displayIndex ?? 0,
      colorTransform: sample.colorTransform ?? null,
    });
  }
  return extras;
}

function parseTransform(t) {
  if (!t) return { ...DEFAULT_TRANSFORM };
  const pX = t.pX === '' || t.pX == null ? 0 : Number(t.pX);
  const pY = t.pY === '' || t.pY == null ? 0 : Number(t.pY);
  return {
    x: Number(t.x ?? 0),
    y: Number(t.y ?? 0),
    skX: Number(t.skX ?? 0),
    skY: Number(t.skY ?? t.skX ?? 0),
    scX: Number(t.scX ?? 1),
    scY: Number(t.scY ?? 1),
    pX,
    pY,
  };
}

const FULL_COLOR = { alpha: 1, red: 1, green: 1, blue: 1 };

function parseColorTransform(ct) {
  if (!ct) return null;
  return {
    alpha: ct.alpha != null ? Number(ct.alpha) : (ct.aM != null ? Number(ct.aM) / 100 : 1),
    red: ct.red != null ? Number(ct.red) : (ct.rM != null ? Number(ct.rM) / 100 : 1),
    green: ct.green != null ? Number(ct.green) : (ct.gM != null ? Number(ct.gM) / 100 : 1),
    blue: ct.blue != null ? Number(ct.blue) : (ct.bM != null ? Number(ct.bM) / 100 : 1),
  };
}

function normalizeDeg(value) {
  let v = ((value % 360) + 360) % 360;
  if (v > 180) v -= 360;
  return v;
}

function lerpAngle(a, b, t) {
  const da = normalizeDeg(b - a);
  return a + da * t;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpTransform(a, b, t) {
  if (!b) return { ...a };
  if (!a) return { ...b };
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    skX: lerpAngle(a.skX, b.skX, t),
    skY: lerpAngle(a.skY, b.skY, t),
    scX: lerp(a.scX, b.scX, t),
    scY: lerp(a.scY, b.scY, t),
    pX: lerp(a.pX, b.pX, t),
    pY: lerp(a.pY, b.pY, t),
  };
}

function lerpColor(a, b, t) {
  if (!b) return a ? { ...a } : null;
  if (!a) return { ...b };
  return {
    alpha: lerp(a.alpha ?? 1, b.alpha ?? 1, t),
    red: lerp(a.red ?? 1, b.red ?? 1, t),
    green: lerp(a.green ?? 1, b.green ?? 1, t),
    blue: lerp(a.blue ?? 1, b.blue ?? 1, t),
  };
}

function tweenRatio(fr, t, dur) {
  if (dur <= 1) return 1;
  let ratio = t / dur;
  const easing = fr.tweenEasing;
  if (easing == null || easing === 'NaN') return ratio;
  const n = Number(easing);
  if (!Number.isFinite(n) || n === 0) return ratio;
  if (n > 0 && n <= 1) {
    return ratio + (Math.pow(ratio, 2) - ratio) * n;
  }
  return ratio;
}

function sampleTimeline(timeline, bones, boneName, frameIndex) {
  const base = bones[boneName]?.transform ?? DEFAULT_TRANSFORM;
  if (!timeline?.frames?.length) {
    return { transform: { ...base }, displayIndex: 0, frameZ: 0, visible: true, colorTransform: null };
  }

  let t = frameIndex - (timeline.offset ?? 0);
  if (t < 0) {
    return { transform: { ...base }, displayIndex: 0, frameZ: 0, visible: true, colorTransform: null };
  }

  for (let i = 0; i < timeline.frames.length; i++) {
    const fr = timeline.frames[i];
    const dur = fr.duration ?? 1;
    if (t < dur) {
      if (fr.displayIndex === -1) {
        return { transform: { ...base }, displayIndex: -1, frameZ: fr.z ?? 0, visible: false, colorTransform: null };
      }
      const next = timeline.frames[i + 1];
      const local = fr.transform ?? base;
      const canTween = fr.tweenEasing != null
        && fr.tweenEasing !== 'NaN'
        && next?.transform
        && next.displayIndex !== -1;
      const ratio = canTween ? tweenRatio(fr, t, dur) : 1;
      let transform = canTween
        ? lerpTransform(local, next.transform, ratio)
        : { ...local };
      if (canTween && fr.tweenRotate != null && Number.isFinite(fr.tweenRotate)) {
        const rotDeg = fr.tweenRotate * 360 * ratio;
        const skX = transform.skX ?? 0;
        const skY = transform.skY ?? 0;
        if (Math.abs(skX - skY) < 2) {
          transform = { ...transform, skX: skX + rotDeg, skY: skY + rotDeg };
        } else {
          transform = { ...transform, skY: skY + rotDeg };
        }
      }
      let colorTransform = null;
      if (fr.colorTransform && next?.colorTransform) {
        colorTransform = lerpColor(
          parseColorTransform(fr.colorTransform),
          parseColorTransform(next.colorTransform),
          canTween ? ratio : 1,
        );
      } else if (fr.colorTransform && canTween && next) {
        colorTransform = lerpColor(
          parseColorTransform(fr.colorTransform),
          FULL_COLOR,
          ratio,
        );
      } else if (fr.colorTransform) {
        colorTransform = parseColorTransform(fr.colorTransform);
        if (colorTransform.alpha < 0.05 && t === 0 && i === 0) {
          colorTransform = { ...colorTransform, alpha: 1 };
        }
      } else if (next?.colorTransform && canTween) {
        colorTransform = lerpColor(FULL_COLOR, parseColorTransform(next.colorTransform), ratio);
      }
      const displayIndex = fr.displayIndex ?? next?.displayIndex ?? 0;
      return {
        transform,
        displayIndex,
        frameZ: fr.z ?? 0,
        visible: true,
        colorTransform,
      };
    }
    t -= dur;
  }

  const last = timeline.frames[timeline.frames.length - 1];
  if (last.displayIndex === -1) {
    return { transform: { ...base }, displayIndex: -1, frameZ: last.z ?? 0, visible: false, colorTransform: null };
  }
  return {
    transform: last.transform ? { ...last.transform } : { ...base },
    displayIndex: last.displayIndex ?? 0,
    frameZ: last.z ?? 0,
    visible: true,
    colorTransform: last.colorTransform ? { ...last.colorTransform } : null,
  };
}

function boneMatrixFromTransform(t) {
  const px = t.pX ?? 0;
  const py = t.pY ?? 0;
  if (Math.abs(px) < 0.001 && Math.abs(py) < 0.001) {
    return transformToMatrix(t);
  }
  const rot = transformToMatrix({ ...t, x: 0, y: 0, pX: 0, pY: 0 });
  const pre = { a: 1, b: 0, c: 0, d: 1, tx: -px, ty: -py };
  const post = { a: 1, b: 0, c: 0, d: 1, tx: t.x + px, ty: t.y + py };
  return multiplyMatrix(post, multiplyMatrix(rot, pre));
}

export function buildPose(arm, animName, frameIndex) {
  const anim = arm.animations[animName];
  if (!anim) return null;

  const bonePose = {};
  for (const boneName of Object.keys(anim.timelines)) {
    if (!arm.bones[boneName]) continue;
    const tl = anim.timelines[boneName];
    const sampled = sampleTimeline(tl, arm.bones, boneName, frameIndex);
    bonePose[boneName] = {
      matrix: boneMatrixFromTransform(sampled.transform),
      displayIndex: sampled.displayIndex,
      visible: sampled.visible,
    };
  }
  applyBreadPivotHierarchy(arm, bonePose);
  return { bonePose, animScale: anim.scale ?? 1 };
}

function resolveBonePose(arm, boneName, bonePose) {
  const posed = bonePose[boneName];
  if (posed) return posed;
  const bind = arm.bones[boneName]?.transform ?? DEFAULT_TRANSFORM;
  return {
    matrix: boneMatrixFromTransform(bind),
    displayIndex: 0,
    visible: true,
  };
}

function isMc20BreadMachineArm(arm) {
  if (!arm.slots?.some((s) =>
    s.displays?.some((d) => d.name === 'soldier20-面包机1.png'),
  )) return false;
  const breadSlot = arm.slots.find((s) => s.parent === '图层 3');
  return breadSlot?.displays?.some((d) => /面包/.test(d.name ?? '')) ?? false;
}

/** 仅面包机子骨骼：图层3(面包片) 跟随 图层2(转轴) 旋转；禁止用于椰子等同名骨骼 */
function applyBreadPivotHierarchy(arm, bonePose) {
  if (!isMc20BreadMachineArm(arm)) return;
  if (!arm.bones['图层 2'] || !arm.bones['图层 3']) return;
  const pivot = bonePose['图层 2'];
  const bread = bonePose['图层 3'];
  if (!pivot || !bread) return;
  const pb = arm.bones['图层 2'].transform;
  const cb = arm.bones['图层 3'].transform;
  const local = {
    x: cb.x - pb.x,
    y: cb.y - pb.y,
    skX: cb.skX - pb.skX,
    skY: cb.skY - pb.skY,
    scX: (cb.scX ?? 1) / (pb.scX ?? 1),
    scY: (cb.scY ?? 1) / (pb.scY ?? 1),
    pX: 0,
    pY: 0,
  };
  bread.matrix = multiplyMatrix(pivot.matrix, boneMatrixFromTransform(local));
  bread.displayIndex = bread.displayIndex ?? 0;
  bread.visible = bread.visible !== false;
}

function isShadowSlot(slot) {
  if (slot.name === '影子' || slot.parent === '影子') return true;
  const d0 = slot.displays[0];
  return d0?.name === '影子' || (d0?.type === 'armature' && d0?.name === '影子');
}

function isBulletSlot(slot) {
  return slot.name === 'bullet' || slot.parent === 'bullet'
    || slot.displays.some((d) => /bullet|blt/i.test(d.name ?? ''));
}

function isEffectSlot(slot, animName) {
  if (animName === 'attacking' || /^attacking_/.test(animName ?? '')) return false;
  return slot.displays.some((d) =>
    /baozha|爆炸|shanguang|zhaFile|烟\d|effectFile|baozhaFile/i.test(d.name ?? ''),
  );
}

function isSlotInAnimation(slot, animatedKeys) {
  return animatedKeys.has(slot.parent) || animatedKeys.has(slot.name);
}

function pickChildAnim(child, parentAnimName, childArmName = null) {
  if (childArmName && NESTED_FACE_ARMATURES.has(childArmName) && child.animations.unnamed) {
    return 'unnamed';
  }
  if (childArmName === 'soldier27/身体27' && child.animations.unnamed) return 'unnamed';
  if (child.animations[parentAnimName]) return parentAnimName;
  if (child.animations.default) return 'default';
  if (child.animations.unnamed) return 'unnamed';
  const keys = Object.keys(child.animations);
  return keys[0] ?? null;
}

/** MC20 待机/移动：嵌套转轴固定在第 0 帧，避免投口旋转露缺口 */
function resolveMc20ChildFrameIndex(parentAnimName, parentArm, childArm, childAnimName, frameIndex) {
  if (!isMc20AttackBreadVisible(parentAnimName)) return 0;
  return childFrameIndex(parentArm, parentAnimName, childArm, childAnimName, frameIndex);
}

function childFrameIndex(parentArm, parentAnimName, childArm, childAnimName, frameIndex, childArmName = null) {
  const childAnim = childArm.animations[childAnimName];
  const childDur = Math.max(1, childAnim?.duration ?? 1);
  if (childArmName && NESTED_FACE_ARMATURES.has(childArmName)) {
    return ((frameIndex % childDur) + childDur) % childDur;
  }
  const parentAnim = parentArm.animations[parentAnimName];
  const parentDur = Math.max(1, parentAnim?.duration ?? 1);
  const parentScale = Math.max(0.001, parentAnim?.scale ?? 1);
  const childScale = childAnim?.scale ?? 1;
  const progress = Math.min(1, Math.max(0, frameIndex / parentDur));
  const childFi = Math.floor(progress * childDur * (childScale / parentScale));
  return ((childFi % childDur) + childDur) % childDur;
}

function getSlotSample(arm, anim, slot, frameIndex) {
  const boneName = slot.parent;
  const boneTl = anim?.timelines[boneName];
  if (boneTl) return sampleTimeline(boneTl, arm.bones, boneName, frameIndex);
  const base = arm.bones[boneName]?.transform ?? DEFAULT_TRANSFORM;
  return { transform: { ...base }, displayIndex: 0, frameZ: slot.z, visible: true, colorTransform: null };
}

/** MC20 攻击：父级图层7 半片面包弹出 + 机体顶裁切 */
export function isMc20AttackBreadVisible(animName) {
  return animName === 'attacking' || /^attacking_/.test(animName ?? '');
}

/** MC20 待机/移动：子级图层3 平顶面包静态显示 */
export function isMc20IdleBreadVisible(animName) {
  return isIdleAnimName(animName);
}

/** @deprecated 兼容旧名：等同攻击面包 */
export function isMc20BreadVisible(animName) {
  return isMc20AttackBreadVisible(animName);
}

function shouldDrawMc20BreadSlot(armName, animName, slot) {
  if (armName !== 'MC20') return false;
  if (slot.parent !== '图层 5') return false;
  return isMc20AttackBreadVisible(animName);
}

/** 嵌套面包机子槽：图层3 平顶面包仅待机/移动；攻击改由父级图层7 */
function shouldDrawMc20ChildSlot(armName, rootAnimName, slot) {
  if (armName !== 'soldier20/面包机_1') return null;
  if (slot.parent === '图层 3') {
    if (isMc20AttackBreadVisible(rootAnimName)) return false;
    return isMc20IdleBreadVisible(rootAnimName);
  }
  return null;
}

function animNamesWithBone(arm, boneName) {
  return Object.keys(arm.animations).filter(
    (name) => arm.animations[name]?.timelines?.[boneName],
  );
}

function isIdleAnimName(name) {
  return name === 'default' || name === 'moving' || name === 'flying' || /^default_\d+$/.test(name);
}

function isAttackAnimName(name) {
  return name === 'attacking' || /^attacking_/.test(name ?? '');
}

/** 烘焙 exclude 图层4/5 时仍走 MC20 合成分支(通用路径会误绘，合成路径自行叠层) */
function mc20UsesCompositeFrame(armName, onlyBones, excludeBones) {
  if (armName !== 'MC20' || onlyBones) return false;
  if (!excludeBones || excludeBones.size === 0) return true;
  for (const bone of excludeBones) {
    if (bone !== '图层 4' && bone !== '图层 5') return false;
  }
  return true;
}

/** 死神移动时排除环绕帧，避免脸部被抠空 */
const MC57_MOVING_EXCLUDE_BONES = new Set(['图层 11', '图层 12', '图层 13', '图层 14']);

const MC2_EYE_BONES = {
  default_40: ['2.png', '6.png', '1.5.png'],
};

const MC2_PUPIL_OVERLAY_ANIMS = /^default_(100|80|60)$/;

/** MC27 各动画仅对应一组骨骼，禁止其它 HP 组 bind-pose 叠出多重手臂 */
const MC27_ONLY_BONES = {
  default: new Set(['图层 34', '图层 1', '图层 3', '图层 4', '图层 5', '图层 6', '图层 7', '图层 8']),
  moving: new Set(['图层 34', '图层 10', '图层 11', '图层 12', '图层 13', '图层 14', '图层 15', '图层 16']),
  attacking: new Set(['图层 34', '图层 18', '图层 19', '图层 20', '图层 21', '图层 22', '图层 23', '图层 24']),
};

/** MC40 飞行水蜜桃：多 HP 组白名单，避免脸部/肢体叠层 */
const MC40_ONLY_BONES = {
  default: new Set(['图层 28', '图层 1', '图层 3', '图层 4', '图层 5', '图层 6', '图层 7', '图层 8']),
  moving: new Set(['图层 28', '图层 10', '图层 11', '图层 12', '图层 13', '图层 14', '图层 15', '图层 16']),
  flying: new Set(['图层 28', '图层 1', '图层 3', '图层 4', '图层 5', '图层 6', '图层 7', '图层 8']),
  attacking: new Set(['图层 28', '图层 18', '图层 19', '图层 20', '图层 21', '图层 22', '图层 23', '图层 24']),
};

const MC38_DEFAULT_RING_BONES = ['图层 11', '图层 12', '图层 13', '图层 14'];

function resolveHpBoneWhitelist(armName, animName) {
  if (armName === 'MC27') {
    if (animName === 'default' || /^default_/.test(animName)) return MC27_ONLY_BONES.default;
    if (animName === 'moving') return MC27_ONLY_BONES.moving;
    if (animName === 'attacking' || /^attacking_/.test(animName)) return MC27_ONLY_BONES.attacking;
  }
  if (armName === 'MC40') {
    if (animName === 'flying') return MC40_ONLY_BONES.flying;
    if (animName === 'default' || /^default_/.test(animName)) return MC40_ONLY_BONES.default;
    if (animName === 'moving') return MC40_ONLY_BONES.moving;
    if (animName === 'attacking' || /^attacking_/.test(animName)) return MC40_ONLY_BONES.attacking;
  }
  return null;
}

function mc2SupplementBones(animName) {
  return MC2_EYE_BONES[animName] ?? [];
}

/** 待机缺时间轴的配件槽：用绑定姿势补画 */
function shouldSupplementBindPoseSlot(armName, animName, boneName) {
  if (armName === 'MC25' && (animName === 'default' || animName === 'moving')) {
    return /^图层 (14|18|21)$/.test(boneName);
  }
  if (armName === 'MC18' && (animName === 'default' || animName === 'attacking') && boneName === '眼皮') {
    return true;
  }
  if (armName === 'MC18' && animName === 'default' && (boneName === '眼' || boneName === '脸')) {
    return true;
  }
  if (armName === 'MC18' && (animName === 'default' || animName === 'attacking')
    && ['茎', '9.png', '10.png', '8.png'].includes(boneName)) {
    return true;
  }
  if (armName === 'MC2' && /^default_\d+$/.test(animName)) {
    return mc2SupplementBones(animName).includes(boneName);
  }
  if (armName === 'MC21' && /^default_\d+$/.test(animName)) {
    return boneName === '图层 9' || boneName === '图层 10';
  }
  if (armName === 'soldier27/身体27'
    && (animName === 'default' || animName === 'moving' || animName === 'attacking' || animName === 'unnamed')
    && boneName === '图层 4') {
    return true;
  }
  if (armName === 'MC54' && animName === 'default' && (boneName === '图层 6' || boneName === '图层 8')) {
    return true;
  }
  return false;
}

function shouldSkipMc18BulletSlot(armName, animName, slot) {
  if (armName !== 'MC18') return false;
  if (!isBulletSlot(slot)) return false;
  if (isAttackAnimName(animName)) return false;
  return true;
}

const BODY27_ONLY_BONES = new Set(['图层 1', '图层 2', '图层 3', '图层 4']);

/**
 * 仅绘制当前动画时间轴内的槽位；例外仅为特定单位补画缺失配件。
 * 禁止宽泛 HP/眼睛补画，避免核桃三形态叠层、MC21 外壳误显。
 */
function shouldDrawMc20Slot(armName, animName, slot) {
  if (armName !== 'MC20') return null;
  if (isIdleAnimName(animName)) {
    /** 待机走 renderMc20IdleFrame 分层合成 */
    return false;
  }
  if (isAttackAnimName(animName)) {
    /** 攻击走 renderMc20AttackFrame 分层合成，此处全部跳过 */
    return false;
  }
  return null;
}

function shouldDrawSlot(armName, animName, slot, animatedKeys, options = {}) {
  const bone = slot.parent;
  if (armName === 'MC2' && bone === '6.png' && MC2_PUPIL_OVERLAY_ANIMS.test(animName)) {
    return false;
  }
  if (armName === 'MC21'
    && /^default_(100|80|60)$/.test(animName)
    && bone === '9.png') {
    return false;
  }
  if (armName === 'MC57' && bone === '死神06.png0' && !isAttackAnimName(animName)) {
    return false;
  }
  const mc20 = shouldDrawMc20Slot(armName, animName, slot);
  if (mc20 != null) return mc20;
  const mc20Child = shouldDrawMc20ChildSlot(
    armName,
    options.rootAnimName ?? animName,
    slot,
  );
  if (mc20Child != null) return mc20Child;
  if (options.excludeBones?.has(bone)) return false;
  if (isBulletSlot(slot)) {
    if (armName === 'MC18' && !isAttackAnimName(animName)) {
      return false;
    }
    return animatedKeys.has(bone) || animatedKeys.has(slot.name);
  }
  if (animatedKeys.has(bone) || animatedKeys.has(slot.name)) return true;
  if (!isIdleAnimName(animName) && animName !== 'default') return false;
  return shouldSupplementBindPoseSlot(armName, animName, bone);
}

function adjustSlotSample(armName, animName, slot, sample) {
  if (isNestedFaceSlot(armName, slot)) {
    const baseIdx = sample.displayIndex === 1 ? 0 : (sample.displayIndex ?? 0);
    return { ...sample, displayIndex: baseIdx };
  }
  if (DUAL_DISPLAY_OVERLAY_BONES[armName]?.has(slot.parent)) {
    const baseIdx = sample.displayIndex === 1 ? 0 : (sample.displayIndex ?? 0);
    return { ...sample, displayIndex: baseIdx };
  }
  if (armName === 'MC38' && animName === 'default' && MC38_DEFAULT_RING_BONES.includes(slot.parent)) {
    return { ...sample, colorTransform: null };
  }
  if (armName === 'MC38' && animName === 'default' && /^图层 [1-4]$/.test(slot.parent)) {
    const alpha = sample.colorTransform?.alpha;
    if (alpha != null && alpha <= 0.05) {
      return { ...sample, colorTransform: null };
    }
  }
  if (armName === 'MC21' && (slot.parent === '图层 9' || slot.parent === '图层 10')) {
    return { ...sample, displayIndex: 0 };
  }
  if (armName === 'MC18' && animName === 'default' && slot.parent === '眼皮') {
    return { ...sample, visible: false, displayIndex: -1 };
  }
  if (armName === 'MC18' && animName === 'default' && slot.parent === '眼') {
    return { ...sample, visible: true, displayIndex: 0 };
  }
  if (armName === 'MC18' && !isAttackAnimName(animName) && slot.parent === 'bullet') {
    return { ...sample, visible: false, displayIndex: -1 };
  }
  if (armName === 'MC2' && slot.parent === '5.png') {
    if (isIdleAnimName(animName) || /^default_\d+$/.test(animName)) {
      return { ...sample, visible: false, displayIndex: -1 };
    }
    return { ...sample, displayIndex: 0 };
  }
  return sample;
}

function buildBindPoseSupplements(armName, arm, animName, animatedKeys) {
  const extras = [];
  for (const slot of arm.slots) {
    if (!shouldSupplementBindPoseSlot(armName, animName, slot.parent)) continue;
    if (animatedKeys.has(slot.parent) || animatedKeys.has(slot.name)) continue;
    const displayIndex = 0;

    extras.push({
      slot,
      frameZ: slot.z,
      skinZ: slot.z,
      displayIndex,
      useBindPose: true,
    });
  }
  return extras;
}

function fixDrawListZOrder(armName, entry, animName = '') {
  const z = entry.frameZ ?? entry.slot.z ?? 0;
  if (armName === 'MC18' && entry.slot.parent === 'bullet') {
    entry.frameZ = isAttackAnimName(animName) ? z + 45 : z - 120;
  }
  if (armName === 'MC18' && entry.slot.parent === '头盔') {
    entry.frameZ = z + 50;
  }
  if (armName === 'MC18' && entry.slot.parent === '图层 2') {
    entry.frameZ = z - 50;
  }
  if (armName === 'MC18' && ['茎', '9.png', '10.png', '8.png'].includes(entry.slot.parent)) {
    entry.frameZ = z + 5;
  }
  if (armName === 'MC18' && ['脸', '嘴', '眼', '眼皮'].includes(entry.slot.parent)) {
    entry.frameZ = z + 55;
  }
  if (armName === 'MC4' && entry.slot.parent === '图层 3') {
    entry.frameZ = z + 55;
  }
  if (armName === 'MC4' && entry.slot.parent === '图层 1') {
    entry.frameZ = z + 60;
  }
  if (armName === 'MC25' && /^图层 (14|18|21)$/.test(entry.slot.parent)) {
    entry.frameZ = z + 35;
  }
  if (armName === 'MC1' && (entry.slot.parent === '2.png' || entry.slot.parent === '13.png')) {
    entry.frameZ = z + 35;
  }
  if (armName === 'MC17' && (entry.slot.parent === '图层 1' || entry.slot.parent === '图层 2')) {
    entry.frameZ = z + 30;
  }
  if (armName === 'MC54' && (entry.slot.parent === '图层 8' || entry.slot.parent === '图层 6')) {
    entry.frameZ = z + 40;
  }
  if (armName === 'MC21' && (entry.slot.parent === '图层 9' || entry.slot.parent === '图层 10' || entry.slot.parent === '9.png')) {
    entry.frameZ = z + 55;
  }
  if (armName === 'MC2' && (entry.slot.parent === '1.png' || entry.slot.parent === '1.5.png' || entry.slot.parent === '6.png' || entry.slot.parent === '5.png')) {
    entry.frameZ = z + 55;
  }
  if (armName === 'MC18' && (entry.slot.parent === '眼' || entry.slot.parent === '脸')) {
    entry.frameZ = z + 45;
  }

  if (armName === 'MC57') {
    if (/^死神\d/.test(entry.slot.parent) || ['图层 5', '图层 6', '图层 7'].includes(entry.slot.parent)) {
      entry.frameZ = z + 42;
    }
    if (['图层 11', '图层 12', '图层 13', '图层 14'].includes(entry.slot.parent)) {
      entry.frameZ = z - 20;
    }
  }
  if (armName === 'MC20') {
    if (entry.slot.parent === '图层 4' || entry.slot.parent === '图层 5'
      || entry.slot.parent === '图层 7' || entry.slot.parent === '图层 8') {
      entry.frameZ = z + 90;
    }
  }
  /** 嵌套面包机：面包片在投口内，须画在机体后、盖子前(源 DB z 顺序反了) */
  if (armName === 'soldier20/面包机_1') {
    if (entry.slot.parent === '图层 3') entry.frameZ = z - 40;
    else if (entry.slot.parent === '图层 1') entry.frameZ = z + 12;
    else if (entry.slot.parent === '图层 2') entry.frameZ = z + 24;
  }
  if (armName === 'soldier27/身体27' && entry.slot.parent === '图层 4') {
    entry.frameZ = z + 45;
  }
  if (armName === 'MC27' && entry.slot.parent === '图层 1') {
    entry.frameZ = z + 50;
  }
  if (armName === 'MC27' && entry.slot.parent === '图层 5') {
    entry.frameZ = z + 8;
  }
  if (armName === 'MC40' && (entry.slot.parent === '图层 3' || entry.slot.parent === '图层 1')) {
    entry.frameZ = z + 35;
  }
  if (armName === 'MC38' && MC38_DEFAULT_RING_BONES.includes(entry.slot.parent)) {
    entry.frameZ = z + 20;
  }
}



function resolveMc20NestMount(parentArm, bonePose, parentMatrix, mountBone) {
  const slot = parentArm.slots.find((s) => s.parent === mountBone);
  const display = slot?.displays?.[0];
  if (!slot || display?.type !== 'armature') return null;
  const bone = resolveBonePose(parentArm, mountBone, bonePose);
  const combined = multiplyMatrix(
    parentMatrix,
    multiplyMatrix(bone.matrix, transformToMatrix(display.transform)),
  );
  return { display, combined };
}

function resolveMc20AttackMount(parentArm, bonePose, parentMatrix) {
  return resolveMc20NestMount(parentArm, bonePose, parentMatrix, '图层 3');
}

function renderMc20ChildLayers(
  ctx, child, childAnim, childFi, spriteMap, armByName, rootAnimName, onlyBones,
  excludeBread = true,
) {
  renderFrame(ctx, child, childAnim, childFi, spriteMap, {
    armByName,
    skipShadow: true,
    skipBullet: true,
    parentMatrix: identityMatrix(),
    parentArm: child,
    armName: 'soldier20/面包机_1',
    parentAnimName: childAnim,
    rootAnimName,
    onlyBones: new Set(onlyBones),
    excludeBones: excludeBread ? new Set(['图层 3']) : null,
  });
}

/** 待机：只绘制完整机体与灰色盖子，不显示面包。 */
function renderMc20IdleFrame(ctx, arm, animName, frameIndex, spriteMap, options = {}) {
  const pose = buildPose(arm, animName, frameIndex);
  if (!pose) return false;
  const { bonePose } = pose;
  const animData = arm.animations[animName];
  const {
    skipShadow = true,
    armByName = null,
    parentMatrix = identityMatrix(),
  } = options;
  const common = {
    armByName,
    skipShadow: true,
    skipBullet: true,
    parentMatrix,
    parentArm: arm,
    armName: 'MC20',
    rootAnimName: animName,
  };

  if (!skipShadow) {
    const shadowSlot = arm.slots.find((s) => isShadowSlot(s));
    if (shadowSlot) {
      renderSlot(ctx, arm, animData, animName, shadowSlot, frameIndex, bonePose, spriteMap, common);
    }
  }

  // 原始层级：灰色盖子(图层5)与面包(图层4)都在机身(图层1)后方。
  for (const boneName of ['图层 5', '图层 4']) {
    const slot = arm.slots.find((entry) => entry.parent === boneName);
    if (slot) renderSlot(ctx, arm, animData, animName, slot, frameIndex, bonePose, spriteMap, common);
  }

  const mount = resolveMc20NestMount(arm, bonePose, parentMatrix, '图层 1');
  if (!mount) return false;

  const raw = armByName?.get(mount.display.name);
  if (!raw) return false;
  const child = parseArmature(raw, mount.display.name);
  const childAnim = pickChildAnim(child, animName, mount.display.name);
  if (!childAnim) return false;

  ctx.save();
  applyMatrix(ctx, mount.combined);
  renderMc20ChildLayers(
    ctx,
    child,
    childAnim,
    0,
    spriteMap,
    armByName,
    animName,
    ['图层 1', '图层 2', '图层 3'],
    false,
  );
  ctx.restore();
  return true;
}

/** 面包只在出膛前短暂弹起；出膛帧后立即隐藏，由独立子弹接替。 */
function shouldShowMc20LaunchBread(frameIndex) {
  return frameIndex >= 4 && frameIndex < 9;
}

/** 攻击：常态显示盖子；预备帧显示弹起面包；出膛后立即恢复盖子。 */
function renderMc20AttackFrame(ctx, arm, animName, frameIndex, spriteMap, options = {}) {
  const pose = buildPose(arm, animName, frameIndex);
  if (!pose) return false;
  const { bonePose } = pose;
  const animData = arm.animations[animName];
  const {
    skipShadow = true,
    skipBullet = true,
    armByName = null,
    parentMatrix = identityMatrix(),
  } = options;
  const common = {
    armByName,
    skipShadow: true,
    skipBullet: true,
    parentMatrix,
    parentArm: arm,
    armName: 'MC20',
    rootAnimName: animName,
  };

  if (!skipShadow) {
    const shadowSlot = arm.slots.find((s) => isShadowSlot(s));
    if (shadowSlot) {
      renderSlot(ctx, arm, animData, animName, shadowSlot, frameIndex, bonePose, spriteMap, common);
    }
  }

  // 原始攻击层级：运动盖子(图层8)、弹起面包(图层7)、机身(图层3)。
  for (const boneName of ['图层 8', '图层 7']) {
    const slot = arm.slots.find((entry) => entry.parent === boneName);
    if (slot) renderSlot(ctx, arm, animData, animName, slot, frameIndex, bonePose, spriteMap, common);
  }

  const mount = resolveMc20AttackMount(arm, bonePose, parentMatrix);
  if (!mount) return false;

  const raw = armByName?.get(mount.display.name);
  if (!raw) return false;
  const child = parseArmature(raw, mount.display.name);
  const childAnim = pickChildAnim(child, animName, mount.display.name);
  if (!childAnim) return false;
  const childFi = resolveMc20ChildFrameIndex(animName, arm, child, childAnim, frameIndex);

  ctx.save();
  applyMatrix(ctx, mount.combined);

  renderMc20ChildLayers(
    ctx,
    child,
    childAnim,
    childFi,
    spriteMap,
    armByName,
    animName,
    ['图层 1', '图层 2', '图层 3'],
    false,
  );

  ctx.restore();

  if (!skipBullet) {
    const bulletSlot = arm.slots.find((s) => s.parent === 'bullet');
    if (bulletSlot) {
      renderSlot(ctx, arm, animData, animName, bulletSlot, frameIndex, bonePose, spriteMap, common);
    }
  }
  return true;
}

function renderNestedArmature(ctx, display, parentMatrix, armByName, spriteMap, parentArm, parentAnimName, frameIndex) {
  const raw = armByName?.get(display.name);
  if (!raw) return;
  const child = parseArmature(raw, display.name);
  const childAnim = pickChildAnim(child, parentAnimName, display.name);
  if (!childAnim) return;

  const childFi = display.name === 'soldier20/面包机_1'
    ? resolveMc20ChildFrameIndex(parentAnimName, parentArm, child, childAnim, frameIndex)
    : childFrameIndex(parentArm, parentAnimName, child, childAnim, frameIndex, display.name);
  const displayMatrix = transformToMatrix(display.transform);
  const combined = multiplyMatrix(parentMatrix, displayMatrix);
  const breadMc20 = display.name === 'soldier20/面包机_1';

  ctx.save();
  applyMatrix(ctx, combined);
  if (breadMc20) {
    const attackBread = isMc20AttackBreadVisible(parentAnimName);
    const idleBread = isMc20IdleBreadVisible(parentAnimName);
    renderFrame(ctx, child, childAnim, childFi, spriteMap, {
      armByName,
      skipShadow: true,
      skipBullet: true,
      parentMatrix: identityMatrix(),
      parentArm: child,
      armName: 'soldier20/面包机_1',
      parentAnimName: childAnim,
      rootAnimName: parentAnimName,
      excludeBones: attackBread ? new Set(['图层 3']) : null,
      onlyBones: attackBread
        ? new Set(['图层 1', '图层 2'])
        : (idleBread ? new Set(['图层 1', '图层 2', '图层 3']) : new Set(['图层 1', '图层 2'])),
    });
  } else if (NESTED_FACE_ARMATURES.has(display.name)) {
    renderFrame(ctx, child, childAnim, childFi, spriteMap, {
      armByName,
      skipShadow: true,
      skipBullet: true,
      parentMatrix: identityMatrix(),
      parentArm: child,
      armName: display.name,
      parentAnimName: childAnim,
    });
  } else {
    const childOpts = {
      armByName,
      skipShadow: true,
      skipBullet: true,
      parentMatrix: identityMatrix(),
      parentArm: child,
      armName: display.name,
      parentAnimName: childAnim,
    };
    if (display.name === 'soldier27/身体27') {
      childOpts.onlyBones = BODY27_ONLY_BONES;
    }
    renderFrame(ctx, child, childAnim, childFi, spriteMap, childOpts);
  }
  ctx.restore();
}

function shouldClipMc20BodyTop(armName, slotParent, displayName, rootAnimName) {
  return false;
}

function shouldClipMc20BreadBottom(armName, slotParent, displayName, rootAnimName) {
  return false;
}

export function drawSlot(ctx, img, globalMatrix, display, colorTransform = null, drawOpts = {}) {
  if (!img) return;
  const alpha = colorTransform?.alpha ?? 1;
  if (alpha <= 0.02) return;

  const dt = display.transform;
  const iw = img.width;
  const ih = img.height;
  const px = dt.pX ?? (iw / 2);
  const py = dt.pY ?? (ih / 2);

  const displayMatrix = transformToMatrix(dt);
  const finalMatrix = multiplyMatrix(globalMatrix, displayMatrix);
  const clipBodyTop = shouldClipMc20BodyTop(
    drawOpts.armName,
    drawOpts.slotParent,
    display.name,
    drawOpts.rootAnimName,
  );
  const clipBreadBottom = shouldClipMc20BreadBottom(
    drawOpts.armName,
    drawOpts.slotParent,
    display.name,
    drawOpts.rootAnimName,
  );
  const bodyClipY = clipBodyTop ? Math.round(ih * MC20_BODY_TOP_CLIP_FRAC) : 0;
  const breadVisibleH = clipBreadBottom
    ? Math.round(ih * (1 - MC20_BREAD_BOTTOM_CLIP_FRAC))
    : ih;

  ctx.save();
  ctx.globalAlpha *= alpha;
  applyMatrix(ctx, finalMatrix);
  if (clipBodyTop) {
    ctx.beginPath();
    ctx.rect(-px, -py + bodyClipY, iw, ih - bodyClipY);
    ctx.clip();
  } else if (clipBreadBottom) {
    ctx.beginPath();
    ctx.rect(-px, -py, iw, breadVisibleH);
    ctx.clip();
  }
  ctx.drawImage(img, -px, -py, iw, ih);
  const displayName = String(display.name ?? '');
  // The atlas is stored on a black matte. These eye-only pieces are black too,
  // so edge chroma-keying erases them; rebuild the pupils in the same bone-local
  // coordinate space so they continue to follow the original animation.
  if (/^soldier4-.*13--4$/.test(displayName)) {
    ctx.fillStyle = '#050807';
    ctx.beginPath();
    ctx.ellipse(-px + iw * 0.3, -py + ih * 0.5, iw * 0.17, ih * 0.42, 0, 0, Math.PI * 2);
    ctx.ellipse(-px + iw * 0.72, -py + ih * 0.5, iw * 0.17, ih * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (/^soldier25-.*_(2|5|9)\.png$/.test(displayName)) {
    ctx.fillStyle = '#050807';
    ctx.beginPath();
    ctx.ellipse(-px + iw * 0.3, -py + ih * 0.5, iw * 0.16, ih * 0.4, 0, 0, Math.PI * 2);
    ctx.ellipse(-px + iw * 0.72, -py + ih * 0.5, iw * 0.16, ih * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function renderDisplayAt(ctx, display, globalMatrix, colorTransform, armByName, spriteMap, parentArm, parentAnimName, frameIndex, renderOpts = {}) {
  if (!display) return;

  if (display.type === 'armature') {
    renderNestedArmature(ctx, display, globalMatrix, armByName, spriteMap, parentArm, parentAnimName, frameIndex);
    return;
  }

  const img = spriteMap.get(display.name);
  drawSlot(ctx, img, globalMatrix, display, colorTransform, renderOpts);
}

function renderSlot(ctx, arm, animData, animName, slot, frameIndex, bonePose, spriteMap, options, slotOverride = null) {
  const { armByName, skipShadow, skipBullet, parentMatrix, parentArm, skipSlot, armName } = options;
  if (skipSlot?.(slot)) return;
  if (skipShadow && isShadowSlot(slot)) return;
  if (skipBullet && isBulletSlot(slot)) return;
  if (isEffectSlot(slot, animName)) return;

  const slotSample = slotOverride?.useBindPose
    ? {
      visible: true,
      displayIndex: slotOverride.displayIndex ?? 0,
      colorTransform: null,
    }
    : adjustSlotSample(
      options.armName,
      animName,
      slot,
      slotOverride
        ? {
          visible: true,
          displayIndex: slotOverride.displayIndex ?? 0,
          colorTransform: slotOverride.colorTransform ?? null,
        }
        : getSlotSample(arm, animData, slot, frameIndex),
    );
  if (slotSample.visible === false || slotSample.displayIndex === -1) return;

  const boneName = slot.parent;
  const bone = slotOverride?.useBindPose
    ? resolveBonePose(arm, boneName, {})
    : resolveBonePose(arm, boneName, bonePose);
  if (!slotOverride && (bone.visible === false || bone.displayIndex === -1)) return;

  const displayIndex = slotSample.displayIndex ?? bone?.displayIndex ?? 0;
  if (displayIndex < 0 || displayIndex >= slot.displays.length) return;

  const globalMatrix = slotOverride?.overrideTransform
    ? multiplyMatrix(parentMatrix, boneMatrixFromTransform(slotOverride.overrideTransform))
    : multiplyMatrix(parentMatrix, bone.matrix);
  const display = slot.displays[displayIndex];
  renderDisplayAt(ctx, display, globalMatrix, slotSample.colorTransform,
    armByName, spriteMap, parentArm, animName, frameIndex, {
      ...options,
      slotParent: slot.parent,
    });
}

export function renderFrame(ctx, arm, animName, frameIndex, spriteMap, options = {}) {
  const {
    skipShadow = true,
    skipBullet = true,
    armByName = null,
    armName = null,
    parentMatrix = identityMatrix(),
    parentArm = arm,
    parentAnimName = animName,
    skipSlot = null,
    onlyBones = null,
    excludeBones = null,
    rootAnimName: rootAnimNameOpt = null,
  } = options;

  if (armName === 'MC20' && mc20UsesCompositeFrame(armName, onlyBones, excludeBones)) {
    if (isAttackAnimName(animName)) {
      return renderMc20AttackFrame(ctx, arm, animName, frameIndex, spriteMap, options);
    }
    if (isIdleAnimName(animName)) {
      return renderMc20IdleFrame(ctx, arm, animName, frameIndex, spriteMap, options);
    }
  }

  const pose = buildPose(arm, animName, frameIndex);
  if (!pose) return false;
  const { bonePose } = pose;
  const animData = arm.animations[animName];
  const animatedKeys = new Set(Object.keys(animData?.timelines ?? {}));
  const boneWhitelist = resolveHpBoneWhitelist(armName, animName);
  const rootAnimName = rootAnimNameOpt ?? parentAnimName;
  const drawOpts = { excludeBones, rootAnimName };
  const mergedSkipSlot = (slot) => {
    if (shouldSkipMc18BulletSlot(armName, animName, slot)) return true;
    if (skipSlot?.(slot)) return true;
    return false;
  };

  const drawList = [];
  for (const slot of arm.slots) {
    if (boneWhitelist && !boneWhitelist.has(slot.parent)) continue;
    if (onlyBones && !onlyBones.has(slot.parent)) continue;
    const forceMc20Bread = shouldDrawMc20BreadSlot(armName, animName, slot);
    if (!forceMc20Bread && !shouldDrawSlot(armName, animName, slot, animatedKeys, drawOpts)) continue;
    if (skipShadow && isShadowSlot(slot)) continue;
    if (skipBullet && isBulletSlot(slot)) continue;
    if (isEffectSlot(slot, animName)) continue;

    const sample = adjustSlotSample(armName, animName, slot,
      getSlotSample(arm, animData, slot, frameIndex));
    if (sample.visible === false || sample.displayIndex === -1) continue;
    const bone = resolveBonePose(arm, slot.parent, bonePose);
    if (bone.visible === false || bone.displayIndex === -1) continue;

    const entry = {
      slot,
      frameZ: sample.frameZ ?? slot.z,
      skinZ: slot.z,
    };
    fixDrawListZOrder(armName, entry, animName);
    drawList.push(entry);
  }

  for (const twin of buildMc20PointerOverlays(armName, arm, animData, animName, frameIndex)) {
    drawList.push(twin);
  }
  for (const twin of buildDualDisplayOverlays(armName, arm, animData, frameIndex, animName)) {
    drawList.push(twin);
  }
  for (const twin of buildNestedFaceOverlays(armName, arm, animData, frameIndex, animName)) {
    drawList.push(twin);
  }
  for (const twin of buildMc38DefaultRingOverlays(armName, arm, animName, frameIndex)) {
    drawList.push(twin);
  }
  for (const extra of buildBindPoseSupplements(armName, arm, animName, animatedKeys)) {
    fixDrawListZOrder(armName, extra, animName);
    drawList.push(extra);
  }

  drawList.sort((a, b) => (a.frameZ - b.frameZ) || (a.skinZ - b.skinZ));

  for (const entry of drawList) {
    const { slot, overrideTransform, displayIndex, colorTransform, useBindPose } = entry;
    const slotOverride = overrideTransform
      ? { overrideTransform, displayIndex, colorTransform }
      : (displayIndex != null || useBindPose)
        ? { displayIndex, colorTransform, useBindPose }
        : null;
    renderSlot(ctx, arm, animData, animName, slot, frameIndex, bonePose, spriteMap, {
      armByName,
      skipShadow,
      skipBullet,
      parentMatrix,
      parentArm,
      armName,
      rootAnimName,
      skipSlot: mergedSkipSlot,
    }, slotOverride);
  }
  return true;
}

export function bakeAnimationFrames(arm, animName, spriteMap, sampleStep = 1) {
  const anim = arm.animations[animName];
  if (!anim) return [];
  const total = Math.max(1, Math.floor(anim.duration));
  const step = total <= 8 ? 1 : sampleStep;
  const frames = [];
  for (let fi = 0; fi < total; fi += step) {
    frames.push(fi);
  }
  if (frames[frames.length - 1] !== total - 1) frames.push(total - 1);
  return frames;
}

export function resolveBakeAnimations(arm) {
  const names = Object.keys(arm.animations);
  const result = [];
  const added = new Set();

  const push = (key, source, extra = {}) => {
    if (added.has(key)) return;
    added.add(key);
    result.push({ key, source, ...extra });
  };

  if (names.includes('default')) {
    for (const key of ['default', 'moving', 'attacking', 'death']) {
      if (arm.animations[key]) push(key, key);
    }
  }

  for (const n of names.filter((k) => /^default_\d+$/.test(k))) {
    const threshold = Number(n.split('_')[1]);
    if (Number.isFinite(threshold)) push(n, n, { hpThreshold: threshold });
  }

  for (const n of names.filter((k) => /^attacking_\d+$/.test(k))) {
    const threshold = Number(n.split('_')[1]);
    if (Number.isFinite(threshold)) push(n, n, { hpThreshold: threshold, isAttack: true });
  }

  for (const n of names.filter((k) => /^effect_\d+$/.test(k))) {
    const threshold = Number(n.split('_')[1]);
    if (Number.isFinite(threshold)) push(n, n, { hpThreshold: threshold, isEffect: true });
  }

  const extras = ['flying', 'jump', 'underMoving', 'toGround', 'secondAttackStatus'];
  for (const n of extras) {
    if (arm.animations[n]) push(n, n);
  }

  if (!result.length) {
    const idle = names.find((n) => n.startsWith('default')) ?? names[0];
    if (idle) push('default', idle);
  }

  return result;
}

export function collectAllDisplayNames(arm, armByName, out = new Set()) {
  for (const slot of arm.slots) {
    for (const d of slot.displays) {
      if (!d.name || d.name === '影子') continue;
      if (d.type === 'armature' && armByName?.has(d.name)) {
        collectAllDisplayNames(parseArmature(armByName.get(d.name), d.name), armByName, out);
      } else {
        out.add(d.name);
      }
    }
  }
  return out;
}

export function padBounds(bounds, pad, maxW, maxH) {
  if (!bounds) return null;
  return {
    left: Math.max(0, bounds.left - pad),
    top: Math.max(0, bounds.top - pad),
    right: Math.min(maxW - 1, bounds.right + pad),
    bottom: Math.min(maxH - 1, bounds.bottom + pad),
    opaque: bounds.opaque,
  };
}

export function mergeBoundsList(boundsList, pad, maxW, maxH) {
  let left = maxW;
  let top = maxH;
  let right = -1;
  let bottom = -1;
  let opaque = 0;
  for (const b of boundsList) {
    if (!b) continue;
    left = Math.min(left, b.left);
    top = Math.min(top, b.top);
    right = Math.max(right, b.right);
    bottom = Math.max(bottom, b.bottom);
    opaque = Math.max(opaque, b.opaque ?? 0);
  }
  if (right < left) return null;
  return padBounds({ left, top, right, bottom, opaque }, pad, maxW, maxH);
}
