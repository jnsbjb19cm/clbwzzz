// 校验：悲伤密林 BOSS 材料与「秘境材料」支线（2026-10-06 接入；2026-10-23 按用户要求恢复 4 条支线）
//
// 背景：2026-10-09 任务目录整体重写时，原先的「秘境材料」支线（smt_*，收集材料提交领奖）被整组替换；
//   2026-10-23 用户要求恢复其中的 4 条收集支线（以毒攻毒 / 铠甲的研发 / 海德的请求 / 神秘的魔法），
//   解锁条件改用现目录里对应的主线「击败 BOSS」任务。本脚本守的是：
//   ① 5 件材料在 item.json 里有条目、图标文件存在；
//   ② 材料有产出途径（BOSS 掉落 / 宝箱池 / 礼包池），任务真的能完成；
//   ③ 4 条支线的目标材料、提交数量、解锁 BOSS、奖励卡牌一一对应；
//   ④ 「收集材料」任务必须同时声明 itemId + consumeItems + lifetimeItemId（否则领奖不扣材料/进度不识别背包）。
//
// 用法： node scripts/verify-quest-materials-20261006.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUEST_GROUPS } from '../src/data/QuestCatalog.js';
import { QUEST_ITEM_IDS } from '../src/data/QuestRewardBalance.js';
import { BOSS_MATERIAL_DROP } from '../server/domain/AdventureAccess.js';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const items = JSON.parse(fs.readFileSync(path.join(root, 'src/data/item.json'), 'utf8'));
const itemById = new Map(items.map((it) => [Number(it.item_id), it]));
const bossList = fs.readFileSync(path.join(root, 'src/data/bossList.js'), 'utf8');
const giftPools = JSON.parse(fs.readFileSync(path.join(root, 'src/data/giftPools.json'), 'utf8'));
// 宝箱池在 ItemUseSystem 里是模块内常量（未导出），按源码内容校验，避免为测试改生产导出。
const itemUseSource = fs.readFileSync(path.join(root, 'src/systems/ItemUseSystem.js'), 'utf8');
const treasureMatch = itemUseSource.match(/TREASURE_ITEM_POOL\s*=\s*\[([^\]]*)\]/);
const treasurePool = treasureMatch ? treasureMatch[1].split(',').map((value) => Number(value.trim())).filter(Boolean) : [];
const iconDir = path.join(root, 'resources/img');
const iconFiles = new Set(fs.readdirSync(iconDir).filter((f) => f.toLowerCase().endsWith('.png')).map((f) => f.replace(/\.png$/i, '')));
const ICON_ALIAS = { 树妖的精元: '树妖的核心', 树妖的核心: '树妖的精元' };

const failures = [];
function check(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); } catch (error) {
    failures.push(name);
    console.log(`  FAIL ${name}\n       ${String(error.message).split('\n')[0]}`);
  }
}

console.log('=== ① 材料物品 ===');
const EXPECT_ITEMS = [
  [53001, '多特的巫蛊'],
  [53002, '沃里尔的铠甲'],
  [53003, '安娜的冰晶'],
  [53004, '树妖的精元'],
  [53005, '神秘技能书'],
];
for (const [id, name] of EXPECT_ITEMS) {
  check(`${id} ${name}：物品表有条目 + 图标文件存在`, () => {
    const item = itemById.get(id);
    assert.ok(item, `item.json 里没有 ${id}`);
    assert.equal(item.item_name, name, `名字不符：${item.item_name}`);
    const iconKey = String(item.item_img);
    const resolved = iconFiles.has(iconKey) ? iconKey : (ICON_ALIAS[iconKey] ?? null);
    assert.ok(resolved && iconFiles.has(resolved), `resources/img/ 里没有 ${iconKey}.png${ICON_ALIAS[iconKey] ? ` / ${ICON_ALIAS[iconKey]}.png` : ''}`);
  });
}
check('QUEST_ITEM_IDS 已注册这批材料 ID', () => {
  const m = QUEST_ITEM_IDS.bossMaterial;
  assert.equal(m.dot, 53001); assert.equal(m.gravo, 53002);
  assert.equal(m.ice, 53003); assert.equal(m.forest, 53004);
  assert.equal(QUEST_ITEM_IDS.bossSkillBook, 53005);
});

console.log('=== ② 材料有产出途径（宝箱 / 礼包）===');
const giftItemIds = new Set();
for (const pool of Object.values(giftPools)) {
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    const id = Number(node.item ?? node.itemId ?? node.id);
    if (Number.isInteger(id) && id > 0) giftItemIds.add(id);
    Object.values(node).forEach(walk);
  };
  walk(pool);
}
check('悲伤密林 4 件 BOSS 材料可从宝箱池开出', () => {
  for (const itemId of [53001, 53002, 53003, 53004]) {
    assert.ok(treasurePool.includes(itemId), `宝箱池缺少 ${itemId}（TREASURE_ITEM_POOL=${treasurePool.join(',')}）`);
  }
});
check('悲伤密林 4 件 BOSS 材料可从礼包池开出', () => {
  for (const itemId of [53001, 53002, 53003, 53004]) {
    assert.ok(giftItemIds.has(itemId), `礼包池缺少 ${itemId}`);
  }
});

console.log('=== ③ BOSS 掉落 ===');
check('4 只悲伤密林 BOSS 各掉自己的材料', () => {
  assert.equal(BOSS_MATERIAL_DROP.boss_dot, 53001);
  assert.equal(BOSS_MATERIAL_DROP.boss_gravo, 53002);
  assert.equal(BOSS_MATERIAL_DROP.boss_ice, 53003);
  assert.equal(BOSS_MATERIAL_DROP.boss_forest, 53004);
});
check('掉落表里的 BOSS 都是真实 BOSS（bossList.js 里查得到）', () => {
  for (const bossId of Object.keys(BOSS_MATERIAL_DROP)) {
    assert.ok(bossList.includes(`'${bossId}'`), `bossList.js 里没有 ${bossId}`);
  }
});

console.log('=== ④ 任务链路守则（材料任务的「提交消耗」必须成对声明）===');
check('若任务以 BOSS 材料为目标，必须同时声明 consumeItems（否则领奖不扣材料）', () => {
  const materialIds = new Set(Object.values(QUEST_ITEM_IDS.bossMaterial));
  const problems = [];
  for (const [category, quests] of Object.entries(QUEST_GROUPS)) {
    for (const quest of quests) {
      const targetId = Number(quest.itemId ?? quest.lifetimeItemId ?? NaN);
      if (!materialIds.has(targetId)) continue;
      const consumes = Array.isArray(quest.consumeItems) ? quest.consumeItems : [];
      const matched = consumes.find((entry) => Number(entry?.id ?? entry?.itemId) === targetId);
      if (!matched) problems.push(`${category}:${quest.id}(${quest.name}) 目标材料 ${targetId} 但没写 consumeItems`);
      else if (Number(matched.count) < Number(quest.goal)) problems.push(`${category}:${quest.id} 提交数量小于目标`);
    }
  }
  assert.equal(problems.join(' | '), '', '材料任务声明不完整');
});
check('4 条恢复的「秘境材料」支线都在目录里：目标材料 / 提交数量 / 解锁 BOSS 一一对应', () => {
  const side = QUEST_GROUPS.side;
  const expect = [
    { id: 'sq28', name: '以毒攻毒', goal: 50, itemId: 53001, requiresMain: 'mq53', card: 75 },
    { id: 'sq29', name: '铠甲的研发', goal: 100, itemId: 53002, requiresMain: 'mq55', card: null },
    { id: 'sq30', name: '海德的请求', goal: 100, itemId: 53003, requiresMain: 'mq57', card: 77 },
    { id: 'sq31', name: '神秘的魔法', goal: 100, itemId: 53004, requiresMain: 'mq59', card: null },
  ];
  for (const wanted of expect) {
    const quest = side.find((q) => q.id === wanted.id);
    assert.ok(quest, `缺少支线 ${wanted.id}(${wanted.name})`);
    assert.equal(quest.name, wanted.name);
    assert.equal(Number(quest.goal), wanted.goal);
    assert.equal(quest.event, 'item_gain', `${wanted.id} 应统计材料获得`);
    assert.equal(Number(quest.itemId), wanted.itemId);
    assert.equal(Number(quest.lifetimeItemId), wanted.itemId, `${wanted.id} 应记录累计获得数`);
    assert.equal(quest.requiresMain, wanted.requiresMain, `${wanted.id} 的解锁主线任务不对`);
    assert.ok(Array.isArray(quest.consumeItems) && quest.consumeItems.length === 1, `${wanted.id} 应声明提交消耗`);
    assert.equal(Number(quest.consumeItems[0].id), wanted.itemId);
    assert.equal(Number(quest.consumeItems[0].count), wanted.goal);
    assert.equal(quest.arc, '秘境材料');
    if (wanted.card) assert.ok((quest.cards ?? []).some((entry) => Number(entry?.id ?? entry) === wanted.card), `${wanted.id} 应奖励卡牌 ${wanted.card}`);
  }
  assert.ok(QUEST_GROUPS.side.filter((q) => q.arc === '秘境材料').length === 4, '秘境材料支线应正好 4 条');
});

console.log(failures.length ? `\n${failures.length} 项未通过` : '\n全部通过');
process.exit(failures.length ? 1 : 0);
