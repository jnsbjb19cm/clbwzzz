/**
 * 卡牌图鉴特性表。这里只保存规则数据，战斗执行统一由 BattleEngine 处理。
 * 不能再用一个 special_atk_effect 数字推断所有行为：原始数据里同值会复用。
 */

export const SUICIDE_CARD_IDS = new Set([40, 61, 65]);

export const ATTACK_PATTERNS = new Map([
  [16, { kind: 'forward', cells: 2 }],
  [18, { kind: 'row_splash', radius: 1 }],
  [48, { kind: 'forward', cells: 6 }],
  [54, { kind: 'square', radius: 1 }],
  [55, { kind: 'forward', cells: 2 }],
  [56, { kind: 'forward', cells: 3, addResources: true }],
  [57, { kind: 'forward', cells: 2 }],
  [58, { kind: 'all' }],
  [62, { kind: 'square_self', radius: 1 }],
  [64, { kind: 'col_splash', radius: 1 }],
  [70, { kind: 'square', radius: 1 }],
  [72, { kind: 'x', radius: 1 }],
  [73, { kind: 'rect', laneRadius: 1, colBack: 0, colForward: 1 }],
  [74, { kind: 'forward', cells: 2 }],
  [75, { kind: 'forward', cells: 2 }],
  [76, { kind: 'forward', cells: 2 }],
  [82, { kind: 'square', radius: 1 }],
  [92, { kind: 'forward', cells: 4 }],
  [95, { kind: 'forward', cells: 2 }],
  [100, { kind: 'forward', cells: 3 }],
  [101, { kind: 'square_self', radius: 1 }],
  [113, { kind: 'cross', radius: 1 }],
  [116, { kind: 'square_self', radius: 1 }],
  [118, { kind: 'square', radius: 1 }],
]);

export const CARD_TRAITS = new Map([
  [9, { preferFlying: true }],
  [14, { shots: 2 }],
  [15, { contactThorns: true }],
  [17, { slowSec: 4 }],
  [20, { preferFlying: true, slowSec: 4 }],
  [21, { meleeReflectChance: 0.35, projectileReflectChance: 0.35, reflectRatio: 0.5 }],
  [23, { firstHitStunSec: 1.5 }],
  [27, { projectileReflectChance: 0.35, reflectRatio: 1 }],
  [34, { swallowLowQualitySec: 10 }],
  [35, { executeLowQuality: true }],
  [38, { absorbLowQualitySec: 5, enemyBasePlacement: true }],
  [46, { farthestInLane: true }],
  [52, { contactThorns: true }],
  [53, { charmLowQuality: true }],
  [54, { slowSec: 4 }],
  [55, { healOnHitRatio: 0.2 }],
  [63, { poisonChance: 0.35, poisonDps: 3, poisonSec: 5 }],
  [70, { stunChance: 0.3, stunSec: 1.5 }],
  [71, { stealResource: 1 }],
  [72, { forceParabola: true }],
  [73, { stunChance: 0.3, stunSec: 1.5 }],
  [75, { poisonChance: 0.3, poisonDps: 3, poisonSec: 5, poisonRadius: 1 }],
  [76, { whiteSlashChance: 0.3 }],
  [77, { freezeChance: 0.3, freezeSec: 1.5, slowSec: 4 }],
  [83, { farthestInLane: true }],
  [84, { slowSec: 4 }],
  [86, { stunChance: 0.3, stunSec: 1.5 }],
  [87, { meleeReflectChance: 0.35, reflectRatio: 0.5 }],
  [88, { freezeMeleeSec: 1.5, slowSec: 4, blockProjectiles: true }],
  [90, { burnMelee: true, burnDps: 3, burnSec: 5 }],
  [91, { shots: 2, rootChance: 0.35, rootSec: 2.5 }],
  [97, { lifestealRatio: 0.3 }],
  [98, { lifestealRatio: 0.3 }],
  [101, { poisonChance: 1, poisonDps: 3, poisonSec: 5 }],
  [105, { doubleVsDefender: true }],
  [107, { healMaxHpOnHit: 0.2, healCooldownSec: 8 }],
  [110, { doubleVsRanged: true }],
  [116, { stunChance: 0.3, stunSec: 1.5 }],
  [118, { stunChance: 0.3, stunSec: 1.5 }],
  [125, { farthestInLane: true }],
]);

export function getCardTraits(cardOrId) {
  const id = Number(cardOrId?.cardId ?? cardOrId?.id ?? cardOrId);
  return CARD_TRAITS.get(id) ?? {};
}

export function getAttackPattern(cardOrId) {
  const id = Number(cardOrId?.cardId ?? cardOrId?.id ?? cardOrId);
  return ATTACK_PATTERNS.get(id) ?? null;
}

export function isSuicideCard(cardOrId) {
  const id = Number(cardOrId?.cardId ?? cardOrId?.id ?? cardOrId);
  return SUICIDE_CARD_IDS.has(id);
}
