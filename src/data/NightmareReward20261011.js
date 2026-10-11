/**
 * 噩梦模式奖励倍率（2026-10-11）
 *
 * 单一来源：客户端预览、单机结算、以及服务端联机结算都必须用同一套数字，
 * 否则会出现「预览和实得不一样」或「单机/联机给的不一样」。
 *
 * 规则（用户定义）：
 *   金币 / 经验        ×2.5
 *   材料（道具）数量    ×1.6
 *   掉落数量            ×1.5（体现"爆率更高"）
 *   噩梦专属材料        首通必得 1 个；重复挑战 35%
 *
 * 本模块**零依赖**（不 import 任何 JSON 或浏览器 API），
 * 所以 Node 服务端（server/battle/PveStageSettlement20260911.js）也能安全引用。
 */

export const NIGHTMARE_DIFFICULTY = 3;
export const NIGHTMARE_GOLD_EXP_MULT = 2.5;
export const NIGHTMARE_MATERIAL_MULT = 1.6;
export const NIGHTMARE_DROP_MULT = 1.5;
/** 噩梦专属材料（暂用 5 级强化粉 10005；换正式道具只改这一行） */
export const NIGHTMARE_EXCLUSIVE_ITEM_ID = 10005;
export const NIGHTMARE_EXCLUSIVE_NAME = '噩梦专属材料';
export const NIGHTMARE_EXCLUSIVE_FIRST = 1;
export const NIGHTMARE_EXCLUSIVE_REPEAT_RATE = 0.35;

/** 这一关是不是噩梦（stage.adventure.difficulty === 3） */
export function isNightmareStage(stage) {
  return Number(stage?.adventure?.difficulty) === NIGHTMARE_DIFFICULTY;
}

/**
 * 把「首通奖励串解析出来的 rewards」按噩梦规则放大（预览与结算共用）。
 * rewards: [{ type, amount }]，类型：1 道具 / 2 卡牌 / 3 金币 / 27 经验
 * 返回新的数组（不改原数组），并追加一条专属材料。
 */
export function scaleRewardsForNightmare(rewards, stage) {
  const list = Array.isArray(rewards) ? rewards : [];
  if (!isNightmareStage(stage)) return list.map((r) => ({ ...r }));
  const out = list.map((r) => {
    const type = Number(r?.type);
    const amount = Number(r?.amount) || 0;
    if (type === 3 || type === 27) {
      return { ...r, amount: Math.round(amount * NIGHTMARE_GOLD_EXP_MULT), nightmareScaled: true };
    }
    if (type === 1) {
      // 道具：数量 ×1.6（amount 是道具 id，数量单独给，见 count）
      return { ...r, count: Math.max(1, Math.round((Number(r?.count) || 1) * NIGHTMARE_MATERIAL_MULT)), nightmareScaled: true };
    }
    return { ...r };
  });
  out.push({ type: 1, amount: NIGHTMARE_EXCLUSIVE_ITEM_ID, count: NIGHTMARE_EXCLUSIVE_FIRST, nightmareExclusive: true });
  return out;
}

/** 单机结算用：把金币/经验直接乘倍率 */
export function nightmareGoldExpMult(stage) {
  return isNightmareStage(stage) ? NIGHTMARE_GOLD_EXP_MULT : 1;
}

/** 单机结算用：掉落数量乘倍率 */
export function nightmareDropCount(stage, count) {
  const base = Math.max(1, Math.floor(Number(count) || 1));
  return isNightmareStage(stage) ? Math.max(1, Math.round(base * NIGHTMARE_DROP_MULT)) : base;
}

/** 文案：给预览用的一句话 */
export function nightmareHintText(stage) {
  if (!isNightmareStage(stage)) return '';
  return `噩梦加成：金币/经验 ×${NIGHTMARE_GOLD_EXP_MULT}、材料 ×${NIGHTMARE_MATERIAL_MULT}、掉落 ×${NIGHTMARE_DROP_MULT}，首通必得${NIGHTMARE_EXCLUSIVE_NAME}`;
}
