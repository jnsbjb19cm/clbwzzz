import { calculateCardStats, normalizeBattleCraftQuality } from '../battle/CardStatFormula.js';
import { COLS, LANES, roundBattleAmount } from '../battle/BattleConfig.js';
import { resolveCraftQuality } from '../core/constants.js';

const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const number = value => String(roundBattleAmount(Number(value) || 0));
const text = (value, className = '') => `<span class="${className}">${escape(value)}</span>`;

// Read-only preview: same formula and talent rounding as BattleUnit/deploy.
export function battleHandPreview(view, index) {
  const engine = view.engine, entry = engine?.deck?.[index];
  if (!entry) return null;
  const { card, instance } = entry;
  const quality = normalizeBattleCraftQuality(instance?.craftQuality);
  const base = calculateCardStats(card, quality, 0);
  const stats = calculateCardStats(card, quality, instance?.star ?? instance?.strengthLv ?? 0);
  let atk = roundBattleAmount(stats.atk), hp = Math.max(1, roundBattleAmount(stats.hp));
  const bonus = engine.talentBonus ?? {};
  if (bonus.atkPct > 0) atk = roundBattleAmount(atk * (1 + bonus.atkPct / 100));
  if (bonus.hpPct > 0) hp = roundBattleAmount(hp + roundBattleAmount(hp * bonus.hpPct / 100));
  let status = '可放置', ready = false;
  const cost = engine.getDeployCost(card);
  if (view.pvp?.spectator) status = '观战中，不能放置';
  else if (engine.status !== 'playing') status = '战斗已结束';
  else if ((engine.resetHeroLockedUntil?.player ?? 0) > engine.time) status = '海妖之声生效中：不能出牌';
  else if (!engine.trainingMode && engine.sunlight < cost.sun) status = '没有足够的阳光';
  else if (!engine.trainingMode && engine.food < cost.food) status = '没有足够的食物';
  else if (!engine.trainingMode && engine.cooldowns[index] > 0) status = `冷却中，剩余${Math.ceil(engine.cooldowns[index])}秒`;
  else {
    // Consult final installed placement rules, including PVP and sentinel restrictions.
    const previousError = engine.lastDeployError;
    try {
      for (let lane = 0; lane < LANES && !ready; lane++) {
        for (let col = 0; col < COLS && !ready; col++) ready = engine.canDeploy(lane, col, index, {silent:true});
      }
    } finally { engine.lastDeployError = previousError; }
    if (!ready) status = Number(card.id) === 38 ? '没有可放置的敌方目标' : '当前没有可放置的位置';
  }
  return {card, quality, base, atk, hp, cooldown:stats.cd, status, ready};
}

function markup(preview, index) {
  const {card, quality, base, atk, hp, cooldown, status, ready} = preview;
  const delta = value => value ? text(value > 0 ? `(+${number(value)})` : number(value), 'hand-tip-bonus') : '';
  const attribute = (label, original, actual) => `<div class="hand-tip-stat">${text(`${label}:${number(original)}`)}${delta(roundBattleAmount(actual - original))}</div>`;
  const traitLines = Array.from(`特技:${card.trait || card.desc || '暂无'}`).reduce((lines, ch, i) => {
    if (i % 22 === 0) lines.push(''); lines[lines.length - 1] += ch; return lines;
  }, []);
  return `<div>${text(`快捷键:${(index + 1) % 10}`)}</div>
    <div style="color:${escape(resolveCraftQuality(quality).color)}">${text(`${card.name}[${card.quality}级卡]`)}</div>
    ${attribute('攻击', roundBattleAmount(base.atk), atk)}
    ${attribute('生命', Math.max(1, roundBattleAmount(base.hp)), hp)}
    <div class="hand-tip-stat">${text(`冷却时间:${number(base.cd)}秒`)}${delta(roundBattleAmount(cooldown - base.cd))}</div>
    <div class="hand-tip-trait">${traitLines.map(line => text(line)).join('<br>')}</div>
    <div class="hand-tip-status ${ready ? 'ready' : 'blocked'}">${text(status)}</div>`;
}

export function bindBattleHandTooltip(view, hand) {
  if (hand.__battleTooltipBound) return;
  hand.__battleTooltipBound = true;
  let active = null, tip = null, timer = null, lastMarkup = '', savedTitle = '';
  const hide = () => {
    clearInterval(timer); timer = null;
    if (active) {
      active.removeAttribute('aria-describedby');
      if (savedTitle) active.title = savedTitle;
    }
    tip?.remove(); tip = null; active = null; lastMarkup = '';
  };
  const position = () => {
    const rect = active.getBoundingClientRect();
    tip.style.left = `${Math.max(6, Math.min(rect.left, innerWidth - tip.offsetWidth - 6))}px`;
    tip.style.top = `${Math.max(6, Math.min(rect.bottom + 5, innerHeight - tip.offsetHeight - 6))}px`;
  };
  const update = () => {
    if (!hand.isConnected || !active?.isConnected || !view.engine) return hide();
    const preview = battleHandPreview(view, Number(active.dataset.handIdx));
    if (!preview) return hide();
    active.removeAttribute('title');
    const html = markup(preview, Number(active.dataset.handIdx));
    if (html !== lastMarkup) {
      lastMarkup = html; tip.innerHTML = html;
      position();
    }
    position();
  };
  const show = element => {
    if (!element || element === active) return;
    hide(); active = element; savedTitle = active.title;
    tip = document.createElement('div'); tip.className = 'battle-hand-tooltip';
    tip.id = 'battle-hand-reference-tooltip'; tip.setAttribute('role', 'tooltip');
    active.setAttribute('aria-describedby', tip.id); document.body.append(tip);
    update(); if (tip) timer = setInterval(update, 150);
  };
  const card = event => event.target instanceof Element ? event.target.closest('.filled[data-hand-idx]') : null;
  hand.addEventListener('pointerover', event => show(card(event)));
  hand.addEventListener('pointerout', event => { if (active && !active.contains(event.relatedTarget)) hide(); });
  hand.addEventListener('focusin', event => show(card(event)));
  hand.addEventListener('focusout', hide);
  hand.addEventListener('pointerdown', hide);
  hand.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
}
