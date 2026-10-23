/**
 * 2026-10-23 任务链路全面体检（主线 + 支线 + 日常/周常/成就/挑战 + 等级奖励）。
 *
 * 覆盖范围：
 *  ① 目录结构：id 唯一 / 主线逐条前置 / 支线、挑战前置全部指向真实任务（抓 mf01 这类死引用）
 *  ② 奖励完整性：卡牌 id 存在于 card.json 且 <500（服务端只发 <500）、道具 id 在 item/functionalItems/craftMaterials 里存在、
 *     金币/钻石/荣誉/经验均为非负整数
 *  ③ 冒险目标：route/adventureIndex 对应的关卡在 stageInfo 里真实存在（主线不能指向不存在的关卡）
 *  ④ 事件链：每个任务的事件都有实际发射点（dispatch/emitQuestEvent/onQuestEvent 字面量），
 *     纯累计/派生事件单独放行（level/auto/成就聚合）
 *  ⑤ 进度可达成：给每个任务造一个匹配的事件 payload，progressDelta 必须 >0（累计任务则读累计统计）
 *  ⑥ 整条链模拟：从空存档开始，main 1→59 逐条完成并领取，再走完所有 side / challenge；
 *     游行商人两个互斥分支可见性正确；领一个另一个隐藏
 *  ⑦ 领奖链路：服务端 findQuestReward 能找到每个任务（含 level 的 lvN id）；
 *     周期 key（daily/weekly 重置、永久任务不重置）与 claim 存储 id 正确
 *  ⑧ 旧存档回填：历史统计能回填到新任务，且不写 claimed
 *
 * 用法： node scripts/verify-quest-chains-20261023.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  QUEST_GROUPS, LEVEL_REWARDS, CATEGORIES, MAX_PLAYER_LEVEL, catalogProblems, findQuestReward,
} from '../src/data/QuestCatalog.js';
import {
  progressDelta, cumulativeProgress, requirementsMet, visibleQuests, questComplete,
  backfillQuestProgressFromHistory, requirementIds, syncCumulativeProgress,
} from '../src/battle/QuestProgressRules.js';
import { questPeriodKey, questClaimStorageId } from '../src/data/QuestPeriods.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const asArray = (value) => (Array.isArray(value) ? value : Object.values(value ?? {}));

const cardRows = readJson('src/data/card.json');
const itemIds = new Set([
  ...asArray(readJson('src/data/item.json')).map((row) => Number(row.item_id)),
  ...asArray(readJson('src/data/functionalItems.json')).map((row) => Number(row.item_id)),
  ...asArray(readJson('src/data/craftMaterials.json').items ?? []).map((row) => Number(row.item_id)),
]);
const cardIds = new Set(cardRows.map((row) => Number(row.card_id)));
const stageRows = asArray(readJson('src/data/stageInfo.json'));
const stageKeys = new Set(stageRows.map((row) => `${Number(row.map_id)}:${Number(row.stage_num)}`));

const failures = [];
let checks = 0;
function check(name, fn) {
  checks += 1;
  try { fn(); console.log(`  ok   ${name}`); } catch (error) {
    failures.push(`${name}\n       ${String(error.message).split('\n').slice(0, 4).join('\n       ')}`);
    console.log(`  FAIL ${name}\n       ${String(error.message).split('\n').slice(0, 3).join('\n       ')}`);
  }
}
function assert(condition, message) { if (!condition) throw new Error(message); }
function assertEqual(actual, expected, message) { if (actual !== expected) throw new Error(`${message}（实际 ${actual}，期望 ${expected}）`); }

const main = QUEST_GROUPS.main;
const side = QUEST_GROUPS.side;
const challenge = QUEST_GROUPS.challenge;
const daily = QUEST_GROUPS.daily;
const weekly = QUEST_GROUPS.weekly;
const achievement = QUEST_GROUPS.achievement;
const ALL_GROUPS = { main, side, daily, weekly, achievement, challenge };
const MAIN_IDS = new Set(main.map((quest) => String(quest.id)));

// ---------- 事件 payload 合成：给任意任务造一个"应能推进"的事件 ----------
function payloadFor(quest) {
  const payload = { count: 1 };
  const event = quest.event;
  if (event === 'adventure_complete' || event === 'adventure_attempt') {
    payload.route = quest.route ?? 0;
    payload.adventureIndex = quest.adventureIndex ?? 1;
    payload.challenge = Boolean(quest.challengeOnly);
    payload.final = Boolean(quest.finalOnly);
    payload.noDefenseCards = true;
    payload.won = true;
    if (quest.finalOnly) { payload.final = true; payload.adventureIndex = null; }
  } else if (event === 'kill_enemy' || event === 'battle_kill' || event === 'elite_kill' || event === 'item_use') {
    payload.cardId = 1;
  } else if (event === 'kill_card') {
    payload.cardId = (quest.killCardIds ?? [8])[0];
  } else if (event === 'card_obtain') {
    payload.cardId = quest.obtainCardId;
  } else if (event === 'card_use') {
    payload.cardId = quest.useCardId;
  } else if (event === 'visit_area') {
    payload.areaId = quest.areaId;
  } else if (event === 'boss_challenge' || event === 'boss_defeated') {
    payload.bossId = quest.bossId;
  } else if (event === 'material_combine') {
    payload.materialKind = quest.materialKind ?? 'powder';
    payload.materialLevel = quest.materialLevel ?? 1;
  } else if (event === 'item_gain') {
    payload.itemId = quest.itemId ?? 10001;
  } else if (event === 'card_strengthen') {
    payload.star = quest.minStar ?? 1;
  } else if (event === 'card_craft') {
    payload.craftLevel = quest.craftLevel ?? 1;
  } else if (event === 'battle_duration') {
    payload.duration = Math.max(1, Number(quest.maxDuration ?? 180) - 10);
    payload.won = true;
  } else if (event === 'battle_variety') {
    payload.distinctCards = Number(quest.minDistinctCards ?? 5);
  } else if (event === 'battle_lane_spread') {
    payload.lanesUsed = Number(quest.minLanes ?? 3);
  } else if (event === 'battle_complete' || event === 'battle_win' || event === 'battle_nodeath'
    || event === 'battle_pvp' || event === 'pvp_win' || event === 'coop_battle_complete') {
    payload.won = true;
  } else if (event === 'playtime') {
    payload.minutes = 1;
    payload.count = 1;
  } else if (event === 'gold_gain' || event === 'honor_gain' || event === 'shop_spend') {
    payload.amount = 1;
  }
  return payload;
}

// 与 QuestView.dispatch 里的长期统计累加保持一致（任务链模拟用）
function applyExtra(state, event, data) {
  const extra = state._extra;
  const num = (value) => Math.max(0, Number(value) || 0);
  const count = Math.max(0, Number(data?.count ?? data?.amount ?? 1) || 0);
  switch (event) {
    case 'kill_enemy': extra.totalKills = num(extra.totalKills) + count; break;
    case 'battle_complete': extra.totalBattles = num(extra.totalBattles) + count; break;
    case 'battle_win': extra.totalBattleWins = num(extra.totalBattleWins) + count; break;
    case 'battle_nodeath': extra.totalNoDeath = num(extra.totalNoDeath) + count; break;
    case 'battle_pvp': extra.totalPvpBattles = num(extra.totalPvpBattles) + count; break;
    case 'pvp_win': extra.totalPvpWins = num(extra.totalPvpWins) + count; break;
    case 'coop_battle_complete': extra.totalCoopBattles = num(extra.totalCoopBattles) + count; break;
    case 'adventure_complete': {
      extra.totalAdventures = num(extra.totalAdventures) + count;
      const route = Number(data?.route), index = Number(data?.adventureIndex), difficulty = Number(data?.difficulty);
      if (Number.isFinite(route) && Number.isFinite(index) && index > 0) {
        extra.adventureClears[`${route}:${index}`] = 1;
        if (Number.isFinite(difficulty)) extra.adventureClears[`${route}:${index}:${difficulty}`] = 1;
      }
      if (data?.final) extra.adventureClears.final = 1;
      break;
    }
    case 'adventure_attempt': extra.totalAdventureAttempts = num(extra.totalAdventureAttempts) + count; break;
    case 'card_craft': extra.totalCrafts = num(extra.totalCrafts) + count; extra.totalUpgrades = num(extra.totalUpgrades) + count; break;
    case 'card_strengthen': extra.totalStrengthens = num(extra.totalStrengthens) + count; extra.totalUpgrades = num(extra.totalUpgrades) + count; break;
    case 'card_upgrade': extra.totalUpgrades = num(extra.totalUpgrades) + count; break;
    case 'card_strengthen_attempt': extra.totalStrengthenAttempts = num(extra.totalStrengthenAttempts) + count; break;
    case 'material_combine': extra.totalMaterialCombines = num(extra.totalMaterialCombines) + count; break;
    case 'item_use': extra.totalItems = num(extra.totalItems) + count; break;
    case 'item_gain': {
      extra.totalItemGains = num(extra.totalItemGains) + count;
      const key = String(Number(data?.itemId) || 0);
      if (key !== '0') extra.itemGainsById[key] = num(extra.itemGainsById[key]) + count;
      break;
    }
    case 'boss_challenge': {
      extra.totalBossChallenges = num(extra.totalBossChallenges) + count;
      const key = String(data?.bossId || '');
      if (key) extra.bossChallengesById[key] = num(extra.bossChallengesById[key]) + count;
      break;
    }
    case 'boss_defeated': {
      extra.totalBossDefeats = num(extra.totalBossDefeats) + count;
      const key = String(data?.bossId || '');
      if (key) extra.bossDefeatsById[key] = num(extra.bossDefeatsById[key]) + count;
      break;
    }
    case 'kill_card': {
      const key = String(Number(data?.cardId) || 0);
      if (key !== '0') extra.cardKillsById[key] = num(extra.cardKillsById[key]) + count;
      break;
    }
    case 'card_obtain': {
      const key = String(Number(data?.cardId) || 0);
      if (key !== '0') extra.cardObtainsById[key] = num(extra.cardObtainsById[key]) + count;
      break;
    }
    case 'card_use': {
      const key = String(Number(data?.cardId) || 0);
      if (key !== '0') extra.cardUsesById[key] = num(extra.cardUsesById[key]) + count;
      break;
    }
    case 'visit_area': {
      const key = String(data?.areaId || '');
      if (key) extra.areasVisited[key] = num(extra.areasVisited[key]) + count;
      break;
    }
    case 'playtime': {
      const minutes = Math.max(0, Number(data?.minutes || 0));
      extra.totalPlayMinutes = num(extra.totalPlayMinutes) + (minutes || count);
      break;
    }
    case 'gold_gain': extra.totalGold = num(extra.totalGold) + Math.max(0, Number(data?.amount || 0)); break;
    case 'honor_gain': extra.totalHonor = num(extra.totalHonor) + Math.max(0, Number(data?.amount || 0)); break;
    case 'skill_cast': extra.totalSkillCasts = num(extra.totalSkillCasts) + count; break;
    case 'skill_learn': extra.totalSkillLearns = num(extra.totalSkillLearns) + count; break;
    case 'shop_buy': extra.totalShopBuys = num(extra.totalShopBuys) + count; break;
    case 'lucky_wheel': extra.totalWheelSpins = num(extra.totalWheelSpins) + count; break;
    case 'friend_add': extra.totalFriendAdds = num(extra.totalFriendAdds) + count; break;
    case 'world_chat': extra.totalWorldChats = num(extra.totalWorldChats) + count; break;
    case 'guild_join': extra.totalGuildJoins = num(extra.totalGuildJoins) + count; break;
    case 'tutorial_complete': extra.totalTutorials = num(extra.totalTutorials) + count; break;
    default: break;
  }
}

function freshState() {
  return {
    dailyProgress: {}, dailyClaimed: [], weeklyProgress: {}, weeklyClaimed: [],
    mainProgress: {}, mainClaimed: [], sideProgress: {}, sideClaimed: [],
    achievementProgress: {}, achievementClaimed: [], challengeProgress: {}, challengeClaimed: [],
    levelClaimed: [],
    _extra: {
      totalKills: 0, totalBattles: 0, totalBattleWins: 0, totalAdventures: 0, totalUpgrades: 0,
      totalStrengthens: 0, totalCrafts: 0, totalMaterialCombines: 0, totalItems: 0, totalItemGains: 0,
      totalBossChallenges: 0, totalBossDefeats: 0, totalNoDeath: 0, totalPvpBattles: 0, totalPvpWins: 0,
      totalCoopBattles: 0, totalQuests: 0, totalGold: 0, totalHonor: 0, loginDays: 0,
      totalStrengthenAttempts: 0, totalSkillCasts: 0, totalSkillLearns: 0, totalShopBuys: 0,
      totalWheelSpins: 0, totalFriendAdds: 0, totalWorldChats: 0, totalGuildJoins: 0,
      totalTutorials: 0, totalPlayMinutes: 0, totalAdventureAttempts: 0,
      itemGainsById: {}, bossChallengesById: {}, bossDefeatsById: {}, adventureClears: {},
      cardKillsById: {}, cardObtainsById: {}, cardUsesById: {}, areasVisited: {},
    },
  };
}

/** 对一个任务反复投递它自己的事件，直到累计/增量进度达到 goal；返回最终进度。 */
function driveQuest(state, category, quest) {
  const progressKey = `${category}Progress`;
  state[progressKey] ??= {};
  let progress = Number(state[progressKey][quest.id] || 0);
  if (quest.event === 'level') {
    state._lastPlayerLevel = Math.max(Number(state._lastPlayerLevel || 1), Number(quest.goal));
    progress = cumulativeProgress(quest, state);
    state[progressKey][quest.id] = Math.min(quest.goal, progress);
    return state[progressKey][quest.id];
  }
  const payload = payloadFor(quest);
  const maxRounds = Math.max(2, Math.min(600, Number(quest.goal) * 3));
  for (let round = 0; round < maxRounds && progress < quest.goal; round += 1) {
    applyExtra(state, quest.event, payload);
    const cumulative = cumulativeProgress(quest, state);
    if (cumulative != null) {
      progress = Math.max(progress, Number(cumulative) || 0);
    } else {
      const delta = progressDelta(quest, quest.event, payload);
      progress += Math.max(0, Number(delta) || 0);
    }
    progress = Math.min(quest.goal, progress);
    state[progressKey][quest.id] = progress;
  }
  return progress;
}

// ---------- ① 目录结构 ----------
console.log('=== ① 目录结构与前置引用 ===');
check('卡牌/道具名称全部解析（catalogProblems 为空）', () => {
  assertEqual(catalogProblems().join(','), '', '存在未登记的卡牌/道具名');
});
check('主线 1~59、id 连续、逐条前置', () => {
  assertEqual(main.length, 59, '主线数量');
  main.forEach((quest, index) => {
    const expected = `mq${String(index + 1).padStart(2, '0')}`;
    assertEqual(quest.id, expected, `第 ${index + 1} 条 id`);
    if (index === 0) assert(quest.requires === undefined, 'mq01 不应有前置');
    else assertEqual(quest.requires, `mq${String(index).padStart(2, '0')}`, `${expected} 的前置`);
  });
});
check('所有 requires / requiresMain 都指向真实存在的任务（无死引用）', () => {
  const missing = [];
  for (const [category, quests] of Object.entries(ALL_GROUPS)) {
    const ids = new Set(quests.map((quest) => String(quest.id)));
    for (const quest of quests) {
      for (const id of requirementIds(quest.requires)) {
        if (!ids.has(String(id))) missing.push(`${category}:${quest.id}.requires=${id}`);
      }
      for (const id of requirementIds(quest.requiresMain)) {
        if (!MAIN_IDS.has(String(id))) missing.push(`${category}:${quest.id}.requiresMain=${id}`);
      }
    }
  }
  assertEqual(missing.join(' | '), '', '存在指向不存在任务的前置');
});
check('id 全局唯一、goal>0、event/desc 非空', () => {
  const seen = new Set();
  for (const [category, quests] of Object.entries(ALL_GROUPS)) {
    for (const quest of quests) {
      const key = `${category}:${quest.id}`;
      assert(!seen.has(key), `${key} 重复`);
      seen.add(key);
      assert(Number.isFinite(Number(quest.goal)) && Number(quest.goal) > 0, `${key} goal 无效`);
      assert(String(quest.event || '').trim(), `${key} 缺 event`);
      assert(String(quest.desc || '').trim(), `${key} 缺 desc`);
    }
  }
  const levelIds = LEVEL_REWARDS.map((entry) => `level:${entry.id}`);
  assertEqual(new Set(levelIds).size, LEVEL_REWARDS.length, '等级奖励 id 重复');
});
check('分类表覆盖全部任务组 + 等级', () => {
  const ids = CATEGORIES.map((entry) => entry.id);
  for (const category of [...Object.keys(ALL_GROUPS), 'level']) assert(ids.includes(category), `分类缺少 ${category}`);
});

// ---------- ② 奖励完整性 ----------
console.log('=== ② 奖励完整性 ===');
check('奖励里的卡牌/道具/货币都合法（卡牌 <500、道具存在、数值非负整数）', () => {
  const problems = [];
  const validate = (entry, label) => {
    for (const key of ['gold', 'gem', 'honor', 'exp']) {
      const value = Number(entry[key] ?? 0);
      if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) problems.push(`${label}.${key}=${entry[key]}`);
    }
    for (const card of entry.cards ?? []) {
      const id = Number(card?.id ?? card);
      if (!Number.isInteger(id) || id <= 0) problems.push(`${label}.card=${card}`);
      else if (id >= 500) problems.push(`${label}.card=${id}（服务端拒发 >=500）`);
      else if (!cardIds.has(id)) problems.push(`${label}.card=${id} 不在 card.json`);
    }
    for (const item of entry.items ?? []) {
      const id = Number(item?.id ?? item);
      if (!itemIds.has(id)) problems.push(`${label}.item=${id} 不存在`);
      if (!(Number(item?.count ?? 1) > 0)) problems.push(`${label}.item=${id} 数量非法`);
    }
  };
  for (const [category, quests] of Object.entries(ALL_GROUPS)) quests.forEach((quest) => validate(quest, `${category}:${quest.id}`));
  LEVEL_REWARDS.forEach((entry) => validate(entry, `level:${entry.id}`));
  assertEqual(problems.join(' | '), '', '奖励数据有问题');
});

// ---------- ③ 冒险目标存在 ----------
console.log('=== ③ 冒险关卡目标存在 ===');
check('adventure_complete/attempt 指向的关卡在 stageInfo 里存在', () => {
  const problems = [];
  const stageKeyFor = (route, index) => {
    if (index === 17) return '9:5'; // 大混战（最终关）
    const act = Math.ceil(Number(index) / 4);
    const node = (Number(index) - 1) % 4 + 1;
    return `${act + Number(route) * 4}:${node}`;
  };
  for (const [category, quests] of Object.entries(ALL_GROUPS)) {
    for (const quest of quests) {
      if (quest.event !== 'adventure_complete' && quest.event !== 'adventure_attempt') continue;
      if (quest.finalOnly) continue;
      if (quest.adventureIndex == null) continue;
      const routes = quest.route != null ? [Number(quest.route)] : [0, 1];
      for (const route of routes) {
        const key = stageKeyFor(route, quest.adventureIndex);
        if (!stageKeys.has(key)) problems.push(`${category}:${quest.id} → ${route}-${quest.adventureIndex} (mapId:num=${key})`);
      }
    }
  }
  assertEqual(problems.join(' | '), '', '存在指向不存在关卡的冒险任务');
});

// ---------- ④ 事件发射点 ----------
console.log('=== ④ 事件发射点 ===');
const SRC_FILES = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) SRC_FILES.push(full);
  }
}(path.join(ROOT, 'src')));
const SRC_TEXT = SRC_FILES.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
function hasEmitter(event) {
  const names = [event, ...(event === 'card_upgrade' ? [] : [])].map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return names.some((name) => new RegExp(`(?:dispatch|emitQuestEvent)\\s*\\(\\s*['"]${name}['"]`).test(SRC_TEXT)
    || new RegExp(`onQuestEvent\\??\\.?\\s*\\(\\s*['"]${name}['"]`).test(SRC_TEXT)
    || new RegExp(`onQuestEvent\\s*&&\\s*onQuestEvent\\s*\\(\\s*['"]${name}['"]`).test(SRC_TEXT));
}
// 纯累计/派生事件：不靠事件发射，而是由长期统计或玩家等级/自动完成计算。
const DERIVED_EVENTS = new Set([
  'auto', 'level', 'card_upgrade',
  // 成就聚合（QuestView 直接从 _extra 汇总）
  'kill_total', 'card_total', 'gold_total', 'honor_total', 'battle_total', 'battle_win_total',
  'adventure_total', 'strengthen_total', 'craft_total', 'material_total', 'boss_defeat_total',
  'no_death_total', 'pvp_total', 'pvp_win_total', 'coop_total', 'item_total', 'item_gain_total',
  'item_id_total', 'achieve_total',
]);
check('主线/支线/挑战/日常/周常的每个事件都有发射点或累计来源', () => {
  const missing = new Set();
  for (const category of ['main', 'side', 'daily', 'weekly', 'challenge']) {
    for (const quest of QUEST_GROUPS[category]) {
      if (DERIVED_EVENTS.has(quest.event)) continue;
      if (quest.cumulativeKey || quest.lifetimeItemId || quest.bossChallengeId || quest.bossDefeatId || quest.adventureKey) continue;
      if (!hasEmitter(quest.event)) missing.add(`${quest.event}（${category}:${quest.id} ${quest.name}）`);
    }
  }
  assertEqual([...missing].join(' | '), '', '以下事件没有发射点，任务永远无法完成');
});
check('成就事件在 QuestView 里都有对应的进度映射分支', () => {
  const missing = [];
  for (const quest of achievement) {
    const marker = `quest.event==='${quest.event}'`;
    if (quest.event === 'achieve_total') { if (!SRC_TEXT.includes(`'achieve_total'`)) missing.push(quest.id); continue; }
    if (!SRC_TEXT.includes(marker)) missing.push(`${quest.id}(${quest.event})`);
  }
  assertEqual(missing.join(' | '), '', '成就事件缺映射');
});

// ---------- ⑤ 进度可达成 ----------
console.log('=== ⑤ 每个任务用自身事件都能推进 ===');
check('main/side/challenge/daily/weekly 逐条模拟进度（累计任务读累计统计）', () => {
  const problems = [];
  for (const category of ['main', 'side', 'challenge', 'daily', 'weekly']) {
    const state = freshState();
    for (const quest of QUEST_GROUPS[category]) {
      const progress = driveQuest(state, category, quest);
      if (progress <= 0) problems.push(`${category}:${quest.id}(${quest.name}) event=${quest.event} 进度为 0`);
    }
  }
  assertEqual(problems.join(' | '), '', '存在事件无法推进的任务');
});
check('成就任务进度可由长期统计映射得出（goal>0 且事件在映射表里）', () => {
  const state = freshState();
  const problems = [];
  for (const quest of achievement) {
    let ok = quest.event === 'level' || quest.event === 'achieve_total';
    if (!ok) {
      // 在 QuestView.dispatch 中每种成就事件都会读 _extra：给足统计再走 cumulativeProgress 不可行，
      // 这里只静态确认映射分支存在（上一条检查已覆盖），并确认 goal 合理。
      ok = SRC_TEXT.includes(`quest.event==='${quest.event}'`);
    }
    if (!ok) problems.push(`${quest.id}(${quest.event})`);
    const mappingKey = {
      kill_total: 'totalKills', card_total: '_lastCardCount', gold_total: 'totalGold', honor_total: 'totalHonor',
      battle_win_total: 'totalBattleWins', craft_total: 'totalCrafts', material_total: 'totalMaterialCombines',
      boss_defeat_total: 'totalBossDefeats', no_death_total: 'totalNoDeath', pvp_total: 'totalPvpBattles',
      pvp_win_total: 'totalPvpWins', coop_total: 'totalCoopBattles', battle_total: 'totalBattles',
      adventure_total: 'totalAdventures', strengthen_total: 'totalStrengthens', item_total: 'totalItems',
      item_gain_total: 'totalItemGains', item_id_total: 'itemGainsById',
    }[quest.event];
    if (mappingKey && !SRC_TEXT.includes(mappingKey)) problems.push(`${quest.id} 缺统计源 ${mappingKey}`);
  }
  assertEqual(problems.join(' | '), '', '成就进度映射缺失');
});

// ---------- ⑥ 整条链模拟 ----------
console.log('=== ⑥ 主线→支线→挑战 全链模拟 ===');
function claimQuest(state, category, quest) {
  const key = `${category}Claimed`;
  state[key] ??= [];
  if (!state[key].some((id) => String(id) === String(quest.id))) state[key].push(quest.id);
  state._extra.totalQuests = Number(state._extra.totalQuests || 0) + 1;
}
function runChain(category, quests, state) {
  const problems = [];
  for (const quest of quests) {
    if (!requirementsMet(state, category, quest, QUEST_GROUPS)) {
      problems.push(`${category}:${quest.id}(${quest.name}) 前置不满足：requires=${JSON.stringify(quest.requires)} requiresMain=${JSON.stringify(quest.requiresMain)}`);
      continue;
    }
    const progress = driveQuest(state, category, quest);
    if (progress < quest.goal) problems.push(`${category}:${quest.id}(${quest.name}) 进度 ${progress}/${quest.goal}`);
    claimQuest(state, category, quest);
  }
  return problems;
}
const chainState = freshState();
check('主线 1→59 从空存档可以逐条解锁并完成', () => {
  const problems = runChain('main', main, chainState);
  assertEqual(problems.join(' | '), '', '主线链断点');
});
check('主线全部完成后，支线 31 条（含 4 条秘境材料）都可以解锁并完成', () => {
  const problems = runChain('side', side, chainState);
  assertEqual(problems.join(' | '), '', '支线链断点');
});
check('4 条秘境材料支线：击败对应 BOSS 前不可见，完成后可提交材料领奖', () => {
  const materialQuests = side.filter((quest) => quest.arc === '秘境材料');
  assertEqual(materialQuests.length, 4, '秘境材料支线数量');
  assertEqual(materialQuests.map((quest) => quest.id).join(','), 'sq28,sq29,sq30,sq31', '秘境材料支线 id');
  const before = freshState();
  runChain('main', main.slice(0, 52), before); // 只到 mq52（还没击败多特）
  const visibleBefore = visibleQuests('side', before, side, QUEST_GROUPS).map((quest) => String(quest.id));
  const leaked = materialQuests.filter((quest) => visibleBefore.includes(String(quest.id)));
  assertEqual(leaked.map((quest) => quest.id).join(','), '', '对应 BOSS 未击败时材料支线不应提前出现');
  // 打完 mq53（击败多特）后，以毒攻毒解锁；背包里有 50 个巫蛊 → syncCumulativeProgress 应直接给到 50/50。
  const state = freshState();
  runChain('main', main.slice(0, 53), state);
  const unlocked = visibleQuests('side', state, side, QUEST_GROUPS).map((quest) => String(quest.id));
  assert(unlocked.includes('sq28'), '击败多特后「以毒攻毒」应解锁');
  const owned = new Map([[53001, 50]]);
  syncCumulativeProgress(state, (itemId) => owned.get(Number(itemId)) ?? 0, QUEST_GROUPS);
  assertEqual(Number(state.sideProgress.sq28 || 0), 50, '背包已有 50 个巫蛊时应直接 50/50');
});
check('秘境材料支线用「提交」结算：consumeItems 与目标一致', () => {
  const problems = [];
  for (const quest of side.filter((entry) => entry.arc === '秘境材料')) {
    const consume = Array.isArray(quest.consumeItems) ? quest.consumeItems : [];
    if (consume.length !== 1 || Number(consume[0].id) !== Number(quest.itemId) || Number(consume[0].count) !== Number(quest.goal)) {
      problems.push(`${quest.id}(${quest.name}) consumeItems=${JSON.stringify(consume)} goal=${quest.goal}`);
    }
    if (Number(quest.lifetimeItemId) !== Number(quest.itemId)) problems.push(`${quest.id} 缺 lifetimeItemId`);
  }
  assertEqual(problems.join(' | '), '', '材料支线提交声明不完整');
});
check('挑战任务可以解锁并完成（含海底神殿 5 条的前置）', () => {
  const problems = runChain('challenge', challenge, chainState);
  assertEqual(problems.join(' | '), '', '挑战链断点');
});
check('打完全部主线之前，海底神殿挑战不可见（前置真的生效）', () => {
  const early = freshState();
  runChain('main', main.slice(0, 48), early); // 只到 mq48
  const visible = visibleQuests('challenge', early, challenge, QUEST_GROUPS).map((quest) => String(quest.id));
  const templeIds = ['cq5', 'cq6', 'cq7', 'cq8', 'cq9'];
  const leaked = templeIds.filter((id) => visible.includes(id));
  assertEqual(leaked.join(','), '', '海底神殿挑战在主线未完成时提前解锁（前置引用无效）');
});
check('游行商人互斥：未选择时两个分支都在，领一个后另一个隐藏', () => {
  const state = freshState();
  runChain('main', main, state); // mq32 完成
  const before = visibleQuests('side', state, side, QUEST_GROUPS).map((quest) => String(quest.id));
  const buy = side.find((quest) => quest.id === 'sq10');
  const decline = side.find((quest) => quest.id === 'sq11');
  assert(before.includes('sq10') && before.includes('sq11'), `未选择时应两个分支可见：${before.join(',')}`);
  claimQuest(state, 'side', buy);
  const after = visibleQuests('side', state, side, QUEST_GROUPS).map((quest) => String(quest.id));
  assert(after.includes('sq10') && !after.includes('sq11'), `选择买下后应只显示 sq10：${after.join(',')}`);
  assert(['sq10', 'sq11'].includes(decline.id), '互斥组数据异常');
});
check('日常/周常从空存档可完成并领取', () => {
  const state = freshState();
  const problems = [];
  for (const [category, quests] of [['daily', daily], ['weekly', weekly]]) {
    for (const quest of quests) {
      const progress = driveQuest(state, category, quest);
      if (progress < quest.goal) problems.push(`${category}:${quest.id} ${progress}/${quest.goal}`);
      claimQuest(state, category, quest);
    }
  }
  assertEqual(problems.join(' | '), '', '日常/周常断点');
});
check('等级奖励 Lv.1~50 可逐级领取', () => {
  const state = freshState();
  for (const entry of LEVEL_REWARDS) {
    assertEqual(entry.lv, LEVEL_REWARDS.indexOf(entry) + 1, '等级奖励 lv 连续');
    assert(entry.lv <= MAX_PLAYER_LEVEL, `Lv.${entry.lv} 超过上限`);
  }
  assertEqual(LEVEL_REWARDS[0].lv, 1, 'Lv.1 起');
  assertEqual(LEVEL_REWARDS.at(-1).lv, MAX_PLAYER_LEVEL, '到最后一级');
  assert(Number(state.levelClaimed.length) === 0, '初始无已领等级');
});

// ---------- ⑦ 领奖链路 ----------
console.log('=== ⑦ 领奖链路（服务端 findQuestReward / 周期） ===');
check('服务端 findQuestReward 能找到所有任务（含 level 的 lvN id）', () => {
  const missing = [];
  for (const [category, quests] of Object.entries(ALL_GROUPS)) {
    for (const quest of quests) if (!findQuestReward(category, quest.id)) missing.push(`${category}:${quest.id}`);
  }
  for (const entry of LEVEL_REWARDS) if (!findQuestReward('level', entry.id)) missing.push(`level:${entry.id}`);
  assertEqual(missing.join(' | '), '', '服务端找不到这些任务的奖励定义');
});
check('日常/周常按周期重置，主线/支线/挑战/等级永久', () => {
  const monday = new Date('2026-10-21T12:00:00Z');
  const tuesday = new Date('2026-10-22T12:00:00Z');
  assert(questPeriodKey('daily', monday) !== questPeriodKey('daily', tuesday), 'daily 跨天应重置');
  assertEqual(questPeriodKey('weekly', monday), questPeriodKey('weekly', new Date('2026-10-25T23:00:00Z')), '同周不应该重置');
  assert(questPeriodKey('weekly', monday) !== questPeriodKey('weekly', new Date('2026-10-26T12:00:00Z')), 'weekly 跨周应重置');
  for (const category of ['main', 'side', 'challenge', 'achievement', 'level']) {
    assertEqual(questPeriodKey(category, monday), 'permanent', `${category} 应为永久`);
    assertEqual(questClaimStorageId(category, 'x'), 'x', `${category} 领取 id 不应带周期`);
  }
  assert(questClaimStorageId('daily', 'dq1', monday) !== questClaimStorageId('daily', 'dq1', tuesday), 'daily 领取 id 应带周期');
  assert(questClaimStorageId('weekly', 'wq1', monday).includes('@'), 'weekly 领取 id 应带周期');
});
check('金币提交任务（游行商人）服务端校验 consumeGold', () => {
  const buy = side.find((quest) => quest.consumeGold);
  assert(buy && Number(buy.consumeGold) === 9999, '支线「买下情报」应要求 9999 金币');
  assert(findQuestReward('side', buy.id)?.consumeGold === 9999, '服务端应从任务目录读到同样的消耗');
});

// ---------- ⑧ 旧存档回填 ----------
console.log('=== ⑧ 旧存档回填 ===');
check('历史统计可回填新任务进度（不写 claimed）', () => {
  const state = freshState();
  state._extra.adventureClears = { '0:1': 1, '0:4': 1, '1:4': 1, final: 0 };
  state._extra.totalCrafts = 3;
  state._extra.totalStrengthens = 5;
  state._extra.totalBattles = 20;
  state._extra.totalAdventures = 8;
  state._extra.bossChallengesById = { boss_dot: 1 };
  backfillQuestProgressFromHistory(state, { playerLevel: 12 });
  assertEqual(state.mainProgress.mq01, 1, '打过战斗 → 教程视为完成');
  assertEqual(state.mainProgress.mq03, 1, '清过 1-1 → mq03 回填');
  assertEqual(state.mainProgress.mq10, 1, '清过植物 1-4 → mq10 回填');
  assertEqual(state.mainProgress.mq23, 10, '12 级 → 等级任务封顶');
  assertEqual(state.mainClaimed.length, 0, '回填不应写 claimed');
  assertEqual(state.mainProgress.mq06, undefined, '没清过 1-2 → 不回填');
});
check('新存档不会误领：空统计时回填后 main 进度为 0/undefined（等级类按 Lv.1 计）', () => {
  const state = freshState();
  backfillQuestProgressFromHistory(state, { playerLevel: 1 });
  const wrong = Object.entries(state.mainProgress)
    .filter(([id, value]) => Number(value) > 0 && main.find((quest) => String(quest.id) === id)?.event !== 'level');
  assertEqual(wrong.map(([id]) => id).join(','), '', '空存档不应回填出进度');
  // 等级任务在 Lv.1 时进度应为 1/目标（而不是 0），其余非等级任务为 0/undefined。
  assertEqual(Number(state.mainProgress.mq23 || 0), 1, 'Lv.1 时主线23「升至10级」应为 1/10');
});

// ---------- ⑨ 等级链路 ----------
console.log('=== ⑨ 等级变化 → 任务统计 ===');
check('玩家升级后会同步任务等级统计（_lastPlayerLevel 更新点存在）', () => {
  const hasLevelDispatch = /dispatch\s*\(\s*['"]level['"]/.test(SRC_TEXT);
  const syncPoints = SRC_FILES
    .filter((file) => !file.endsWith(path.join('ui', 'QuestView.js')))
    .filter((file) => /_lastPlayerLevel/.test(fs.readFileSync(file, 'utf8')));
  assert(hasLevelDispatch || syncPoints.length > 0, '升级后没有把等级同步给任务系统（主线23「升至10级」/支线等级补给/等级成就会延迟）');
});

// ---------- 汇总 ----------
console.log('');
if (failures.length) {
  console.log(`✗ ${failures.length} / ${checks} 项未通过：\n`);
  for (const failure of failures) console.log(`- ${failure}\n`);
  process.exit(1);
}
console.log(`✓ 全部 ${checks} 项通过`);
