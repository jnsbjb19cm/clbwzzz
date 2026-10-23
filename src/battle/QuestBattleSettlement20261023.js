/**
 * 2026-10-23：战斗内行为 → 任务事件的「先记账、结算时统一上报」。
 *
 * 用户反馈：主线18「玉米大作战 II（战斗中累计使用 3 次幼小玉米）」等按次数计的任务，
 * 应该像击杀/通关一样在**战斗结算**时入账，而不是出牌瞬间就涨进度。
 * 另外野外冒险/联机战斗是服务端权威结算，出牌与技能都不走本地执行链路，
 * 之前这类事件根本没有上报点；统一在战斗结算面板出现时 flush 一次，两条链路共用同一套记账。
 *
 * 设计：
 *  - BattleView.questBattleStats 里累计 cardUses（按 cardId 计数）与 skillCasts；
 *  - 本地技能系统把次数记到 engine.questSkillCasts（同一场战斗的 engine 累计）；
 *  - 战斗结算（updateResultOverlay 上报任务事件处）调用 flushQuestBattleEvents，
 *    按「每张卡一条 card_use(count) + 一条 skill_cast(count)」上报，随后清零，重复结算不会重复计数；
 *  - 训练营/观战/中途退出不结算（不调用 flush 即不入账）。
 */

export function ensureQuestBattleSettlement(view) {
  const stats = view.questBattleStats ?? (view.questBattleStats = {});
  if (!(stats.cardUses instanceof Map)) stats.cardUses = new Map();
  stats.skillCasts = Math.max(0, Math.floor(Number(stats.skillCasts) || 0));
  return stats;
}

/** 记一次出牌（只记账，结算时才发任务事件）。 */
export function recordCardUseForQuest(view, cardId) {
  const id = Math.floor(Number(cardId));
  if (!Number.isInteger(id) || id <= 0) return false;
  const stats = ensureQuestBattleSettlement(view);
  stats.cardUses.set(id, (stats.cardUses.get(id) || 0) + 1);
  stats.cardIds?.add?.(id);
  return true;
}

/** 记一次技能释放（本地技能系统 / 权威技能释放成功后调用）。 */
export function recordSkillCastForQuest(view, count = 1) {
  const amount = Math.max(0, Math.floor(Number(count) || 0));
  if (!amount) return false;
  const stats = ensureQuestBattleSettlement(view);
  stats.skillCasts += amount;
  return true;
}

/** 本地技能系统只有一个 engine，没有 view：次数先记在 engine 上，结算时并入。 */
export function recordSkillCastForEngine(engine, count = 1) {
  if (!engine) return false;
  const amount = Math.max(0, Math.floor(Number(count) || 0));
  if (!amount) return false;
  engine.questSkillCasts = Math.max(0, Math.floor(Number(engine.questSkillCasts) || 0)) + amount;
  return true;
}

/**
 * 战斗结算时把这场的出牌/技能次数一次性上报给任务系统。
 * @returns {number} 实际上报的事件条数（0 = 没有需要上报的，重复调用第二次必为 0）。
 */
export function flushQuestBattleEvents(view, questMeta = {}, emit = null) {
  const stats = view?.questBattleStats;
  if (!stats) return 0;
  let emitted = 0;
  const cardUses = stats.cardUses instanceof Map ? stats.cardUses : null;
  if (cardUses) {
    for (const [cardId, count] of cardUses) {
      const amount = Math.floor(Number(count) || 0);
      if (amount <= 0) continue;
      emit?.('card_use', { ...questMeta, cardId: Number(cardId), count: amount });
      emitted += 1;
    }
    cardUses.clear();
  }
  const engineCasts = Math.max(0, Math.floor(Number(view?.engine?.questSkillCasts) || 0));
  const totalCasts = Math.max(0, Math.floor(Number(stats.skillCasts) || 0)) + engineCasts;
  stats.skillCasts = 0;
  if (view?.engine && 'questSkillCasts' in view.engine) view.engine.questSkillCasts = 0;
  if (totalCasts > 0) {
    emit?.('skill_cast', { ...questMeta, count: totalCasts });
    emitted += 1;
  }
  return emitted;
}
