/** 英雄技能槽数量，对应 Q/W/E/R/T/Y。 */
export const SKILL_SLOT_COUNT = 6;
export const SKILL_HOTKEYS = ['Q', 'W', 'E', 'R', 'T', 'Y'];

/** 英雄 MP：战斗中每 50 秒恢复 10 点。 */
export const HERO_MP_MAX = 100;
export const HERO_MP_START = 100;
export const HERO_MP_REGEN = 10;
export const HERO_MP_REGEN_INTERVAL = 50;

/** 初始只装备非天赋技能；其余技能必须先在天赋树解锁。 */
export const DEFAULT_SKILL_LOADOUT = [503, 504, 505, null, null, null];

/**
 * 不应出现在技能树/技能池中的内部或废弃技能。
 * 2026-09-12：按用户要求把 542/543/544/545/546/548/549/551/552/553/554/555/556
 * 一并禁用并隐藏（这些技能的效果声明也已从 SKILL_EFFECTS 移除，
 * 技能池按"有效果声明"过滤，所以它们不会再出现在战斗技能栏里）。
 */
const HIDDEN_SKILL_CARD_IDS = new Set([
  520,
  542, 543, 544, 545, 546, 548, 549,
  551, 552, 553, 554, 555, 556,
]);

/** 主动技能的战斗效果。 */
export const SKILL_EFFECTS = {
  500: { kind: 'aoe_damage', radius: 1, damage: 25, needsTarget: true, label: '3×3范围25伤害' },
  501: { kind: 'enemy_hero_damage', damage: 60, label: '敌方基地60伤害' },
  502: { kind: 'heal_all_allies', amount: 30, label: '治疗己方全场' },
  503: { kind: 'freeze_all_enemies', freezeSec: 5, slowSec: 5, label: '冻结全场敌人' },
  504: { kind: 'heal_hero', amount: 200, heroHpFloorSec: 8, heroHpFloor: 10, label: '圣光术：回200并8秒基地锁血至10' },
  505: { kind: 'buff_max_hp', amount: 10, duration: 15, healPct: 50, label: '生命结界：回50%生命并提升生命上限' },
  506: { kind: 'cell_damage', damage: 70, needsTarget: true, label: '单格雷击' },
  507: { kind: 'fire_wall', dps: 10, duration: 10, needsTarget: true, label: '纵向火墙' },
  514: { kind: 'poison_aoe', radius: 1, dps: 4, duration: 10, needsTarget: true, label: '3×3毒雾' },
  517: { kind: 'damage_all_enemies', damage: 35, label: '全屏陨石伤害' },
  518: { kind: 'invuln_all_allies', duration: 5, debuffImmune: true, label: '圣盾术：5秒无敌并免疫负面效果' },
  522: { kind: 'buff_atk_allies', amount: 10, duration: 15, label: '全场攻击强化' },
  523: { kind: 'row_damage', damage: 50, needsTarget: true, label: '冰刺突袭' },
  526: { kind: 'cell_damage', damage: 75, freezeSec: 1.5, bonusFrozenPct: 30, needsTarget: true, label: '灼熱之箭(75+冰冻1.5秒,冰冻目标+30%)' },
  527: { kind: 'cell_damage', damage: 120, needsTarget: true, label: '雷鳴之箭' },
  528: { kind: 'cell_damage', damage: 72, bonusBurningPct: 25, needsTarget: true, label: '冰霜之箭(72,灼烧目标+25%)' },
  529: { kind: 'aoe_damage', radius: 1, damage: 65, bonusSlowedPct: 25, needsTarget: true, label: '岩破术(65,减速目标+25%)' },
  530: { kind: 'aoe_rect', lanes: 4, cols: 5, laneOffset: 1, colOffset: 2, damage: 15, needsTarget: true, label: '4行5列范围15伤害' },
  531: { kind: 'aoe_damage', radius: 1, damage: 25, needsTarget: true, label: '3×3范围25伤害' },
  532: { kind: 'aoe_damage', radius: 1, damage: 25, needsTarget: true, label: '3×3范围25伤害' },
  533: { kind: 'row_damage', damage: 50, needsTarget: true, label: '横向50伤害' },
  534: { kind: 'row_damage', damage: 50, needsTarget: true, label: '横向50伤害' },
  535: { kind: 'row_damage', damage: 70, needsTarget: true, label: '横向70伤害' },
  536: { kind: 'row_damage', damage: 70, needsTarget: true, label: '横向70伤害' },
  537: { kind: 'firebird', damage: 50, burnDps: 4, burnSec: 5, label: '全屏50伤害并灼烧(4/秒,5秒)' },
  538: { kind: 'sacred_revival', amount: 100, hotAmount: 0, hotEvery: 2, duration: 10, label: '全军复苏回100' },
  539: { kind: 'fatal_curse', dps: 8, duration: 10, vulnerability: 3, label: '全屏持续伤害8(中毒目标受非中毒伤害+3)' },
  540: { kind: 'buff_as_ms', pct: 10, duration: 10, label: '全场攻速移速+10%' },
  541: { kind: 'buff_atk_allies', amount: 30, duration: 15, label: '全场攻击+30' },
  547: { kind: 'base_invulnerable', duration: 10, label: '铁壳功：己方基地无敌10秒' },
  550: { kind: 'phase_out_enemies', countMin: 3, countMax: 5, duration: 10, label: '幻之境：3~5张敌卡消失10秒' },
  557: { kind: 'aoe_damage', radius: 1, damage: 60, needsTarget: true, label: '3×3范围60伤害' },
  558: { kind: 'thunderstorm', damage: 10, label: '雷霆风暴(全屏10伤+记录打最高)' },
  560: { kind: 'row_damage', damage: 100, needsTarget: true, label: '雷弹100' },
  559: { kind: 'sacred_revival', amount: 30, hotAmount: 0, hotEvery: 2, duration: 0, label: '神圣复苏(回30)' },
};

export function isActiveSkillCard(card) {
  const category = Number(card?.card_category ?? card?.category);
  const id = Number(card?.id ?? card?.card_id);
  return category === 2 && id >= 500 && id < 600 && !HIDDEN_SKILL_CARD_IDS.has(id);
}

export function getSkillEffect(cardId) {
  return SKILL_EFFECTS[Number(cardId)] ?? null;
}

export function getSkillMpCost(card) {
  if (!card) return 99;
  if (!card.cost) return 0;
  return Math.max(5, Math.round(card.cost * 0.15));
}

export function getSkillCooldownSec(card) {
  if (!card) return 20;
  return Math.max(8, Math.round((card.cooldown || 40) * 0.5));
}

export function getSkillIcon(card) {
  if (!card) return '✦';
  // 技能卡有卡图（sprites/cards/{res}.png）：优先用图片，回退 emoji
  const res = Number(card.spriteRes ?? card.res ?? card.card_id);
  if (res) return `<img class="skill-card-icon" src="/sprites/cards/${res}.png" alt="" draggable="false" />`;
  const name = card.name ?? '';
  if (name.includes('治疗') || name.includes('医疗') || name.includes('圣光') || name.includes('复苏')) return '💚';
  if (name.includes('冻结') || name.includes('暴风') || name.includes('冰')) return '❄';
  if (name.includes('火') || name.includes('陨石')) return '🔥';
  if (name.includes('毒') || name.includes('诅咒')) return '☣';
  if (name.includes('盾') || name.includes('结界')) return '🛡';
  if (name.includes('雷') || name.includes('闪电')) return '⚡';
  return '✦';
}
