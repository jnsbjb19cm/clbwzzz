// 回归验证：2026-09-12 本次技能改动的实际效果。
//
//  505 生命结界：瞬间回复 50% 生命 + 生命上限 +10
//  530 绽放吧..波涛：4 行（路）× 5 列，伤害 15
//  537 幻·火鸟：全屏 50 伤 + 灼烧 4/秒 5 秒
//  539 死亡诅咒：+3 只加在"中毒目标的非中毒伤害"上（中毒 DoT 本身不吃增伤）
//  540 全军突击：攻速/移速 +10%
//  542/543/544/545/546/548/549/551~556：已禁用（无效果、不可施放）
//
// 用法： node scripts/verify-skill-effects-20260912.mjs
import assert from 'node:assert/strict';
import { BattleEngine } from '../src/battle/BattleEngine.js';
import { BattleUnit } from '../src/battle/BattleUnit.js';
import { installBattleRuleConvergence20260830 } from '../src/battle/BattleRuleConvergence20260830.js';
import { SKILL_EFFECTS, getSkillEffect } from '../src/core/SkillRegistry.js';

installBattleRuleConvergence20260830();

const failures = [];
function check(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.log(`  FAIL ${name}\n       ${String(error.message).split('\n')[0]}`);
  }
}

const db = { stages: [{ stage_id: 1, hp: 1000 }], getById: () => null };

function makeEngine() {
  return new BattleEngine(db, 1, [], null, { skillLoadout: [], heroMpMax: 100, trainingMode: true, talentBonus: null });
}
function addUnit(engine, { id = 1, name = '单位', atk = 10, hp = 1000, lane = 0, col = 0, team = 'enemy' } = {}) {
  const unit = new BattleUnit({ card: { id, name, atk, hp }, lane, col, team });
  engine.units.push(unit);
  return unit;
}

console.log('=== 505 生命结界：回复 50% 生命 + 上限 +10 ===');
{
  const engine = makeEngine();
  const ally = addUnit(engine, { team: 'player', hp: 400, col: 0 });
  ally.hp = 100;
  engine.skills.applyEffect(505, SKILL_EFFECTS[505], null, null);
  console.log(`   400 上限 / 100 血 → 血 ${ally.hp}，上限 ${ally.maxHp}`);
  check('回复 50% 生命（200）后上限再 +10 并补血', () => {
    assert.equal(ally.hp, 310, `hp=${ally.hp}（期望 100+200+10 = 310）`);
    assert.equal(ally.maxHp, 410, `maxHp=${ally.maxHp}（期望 410）`);
  });
}

console.log('=== 530 绽放吧..波涛：4 路 × 5 列，15 伤 ===');
{
  const engine = makeEngine();
  const grid = [];
  for (let lane = 0; lane < 5; lane += 1) {
    for (let col = 0; col < 12; col += 1) grid.push(addUnit(engine, { lane, col }));
  }
  engine.skills.applyEffect(530, SKILL_EFFECTS[530], { lane: 2, col: 6 }, null);
  const hit = grid.filter((u) => u.hp < 1000);
  const hitCells = hit.map((u) => `${u.lane}:${u.col}`).sort();
  console.log(`   命中 ${hit.length} 格：${hitCells.join(' ')}`);
  check('命中 4 路 × 5 列 = 20 格（lanes 1..4 × cols 4..8）', () => {
    assert.equal(hit.length, 20, `实际命中 ${hit.length} 格`);
    assert.deepEqual(
      hitCells,
      [
        '1:4', '1:5', '1:6', '1:7', '1:8',
        '2:4', '2:5', '2:6', '2:7', '2:8',
        '3:4', '3:5', '3:6', '3:7', '3:8',
        '4:4', '4:5', '4:6', '4:7', '4:8',
      ],
    );
  });
  check('每格 15 伤', () => {
    assert.equal(hit[0].hp, 985, `hp=${hit[0].hp}（期望 985）`);
  });
}

console.log('=== 539 死亡诅咒：+3 只作用于"中毒目标的非中毒伤害" ===');
{
  const engine = makeEngine();
  const cursed = addUnit(engine, { hp: 1000 });
  engine.skills.applyEffect(539, SKILL_EFFECTS[539], null, null); // 只诅咒当前场上的敌人
  const clean = addUnit(engine, { hp: 1000 });                   // 之后入场的敌人没被诅咒
  engine.time = 1;                     // DoT 第一次结算点（只建立 nextAt，不结算）
  engine.skills.tickDots(1);
  engine.time = 2;                     // 第二次才真正结算 8 点中毒伤害
  const beforePoison = cursed.hp;
  engine.skills.tickDots(1);
  const poisonHit = beforePoison - cursed.hp;
  const beforeNormal = cursed.hp;
  engine.skills.hitUnit(cursed, 10);   // 中毒目标的普通伤害
  const normalHit = beforeNormal - cursed.hp;
  const beforeClean = clean.hp;
  engine.skills.hitUnit(clean, 10);    // 没中毒的目标
  const cleanHit = beforeClean - clean.hp;
  console.log(`   中毒 DoT 扣血 ${poisonHit}；中毒目标普通伤害扣血 ${normalHit}；未中毒目标扣血 ${cleanHit}`);
  check('中毒 DoT 本身不吃 +3（8 → 8）', () => assert.equal(poisonHit, 8, `实际 ${poisonHit}`));
  check('中毒目标的非中毒伤害 +3（10 → 13）', () => assert.equal(normalHit, 13, `实际 ${normalHit}`));
  check('未中毒目标没有 +3（10 → 10）', () => assert.equal(cleanHit, 10, `实际 ${cleanHit}`));
}

console.log('=== 540 全军突击：攻速/移速 +10% ===');
{
  const engine = makeEngine();
  const ally = addUnit(engine, { team: 'player' });
  engine.skills.applyEffect(540, SKILL_EFFECTS[540], null, null);
  console.log(`   移速倍率 ${ally.asMsSpeedUp}；攻击冷却倍率 ${ally.asMsAtkMult.toFixed(4)}`);
  check('移速 ×1.1 且攻击冷却 ×(1/1.1)', () => {
    assert.equal(ally.asMsSpeedUp, 1.1, `asMsSpeedUp=${ally.asMsSpeedUp}`);
    assert.ok(Math.abs(ally.asMsAtkMult - 1 / 1.1) < 1e-9, `asMsAtkMult=${ally.asMsAtkMult}`);
  });
  check('引擎读取到攻速加成', () => {
    const mult = engine.getAtkSpeedMult(ally);
    assert.ok(Math.abs(mult - 1 / 1.1) < 1e-9, `getAtkSpeedMult=${mult}`);
  });
}

console.log('=== 禁用技能：无效果声明、不可施放 ===');
{
  const DISABLED = [542, 543, 544, 545, 546, 548, 549, 551, 552, 553, 554, 555, 556];
  const engine = makeEngine();
  for (const id of DISABLED) {
    check(`${id} 不可施放`, () => {
      assert.equal(getSkillEffect(id), null, `${id} 仍有 SKILL_EFFECTS 声明`);
      const result = engine.skills.canCast(id);
      assert.equal(result.ok, false, `${id} 居然可以施放`);
    });
  }
  check('存活技能不受影响（500/505/540/560 仍可施放）', () => {
    for (const id of [500, 505, 540, 560]) {
      assert.equal(getSkillEffect(id)?.kind != null, true, `${id} 效果声明丢失`);
    }
  });
}

console.log(failures.length ? `\n${failures.length} 项未通过` : '\n全部通过');
process.exit(failures.length ? 1 : 0);
