// 验证（2026-10-09）：任务目录重写（主线 1~59 + 支线）+ 事件→进度规则 + 奖励「精确模式」。
// 用法： node scripts/verify-quest-catalog-20261009.mjs
// （QuestCatalog / QuestProgressRules 不依赖 DOM 或 JSON import，Node 直跑。）
import assert from 'node:assert/strict';
import { QUEST_GROUPS, LEVEL_REWARDS, catalogProblems } from '../src/data/QuestCatalog.js';
import {
  progressDelta,
  cumulativeProgress,
  requirementsMet,
  visibleQuests,
  backfillQuestProgressFromHistory,
} from '../src/battle/QuestProgressRules.js';

const main = QUEST_GROUPS.main;
const side = QUEST_GROUPS.side;

console.log('=== ① 目录解析：没有未登记的名称 ===');
assert.deepEqual(catalogProblems(), [], `名称未能解析：${catalogProblems().join(', ')}`);
console.log('  ok 所有卡牌/道具名都能落到 id');

console.log('=== ② 主线 59 条、id 连续、逐条前置 ===');
assert.equal(main.length, 59, `主线应为 59 条，实际 ${main.length}`);
main.forEach((q, i) => {
  const expectId = `mq${String(i + 1).padStart(2, '0')}`;
  assert.equal(q.id, expectId, `第 ${i + 1} 条 id 应为 ${expectId}`);
  if (i === 0) assert.equal(q.requires, undefined, '主线第一条不应有前置');
  else assert.equal(q.requires, `mq${String(i).padStart(2, '0')}`, `${expectId} 应前置上一条`);
});
assert.equal(main[58].event, 'boss_defeated', '第 59 条应为击败树妖萝莉塔（txt 两条都写 58，已拆开）');
console.log(`  ok ${main.length} 条，mq01 → mq59，首尾事件正确`);

console.log('=== ③ 支线 31 条、前置指向主线 ===');
assert.equal(side.length, 31, `支线应为 31 条（12 原有 + 10 等级成长补给 + 5 卡牌补给 + 4 秘境材料），实际 ${side.length}`);
side.forEach((q, i) => assert.equal(q.id, `sq${i + 1}`));
assert.equal(side[9].consumeGold, 9999, '支线10「买下情报」应提交 9999 金币');
assert.equal(side[9].exclusiveGroup, side[10].exclusiveGroup, '游行商人两个分支应同属一个互斥组');
assert.equal(side[11].requiresMain, 'mq49', '支线「神秘的援助」应在完成大混战后解锁');
for (const q of side) {
  assert.ok(q.requiresMain && /^mq\d\d$/.test(q.requiresMain), `${q.id} 的 requiresMain 应指向主线任务`);
}
const levelSide = side.slice(12, 22);
const wantTierGold = { 2: 1000, 6: 1200, 7: 1800, 8: 2400, 9: 4000, 10: 4500, 13: 5000, 15: 5100, 18: 5300, 21: 5500 };
assert.equal(levelSide.length, 10, '「等级成长补给」支线应有 10 条');
for (const q of levelSide) {
  assert.equal(q.event, 'level', `${q.id} 应靠玩家等级判定`);
  assert.equal(q.gold, wantTierGold[q.goal], `${q.id}（Lv.${q.goal}）金币应为 ${wantTierGold[q.goal]}`);
  assert.equal(q.exp, 0, `${q.id} 不应给经验`);
}
// 2026-10-21：新增的 5 条「领卡牌」支线；卡牌奖励统一 {id, craftQuality:2}（普通品质）。
const giftSide = side.slice(22, 27);
assert.equal(giftSide.length, 5, '新号领卡牌支线应有 5 条');
assert.deepEqual(giftSide.map((q) => q.name), [
  '前线补员 · 花生射手', '巡逻搭档 · 大耳怪', '园艺练习 · 地刺', '救护补给 · 蒲公英医生', '扎稳阵脚 · 寒冰椰子',
]);
for (const q of giftSide) {
  assert.equal(q.cards.length, 1, `${q.id} 应只发一张卡`);
  assert.deepEqual(q.cards[0], { id: q.cards[0].id, craftQuality: 2 }, `${q.id} 应发普通品质`);
}
// 2026-10-23（用户要求恢复）：4 条「秘境材料」支线，收集 BOSS 材料提交领奖，击败对应 BOSS 后解锁。
const materialSide = side.slice(27);
assert.deepEqual(materialSide.map((q) => q.name), ['以毒攻毒', '铠甲的研发', '海德的请求', '神秘的魔法']);
assert.deepEqual(materialSide.map((q) => q.goal), [50, 100, 100, 100]);
assert.deepEqual(materialSide.map((q) => q.requiresMain), ['mq53', 'mq55', 'mq57', 'mq59'], '应分别在击败对应 BOSS 后解锁');
assert.deepEqual(materialSide.map((q) => q.itemId), [53001, 53002, 53003, 53004], '目标材料应分别为四只 BOSS 的材料');
assert.deepEqual(materialSide.map((q) => q.arc), ['秘境材料', '秘境材料', '秘境材料', '秘境材料']);
assert.deepEqual(materialSide[0].cards, [75], '以毒攻毒应奖励剧毒巫师(75)');
assert.deepEqual(materialSide[2].cards, [77], '海德的请求应奖励极寒大法师(77)');
assert.equal(Number(materialSide[0].gold), 1200);
assert.equal(Number(materialSide[0].exp), 600);
assert.equal(Number(materialSide[1].gold), 1500);
assert.equal(Number(materialSide[3].gold), 2000);
assert.ok(materialSide[3].items.some((item) => Number(item.id) === 53005), '神秘的魔法应奖励神秘技能书(53005)');
for (const q of materialSide) {
  assert.ok(q.lifetimeItemId === q.itemId, `${q.id} 应同时记录累计获得数`);
  assert.ok(Array.isArray(q.consumeItems) && q.consumeItems.length === 1, `${q.id} 应声明提交消耗`);
}
// 支线4 奖励改成体验卡（用户要求把体验卡做出来）
assert.deepEqual(side[3].items, [{ id: 60200, count: 1 }, { id: 60201, count: 1 }], '支线4 应发两张 7 天体验卡');
console.log('  ok 31 条；游行商人两分支互斥 + 9999 金币；10 档等级金币已挪到支线；支线4 发体验卡；5 条领卡牌支线；4 条秘境材料支线');

console.log('=== ④ 等级奖励：恢复「每级一份成长补给」、且不给技能 ===');
assert.equal(LEVEL_REWARDS.length, 50, '等级奖励应恢复为 Lv.1~50 每级一份');
LEVEL_REWARDS.forEach((entry, i) => {
  assert.equal(entry.lv, i + 1, '等级应连续 1~50');
  assert.equal(entry.goal, entry.lv);
  assert.ok(Number(entry.gold) > 0, `Lv.${entry.lv} 应有金币`);
  assert.equal(entry.exp, 0, `Lv.${entry.lv} 不应给经验`);
  const skillItems = (entry.items ?? []).filter((it) => Number(it.id) === 84);
  assert.deepEqual(skillItems, [], `Lv.${entry.lv} 不应发技能书(84) —— 用户明确不要给技能`);
});
assert.ok(LEVEL_REWARDS[2].items.length > 0, 'Lv.3 应恢复材料补给');
assert.ok(Number(LEVEL_REWARDS[19].gem) > 0, 'Lv.20 里程碑应给钻石');
assert.ok(LEVEL_REWARDS[0].gold < LEVEL_REWARDS[49].gold, '金币应随等级递增');
console.log(`  ok Lv.1~50 每级一份（金币 ${LEVEL_REWARDS[0].gold} → ${LEVEL_REWARDS[49].gold}），不含技能书`);


console.log('=== ⑤ 奖励精确模式：txt 写明的原样发 ===');
const byId = (id) => main.find((q) => q.id === id) || side.find((q) => q.id === id);
const itemMap = (q) => Object.fromEntries(q.items.map((it) => [it.id, it.count]));

let q1 = byId('mq01');
assert.deepEqual(q1.cards, [8], '主线1 应给大耳怪(8)');
assert.deepEqual(itemMap(q1), { 50001: 2, 50011: 3, 30006: 1, 60100: 1 }, '主线1 道具应为 txt 所列 4 项');

const q10 = byId('mq10');
assert.deepEqual(q10.cards, [22], '主线10 应给蒲公英医生(22)');
assert.equal(q10.gold, 500); assert.equal(q10.exp, 600);

const q15 = byId('mq15');
assert.deepEqual(q15.cards, [{ id: 17, craftQuality: 3 }], '主线15 应给「精良的寒冰椰子」(17, 精良=3)');
const q39 = byId('mq39');
assert.deepEqual(q39.cards, [{ id: 1, craftQuality: 5 }], '主线39 应给「完美的花生射手」(1, 完美=5)');

const q28 = byId('mq28');
assert.deepEqual(itemMap(q28), { 30006: 1 }, '主线28 只应发三头仙人掌DNA，不叠加主题材料');
const q12 = byId('mq12');
assert.ok(q12.items.length > 0, '没写道具的任务应回落到 profile 主题材料');
assert.deepEqual(itemMap(byId('mq49')), { 60105: 1 }, '主线49 应给神秘的卡蛋III');
assert.equal(byId('mq49').gold, 50000);
assert.deepEqual(itemMap(byId('mq40')), { 10004: 10, 10003: 20, 10002: 30, 10001: 30 }, '主线40 应发 4 档强化粉');
assert.equal(byId('mq48').exp, 2000);
console.log('  ok 卡牌/道具/金币/经验逐条对得上 txt；未写明的回落到平衡档');

console.log('=== ⑥ progressDelta：冒险关卡（任意线 / 指定线 / 尝试通关）===');
const mq03 = byId('mq03'); // 任意线 1-1
assert.equal(progressDelta(mq03, 'adventure_complete', { route: 0, adventureIndex: 1 }), 1, '植物线 1-1 应算');
assert.equal(progressDelta(mq03, 'adventure_complete', { route: 1, adventureIndex: 1 }), 1, '怪物线 1-1 也应算');
assert.equal(progressDelta(mq03, 'adventure_complete', { route: 0, adventureIndex: 2 }), 0, '1-2 不应算 1-1');

const mq10 = byId('mq10'); // 植物线 1-4
assert.equal(progressDelta(mq10, 'adventure_complete', { route: 0, adventureIndex: 4 }), 1);
assert.equal(progressDelta(mq10, 'adventure_complete', { route: 1, adventureIndex: 4 }), 0, '怪物线 1-4 不应算植物线 1-4');

const mq15 = byId('mq15'); // 尝试通关植物线 2-1，输也算
assert.equal(progressDelta(mq15, 'adventure_attempt', { route: 0, adventureIndex: 5, win: false }), 1, '失败也算尝试');
assert.equal(progressDelta(mq15, 'adventure_attempt', { route: 1, adventureIndex: 5 }), 0);

console.log('=== ⑦ progressDelta：指定卡击杀/获取/使用、区域、BOSS、加工 ===');
const mq16 = byId('mq16');
assert.equal(progressDelta(mq16, 'kill_card', { cardId: 7 }), 1, '西瓜太郎算');
assert.equal(progressDelta(mq16, 'kill_card', { cardId: 30 }), 1, '真.西瓜太郎算');
assert.equal(progressDelta(mq16, 'kill_card', { cardId: 8 }), 0, '大耳怪不算');
assert.equal(progressDelta(mq16, 'kill_enemy', { cardId: 7, count: 3 }), 0, '普通击杀事件不算指定卡任务');

const mq17 = byId('mq17');
assert.equal(progressDelta(mq17, 'card_obtain', { cardId: 82 }), 1, '获得幼小玉米算');
assert.equal(progressDelta(mq17, 'card_obtain', { cardId: 81 }), 0);
const mq18 = byId('mq18');
assert.equal(progressDelta(mq18, 'card_use', { cardId: 82, count: 1 }), 1);
assert.equal(progressDelta(mq18, 'card_use', { cardId: 7 }), 0);

const mq51 = byId('mq51');
assert.equal(progressDelta(mq51, 'visit_area', { areaId: 'painforest' }), 1);
assert.equal(progressDelta(mq51, 'visit_area', { areaId: 'forest' }), 0);

const mq53 = byId('mq53');
assert.equal(progressDelta(mq53, 'boss_defeated', { bossId: 'boss_dot' }), 1);
assert.equal(progressDelta(mq53, 'boss_defeated', { bossId: 'boss_gravo' }), 0);
assert.equal(progressDelta(mq53, 'boss_challenge', { bossId: 'boss_dot' }), 0, '挑战不算击败');

assert.equal(progressDelta(byId('mq04'), 'material_combine', { materialKind: 'powder' }), 1);
assert.equal(progressDelta(byId('mq04'), 'material_combine', { materialKind: 'gem' }), 0);
console.log('  ok 击杀/获取/使用/区域/BOSS/加工都按 id 精确匹配');

console.log('=== ⑧ cumulativeProgress：自动完成 / 指定卡累计 / 挂机累计 ===');
const emptyState = { _extra: {} };
assert.equal(cumulativeProgress(byId('mq50'), emptyState), 1, '「片刻喘息」应直接完成');
assert.equal(cumulativeProgress(byId('sq12'), emptyState), 1, '「神秘的援助」应直接完成');
const killState = { _extra: { cardKillsById: { 7: 3, 30: 2, 8: 99 } } };
assert.equal(cumulativeProgress(byId('mq16'), killState), 5, '两卡击杀数应求和、忽略其它卡');
const playState = { _extra: { totalPlayMinutes: 4 } };
assert.equal(cumulativeProgress(byId('mq26'), playState), 4, '挂机任务读 totalPlayMinutes');

console.log('=== ⑨ 前置与互斥分支 ===');
const st = { mainClaimed: ['mq01'], mainProgress: {}, sideClaimed: [], sideProgress: {} };
assert.equal(requirementsMet(st, 'side', byId('sq1')), true, 'sq1 只需主线1');
assert.equal(requirementsMet(st, 'side', byId('sq7')), false, 'sq7 需要主线10');
st.mainClaimed = ['mq32'];
const before = visibleQuests('side', st, side).map((q) => q.id);
assert.ok(before.includes('sq10') && before.includes('sq11'), '未选择时两个分支都可见');
st.sideClaimed = ['sq10'];
const after = visibleQuests('side', st, side).map((q) => q.id);
assert.ok(after.includes('sq10'), '已选的分支仍显示（已领取）');
assert.ok(!after.includes('sq11'), '互斥的另一分支应隐藏');
console.log('  ok requiresMain 生效；游行商人选一个另一个消失');

console.log('=== ⑩ 旧存档回填（只补 progress、不补 claimed）===');
const legacy = {
  mainProgress: {}, mainClaimed: [], sideProgress: {}, sideClaimed: [],
  _extra: {
    adventureClears: { '0:1': 1, '0:4': 1, '1:4': 1, final: 0 },
    totalCrafts: 3, totalStrengthens: 5, totalBattles: 20, totalAdventures: 8,
    bossChallengesById: { boss_dot: 1 }, bossDefeatsById: {},
  },
};
backfillQuestProgressFromHistory(legacy, { playerLevel: 12 });
assert.equal(legacy.mainProgress.mq01, 1, '打过战斗 → 教程视为已完成');
assert.equal(legacy.mainProgress.mq03, 1, '清过 1-1 → 主线3 回填');
assert.equal(legacy.mainProgress.mq10, 1, '清过植物线 1-4 → 主线10 回填');
assert.equal(legacy.mainProgress.mq11, 1, '清过怪物线 1-4 → 主线11 回填');
assert.equal(legacy.mainProgress.mq13, 4, '累计成功强化 5 次 → 主线13 封顶到 4');
assert.equal(legacy.mainProgress.mq23, 10, '12 级 → 主线23「升至10级」封顶');
assert.equal(legacy.mainProgress.mq52, 1, '挑战过多特 → 主线52 回填');
assert.equal(legacy.mainProgress.mq53, undefined, '没击败过多特 → 主线53 不回填');
assert.equal(legacy.mainProgress.mq06, undefined, '没清过 1-2 → 主线6 不回填');
assert.deepEqual(legacy.mainClaimed, [], '回填不应写 claimed（奖励还得自己领）');
console.log('  ok 关卡/BOSS/累计/等级按历史回填，未走过的路不回填，claimed 保持空');

console.log('\n全部通过');
