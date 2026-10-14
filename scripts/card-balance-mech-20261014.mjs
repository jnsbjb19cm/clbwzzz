/**
 * 机制加权版卡牌评估 + 强化/冷却方案模拟（2026-10-14 用户要求）
 *
 * 用户三点:
 *  ① 根据机制加血量，评估各类卡强弱（哪些超标/偏弱）
 *  ② 强化系统怎么改更好？（削弱倍率  vs  改成"加1/加2"这种小数值）
 *  ③ 如果动冷却，怎么变更好？
 *
 * 口径：
 *   本体属性   calculateCardStats(card, 品质, 星级)
 *   强化/品质  P + 0.08×Q（攻击）、防御 P+0.08Q+0.08V、普通血 P+0.05Q   ← src/core/constants.js
 *   冷却       getAttackCooldown(攻速档)                              ← src/battle/BattleConfig.js
 *   机制权重   MECH_TABLE（下，人工设定，可调）
 * 输出：docs/CARD-BALANCE-MECH-20261014.md
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const OUT = 'docs/CARD-BALANCE-MECH-20261014.md';
const raw = JSON.parse(readFileSync('src/data/card.json', 'utf8'));
const list = Array.isArray(raw) ? raw : (raw.cards ?? []);
const { getAttackCooldown } = await import('../src/battle/BattleConfig.js');
const { calculateCardStats } = await import('../src/battle/CardStatFormula.js');
const { CRAFT_QUALITY_MULT } = await import('../src/core/constants.js');

const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '—');

/* ---------------- 机制权重表（人工设定，可调） ----------------
 * ehp: 等效血量倍率（规避/续航/团队价值折算）
 * dps: 等效输出倍率（范围/多目标折算）
 */
const MECH_TABLE = {
  飞行: { ehp: 1.15, dps: 1.00, why: '地面近战难以处理' },
  钻地: { ehp: 1.10, dps: 1.00, why: '进场规避' },
  辅助: { ehp: 1.35, dps: 1.00, why: '价值在团队增益，本身不出输出' },
  召唤: { ehp: 1.30, dps: 1.20, why: '持续产出单位' },
  控制: { ehp: 1.25, dps: 1.15, why: '冰冻/眩晕/魅惑改变节奏' },
  范围: { ehp: 1.00, dps: 1.20, why: '多目标命中' },
  持续: { ehp: 1.10, dps: 1.20, why: 'DOT 叠伤' },
  治疗: { ehp: 1.30, dps: 1.00, why: '自身/团队续航' },
  死亡收益: { ehp: 1.15, dps: 1.10, why: '死亡/自爆生效' },
  薄血射手: { ehp: 0.85, dps: 1.05, why: '射程换血，但易被范围清' },
};
const MECH_BY_ID = {
  // 机制分类（按 id 人工归类，可增删）
  18: ['范围'], 70: ['范围'], 106: ['范围'], 72: ['范围'], 104: ['范围'], 100: ['范围'],
  66: ['召唤'], 93: ['召唤'], 20: ['召唤'], 34: ['召唤'], 46: ['召唤'],
  53: ['控制'], 77: ['控制'], 17: ['控制'], 54: ['控制'], 75: ['持续'], 58: ['持续', '范围'],
  56: ['持续', '范围'], 38: ['控制'], 51: ['控制'], 73: ['控制'], 105: ['控制'],
  107: ['治疗'], 109: ['治疗', '死亡收益'], 22: ['治疗'], 36: ['治疗'],
  15: ['死亡收益'], 52: ['死亡收益'], 61: ['死亡收益'], 2: ['辅助'], 68: ['辅助'],
  19: ['辅助'], 32: ['辅助'], 26: ['辅助'], 39: ['辅助'], 24: ['辅助'],
  1: ['薄血射手'], 4: ['薄血射手'], 25: ['薄血射手'], 84: ['薄血射手'], 91: ['薄血射手'],
  12: ['飞行'], 40: ['飞行'], 45: ['飞行'], 41: ['钻地'], 43: ['钻地'],
};
function mechsOf(id, viewType) {
  const out = new Set(MECH_BY_ID[Number(id)] ?? []);
  if (num(viewType) === 6) out.add('飞行');
  if (num(viewType) === 7) out.add('钻地');
  return [...out];
}
function mechMult(mechs, key) {
  let m = 1;
  for (const k of mechs) m *= (MECH_TABLE[k]?.[key] ?? 1);
  return m;
}

/* ---------------- 强化方案模拟 ---------------- */
const STRENGTH_OPTIONS = [
  { key: 'A 现状', desc: '每星 +8% 倍率（攻击）/ +5% 血（普通）/ +8% 血（防御）', mult: (P, Q, def) => P + 0.08 * Q, hp: (P, Q, def) => (def ? P + 0.08 * Q + 0.08 * Q : P + 0.05 * Q) },
  { key: 'B 减半', desc: '每星 +4% 倍率 / +2.5% 血（防御 +4%）', mult: (P, Q) => P + 0.04 * Q, hp: (P, Q, def) => (def ? P + 0.04 * Q + 0.04 * Q : P + 0.025 * Q) },
  { key: 'C 递减', desc: '8% 递减：+0.08Q / (1 + Q/10)，15 星约 +48%', mult: (P, Q) => P + (0.08 * Q) / (1 + Q / 10), hp: (P, Q, def) => P + ((def ? 0.08 : 0.05) * Q) / (1 + Q / 10) },
  { key: 'D 封顶', desc: '每星 8% 但总计封顶 +60%', mult: (P, Q) => P + Math.min(0.08 * Q, 0.6), hp: (P, Q, def) => P + Math.min((def ? 0.08 : 0.05) * Q, def ? 0.6 : 0.45) },
  { key: 'E 小数值', desc: '改成固定加值：攻击 +1/星、血 +4/星（用户提到的那种）', flat: { atk: 1, hp: 4 } },
];

/* ---------------- 冷却方案 ---------------- */
const CD_CURRENT = { 0: 99, 1: 8.6, 2: 5.0, 3: 4.2, 4: 3.8, 5: 3.5, 6: 3.0, top: 2.0 };
const CD_SMOOTH = { 0: 99, 1: 7.2, 2: 5.4, 3: 4.5, 4: 3.9, 5: 3.4, 6: 2.9, top: 2.5 };

const rows = [];
for (const c of list) {
  const id = num(c.card_id);
  if (id >= 500 || num(c.show_card) !== 1) continue;
  const quality = Math.max(1, Math.min(6, num(c.card_quality, 1)));
  const cost = Math.max(1, num(c.cost_a, 1));
  const viewType = num(c.card_view_type);
  const cd = getAttackCooldown(num(c.atk_speed, 0));
  let st = null;
  try { st = calculateCardStats({ ...c, id, cost, quality }, quality, 0); } catch { st = null; }
  const hp = num(st?.hp ?? c.card_hp, 0);
  const atk = num(st?.atk ?? c.card_atk, 0);
  const mechs = mechsOf(id, viewType);
  const ehpMult = mechMult(mechs, 'ehp');
  const dpsMult = mechMult(mechs, 'dps');
  const dps = atk > 0 && cd < 90 ? atk / cd : 0;
  rows.push({ id, name: String(c.card_name ?? ''), quality, cost, hp, atk, cd, dps, mechs, ehpMult, dpsMult,
    ehp: hp * ehpMult, edps: dps * dpsMult,
    ehpEff: (hp * ehpMult) / cost, edpsEff: (dps * dpsMult) / cost,
    value: ((hp * ehpMult) / cost) * 1 + ((dps * dpsMult) / cost) * 3 });
}

function stat(xs) {
  if (!xs.length) return { mean: 0, sd: 1 };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length) || 1;
  return { mean, sd };
}
const byQ = new Map();
for (const r of rows) { if (!byQ.has(r.quality)) byQ.set(r.quality, []); byQ.get(r.quality).push(r); }
for (const [, g] of byQ) { const { mean, sd } = stat(g.map((r) => r.value)); for (const r of g) r.z = (r.value - mean) / sd; }

const L = [];
L.push('# 机制加权版卡牌评估 + 强化 / 冷却方案模拟（2026-10-14）', '');
L.push('> 由 `scripts/card-balance-mech-20261014.mjs` 生成。机制权重是**人工设定**，可调（脚本顶部 `MECH_TABLE`）。', '');
L.push('## 1. 机制权重表', '');
L.push('| 机制 | 等效血量 | 等效输出 | 理由 |');
L.push('|---|---|---|---|');
for (const [k, v] of Object.entries(MECH_TABLE)) L.push(`| ${k} | ×${v.ehp} | ×${v.dps} | ${v.why} |`);
L.push('');
L.push('## 2. 机制加权后的档位基准', '');
L.push('| 品质 | 张数 | 综合值均值 | σ | 每费等效血中位 | 每费等效秒伤中位 |');
L.push('|---|---|---|---|---|---|');
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0; };
for (const q of [...byQ.keys()].sort((a, b) => a - b)) {
  const g = byQ.get(q); const s = stat(g.map((r) => r.value));
  L.push(`| ${q} | ${g.length} | ${f2(s.mean)} | ${f2(s.sd)} | ${f2(med(g.map((r) => r.ehpEff)))} | ${f2(med(g.map((r) => r.edpsEff)))} |`);
}
L.push('');
L.push('## 3. 机制加权后的超标 / 偏弱', '');
const sorted = [...rows].sort((a, b) => b.z - a.z);
L.push('### 超标（z ≥ 1.5）', '');
for (const r of sorted.filter((r) => r.z >= 1.5)) {
  L.push(`- **#${r.id} ${r.name}**（品质${r.quality} 费${r.cost} 血${f2(r.hp)}→等效${f2(r.ehp)} 秒伤${f2(r.dps)}→等效${f2(r.edps)} z${f2(r.z)}）机制：${r.mechs.join('、') || '—'}`);
}
L.push('');
L.push('### 偏弱（z ≤ -1）', '');
for (const r of sorted.filter((r) => r.z <= -1)) {
  L.push(`- **#${r.id} ${r.name}**（品质${r.quality} 费${r.cost} 血${f2(r.hp)}→等效${f2(r.ehp)} 秒伤${f2(r.dps)}→等效${f2(r.edps)} z${f2(r.z)}）机制：${r.mechs.join('、') || '—'}`);
}
L.push('');
L.push('## 4. 强化系统方案对比（15 星满级时）', '');
L.push('| 方案 | 说明 | 攻击倍率(Q=15) | 相对 +0 星提升 | 普通卡血倍率 | 防御卡血倍率 | 风险 |');
L.push('|---|---|---|---|---|---|---|');
const P2 = num(CRAFT_QUALITY_MULT?.[2], 1.2); const P5 = num(CRAFT_QUALITY_MULT?.[5], 1.8);
for (const opt of STRENGTH_OPTIONS) {
  const atkQ15 = opt.flat ? null : opt.mult(P5, 15, false);
  const hpN = opt.flat ? null : opt.hp(P5, 15, false);
  const hpD = opt.flat ? null : opt.hp(P5, 15, true);
  const gain = atkQ15 ? ((atkQ15 / P5 - 1) * 100).toFixed(0) + '%' : '按加值（见下）';
  const risk = opt.flat
    ? '对高攻卡几乎无感、对低攻卡过强（如 4 攻卡 +15 = +375%）→ **不推荐**'
    : (opt.key.startsWith('A') ? '满强化提升过大（攻击 +' + gain + '）' : '较平缓');
  L.push(`| ${opt.key} | ${opt.desc} | ${atkQ15 ? f2(atkQ15) : '—'} | ${gain} | ${hpN ? f2(hpN) : '—'} | ${hpD ? f2(hpD) : '—'} | ${risk} |`);
}
L.push('');
L.push('## 5. 冷却方案对比', '');
L.push('| 攻速档 | 现行(s) | 平滑后(s) | 现行DPS系数 | 平滑DPS系数 | 说明 |');
L.push('|---|---|---|---|---|---|');
const base = CD_CURRENT[1];
for (const k of [1, 2, 3, 4, 5, 6]) {
  L.push(`| ${k} | ${CD_CURRENT[k]} | ${CD_SMOOTH[k]} | ${f2(base / CD_CURRENT[k])}× | ${f2(base / CD_SMOOTH[k])}× | 平滑后相邻档差更小 |`);
}
L.push(`| ≥6(特殊) | ${CD_CURRENT.top} | ${CD_SMOOTH.top} | ${f2(base / CD_CURRENT.top)}× | ${f2(base / CD_SMOOTH.top)}× | 现行 3.0→2.0 是 −33% 断崖，平滑后为 −14% |`);
L.push('');
L.push('## 6. 结论与建议', '');
L.push('### 6.1 机制加权后谁超标 / 谁偏弱', '');
const top5 = sorted.slice(0, 5); const bot5 = sorted.slice(-5).reverse();
L.push('机制加权**最强 5 张**：' + top5.map((r) => `#${r.id}${r.name}(z${f2(r.z)})`).join('、'));
L.push('');
L.push('机制加权**最弱 5 张**：' + bot5.map((r) => `#${r.id}${r.name}(z${f2(r.z)})`).join('、'));
L.push('');
L.push('### 6.2 强化系统', '');
L.push('- **不要改成"加 1/加 2"这种固定加值**：高攻卡（如 750 攻）几乎无感，低攻卡（4 攻）却会翻几倍，**会直接把平衡打散**。');
L.push('- 推荐 **D 封顶**（保留 8%/星的手感，但总计封顶 +60%）或 **C 递减**（前 5 星提升明显，后 10 星放缓），两者都能"削弱上限而不砍手感"。');
L.push('- 若必须简单：**B 减半（4%/星）** 是最小改动，满级攻击从 +120% 降到 +60%。');
L.push('### 6.3 冷却', '');
L.push('- 现行表最大问题是 **3.0 → 2.0 的断崖（−33%）**，以及 **8.6 与 5.0 之间差 42%**；');
L.push('- 建议改用**平滑表**（7.2 / 5.4 / 4.5 / 3.9 / 3.4 / 2.9 / 特殊 2.5），相邻档差控制在 15%~25%，');
L.push('- 同时把 `Math.max(6, ...)` 的**冷却下限**与新表一起检查（避免高星缩减后所有卡都压到同一档）。');

mkdirSync('docs', { recursive: true });
writeFileSync(OUT, L.join('\n'), 'utf8');
console.log('已生成:', OUT);
console.log('  · 卡牌:', rows.length, '| 超标(z≥1.5):', sorted.filter((r) => r.z >= 1.5).length, '张 | 偏弱(z≤-1):', sorted.filter((r) => r.z <= -1).length, '张');
console.log('  · 品质倍率 P:', JSON.stringify(CRAFT_QUALITY_MULT));
console.log('  · 最强5:', top5.map((r) => '#' + r.id + r.name).join(' '));
console.log('  · 最弱5:', bot5.map((r) => '#' + r.id + r.name).join(' '));
