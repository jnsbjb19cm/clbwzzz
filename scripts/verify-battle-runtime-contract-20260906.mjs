import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const gameplay = await readFile(new URL('../server/battle/PvpGameplayInstall.js', import.meta.url), 'utf8');
const engine = await readFile(new URL('../src/battle/BattleEngine.js', import.meta.url), 'utf8');

function contains(source, needle, message) {
  assert.ok(source.includes(needle), message);
}

// BOSS commander（痴情的多特）只是展示/指挥模型，不能进入任何普通战斗 seam。
contains(gameplay, 'unit.bossCommanderOnly = true;', 'commander must be explicitly marked');
contains(gameplay, 'unit.atk = 0;', 'commander must have no normal attack damage');
contains(gameplay, 'unit.atkSpeed = 0;', 'commander must have no normal attack cadence');
contains(gameplay, 'if (enemy?.bossCommanderOnly === true) return false;', 'commander must never be a normal enemy target');
contains(gameplay, 'if (blocker?.bossCommanderOnly === true) return false;', 'commander must never block movement');
contains(gameplay, ".filter((enemy) => enemy?.bossCommanderOnly !== true)", 'commander must be removed from contact enemies');
contains(gameplay, "this.units = originalUnits.filter((unit) => unit?.bossCommanderOnly !== true);", 'normal projectile sweep must ignore commander');
contains(gameplay, 'if (unit?.bossCommanderOnly === true) {', 'commander tryAttack guard must exist');
contains(gameplay, 'return false;\n    }\n    return previousTryAttack.call(this, unit, ...args);', 'commander tryAttack guard must short-circuit');

// 飞鞋怪：首个接触是一次性 latch；第一次普通攻击必须让位给特殊击晕。
const stunStart = engine.indexOf('tryFirstContactStun(unit)');
assert.ok(stunStart >= 0, 'fly-shoe first-contact implementation must exist');
const stunSection = engine.slice(stunStart, stunStart + 1800);
contains(stunSection, 'unit.cardId !== 23 || unit._firstContactStun || !unit.alive', 'fly-shoe stun must be card 23 and one-shot');
contains(stunSection, 'unit._firstContactStun = true;', 'fly-shoe must latch before resolving victims');
contains(stunSection, 'this.time + 2.5', 'fly-shoe first contact must apply 2.5s stun');
contains(engine, "if (unit.cardId === 23 && !unit._firstContactStun && !unit.attackingBase) return false;", 'normal attack must not race the first-contact special');

// Headless authority cannot see animation assets, but must still publish the special animation protocol once.
contains(gameplay, 'Number(unit?.cardId) === 23 && unit._firstContactStun', 'authority must recognize completed fly-shoe first contact');
contains(gameplay, "unit._forcedAnimState = 'secondAttackStatus';", 'authority must publish fly-shoe special animation state');
contains(gameplay, "unit._forcedAnimUntil = Math.max(Number(unit._forcedAnimUntil) || 0, this.time + duration);", 'authority must publish a bounded special-animation window');

// The production authority installer must install shared combat fixes before late rule packs.
const installBody = gameplay.slice(gameplay.indexOf('export function installPvpGameplayFinal()'));
const ordered = [
  'installFlyShoeHeadlessSpecialRule();',
  'installBattleAttackTimingFix();',
  'installBattleMeleeContactFinal();',
  'installProjectileImpactAlignmentFinal();',
  'installBossCommanderOnlyRule();',
  'installPvpBaseDamageSymmetryFinal();',
  'installPvpProjectileReleaseCalibrationFinal();',
  'installBattleRound3Rules();',
  'installBattlePlacementRound3();',
  'installBossSummonRules20260819();',
];
let cursor = -1;
for (const call of ordered) {
  const next = installBody.indexOf(call);
  assert.ok(next > cursor, `production install order is wrong around ${call}`);
  cursor = next;
}

console.log('PASS battle runtime contract 20260906');
