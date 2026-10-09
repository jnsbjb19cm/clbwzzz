/**
 * 2026-10-09：任务进度规则（纯函数），从 QuestView 抽出。
 *
 * 动机：QuestView 依赖 CSS/DOM，Node 里 import 不了（ERR_UNKNOWN_FILE_EXTENSION），
 * 于是没法写「给定事件序列 → 期望进度」的测试。这里只保留判定逻辑，一份实现；
 * `scripts/verify-quest-progress-20261009.mjs` 直接跑这个模块。
 * 与 QuestEventRules.js 同样的思路：可测的规则不埋在 UI 里。
 *
 * 依赖注入：任务表默认取 QUEST_GROUPS；「背包当前数量」由调用方传入 ownedItemCount。
 */
import { QUEST_GROUPS } from '../data/QuestCatalog.js';

export function dataCount(data) {
  return Math.max(0, Number(data?.count ?? data?.amount ?? 1) || 0);
}

export function battleTargetMatches(quest, data) {
  if (quest.stageId != null && Number(data?.stageId) !== Number(quest.stageId)) return false;
  if (quest.route != null && Number(data?.route) !== Number(quest.route)) return false;
  if (quest.adventureIndex != null && Number(data?.adventureIndex) !== Number(quest.adventureIndex)) return false;
  if (quest.challengeOnly && !data?.challenge) return false;
  if (quest.finalOnly && !data?.final) return false;
  return true;
}

export function progressDelta(quest, event, data) {
  // 综合工坊任务：造卡、强化任一成功都计数。
  if (quest.event === 'card_upgrade' && (event === 'card_craft' || event === 'card_strengthen')) return dataCount(data) || 1;
  if (quest.event === 'any') return 1;

  // 收集指定道具：事件记录本次新增；带 lifetimeItemId 的永久任务还会读取长期收集统计。
  if (quest.event === 'item_gain') {
    if (event !== 'item_gain') return 0;
    if (quest.itemId && Number(quest.itemId) !== Number(data?.itemId)) return 0;
    return dataCount(data);
  }

  // 材料加工只认铁匠铺明确上报的成功事件，避免“加工产物入库”与加工本身重复计数。
  if (quest.event === 'material_combine') {
    if (event !== 'material_combine') return 0;
    if (quest.materialKind && data?.materialKind && quest.materialKind !== data.materialKind) return 0;
    if (quest.materialLevel && data?.materialLevel && Number(data.materialLevel) !== Number(quest.materialLevel)) return 0;
    return dataCount(data) || 1;
  }

  // BOSS挑战与冒险模式严格分开，按BOSS id精确匹配。
  if (quest.event === 'boss_challenge' || quest.event === 'boss_defeated') {
    if (event !== quest.event) return 0;
    if (quest.bossId && String(quest.bossId) !== String(data?.bossId ?? '')) return 0;
    return dataCount(data) || 1;
  }

  // 2026-10-09：新任务目录的事件（指定卡击杀/获取/使用、区域到访）。
  if (quest.event === 'kill_card') {
    if (event !== 'kill_card') return 0;
    const ids = (quest.killCardIds || []).map(Number);
    if (ids.length && !ids.includes(Number(data?.cardId))) return 0;
    return dataCount(data) || 1;
  }
  if (quest.event === 'card_obtain') {
    if (event !== 'card_obtain') return 0;
    if (quest.obtainCardId != null && Number(data?.cardId) !== Number(quest.obtainCardId)) return 0;
    return dataCount(data) || 1;
  }
  if (quest.event === 'card_use') {
    if (event !== 'card_use') return 0;
    if (quest.useCardId != null && Number(data?.cardId) !== Number(quest.useCardId)) return 0;
    return dataCount(data) || 1;
  }
  if (quest.event === 'visit_area') {
    if (event !== 'visit_area') return 0;
    if (quest.areaId && String(quest.areaId) !== String(data?.areaId ?? '')) return 0;
    return dataCount(data) || 1;
  }

  if (quest.event !== event) return 0;

  if (event === 'adventure_complete') {
    if (!battleTargetMatches(quest, data)) return 0;
    if (quest.minAdventureIndex != null && Number(data?.adventureIndex || 0) < Number(quest.minAdventureIndex)) return 0;
    // 2026-10-09：支线5「不使用防御类卡牌」—— 结算里明确带 noDefenseCards=false 才算失败。
    if (quest.noDefenseOnly && data?.noDefenseCards === false) return 0;
    return dataCount(data) || 1;
  }

  // 「尝试通关（没通过也可以）」：胜负都算，只校验关卡是否匹配。
  if (event === 'adventure_attempt') {
    if (!battleTargetMatches(quest, data)) return 0;
    return dataCount(data) || 1;
  }

  if (event === 'playtime') return Math.max(0, Number(data?.minutes || 0)) || dataCount(data) || 1;

  if (event === 'card_strengthen') {
    if (quest.minStar && Number(data?.star || 0) < Number(quest.minStar)) return 0;
    return dataCount(data) || 1;
  }
  if (event === 'card_craft') {
    if (quest.craftLevel && Number(data?.craftLevel || 0) !== Number(quest.craftLevel)) return 0;
    return dataCount(data) || 1;
  }
  if (event === 'gold_gain' || event === 'honor_gain' || event === 'player_healed' || event === 'shop_spend') return Math.max(0, Number(data?.amount || 0));
  if (['battle_complete', 'battle_win', 'battle_nodeath', 'battle_duration', 'battle_kill', 'battle_variety', 'battle_lane_spread'].includes(event) && !battleTargetMatches(quest, data)) return 0;
  if (['kill_enemy', 'card_collect', 'battle_kill', 'elite_kill', 'item_use', 'team_diversity', 'quest_complete', 'discover_secret', 'mine_collect'].includes(event)) return dataCount(data);
  if (event === 'battle_duration') {
    if (data?.won === false) return 0;
    return Number(data?.duration || 999) <= Number(quest.maxDuration ?? 180) ? 1 : 0;
  }
  if (event === 'battle_variety') return Number(data?.distinctCards || 0) >= Number(quest.minDistinctCards ?? 5) ? 1 : 0;
  if (event === 'battle_lane_spread') return Number(data?.lanesUsed || 0) >= Number(quest.minLanes ?? 3) ? 1 : 0;
  return dataCount(data) || 1;
}

export function requirementIds(requires) {
  if (!requires) return [];
  return Array.isArray(requires) ? requires : [requires];
}

export function questComplete(state, category, questId, groups = QUEST_GROUPS) {
  const quest = (groups[category] || []).find((entry) => String(entry.id) === String(questId));
  if (!quest) return true;
  const claimed = state[category + 'Claimed'] || [];
  const progress = state[category + 'Progress'] || {};
  return claimed.some((id) => String(id) === String(questId)) || Number(progress[quest.id] || 0) >= Number(quest.goal || 0);
}

export function requirementsMet(state, category, quest, groups = QUEST_GROUPS) {
  const localOk = requirementIds(quest.requires).every((id) => questComplete(state, category, id, groups));
  const mainOk = requirementIds(quest.requiresMain).every((id) => questComplete(state, 'main', id, groups));
  return localOk && mainOk;
}

export function cumulativeProgress(quest, state, ownedItemCount = () => 0) {
  // 直接完成的任务（如「片刻喘息」「神秘的援助」）—— 前置满足即视为完成。
  if (quest.event === 'auto') return Math.max(1, Number(quest.goal || 1));
  // 等级类任务（等级成就 + 主线等级任务）统一读玩家等级。
  if (quest.event === 'level') return Math.max(0, Number(state?._lastPlayerLevel || 1));
  if (quest.cumulativeKey) return Math.max(0, Number(state?._extra?.[quest.cumulativeKey] || 0));
  if (quest.lifetimeItemId != null) {
    const tracked = Math.max(0, Number(state?._extra?.itemGainsById?.[String(quest.lifetimeItemId)] || 0));
    return Math.max(tracked, Number(ownedItemCount(quest.lifetimeItemId)) || 0);
  }
  if (quest.bossChallengeId) return Math.max(0, Number(state?._extra?.bossChallengesById?.[String(quest.bossChallengeId)] || 0));
  if (quest.bossDefeatId) return Math.max(0, Number(state?._extra?.bossDefeatsById?.[String(quest.bossDefeatId)] || 0));
  if (quest.adventureKey) return Math.max(0, Number(state?._extra?.adventureClears?.[String(quest.adventureKey)] || 0));
  // 指定卡击杀（可能多个 id 求和）、获取、使用、区域到访。
  if (Array.isArray(quest.killCardIds) && quest.killCardIds.length) {
    const map = state?._extra?.cardKillsById ?? {};
    return quest.killCardIds.reduce((sum, id) => sum + Math.max(0, Number(map[String(id)] || 0)), 0);
  }
  if (quest.obtainCardId != null) return Math.max(0, Number(state?._extra?.cardObtainsById?.[String(quest.obtainCardId)] || 0));
  if (quest.useCardId != null) return Math.max(0, Number(state?._extra?.cardUsesById?.[String(quest.useCardId)] || 0));
  if (quest.areaId) return Math.max(0, Number(state?._extra?.areasVisited?.[String(quest.areaId)] || 0));
  return null;
}

export function syncCumulativeProgress(state, ownedItemCount = () => 0, groups = QUEST_GROUPS) {
  for (const [category, quests] of Object.entries(groups)) {
    if (category === 'achievement') continue;
    const progress = state[category + 'Progress'] ?? (state[category + 'Progress'] = {});
    for (const quest of quests) {
      const value = cumulativeProgress(quest, state, ownedItemCount);
      if (value == null || !requirementsMet(state, category, quest, groups)) continue;
      progress[quest.id] = Math.min(Number(quest.goal || 0), value);
    }
  }
}

/**
 * 2026-10-09：旧存档一次性回填。
 *
 * 任务目录整体重写后，旧 localStorage 里的任务 id（mp01/me07/mfx12…）在新目录里不存在了。
 * migrateLegacyState 只保留「真实长期统计」（_extra），所以这里用这些统计把新任务能判定的部分补上：
 * 通关过的关卡、打过的 BOSS、累计强化/制造/加工/战斗次数、等级 —— 让老玩家不用把走过的路重走一遍。
 *
 * 只写 progress、不写 claimed：奖励仍要玩家自己领。
 * 只跑一次（调用方用 _extra.questBackfillV13 标记），已领取的条目不动。
 */
export function backfillQuestProgressFromHistory(state, { groups = QUEST_GROUPS, playerLevel = 1 } = {}) {
  const extra = state._extra || {};
  const num = (v) => Math.max(0, Number(v) || 0);
  const eventHistory = (event) => {
    switch (event) {
      case 'tutorial_complete':
        // 老存档没有教程事件；只要打过任何一场战斗/冒险，就认为教程早已完成。
        return num(extra.totalTutorials) || (num(extra.totalBattles) > 0 || num(extra.totalAdventures) > 0 ? 1 : 0);
      case 'card_craft': return num(extra.totalCrafts);
      case 'card_strengthen': return num(extra.totalStrengthens);
      case 'card_strengthen_attempt': return num(extra.totalStrengthenAttempts);
      case 'material_combine': return num(extra.totalMaterialCombines);
      case 'battle_complete': return num(extra.totalBattles);
      case 'battle_win': return num(extra.totalBattleWins);
      case 'kill_enemy': return num(extra.totalKills);
      case 'level': return num(playerLevel) || 1;
      case 'lucky_wheel': return num(extra.totalWheelSpins);
      case 'skill_cast': return num(extra.totalSkillCasts);
      case 'skill_learn': return num(extra.totalSkillLearns);
      case 'guild_join': return num(extra.totalGuildJoins);
      case 'world_chat': return num(extra.totalWorldChats);
      case 'friend_add': return num(extra.totalFriendAdds);
      case 'shop_buy': return num(extra.totalShopBuys);
      case 'playtime': return num(extra.totalPlayMinutes);
      default: return 0;
    }
  };

  for (const category of ['main', 'side']) {
    const quests = groups[category] || [];
    const progress = state[category + 'Progress'] ?? (state[category + 'Progress'] = {});
    const claimed = state[category + 'Claimed'] || [];
    for (const quest of quests) {
      if (claimed.some((id) => String(id) === String(quest.id))) continue;
      if (quest.event === 'auto') continue; // 交给 cumulativeProgress 判定
      let value = eventHistory(quest.event);
      if (quest.event === 'adventure_complete' || quest.event === 'adventure_attempt') {
        const clears = extra.adventureClears || {};
        if (quest.finalOnly) value = clears.final ? 1 : 0;
        else if (quest.adventureIndex != null) {
          const routes = quest.route != null ? [Number(quest.route)] : [0, 1];
          value = routes.some((r) => Number(clears[`${r}:${quest.adventureIndex}`] || 0) > 0) ? 1 : 0;
        } else value = 0;
      } else if (quest.event === 'monster_line_clear') {
        value = 0; // 旧存档没有这个计数，只能从现在开始攒
      } else if (quest.event === 'boss_challenge') {
        value = num(extra.bossChallengesById?.[String(quest.bossId)]);
      } else if (quest.event === 'boss_defeated') {
        value = num(extra.bossDefeatsById?.[String(quest.bossId)]);
      } else if (quest.event === 'kill_card') {
        const map = extra.cardKillsById || {};
        value = (quest.killCardIds || []).reduce((sum, id) => sum + num(map[String(id)]), 0);
      } else if (quest.event === 'material_combine' && quest.materialKind) {
        value = num(extra.totalMaterialCombines); // 旧统计不分材料种类，按总数回填
      }
      const capped = Math.min(Number(quest.goal || 0), value);
      if (capped > Number(progress[quest.id] || 0)) progress[quest.id] = capped;
    }
  }
}

export function visibleQuests(category, state, allQuests, groups = QUEST_GROUPS) {
  if (category === 'daily' || category === 'weekly' || category === 'achievement') return allQuests;
  const claimed = state[category + 'Claimed'] || [];
  const unlocked = allQuests.filter((entry) => requirementsMet(state, category, entry, groups));
  // 2026-10-09：互斥分支（游行商人 买下/婉拒）—— 领了其中一个，另一个就不再出现；
  // 自己领过的那条保留（面板会显示成「已领取」）。
  const chosen = new Set();
  for (const entry of allQuests) {
    if (entry.exclusiveGroup && claimed.some((id) => String(id) === String(entry.id))) chosen.add(entry.id);
  }
  return unlocked.filter((entry) => {
    if (!entry.exclusiveGroup) return true;
    const siblingChosen = allQuests.some((other) => other.exclusiveGroup === entry.exclusiveGroup && other.id !== entry.id && chosen.has(other.id));
    return !siblingChosen;
  });
}
