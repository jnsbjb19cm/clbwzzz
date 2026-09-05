import assert from 'node:assert/strict';
import fs from 'node:fs';

const files = [
  'src/battle/BattleRenderer.js',
  'src/battle/BattleRuntimeDiagnostics.js',
  'src/ui/BattleCardFeedbackFinal.js',
  'src/ui/BattleImpactSafetyFinal.js',
  'src/ui/BattleAttackTimingFix.js',
];

const patterns = [
  /debug[^\n]{0,80}(?:hit|attack|impact|collision)[^\n]{0,80}(?:arc|ellipse|circle)/i,
  /(?:hit|attack|impact|collision)[^\n]{0,80}debug[^\n]{0,80}(?:arc|ellipse|circle)/i,
];

const offenders = [];
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const source = fs.readFileSync(file, 'utf8');
  for (const pattern of patterns) {
    if (pattern.test(source)) offenders.push(`${file}: ${pattern}`);
  }
}

assert.deepEqual(offenders, [], `debug hit/attack circles still present:\n${offenders.join('\n')}`);
console.log('PASS: no debug hit/attack circle markers remain in battle feedback paths');
