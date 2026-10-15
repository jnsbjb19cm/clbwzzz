/**
 * 生成《强化削弱后 · 全卡数值表》（2026-10-15 用户要求）
 *
 * 依据：d:\.丛林\强化削弱.md —— 第一轮方案
 *   品质倍率   2/3/4/5 → 1.00 / 1.08 / 1.20 / 1.40（已在 b7646f2 实装，本次不动）
 *   攻击成长   10% / 6% / 4%（+1~5 / +6~10 / +11~15，按原始属性加算，不复利）
 *   普通生命   7% / 5% / 2%
 *   防御生命   8% / 6% / 6%（真肉盾：0 攻且血 ≥60）
 *   固定攻击   6星+1、10星+2、12星+3、13星+4、14星起+5
 *   攻击公式   (A0 + R) × (P + GA)      ← 第一轮保留"固定奖励参与倍率"
 *   生命公式   H0 × (P + GH)
 *
 * 输出：docs/CARD-STATS-AFTER-NERF-20261015.md
 * 运行：node --experimental-loader ./scripts/verify-node-json-loader-20261007.mjs scripts/card-stats-after-nerf-20261015.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const OUT = 'docs/CARD-STATS-AFTER-NERF-20261015.md';
const raw = JSON.parse(readFileSync('src/data/card.json', 'utf8'));
const list = (Array.isArray(raw) ? raw : (raw.cards ?? [])).filter((c) => Number(c.show_card) === 1);
const { calculateCardStats } = await import('../src/battle/CardStatFormula.js');

const STAR_CAP = { 1: 4, 2: 7, 3: 10, 4: 13, 5: 15, 6: 15 };
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const f2 = (v) => (Math.round(v * 100) / 100).toFixed(2);

/* ---------- 削弱前的旧公式（用于对比 ✗） ---------- */
function oldGrowth(stars, early, late) {
  const q = Math.max(0, num(stars));
  return early * Math.min(5, q) + late * Math.max(0, q - 5);
}
function oldAttack(card, P, stars) {
  const base = num(card.card_atk);
  if (base <= 0) return 0;
  const q = Math.max(0, num(stars));
  const R = q >= 14 ? 6 : q >= 13 ? 5 : q >= 12 ? 4 : q >= 10 ? 3 : q >= 6 ? 1 : 0;
  return Math.round((base + R) * (P + oldGrowth(q, 0.08, 0.06)) * 100) / 100;
}
function oldHp(card, P, stars, defense) {
  const base = num(card.card_hp);
  const q = Math.max(0, num(stars));
  const V = defense ? oldGrowth(q, 0.16, 0.16) : 0;   // 旧逻辑：防御卡额外再加 0.08/星（这里用 0.16 近似旧表观收益）
  return Math.round(base * (P + (defense ? oldGrowth(q, 0.08, 0.06) : oldGrowth(q, 0.05, 0.04)) + 0.08 * V / 0.16) * 100) / 100;
}

const rows = [];
for (const c of list) {
  const id = num(c.card_id);
  const level = Math.max(1, Math.min(6, num(c.card_quality, 1)));
  const stars = STAR_CAP[level] ?? 15;
  const normal = calculateCardStats({ ...c, id }, 2, stars);
  const perfect = calculateCardStats({ ...c, id }, 5, stars);
  const oldNormal = { atk: oldAttack(c, 1.0, stars), hp: oldHp(c, 1.0, stars, false) };
  const oldPerfect = { atk: oldAttack(c, 1.4, stars), hp: oldHp(c, 1.4, stars, false) };
  rows.push({
    id, name: String(c.card_name ?? ''), level, stars,
    baseAtk: num(c.card_atk), baseHp: num(c.card_hp), cost: num(c.cost_a),
    nAtk: normal.atk, nHp: normal.hp, pAtk: perfect.atk, pHp: perfect.hp,
    oNAtk: oldNormal.atk, oNHp: oldNormal.hp, oPAtk: oldPerfect.atk, oPHp: oldPerfect.hp,
  });
}

const L = [];
L.push('# 强化削弱后 · 全卡数值表（2026-10-15）', '');
L.push('> 依据 `d:\\.丛林\\强化削弱.md` 第一轮方案生成；口径为**该卡原始等级对应的满星**、不含洗练/天赋/战斗光环。');
L.push('> 生成脚本：`scripts/card-stats-after-nerf-20261015.mjs`（可重跑）', '');
L.push('## 一、本轮采用的规则', '');
L.push('| 项目 | 数值 |');
L.push('|---|---|');
L.push('| 品质倍率 P | 普通 1.00 · 精良 1.08 · 优秀 1.20 · 完美 1.40 |');
L.push('| 攻击成长 GA | +1~5 每星 **10%** · +6~10 每星 **6%** · +11~15 每星 **4%**（按原始属性加算） |');
L.push('| 普通生命成长 | **7% / 5% / 2%** |');
L.push('| 防御生命成长 | **8% / 6% / 6%**（真肉盾：0 攻且血 ≥60） |');
L.push('| 固定攻击奖励 R | 6星 **+1** · 10星 **+2** · 12星 **+3** · 13星 **+4** · 14星起 **+5** |');
L.push('| 攻击公式 | **A = (A₀ + R) × (P + GA)**（第一轮保留固定奖励参与倍率） |');
L.push('| 生命公式 | **H = H₀ × (P + GH)** |');
L.push('| 部署冷却 | 最多 −2 秒，最低 6 秒（未改） |');
L.push('');
L.push('**各等级满星上限（本次只用于计算，硬上限尚未在代码里强制执行）**：1级 4星 · 2级 7星 · 3级 10星 · 4级 13星 · 5级(含6级) 15星');
L.push('');
L.push('## 二、全卡数值（按原始等级分组）', '');
L.push('> 「普通/完美」= 制作品质；「削弱前」为旧公式结果，用于看削弱幅度。');
L.push('');
const byLevel = new Map();
for (const r of rows) { if (!byLevel.has(r.level)) byLevel.set(r.level, []); byLevel.get(r.level).push(r); }
for (const lv of [...byLevel.keys()].sort((a, b) => a - b)) {
  const group = byLevel.get(lv).sort((a, b) => a.id - b.id);
  L.push(`### ${lv} 级卡（满星 ${group[0].stars} 星 · ${group.length} 张）`, '');
  L.push('| ID | 卡名 | 费用 | 基础攻 | 基础血 | 普通品质 攻/血 | 完美品质 攻/血 | 削弱前(普通) 攻/血 | 攻击变化 |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const r of group) {
    const delta = r.oNAtk > 0 ? `${((r.nAtk / r.oNAtk - 1) * 100).toFixed(0)}%` : '—';
    L.push(`| ${r.id} | ${r.name} | ${r.cost} | ${r.baseAtk} | ${r.baseHp} | ${f2(r.nAtk)} / ${f2(r.nHp)} | ${f2(r.pAtk)} / ${f2(r.pHp)} | ${f2(r.oNAtk)} / ${f2(r.oNHp)} | ${delta} |`);
  }
  L.push('');
}

const withAtk = rows.filter((r) => r.oNAtk > 0);
const avg = withAtk.length ? withAtk.reduce((a, r) => a + (r.nAtk / r.oNAtk - 1), 0) / withAtk.length : 0;
L.push('## 三、削弱幅度汇总', '');
L.push(`- 统计 ${withAtk.length} 张有攻击力的卡（按各自满星、普通品质对比）：**平均攻击变化 ${(avg * 100).toFixed(1)}%**`);
L.push('- 生命：普通单位改为 7/5/2%（原 5/4%），**低星更高、高星略低**；防御卡改为 8/6/6%（原含额外项）');
L.push('- 固定攻击奖励：10星 **+3→+2**、12星 **+4→+3**、13星 **+5→+4**、14星 **+6→+5**');
L.push('');
L.push('## 四、尚未实施（第二轮 / 待办）', '');
L.push('1. **星级硬上限**（4/7/10/13/15）—— 目前只是"按上限计算"，客户端与服务端**还没有强制校验**，需要补校验并处理已超上限的老玩家卡。');
L.push('2. **固定奖励不再参与倍率**（`A = A₀×(P+GA) + R`）—— 按需求留到第二轮，先看实战。');
L.push('3. 强化概率、材料消耗、分解返还等**本次未动**。');

mkdirSync('docs', { recursive: true });
writeFileSync(OUT, L.join('\n'), 'utf8');
console.log('已生成:', OUT);
console.log('  卡牌数:', rows.length, '| 分组:', [...byLevel.keys()].sort((a, b) => a - b).join('/'), '级');
console.log('  平均攻击变化:', (avg * 100).toFixed(1) + '%');
