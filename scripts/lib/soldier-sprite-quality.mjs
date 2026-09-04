/**
 * 判断 soldier{res} 在图集中是否为可用整图，或仅为 DragonBones 补间碎片。
 * @returns {'good'|'fragment'|'none'}
 */
export function soldierSpriteQuality(sprites, res) {
  const r = String(res);
  const prefix = `soldier${r}-`;
  const parts = sprites.filter((s) => String(s.name ?? '').startsWith(prefix));
  if (!parts.length) return 'none';

  const hasMain = parts.some(
    (s) => /元件\s*1/.test(s.name) && s.width >= 48 && s.height >= 48,
  );
  if (hasMain) return 'good';

  const maxH = Math.max(...parts.map((s) => s.height));
  const maxW = Math.max(...parts.map((s) => s.width));
  if (maxH >= 80 && maxW >= 50) return 'good';

  return 'fragment';
}

export function isFragmentSoldier(sprites, res) {
  return soldierSpriteQuality(sprites, res) === 'fragment';
}

/**
 * 仅当图集完全由极扁碎块组成、且无可用主元件时才跳过动画烘焙。
 * 不再因单条补间碎块误杀整 res(如蒲公英/巨头怪/面包机/地道工兵/熊猫猎手)。
 */
/** 有 DragonBones 骨骼但图集质检为 fragment 时仍强制烘焙 */
const FORCE_ANIM_BAKE_RES = new Set([45]);

export function shouldSkipAnimBake(sprites, res) {
  if (FORCE_ANIM_BAKE_RES.has(Number(res))) return false;
  const r = String(res);
  const prefix = `soldier${r}-`;
  const parts = sprites.filter((s) => String(s.name ?? '').startsWith(prefix));
  if (!parts.length) return true;

  if (soldierSpriteQuality(sprites, res) === 'good') return false;

  const flatOnly = parts.every(
    (s) => s.height > 0 && s.width / s.height >= 3.5 && s.height <= 20,
  );
  const tinyOnly = parts.every((s) => s.width * s.height < 800);
  return flatOnly || tinyOnly;
}