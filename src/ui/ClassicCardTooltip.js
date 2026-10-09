import './ClassicCardTooltip.css';
import { gameSettings } from '../core/GameSettingsStore20260910.js';
import { calculateCardStats } from '../battle/CardStatFormula.js';
import { formatBattleAmount } from '../battle/BattleConfig.js';
import { formatCraftCardName } from '../core/constants.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

export function classicCardTooltipMarkup(card, instance = {}) {
  const stars = Math.max(0, Number(instance.star) || 0);
  const stats = calculateCardStats(card, instance.craftQuality ?? 1, stars, instance.attributeRoll);
  const starCount = Math.max(10, Math.ceil(stars / 5) * 5);
  const title = instance.customName || formatCraftCardName(instance.craftQuality ?? 1, card.name);
  const expires = instance.expiresAt ?? instance.expires_at;
  const expiry = expires ? `有效至：${new Date(expires).toLocaleDateString('zh-CN')}` : '永久有效';
  return `<div class="classic-tip-name">${esc(title)}[${esc(card.quality)}级卡]</div>
    <div class="classic-tip-stars" aria-label="${stars}星">${Array.from({length:starCount}, (_, i) => `<span class="${i < stars ? 'earned' : ''}">★</span>`).join('')}</div>
    <div class="classic-tip-stats">攻击:${esc(formatBattleAmount(stats.atk))}<br>生命:${esc(formatBattleAmount(stats.hp))}<br>冷却时间:${esc(formatBattleAmount(stats.cd))}秒</div>
    <div class="classic-tip-trait">特技:${esc(card.trait || card.desc || '暂无')}</div>
    <div class="classic-tip-lore">描述:<br>${esc(card.intro || card.flavor || '暂无描述')}</div>
    <div class="classic-tip-expiry">${esc(expiry)}</div>`;
}

export function installClassicCardTooltip(app) {
  if (app._classicTooltipInstalled) return;
  app._classicTooltipInstalled = true;
  const tip = document.createElement('aside');
  tip.className = 'classic-card-tooltip'; tip.id = 'classic-card-tooltip'; tip.hidden = true;
  tip.setAttribute('role', 'tooltip'); document.body.append(tip);
  let active = null, nativeTitle = null;
  const hide = () => {
    if (active) {
      if (nativeTitle != null) active.setAttribute('title', nativeTitle);
      if (active.getAttribute('aria-describedby') === tip.id) active.removeAttribute('aria-describedby');
    }
    active = null; nativeTitle = null; tip.hidden = true;
  };
  const position = event => {
    const rect = tip.getBoundingClientRect();
    const x = event.clientX + 16 + rect.width > innerWidth ? event.clientX - rect.width - 12 : event.clientX + 16;
    tip.style.left = `${Math.max(8, Math.min(innerWidth - rect.width - 8, x))}px`;
    tip.style.top = `${Math.max(8, Math.min(innerHeight - rect.height - 8, event.clientY + 12))}px`;
  };
  const selectors = '.card-item[data-id],.card-bag-slot[data-index],.bag-card-slot[data-index],.smithy-pick-card[data-id]';
  document.addEventListener('pointerover', event => {
    if (!gameSettings.get('classicCardTooltip')) return;
    const cell = event.target.closest?.(selectors);
    if (!cell || cell === active) return;
    hide();
    const instance = cell.matches('.card-bag-slot,.bag-card-slot') ? app.cardInventory?.getSlots?.()[Number(cell.dataset.index)] : {};
    const card = app.db?.getById(instance?.cardId ?? cell.dataset.id);
    if (!card) return;
    active = cell; nativeTitle = cell.getAttribute('title'); cell.removeAttribute('title');
    cell.setAttribute('aria-describedby', tip.id);
    tip.innerHTML = classicCardTooltipMarkup(card, instance); tip.hidden = false; position(event);
  });
  document.addEventListener('pointermove', event => { if (active) position(event); });
  document.addEventListener('pointerout', event => { if (active && !active.contains(event.relatedTarget)) hide(); });
  document.addEventListener('pointerdown', hide);
  window.addEventListener('blur', hide);
  document.addEventListener('scroll', hide, true);
  gameSettings.subscribe(key => { if (key === 'classicCardTooltip') hide(); });
}
