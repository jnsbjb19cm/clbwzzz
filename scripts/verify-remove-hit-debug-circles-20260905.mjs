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

function stripComments(source) {
  return String(source)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const offenders = [];
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const source = stripComments(fs.readFileSync(file, 'utf8'));
  for (const pattern of patterns) {
    if (pattern.test(source)) offenders.push(`${file}: ${pattern}`);
  }
}

assert.deepEqual(
  offenders,
  [],
  `debug hit/attack circles still present in executable source:\n${offenders.join('\n')}`,
);

// Card feedback used to be the main source of synthetic HIT/deploy rings.
// Keep a direct structural guard against any Canvas circle/glow calls returning there.
const feedbackSource = stripComments(fs.readFileSync('src/ui/BattleCardFeedbackFinal.js', 'utf8'));
assert.doesNotMatch(feedbackSource, /ctx\.(?:arc|ellipse)\s*\(/, 'card feedback must not draw synthetic circular markers');
assert.doesNotMatch(feedbackSource, /createRadialGradient\s*\(/, 'card feedback must not draw synthetic radial hit/deploy glows');

console.log('PASS: no debug hit/attack circle markers remain in executable battle feedback paths');
