// 回归验证：被动天赋必须真正进入战斗引擎并生效。
//
// 现象（用户报告 2026-09-12）：有些被动技能"实际不在战斗生效"。
//
// 根因一：BattleCriticalFixes.createBattleEngine 构造引擎时漏传 talentBonus，
//   而它覆盖了 BattleView.enterBattle / restartBattle → 单机战斗里引擎拿到的
//   talentBonus 全是 0（引擎只从 globalThis.heroSkillStore 兜底，那里通常是空的），
//   于是 508~525 的被动全部不生效，重开战斗还会连 MP 天赋一起丢。
// 根因二：BattleEngine 构造函数把传入的 talentBonus **重新收窄**成
//   this.talentBonus = { hp, mp, atkPct, hpPct }
//   于是 BattleTalentAuthority 算出来的 scarecrowAtkPct / dandelionHpPct /
//   dandelionHealPct / lowBaseAtkPct / lowBaseDamageReductionPct 又全被丢掉：
//   512 破釜沉舟（getAuraBonus 读 lowBaseAtkPct）→ 0
//   513 坚韧不屈（takeDamage 读 lowBaseDamageReductionPct）→ 0
//   515 战神祝福（applyTalentCardBonus 读 scarecrowAtkPct）→ 0
//   516 天使之赐（doAreaHeal 读 dandelionHealPct；applyTalentCardBonus 读 dandelionHpPct）→ 0
//
// 用法： node scripts/verify-talent-passives-20260912.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BattleEngine } from '../src/battle/BattleEngine.js';
import { BattleUnit } from '../src/battle/BattleUnit.js';
import { installBattleRuleConvergence20260830 } from '../src/battle/BattleRuleConvergence20260830.js';
import { calculateTalentBonus } from '../src/core/TalentRegistry.js';

installBattleRuleConvergence20260830();

const failures = [];
function check(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.log(`  FAIL ${name}\n       ${String(error.message).split('\n')[0]}`);
  }
}

// 训练模式不需要关卡波次数据，用最小 db 夹具即可（避免依赖浏览器 JSON import）
const db = { stages: [{ stage_id: 1, hp: 1000 }], getById: () => null };

/**
 * 直接用生产代码算天赋加成（TalentRegistry.calculateTalentBonus），
 * 解锁 12 个被动 + 中心点：战意5/杀戮10（攻击）、强壮5/耐久训练10（生命）、
 * 神圣眷顾50+神佑之体100（基地生命）、破釜沉舟10、坚韧不屈10、
 * 战神祝福5（稻草人）、天使之赐5（蒲公英生命）+50（蒲公英治疗）。
 */
const FULL_SET = new Set([
  'core',
  'passive_will', 'passive_slay',
  'passive_strong', 'passive_endure',
  'passive_sacred', 'passive_god',
  'passive_gamble', 'passive_tough',
  'passive_war', 'passive_gift',
  'passive_focus', 'passive_wisdom',
]);
const fullBonus = calculateTalentBonus(FULL_SET);

// 独立来源的期望值（不是从代码反推）：15/15 攻击生命、150 基地生命、10/10 低血加成、5/5/50 家族加成
const EXPECTED = {
  hp: 150,
  mp: 0,
  globalAtkPct: 15,
  globalHpPct: 15,
  lowBaseAtkPct: 10,
  lowBaseDamageReductionPct: 10,
  scarecrowAtkPct: 5,
  dandelionHpPct: 5,
  dandelionHealPct: 50,
};

function makeEngine() {
  return new BattleEngine(db, 1, [], null, {
    skillLoadout: [],
    heroMpMax: 100,
    trainingMode: true,
    talentBonus: { ...fullBonus },
  });
}

console.log(`天赋加成（由 calculateTalentBonus 算出）：${JSON.stringify(fullBonus)}`);
check('天赋树 → 加成的期望值', () => {
  for (const [key, value] of Object.entries(EXPECTED)) {
    assert.equal(fullBonus[key], value, `${key}=${fullBonus[key]}（期望 ${value}）`);
  }
});

console.log('=== 1. talentBonus 必须完整传到引擎 ===');
const engine = makeEngine();
for (const [key, value] of Object.entries(fullBonus)) {
  check(`engine.talentBonus.${key} = ${value}`, () => {
    assert.equal(engine.talentBonus?.[key], value, `实际 ${engine.talentBonus?.[key]}`);
  });
}

console.log('=== 2. 512 破釜沉舟：基地血量 <100 时单位攻击 +10% ===');
const engineLow = makeEngine();
engineLow.heroHp = 50;
const attacker = new BattleUnit({ card: { id: 1, name: '测试兵', atk: 100, hp: 100 }, lane: 0, col: 0, team: 'player' });
const auraLow = engineLow.getAuraBonus(attacker);
engineLow.heroHp = 500;
const auraHigh = engineLow.getAuraBonus(attacker);
console.log(`   基地50血 aura=${auraLow}；基地500血 aura=${auraHigh}`);
check('基地血量 <100 时给出 10% 攻击光环', () => {
  assert.equal(auraLow, 10, `aura=${auraLow}（期望 100×10% = 10）`);
});
check('基地血量正常时没有额外光环', () => {
  assert.equal(auraHigh, 0, `aura=${auraHigh}`);
});

console.log('=== 3. 513 坚韧不屈：基地血量 <100 时受伤 -10% ===');
const engineTough = makeEngine();
engineTough.heroHp = 50;
const tank = new BattleUnit({ card: { id: 1, name: '测试兵', atk: 10, hp: 100 }, lane: 0, col: 0, team: 'player' });
engineTough.units.push(tank);
engineTough.applyTalentCardBonus(tank); // 生成单位时会带上 engine 反向引用
tank.hp = 100;
const dealtLow = tank.takeDamage(50, 0);
const tank2 = new BattleUnit({ card: { id: 1, name: '测试兵', atk: 10, hp: 100 }, lane: 0, col: 0, team: 'player' });
engineTough.heroHp = 500;
engineTough.units.push(tank2);
engineTough.applyTalentCardBonus(tank2);
tank2.hp = 100;
const dealtHigh = tank2.takeDamage(50, 0);
console.log(`   基地50血 受到50伤 → 实际 ${dealtLow}；基地500血 → 实际 ${dealtHigh}`);
check('基地血量 <100 时受伤减免 10%', () => {
  assert.equal(dealtLow, 45, `实际扣血 ${dealtLow}（期望 45）`);
});
check('基地血量正常时不减免', () => {
  assert.equal(dealtHigh, 50, `实际扣血 ${dealtHigh}（期望 50）`);
});

console.log('=== 4. 515 战神祝福：稻草人系(19/32) 额外 +5% 攻击 ===');
const engineWar = makeEngine();
const scarecrow = new BattleUnit({ card: { id: 19, name: '稻草人', atk: 100, hp: 100 }, lane: 0, col: 0, team: 'player' });
engineWar.units.push(scarecrow);
engineWar.applyTalentCardBonus(scarecrow);
const normal = new BattleUnit({ card: { id: 7, name: '普通兵', atk: 100, hp: 100 }, lane: 0, col: 0, team: 'player' });
engineWar.units.push(normal);
engineWar.applyTalentCardBonus(normal);
console.log(`   稻草人 atk=100 → ${scarecrow.atk}；普通兵 atk=100 → ${normal.atk}`);
check('稻草人系比普通卡多 5% 攻击（15%+5% = ×1.20）', () => {
  assert.equal(scarecrow.atk, 120, `稻草人 atk=${scarecrow.atk}（期望 ×1.20）`);
  assert.equal(normal.atk, 115, `普通兵 atk=${normal.atk}（期望 ×1.15）`);
});

console.log('=== 5. 516 天使之赐：蒲公英系(22/36) 生命 +5% 且治疗 +50% ===');
const engineGift = makeEngine();
const dandelion = new BattleUnit({ card: { id: 22, name: '蒲公英医生', atk: 10, hp: 200 }, lane: 0, col: 0, team: 'player' });
engineGift.units.push(dandelion);
engineGift.applyTalentCardBonus(dandelion);
console.log(`   蒲公英 maxHp=200 → ${dandelion.maxHp}`);
check('蒲公英系生命额外 +5%（15%+5% = ×1.20）', () => {
  assert.equal(dandelion.maxHp, 240, `maxHp=${dandelion.maxHp}（期望 240）`);
});

const baseHeal = new BattleUnit({ card: { id: 1, name: '测试兵', atk: 1, hp: 500 }, lane: 0, col: 0, team: 'player' });
baseHeal.hp = 10;
const engineHeal = makeEngine();
engineHeal.units.push(baseHeal);
const healer = new BattleUnit({ card: { id: 22, name: '蒲公英医生', atk: 1, hp: 100 }, lane: 0, col: 0, team: 'player' });
engineHeal.units.push(healer);
healer.lastHealTick = engineHeal.battleTick;
engineHeal.doAreaHeal(0, 0, 'player', 100, 1);
console.log(`   蒲公英在旁治疗 100 → 实际回血 ${baseHeal.hp - 10}`);
check('蒲公英系治疗量 ×1.5（100 → 150）', () => {
  assert.equal(baseHeal.hp, 160, `回血后 hp=${baseHeal.hp}（期望 10+150）`);
});

console.log('=== 6. 每个构造战斗引擎的地方都必须把天赋传进去（源码守卫）===');
{
  // 2026-09-12 的真实事故：BattleCriticalFixes.createBattleEngine 漏传 talentBonus，
  // 于是所有被动在单机战斗里全部失效。这里做静态扫描，防止再次漏传。
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const ALLOW_MISSING = new Set([
    // 联机战斗的单位属性/基地血量/MP 由服务端权威快照覆盖，客户端传天赋只会在快照前闪一下，
    // 所以这里刻意不传（要真正生效必须服务端读玩家 hero_skills 后自行计算）。
    'src/ui/PvpBattleBridgeFinal.js',
  ]);
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  };
  walk(path.join(ROOT, 'src'));
  const offenders = [];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    source.forEach((line, index) => {
      if (!/new BattleEngine\(/.test(line)) return;
      const window = source.slice(index, index + 16).join('\n');
      if (/talentBonus/.test(window)) return;
      if (ALLOW_MISSING.has(rel)) return;
      offenders.push(`${rel}:${index + 1}`);
    });
  }
  console.log(`   扫描 ${files.length} 个源文件；未传 talentBonus 的构造点：${offenders.length ? offenders.join(', ') : '无'}`);
  check('所有 BattleEngine 构造点都传了 talentBonus（或在允许清单内）', () => {
    assert.equal(offenders.length, 0, offenders.join(', '));
  });
}

console.log(failures.length ? `\n${failures.length} 项未通过` : '\n全部通过');
process.exit(failures.length ? 1 : 0);
