import { getAttackCooldown, getMoveColPerSec } from '../battle/BattleConfig.js';
import './CardRadar.css';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = value => Math.max(0, Number(value) || 0);
const fmt = value => Number(value.toFixed(2)).toString();
export const RADAR_AXES = ['攻击', '生命', '普攻频率', '移动', '部署速度', '费用效率'];

export function radarValues(card) {
  const attack = num(card.atk);
  const interval = Number(card.id) === 126 ? 10 : getAttackCooldown(card.atkSpeed);
  return [attack, num(card.hp), attack > 0 && num(card.atkSpeed) > 0 && Number(card.atkStyle) !== 9 ? 1 / interval : 0,
    getMoveColPerSec(num(card.moveSpeed)), 1 / Math.max(6, num(card.cooldown)), 1 / Math.max(1, num(card.cost))];
}

// A fixed catalogue-wide scale: selecting another card cannot change either card's score.
export function radarScale(cards) {
  return RADAR_AXES.map((_, axis) => Math.max(.0001, ...cards.map(card => radarValues(card)[axis])));
}
export function radarScores(card, scale) {
  return radarValues(card).map((value, axis) => {
    // Single-use explosive cards reach 750 ATK; linear scaling hides ordinary
    // 4–20 ATK cards inside the centre stroke. Keep one catalogue-wide scale,
    // but compress the attack axis logarithmically. Zero remains exactly zero.
    const ratio = axis === 0 ? Math.log1p(value) / Math.log1p(scale[axis]) : value / scale[axis];
    return Math.max(0, Math.min(100, ratio * 100));
  });
}
const point = (axis, radius) => {
  const angle = -Math.PI / 2 + axis * Math.PI / 3;
  return [160 + Math.cos(angle) * radius, 132 + Math.sin(angle) * radius];
};
const polygon = scores => scores.map((score, axis) => point(axis, 83 * score / 100).join(',')).join(' ');

export function renderCardRadar(card, other, cards) {
  const scale = radarScale(cards);
  const series = [card, other].filter(Boolean);
  const rawRows = current => {
    const v = radarValues(current);
    return [fmt(v[0]), fmt(v[1]), v[2] ? `${fmt(1 / v[2])} 秒/次` : '无普攻', `${fmt(v[3])} 格/秒`, `${Math.max(6,num(current.cooldown))} 秒`, `${num(current.cost)}`];
  };
  const rows = series.map(rawRows);
  return `<section class="card-radar" aria-label="卡牌属性对比">
    <header><h3>属性维度</h3><span>基础属性 · 未强化</span></header>
    <label class="card-radar-picker">对比卡牌<select data-radar-compare aria-label="选择对比卡牌"><option value="">不对比</option>${cards.filter(c => c.id !== card.id).map(c => `<option value="${Number(c.id)}" ${other?.id === c.id ? 'selected' : ''}>${esc(c.name)} · ${c.quality}级</option>`).join('')}</select></label>
    <div class="card-radar-legend">${series.map((c,i)=>`<span class="series-${i}">${i ? 'B' : 'A'} · ${esc(c.name)}</span>`).join('')}</div>
    <svg viewBox="0 0 320 270" role="img" aria-label="${esc(series.map(c=>c.name).join('与'))}的六维属性雷达图，下方表格提供数值">
      ${[25,50,75,100].map(n=>`<polygon class="radar-grid" points="${polygon(Array(6).fill(n))}"/>`).join('')}
      ${RADAR_AXES.map((label,i)=>{const p=point(i,83),t=point(i,111);return `<line class="radar-axis" x1="160" y1="132" x2="${p[0]}" y2="${p[1]}"/><text x="${t[0]}" y="${t[1]}" text-anchor="middle" dominant-baseline="middle">${label}</text>`;}).join('')}
      ${series.map((c,i)=>`<polygon class="radar-series series-${i}" points="${polygon(radarScores(c,scale))}"/>`).join('')}
      ${series.map((c,i)=>{const p=point(0,83*radarScores(c,scale)[0]/100);return `<circle class="radar-attack-point series-${i}" cx="${p[0]}" cy="${p[1]}" r="3"><title>${esc(c.name)} · 攻击 ${fmt(radarValues(c)[0])}</title></circle>`;}).join('')}
    </svg>
    <table><caption>基础数值对照</caption><thead><tr><th>属性</th>${series.map((c,i)=>`<th class="series-${i}" title="${esc(c.name)}">${i?'B':'A'}</th>`).join('')}</tr></thead><tbody>
      ${['攻击','生命','普攻间隔','移速','部署冷却','费用'].map((label,i)=>`<tr><th>${label}</th>${rows.map(row=>`<td>${row[i]}</td>`).join('')}</tr>`).join('')}
    </tbody></table>
    <p class="card-radar-note">全图鉴固定尺度，向外表示该维度更高；攻击轴采用对数刻度，避免高伤害爆破卡挤没普通卡的攻击显示，真实数值见上表。冷却越短、费用越低越靠外。无强化、洗练和天赋加成；不计治疗、群攻及特殊技能，面积不代表总战力。</p>
  </section>`;
}
