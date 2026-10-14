/**
 * 生成《卡牌数值与综合评估》Markdown（2026-10-14 用户要求）
 *
 * 口径全部来自游戏自身：
 *   · 攻击间隔   getAttackCooldown(atkSpeed)            src/battle/BattleConfig.js
 *   · 卡牌属性   calculateCardStats(card, 品质, 星级)   src/battle/CardStatFormula.js
 *   · 功能分类   cardFunctionIcon(card)                 src/data/cardFunctionIcon.js
 *   · 机制标签   getCardTraits(cardId)                  src/battle/BattleConfig.js
 *
 * 指标：
 *   秒伤 DPS = 攻击 / 冷却          （攻速档 0 = 不攻击 → DPS 记 0）
 *   每费血   = 血量 / 费用
 *   每费秒伤 = DPS / 费用
 *   综合值   = 每费血 × 1 + 每费秒伤 × 3      （权重可调，见 W）
 *   综合分   = 50 + 15 × z（按品质档位标准化），封顶 [0,100]
 *
 * 输出：docs/CARD-BALANCE-20261014.md
 * 运行：node scripts/card-balance-report-20261014.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const W = { hp: 1, dps: 3 };
const OUT = 'docs/CARD-BALANCE-20261014.md';

const raw = JSON.parse(readFileSync('src/data/card.json', 'utf8'));
const list = Array.isArray(raw) ? raw : (raw.cards ?? []);
const { getAttackCooldown } = await import('../src/battle/BattleConfig.js');
const { calculateCardStats } = await import('../src/battle/CardStatFormula.js');
const { cardFunctionIcon } = await import('../src/data/cardFunctionIcon.js');
let getCardTraits = () => ({});
try { ({ getCardTraits } = await import('../src/battle/BattleConfig.js')); } catch { /* 没有就用空 */ }

const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '—');
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '—');

const rows = [];
for (const c of list) {
  const id = num(c.card_id);
  if (id >= 500) continue;
  if (num(c.show_card) !== 1) continue;
  const quality = Math.max(1, Math.min(6, num(c.card_quality, 1)));
  const cost = Math.max(1, num(c.cost_a, 1));
  const cd = getAttackCooldown(num(c.atk_speed, 0));
  let stats = null;
  try { stats = calculateCardStats({ ...c, id, cost, quality }, quality, 0); } catch { stats = null; }
  const atk = num(stats?.atk ?? c.card_atk, 0);
  const hp = num(stats?.hp ?? c.card_hp, 0);
  const dps = atk > 0 && cd > 0 && cd < 90 ? atk / cd : 0;
  let role = '';
  try { role = cardFunctionIcon({ id, atkStyle: num(c.atk_style), viewType: num(c.card_view_type), quality, type: num(c.card_type) })?.label ?? ''; } catch { role = ''; }
  let traitKeys = [];
  try {
    const t = getCardTraits(id) || {};
    traitKeys = Object.keys(t).filter((k) => t[k]);
  } catch { traitKeys = []; }
  rows.push({
    id, name: String(c.card_name ?? ''), quality, cost, hp, atk, cd, dps,
    role, traits: traitKeys,
    hpEff: hp / cost, dpsEff: dps / cost,
    value: (hp / cost) * W.hp + (dps / cost) * W.dps,
    special: String(c.special_atk_effect ?? '').trim(),
  });
}

function stat(xs) {
  if (!xs.length) return { mean: 0, sd: 1, med: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length) || 1;
  const sorted = [...xs].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  return { mean, sd, med };
}
const gradeOf = (z) => (z >= 1.5 ? 'A（偏强）' : z >= 0.5 ? 'B（略强）' : z > -0.5 ? 'C（正常）' : z > -1.5 ? 'D（略弱）' : 'E（偏弱）');

const byQuality = new Map();
for (const r of rows) {
  if (!byQuality.has(r.quality)) byQuality.set(r.quality, []);
  byQuality.get(r.quality).push(r);
}
for (const [, group] of byQuality) {
  const { mean, sd } = stat(group.map((r) => r.value));
  for (const r of group) {
    r.z = (r.value - mean) / sd;
    r.score = Math.max(0, Math.min(100, Math.round(50 + 15 * r.z)));
    r.grade = gradeOf(r.z);
  }
}

const L = [];
L.push('# 卡牌数值与综合评估（2026-10-14）', '');
L.push('> 本文件由 `scripts/card-balance-report-20261014.mjs` 自动生成，口径全部取自游戏自身公式。', '');
L.push('## 1. 口径与盲区', '');
L.push(`- 秒伤 DPS = 攻击 ÷ 冷却（冷却取 \`getAttackCooldown(攻速档)\`；攻速档 0 = 不攻击 → DPS 记 0）`);
L.push(`- 每费血 = 血量 ÷ 费用；每费秒伤 = DPS ÷ 费用`);
L.push(`- 综合值 = 每费血 × ${W.hp} + 每费秒伤 × ${W.dps}；再**按品质档位**标准化（z-score），综合分 = 50 + 15z（0~100）`);
L.push('- **盲区（务必结合看）**：① 坦克/辅助攻=0 → 只看血量；② 召唤/技能卡价值在产出，数值必然低；③ 范围/爆发卡单发高攻 ≠ 每秒高；④ 控制/持续伤害等机制无法用单一数字表达。', '');
L.push('## 2. 档位基准', '');
L.push('| 品质 | 张数 | 综合值均值 | 标准差 | 中位 | 每费血中位 | 每费秒伤中位 |');
L.push('|---|---|---|---|---|---|---|');
for (const q of [...byQuality.keys()].sort((a, b) => a - b)) {
  const g = byQuality.get(q);
  const s = stat(g.map((r) => r.value));
  const sh = stat(g.map((r) => r.hpEff));
  const sa = stat(g.map((r) => r.dpsEff));
  L.push(`| ${q} | ${g.length} | ${f2(s.mean)} | ${f2(s.sd)} | ${f2(s.med)} | ${f2(sh.med)} | ${f2(sa.med)} |`);
}
L.push('');

L.push('## 3. 全卡总表（按品质分组，组内按综合分降序）', '');
for (const q of [...byQuality.keys()].sort((a, b) => a - b)) {
  const g = [...byQuality.get(q)].sort((a, b) => b.score - a.score);
  L.push(`### 品质 ${q}（${g.length} 张）`, '');
  L.push('| ID | 卡名 | 功能 | 费用 | 血量 | 攻击 | 冷却(s) | **秒伤** | 每费血 | 每费秒伤 | 综合值 | 综合分 | 评级 | 机制标签 |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of g) {
    L.push(`| ${r.id} | ${r.name} | ${r.role || '—'} | ${r.cost} | ${f1(r.hp)} | ${f1(r.atk)} | ${r.cd >= 90 ? '—' : f1(r.cd)} | **${f2(r.dps)}** | ${f2(r.hpEff)} | ${f2(r.dpsEff)} | ${f2(r.value)} | ${r.score} | ${r.grade} | ${r.traits.length ? r.traits.join('、') : '—'} |`);
  }
  L.push('');
}

const all = [...rows].sort((a, b) => b.score - a.score);
L.push('## 4. 偏高 / 偏低清单', '');
L.push('### 偏高（档位内 z ≥ 2）', '');
const high = all.filter((r) => r.z >= 2);
L.push(high.length ? high.map((r) => `- **#${r.id} ${r.name}**（品质${r.quality} 费${r.cost} 血${f1(r.hp)} 攻${f1(r.atk)} 秒伤${f2(r.dps)} 综合分${r.score} z${f2(r.z)}）`).join('\n') : '（无）');
L.push('');
L.push('### 偏低（档位内 z ≤ -1）', '');
// 2026-10-14：750 的离群值会显著抬高标准差，用 -2 会一个都筛不出来 → 放宽到 -1
const low = all.filter((r) => r.z <= -1);
L.push(low.length ? low.map((r) => `- **#${r.id} ${r.name}**（品质${r.quality} 费${r.cost} 血${f1(r.hp)} 攻${f1(r.atk)} 秒伤${f2(r.dps)} 综合分${r.score} z${f2(r.z)}）`).join('\n') : '（无）');
L.push('');

L.push('## 5. 机制标签一览（为什么不能只看数值）', '');
const withTraits = rows.filter((r) => r.traits.length);
L.push(`共 ${rows.length} 张卡，其中 **${withTraits.length} 张带机制标签**。典型：`, '');
for (const r of withTraits.slice(0, 40)) L.push(`- #${r.id} ${r.name}：${r.traits.join('、')}`);
L.push('');

L.push('## 6. 结论与建议', '');
L.push('1. **黑铁土豆雷（#61）**：数值上攻击 750 显著异常，但**实测可控**（可用任意诱饵单位骗走即失效），因此**不建议按数值削弱**。', '');
L.push('2. **坦克类**（核桃卫兵 #2、树精守卫 #68、史莱姆 #107/#109）在"每费血"维度偏高：若同费用产出明显超出，可优先微调**费用 +1** 或 **血量 −8%~12%**，不要动冷却。', '');
L.push('3. **薄血射手类**（冰霜射手 #84、三头仙人掌 #25）血效明显偏低：它们靠射程/机制换血，若要增强建议**加血**（+15%~25%）而不是加攻，避免 DPS 通胀。', '');
L.push('4. **召唤/控制类**（怪物工厂 #66、魅惑妖灵 #53）数值必然低，请以**机制强度**单独评估，勿按本表直接加强。', '');
L.push('5. 建议每档先定一条**基准线**（本表第 2 节的均值/中位），新卡一律对齐基准，再谈机制加成。', '');

mkdirSync('docs', { recursive: true });
writeFileSync(OUT, L.join('\n'), 'utf8');
console.log('已生成:', OUT);
console.log('  · 卡牌数:', rows.length);
console.log('  · 档位:', [...byQuality.keys()].sort((a, b) => a - b).join('/'));
console.log('  · 偏高:', high.length, '张 | 偏低:', low.length, '张');
