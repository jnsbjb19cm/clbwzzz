import { readFileSync } from 'node:fs';
const cards = JSON.parse(readFileSync('src/data/card.json', 'utf8'));
const list = (Array.isArray(cards) ? cards : (cards.cards ?? [])).filter((c) => Number(c.show_card) === 1 && Number(c.card_id) < 500);
const NEED = ['default'];
const bad = [];
for (const c of list) {
  const res = String(Number(c.res));
  let meta = null;
  try { meta = JSON.parse(readFileSync(`assets/sprites/unit_anim/${res}.json`, 'utf8')); } catch { bad.push(`#${c.card_id} ${c.card_name}: 无动画包`); continue; }
  const anims = meta.animations ?? {};
  const keys = Object.keys(anims).filter((k) => anims[k]?.frames?.length);
  const atk = Number(c.atk_style);
  const problems = [];
  if (!keys.includes('default')) problems.push('缺 default');
  // 会攻击的卡（攻>0 且有攻速档）应有 attacking 或 attacking_XX
  if (Number(c.card_atk) > 0 && Number(c.atk_speed) > 0) {
    const hasAtk = keys.some((k) => k === 'attacking' || k.startsWith('attacking_') || k.startsWith('attack_'));
    if (!hasAtk) problems.push(`缺 attacking（有攻击力 ${c.card_atk} / 攻速档 ${c.atk_speed}）`);
  }
  // 会移动的卡应有 moving 或 default（代码允许移动用 default）
  if (Number(c.move_speed) > 0 && !keys.includes('moving') && !keys.includes('default')) problems.push('缺 moving');
  // 远程/对空/弱对空：检查弹道相关（bullet 包已确认都有）
  if (problems.length) bad.push(`#${c.card_id} ${c.card_name}(res ${res}, 攻${atk}): ${problems.join('、')}  [现有状态: ${keys.join(',')}]`);
}
console.log(`检查 ${list.length} 张卡的动画状态，问题 ${bad.length} 条:`);
for (const b of bad) console.log('  ' + b);
// 顺带统计：有多少卡的 attacking 是"多套（按血量）"
let multi = 0; let single = 0; let none = 0;
for (const c of list) {
  const res = String(Number(c.res));
  try {
    const meta = JSON.parse(readFileSync(`assets/sprites/unit_anim/${res}.json`, 'utf8'));
    const keys = Object.keys(meta.animations ?? {}).filter((k) => k.startsWith('attacking'));
    if (keys.length > 1) multi += 1; else if (keys.length === 1) single += 1; else none += 1;
  } catch { /* 忽略 */ }
}
console.log(`\n攻击动画套数统计: 单套 ${single} 张 | 多套(按血量切换) ${multi} 张 | 无 ${none} 张`);
