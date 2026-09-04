/**
 * 战斗/UI 音效映射 — 源自 assets/sound/effect/sound.xml + 技能效果补全
 */

import { getSkillEffect } from './SkillRegistry.js';

const p = (rel) => `/${rel.replace(/^\//, '')}`;

/**
 * 攻击音效 1(出手音)：sound.xml 的 send 分类。
 * 注意：不是部署音！召唤/部署统一用 summon.mp3。
 * 蘑菇仙人(58) 出手播 58.mp3，命中再播 b58.mp3(攻击音效 2)。
 */
export const ATTACK_START_SOUNDS = {
  1: p('sound/effect/fire/1.mp3'),
  9: p('sound/effect/fire/9.mp3'),
  17: p('sound/effect/fire/17.mp3'),
  58: p('sound/effect/fire/58.mp3'),
};

export const BULLET_ATTACK_SOUNDS = {
  1: p('sound/effect/fire/b1.mp3'),
  17: p('sound/effect/fire/b2.mp3'),
  58: p('sound/effect/fire/b58.mp3'),
};

export const NEAR_ATTACK_SOUNDS = {
  3: p('sound/effect/fire/n3.mp3'),
  5: p('sound/effect/fire/n5.mp3'),
  6: p('sound/effect/fire/n6.mp3'),
  7: p('sound/effect/fire/n7.mp3'),
  8: p('sound/effect/fire/n8.mp3'),
  11: p('sound/effect/fire/n11.mp3'),
  12: p('sound/effect/fire/n12.mp3'),
  22: p('sound/effect/fire/addHP.mp3'),
  23: p('sound/effect/fire/n3.mp3'),
  27: p('sound/effect/fire/n5.mp3'),
  28: p('sound/effect/fire/n6.mp3'),
  29: p('sound/effect/fire/n6.mp3'),
  30: p('sound/effect/fire/n7.mp3'),
  31: p('sound/effect/fire/n8.mp3'),
  33: p('sound/effect/fire/n33.mp3'),
  35: p('sound/effect/fire/n35.mp3'),
  36: p('sound/effect/fire/addHP.mp3'),
  38: p('sound/effect/fire/n38.mp3'),
  40: p('sound/effect/fire/n40.mp3'),
  41: p('sound/effect/fire/n41.mp3'),
  45: p('sound/effect/fire/n45.mp3'),
  49: p('sound/effect/fire/n49.mp3'),
  55: p('sound/effect/fire/n55.mp3'),
  56: p('sound/effect/fire/n56.mp3'),
  57: p('sound/effect/fire/n57.mp3'),
  60: p('sound/effect/fire/n45.mp3'),
};

export const DEATH_SOUNDS = {
  7: p('sound/effect/fire/d7.mp3'),
  30: p('sound/effect/fire/d7.mp3'),
};

export const DIGEST_ATTACK_SOUNDS = {
  34: p('sound/effect/fire/s34.mp3'),
};

export const CURSE_ATTACK_SOUNDS = {
  53: p('sound/effect/fire/c53.mp3'),
};

/** sound.xml 中 500–507 有专属 skill_*.mp3 */
export const SKILL_SOUNDS = {
  500: p('sound/effect/fire/skill_500.mp3'),
  501: p('sound/effect/fire/skill_501.mp3'),
  502: p('sound/effect/fire/skill_502.mp3'),
  503: p('sound/effect/fire/skill_503.mp3'),
  504: p('sound/effect/fire/skill_504.mp3'),
  505: p('sound/effect/fire/skill_505.mp3'),
  506: p('sound/effect/fire/skill_506.mp3'),
  507: p('sound/effect/fire/skill_507.mp3'),
  /** 无专属文件：按效果类型映射到最接近的素材 */
  514: p('sound/effect/fire/c53.mp3'),
  517: p('sound/effect/fire/skill_501.mp3'),
  518: p('sound/effect/fire/skill_505.mp3'),
  522: p('sound/effect/fire/skill_505.mp3'),
  523: p('sound/effect/fire/skill_506.mp3'),
};

/** 按技能效果 kind 兜底(避免播 readyAlert 误音) */
const SKILL_KIND_FALLBACK = {
  aoe_damage: SKILL_SOUNDS[500],
  enemy_hero_damage: SKILL_SOUNDS[501],
  heal_all_allies: SKILL_SOUNDS[502],
  freeze_all_enemies: SKILL_SOUNDS[503],
  heal_hero: SKILL_SOUNDS[504],
  buff_max_hp: SKILL_SOUNDS[505],
  cell_damage: SKILL_SOUNDS[506],
  fire_wall: SKILL_SOUNDS[507],
  poison_aoe: p('sound/effect/fire/c53.mp3'),
  damage_all_enemies: SKILL_SOUNDS[501],
  invuln_all_allies: SKILL_SOUNDS[505],
  buff_atk_allies: SKILL_SOUNDS[505],
  row_damage: SKILL_SOUNDS[506],
};

export const OTHER_SOUNDS = {
  12: p('sound/effect/fire/o12.mp3'),
  45: p('sound/effect/fire/o45.mp3'),
};

export const MOVE_SOUNDS = {
  41: p('sound/effect/fire/move_43.mp3'),
  43: p('sound/effect/fire/move_43.mp3'),
};

export const DEFAULT_SUMMON = p('sound/effect/fire/summon.mp3');
export const DEFAULT_BULLET = p('sound/effect/fire/b1.mp3');
export const DEFAULT_NEAR = p('sound/effect/fire/n5.mp3');

/** 场景音量层级(相对 sfxVolume 的倍率) */
export const SFX_TIER_VOLUME = {
  hero: 1,
  primary: 0.92,
  combat: 0.62,
  secondary: 0.42,
  subtle: 0.28,
  /** 铁匠铺强化成功/失败：在 primary 基础上再降约 60% */
  smith: 0.37,
};

/**
 * 战斗召唤/部署：统一 summon.mp3(原版所有卡召唤音效一致)
 */
export function resolveDeploySound() {
  return DEFAULT_SUMMON;
}

/** 攻击音效 1(出手音)：sound.xml send 分类，无则 null */
export function resolveAttackStartSound(cardId) {
  return ATTACK_START_SOUNDS[cardId] ?? null;
}

export function resolveAttackSound(cardId, unit) {
  if (DIGEST_ATTACK_SOUNDS[cardId]) return DIGEST_ATTACK_SOUNDS[cardId];
  if (CURSE_ATTACK_SOUNDS[cardId]) return CURSE_ATTACK_SOUNDS[cardId];

  const ranged = unit?.isRanged?.() ?? false;
  if (ranged || BULLET_ATTACK_SOUNDS[cardId]) {
    return BULLET_ATTACK_SOUNDS[cardId] ?? DEFAULT_BULLET;
  }
  return NEAR_ATTACK_SOUNDS[cardId] ?? DEFAULT_NEAR;
}

/**
 * 附加攻击音(同一张卡引用不止一个音效时，与主攻击音同时播放)。
 * sound.xml 中 12/45 同时出现在 nearAttack(n12/n45) 和 other(o12/o45)。
 */
export function resolveExtraAttackSound(cardId) {
  return OTHER_SOUNDS[cardId] ?? null;
}

export function resolveDeathSound(cardId) {
  return DEATH_SOUNDS[cardId] ?? null;
}

export function resolveSkillSound(skillId) {
  const id = Number(skillId);
  if (SKILL_SOUNDS[id]) return SKILL_SOUNDS[id];
  const effect = getSkillEffect(id);
  if (effect?.kind && SKILL_KIND_FALLBACK[effect.kind]) {
    return SKILL_KIND_FALLBACK[effect.kind];
  }
  return null;
}

export function resolveMoveSound(cardId) {
  return MOVE_SOUNDS[cardId] ?? null;
}