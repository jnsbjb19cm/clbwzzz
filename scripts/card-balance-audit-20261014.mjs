/**
 * 卡牌数值风险分析（2026-10-14 用户要求）
 *
 * 做法：用**游戏自己的公式**算，而不是我自己拍一个：
 *   · 攻击间隔 getAttackCooldown(atkSpeed)      ← src/battle/BattleConfig.js
 *   · 卡牌最终属性 calculateCardStats(card, 品质, 星级) ← src/battle/CardStatFormula.js
 * 指标（都按"每点费用"衡量，避免费用差异干扰）：
 *   · 血效  = 有效血量 / 费用
 *   · 攻效  = 有效DPS / 费用        （DPS = 攻击 / 冷却）
 *   · 综合  = (血效 × w1 + 攻效 × w2)     —— 权重写死在脚本顶部，可调
 * 然后**按品质档位分组**做 z-score（高/低 2σ 视为超模/偏弱），并单独列出"费用极低但数值高"的卡。
 *
 * 运行：node scripts/card-balance-audit-20261014.mjs
 */
import { readFileSync } from 'node:fs';

const W = { hp: 1, dps: 3 };   // 综合权重：1 点血效 ≈ 0.33 点攻效（可调）

const raw = JSON.parse(readFileSync('src/data/card.json', 'utf8'));
const list = Array.isArray(raw) ? raw : (raw.cards ?? []);
const { getAttackCooldown } = await import('../src/battle/BattleConfig.js');
const { calculateCardStats } = await import('../src/battle/CardStatFormula.js');

function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }

const rows = [];
for (const c of list) {
  const id = num(c.card_id);
  if (id >= 500) continue;                       // 技能卡不算"卡牌"
  if (num(c.show_card) !== 1) continue;          // 不可见的不参与
  const quality = Math.max(1, Math.min(6, num(c.card_quality, 1)));
  const cost = Math.max(1, num(c.cost_a, 1));
  const cd = getAttackCooldown(num(c.atk_speed, 0));
  // 用同一基准算（品质/星级影响只在品质间比较时才有意义 → 这里用"本体+默认品质")
  let stats;
  try { stats = calculateCardStats({ ...c, id, cost, quality }, quality, 0); } catch { stats = null; }
  const atk = num(stats?.atk ?? c.card_atk, 0);
  const hp = num(stats?.hp ?? c.card_hp, 0);
  const dps = atk > 0 && cd > 0 ? atk / cd : 0;
  rows.push({
    id, name: String(c.card_name ?? ''), quality, cost, atk, hp, dps, cd,
    atkStyle: num(c.atk_style), move: num(c.move_speed),
    hpEff: hp / cost, dpsEff: dps / cost,
    value: (hp / cost) * W.hp + (dps / cost) * W.dps,
    special: String(c.special_atk_effect ?? '').trim(),
  });
}

function statsOf(arr) {
  const xs = arr.map((r) => r.value);
  const mean = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, xs.length));
  return { mean, sd: sd || 1 };
}

console.log('样本:', rows.length, '张 | 权重:', JSON.stringify(W));
const out = [];
for (const q of [1, 2, 3, 4, 5, 6]) {
  const group = rows.filter((r) => r.quality === q);
  if (group.length < 3) continue;
  const { mean, sd } = statsOf(group);
  const sorted = [...group].sort((a, b) => b.value - a.value);
  console.log(`\n=== 品质 ${q}（${group.length} 张）平均综合值 ${mean.toFixed(2)} · σ ${sd.toFixed(2)} ===`);
  const hi = sorted.filter((r) => (r.value - mean) / sd >= 2);
  const lo = sorted.filter((r) => (mean - r.value) / sd >= 2);
  const show = (r) => `  #${r.id} ${r.name}（费${r.cost} 血${r.hp} 攻${r.atk} 冷却${r.cd.toFixed(1)}s 综合${r.value.toFixed(2)} z${((r.value - mean) / sd).toFixed(2)}）`;
  if (hi.length) { console.log('  ★ 超模(+2σ):'); hi.forEach((r) => console.log(show(r))); out.push(...hi.map((r) => ({ ...r, verdict: '超模' }))); }
  if (lo.length) { console.log('  ▽ 偏弱(-2σ):'); lo.forEach((r) => console.log(show(r))); out.push(...lo.map((r) => ({ ...r, verdict: '偏弱' }))); }
  if (!hi.length && !lo.length) console.log('  （本档无明显离群）');
  // 本档最贵/最便宜但较弱/较强的对照
  const cheapStrong = group.filter((r) => r.cost <= 2 && r.value > mean + sd * 0.8);
  if (cheapStrong.length) console.log('  ! 低费高危:', cheapStrong.map((r) => `#${r.id}${r.name}(费${r.cost})`).join(' '));
}

console.log('\n=== 带特殊效果的卡（定性风险，需人工确认）===');
console.log('  ' + rows.filter((r) => r.special).map((r) => `#${r.id}${r.name}`).join(' ') || '  （无）');

console.log('\n=== 全局：综合值最高 / 最低 各 8 张（跨品质仅作参考）===');
const byValue = [...rows].sort((a, b) => b.value - a.value);
for (const r of byValue.slice(0, 8)) console.log(`  高 #${r.id} ${r.name} 品质${r.quality} 费${r.cost} 血${r.hp} 攻${r.atk} 综合${r.value.toFixed(2)} ${r.special ? '★特' : ''}`);
for (const r of byValue.slice(-8)) console.log(`  低 #${r.id} ${r.name} 品质${r.quality} 费${r.cost} 血${r.hp} 攻${r.atk} 综合${r.value.toFixed(2)} ${r.special ? '★特' : ''}`);
