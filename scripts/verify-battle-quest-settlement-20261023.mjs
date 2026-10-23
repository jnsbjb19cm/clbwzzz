/**
 * 2026-10-23：战斗内行为 → 任务事件「结算时统一上报」的纯函数回归。
 *
 * 用户要求：主线18「玉米大作战 II」这类按次数计的任务不应该在出牌瞬间涨进度，
 * 应该在**战斗结算**时统一入账；技能（主线33「战斗的艺术」）同理。
 * 本脚本只测记账/结算模块本身（不依赖 DOM）：
 *  ① 出牌按 cardId 累计、技能次数 engine/view 两侧合并；
 *  ② flush 每条卡一条 card_use(count) + 一条 skill_cast(count)，然后清零；
 *  ③ 重复 flush 不会重复上报（战斗结算重复渲染也不会多算）；
 *  ④ 训练营/中途退出 = 不调用 flush，任务事件为 0。
 */
import assert from 'node:assert/strict';
import {
  ensureQuestBattleSettlement,
  recordCardUseForQuest,
  recordSkillCastForQuest,
  recordSkillCastForEngine,
  flushQuestBattleEvents,
} from '../src/battle/QuestBattleSettlement20261023.js';

const failures = [];
let checks = 0;
function check(name, fn) {
  checks += 1;
  try { fn(); console.log(`  ok   ${name}`); } catch (error) {
    failures.push(name);
    console.log(`  FAIL ${name}\n       ${String(error.message).split('\n')[0]}`);
  }
}

function makeView() {
  return { questBattleStats: { cardIds: new Set(), lanes: new Set() }, engine: {} };
}
function collect(view, meta = {}) {
  const events = [];
  const count = flushQuestBattleEvents(view, meta, (event, data) => events.push({ event, data }));
  return { count, events };
}
const byEvent = (events, event) => events.filter((entry) => entry.event === event);
const findCard = (events, cardId) => byEvent(events, 'card_use').find((entry) => Number(entry.data.cardId) === Number(cardId));

console.log('=== ① 记账 ===');
check('出牌按 cardId 累计，非法 id 忽略', () => {
  const view = makeView();
  assert.equal(recordCardUseForQuest(view, 82), true);
  assert.equal(recordCardUseForQuest(view, 82), true);
  assert.equal(recordCardUseForQuest(view, 7), true);
  assert.equal(recordCardUseForQuest(view, 0), false);
  assert.equal(recordCardUseForQuest(view, 'x'), false);
  const stats = ensureQuestBattleSettlement(view);
  assert.equal(stats.cardUses.get(82), 2);
  assert.equal(stats.cardUses.get(7), 1);
  assert.equal(stats.cardIds.has(82), true);
});
check('技能次数在 view 与 engine 两侧分别累计', () => {
  const view = makeView();
  recordSkillCastForQuest(view);
  recordSkillCastForQuest(view, 2);
  recordSkillCastForEngine(view.engine);
  recordSkillCastForEngine(view.engine, 3);
  assert.equal(view.questBattleStats.skillCasts, 3);
  assert.equal(view.engine.questSkillCasts, 4);
});

console.log('=== ② 结算时统一上报 ===');
check('flush 输出 card_use(每张卡一条,带本场次数) + skill_cast(合并次数)', () => {
  const view = makeView();
  recordCardUseForQuest(view, 82);
  recordCardUseForQuest(view, 82);
  recordCardUseForQuest(view, 82);
  recordCardUseForQuest(view, 7);
  recordSkillCastForQuest(view);
  recordSkillCastForEngine(view.engine, 2);
  const { count, events } = collect(view, { count: 1, won: true });
  assert.equal(count, 3, `应上报 3 条事件，实际 ${count}`);
  assert.equal(findCard(events, 82)?.data.count, 3, '幼小玉米应报 3 次');
  assert.equal(findCard(events, 7)?.data.count, 1, '另一张卡应报 1 次');
  const skills = byEvent(events, 'skill_cast');
  assert.equal(skills.length, 1);
  assert.equal(skills[0].data.count, 3, '技能应为 1+2=3 次');
  assert.equal(skills[0].data.won, true, '应带上战斗结算元数据');
});
check('flush 后清零；重复 flush 不重复上报（重复结算不会多算）', () => {
  const view = makeView();
  recordCardUseForQuest(view, 82);
  recordSkillCastForEngine(view.engine);
  const first = collect(view);
  assert.equal(first.count, 2);
  const second = collect(view);
  assert.equal(second.count, 0, `第二次结算不应再上报，实际 ${second.count}`);
  assert.equal(view.questBattleStats.cardUses.size, 0);
  assert.equal(view.questBattleStats.skillCasts, 0);
  assert.equal(view.engine.questSkillCasts, 0);
});

console.log('=== ③ 中途退出/训练营 ===');
check('记了账但没结算（退出战斗）→ 不上报任务事件', () => {
  const view = makeView();
  recordCardUseForQuest(view, 82);
  recordCardUseForQuest(view, 82);
  recordSkillCastForQuest(view);
  // 不调用 flush：等价于用户中途退出/训练营（训练营结算块被跳过）
  assert.equal(view.questBattleStats.cardUses.get(82), 2);
  assert.equal(view.questBattleStats.skillCasts, 1);
});
check('没有记账时 flush 不产生事件', () => {
  const { count, events } = collect(makeView());
  assert.equal(count, 0);
  assert.deepEqual(events, []);
});

console.log(failures.length ? `\n${failures.length} / ${checks} 项未通过` : `\n全部 ${checks} 项通过`);
process.exit(failures.length ? 1 : 0);
