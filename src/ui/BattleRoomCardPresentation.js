import { usesFoodCost, HAND_SLOT_COUNT } from '../battle/BattleConfig.js';
import { calculateCardStats } from '../battle/CardStatFormula.js';
import { formatCraftCardName, resolveCraftQuality } from '../core/constants.js';
import { DeckSelectView } from './DeckSelectView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleRoomCardPresentation');
const ATLAS_URL = '/resources/img/cardParts.png';
const ATLAS_SIZE = 1024;

function currentDeck(view) {
  const source = view._drawerOpen && Array.isArray(view._drawerDraft)
    ? view._drawerDraft
    : view._selected;
  const result = [];
  const used = new Set();
  for (const raw of Array.isArray(source) ? source : []) {
    const index = Number(raw);
    if (!Number.isInteger(index) || index < 0 || !view._bagSlots?.[index] || used.has(index)) continue;
    used.add(index);
    result.push(index);
    if (result.length >= HAND_SLOT_COUNT) break;
  }
  return result;
}

function getFrame(view, name) {
  return view._db?.atlases?.cardParts?.sprites?.find((frame) => frame.name === name) ?? null;
}

function atlasStyle(view, name) {
  const frame = getFrame(view, name);
  if (!frame) return '';
  const xRange = Math.max(1, ATLAS_SIZE - frame.width);
  const yRange = Math.max(1, ATLAS_SIZE - frame.height);
  const sizeX = (ATLAS_SIZE / frame.width) * 100;
  const sizeY = (ATLAS_SIZE / frame.height) * 100;
  const posX = (frame.x / xRange) * 100;
  const posY = (frame.y / yRange) * 100;
  return [
    `--atlas-url:url('${ATLAS_URL}')`,
    `--atlas-size-x:${sizeX.toFixed(5)}%`,
    `--atlas-size-y:${sizeY.toFixed(5)}%`,
    `--atlas-pos-x:${posX.toFixed(5)}%`,
    `--atlas-pos-y:${posY.toFixed(5)}%`,
  ].join(';');
}

function getInstanceStars(instance) {
  return Math.max(0, Number(instance?.star ?? instance?.strengthLv ?? 0) || 0);
}

function getCardLevel(card, instance) {
  return Math.max(1, Math.min(6, Number(card?.quality ?? instance?.craftQuality ?? 1) || 1));
}

function getFeatureText(card) {
  const raw = String(card?.desc ?? '').trim();
  if (raw) return raw;
  if (card?.isActiveSkill?.()) return '主动技能卡，按卡牌效果对战场产生影响。';
  if (Number(card?.moveSpeed ?? 0) <= 0) return '防御型单位，放置后固定在格子中作战。';
  if (card?.isPlant?.()) return '植物单位，消耗阳光部署。';
  return '怪物单位，消耗食物部署。';
}

function cardMeta(view, bagIndex) {
  const instance = view._bagSlots?.[bagIndex];
  const card = instance ? view._db?.getById(instance.cardId) : null;
  if (!card || !instance) return null;
  const stars = getInstanceStars(instance);
  const level = getCardLevel(card, instance);
  const quality = resolveCraftQuality(instance.craftQuality ?? level);
  const stats = calculateCardStats(card, instance.craftQuality ?? level, stars);
  return {
    card,
    instance,
    stars,
    level,
    quality,
    stats,
    cost: Number(card.cost ?? 0),
    resource: usesFoodCost(card) ? '食物' : '阳光',
    resourceSymbol: usesFoodCost(card) ? '肉' : '光',
    feature: getFeatureText(card),
  };
}

function starsMarkup(stars) {
  const visible = Math.min(14, Math.max(0, stars));
  if (!visible) return '<span class="room-card-stars room-card-stars--empty">☆☆☆☆☆☆</span>';
  return `<span class="room-card-stars" aria-label="${stars}星">${'★'.repeat(Math.min(6, visible))}${visible > 6 ? `<b>+${visible - 6}</b>` : ''}</span>`;
}

function cardVisual(view, meta, { compact = false } = {}) {
  // AS 原版底座按 card_quality(1~6)取 card_bg_X；meta.level 来自 quality(被压缩到 1~5)，
  // 会丢掉 6 级(如死神)的底座，故优先用原始 card_quality。
  const bgQuality = Math.max(1, Math.min(6, Number(meta.card?.card_quality ?? meta.level) || 1));
  const bgStyle = atlasStyle(view, `card_bg_${bgQuality}`);
  const typeStyle = atlasStyle(view, `cardType_${Math.max(1, Math.min(7, Number(meta.card.type) || 1))}`);
  return `
    <span class="room-card-level-bg room-atlas-sprite" style="${bgStyle}" aria-hidden="true"></span>
    <span class="room-card-stars-wrap">${starsMarkup(meta.stars)}</span>
    <img class="room-card-art" src="/sprites/cards/${meta.card.spriteRes}.png" alt="" draggable="false" />
    <span class="room-card-cost room-card-cost--${meta.resource === '食物' ? 'food' : 'sun'}"><i>${meta.resourceSymbol}</i><b>${meta.cost}</b></span>
    <span class="room-card-type room-atlas-sprite" style="${typeStyle}" title="${meta.card.typeLabel}" aria-label="${meta.card.typeLabel}"></span>
    ${compact ? '' : `<span class="room-card-level-label">${meta.level}级</span>`}
  `;
}

function renderDeckSlots(root) {
  const container = root.querySelector('#deck-slots-row');
  if (!container) return;
  const selected = currentDeck(this);

  container.innerHTML = Array.from({ length: HAND_SLOT_COUNT }, (_, slotIndex) => {
    const bagIndex = selected[slotIndex];
    const meta = bagIndex != null ? cardMeta(this, bagIndex) : null;
    if (!meta) {
      const locked = slotIndex >= Math.max(4, selected.length);
      const lockStyle = atlasStyle(this, 'lock');
      return `
        <button type="button" class="deck-slot-item empty${locked ? ' locked' : ''}" data-slot-idx="${slotIndex}" aria-label="第${slotIndex + 1}卡槽，${locked ? '未解锁' : '空位'}">
          ${locked ? `<span class="room-card-lock room-atlas-sprite" style="${lockStyle}" aria-hidden="true"></span>` : `<span class="slot-empty-num">${slotIndex + 1}</span>`}
        </button>`;
    }
    return `
      <button type="button" class="deck-slot-item filled card-level-${meta.level}" data-slot-idx="${slotIndex}" data-bag-idx="${bagIndex}" aria-label="${meta.card.name}，消耗${meta.cost}${meta.resource}">
        ${cardVisual(this, meta, { compact: true })}
      </button>`;
  }).join('');
}

function renderDrawer(root) {
  const drawerCards = root.querySelector('#drawer-cards');
  if (!drawerCards) return;
  const picked = new Set(currentDeck(this));

  drawerCards.innerHTML = this._pool?.length
    ? this._pool.map(({ index }) => {
        const meta = cardMeta(this, index);
        if (!meta) return '';
        const selected = picked.has(index);
        return `
          <button type="button" class="drawer-card card-level-${meta.level}${selected ? ' selected' : ''}" data-idx="${index}" aria-label="${meta.card.name}，${meta.stars}星，消耗${meta.cost}${meta.resource}">
            ${cardVisual(this, meta, { compact: false })}
          </button>`;
      }).join('')
    : '<p class="drawer-empty">卡牌背包为空，请先到背包领取或制作卡牌</p>';

  root.querySelector('#card-drawer')?.__exactRefresh?.();
}

function ensureTooltip(room) {
  let tooltip = room.querySelector('.room-card-tooltip');
  if (tooltip) return tooltip;
  tooltip = document.createElement('aside');
  tooltip.className = 'room-card-tooltip';
  tooltip.hidden = true;
  tooltip.setAttribute('role', 'tooltip');
  room.appendChild(tooltip);
  return tooltip;
}

function renderTooltip(view, tooltip, bagIndex) {
  const meta = cardMeta(view, bagIndex);
  if (!meta) return false;
  const card = meta.card;
  tooltip.innerHTML = `
    <header>
      <strong style="color:${meta.quality.color}">${formatCraftCardName(meta.instance.craftQuality, card.name)}</strong>
      <span class="room-card-tooltip-level">${meta.level}级 · ${meta.quality.name ?? '卡牌'}</span>
    </header>
    <div class="room-card-tooltip-stars">${starsMarkup(meta.stars)}<em>${meta.stars}星</em></div>
    <dl>
      <div><dt>资源</dt><dd>${meta.cost} ${meta.resource}</dd></div>
      <div><dt>攻击</dt><dd>${meta.stats.atk}</dd></div>
      <div><dt>生命</dt><dd>${meta.stats.hp}</dd></div>
      <div><dt>冷却</dt><dd>${meta.stats.cd}秒</dd></div>
      <div><dt>功能</dt><dd>${card.typeLabel} / ${card.atkStyleLabel}</dd></div>
    </dl>
    <section>
      <b>卡牌特性</b>
      <p>${meta.feature}</p>
    </section>`;
  tooltip.hidden = false;
  return true;
}

function positionTooltip(room, tooltip, clientX, clientY) {
  const roomRect = room.getBoundingClientRect();
  const width = tooltip.offsetWidth;
  const height = tooltip.offsetHeight;
  let left = clientX - roomRect.left + 14;
  let top = clientY - roomRect.top + 14;
  if (left + width > roomRect.width - 12) left = clientX - roomRect.left - width - 14;
  if (top + height > roomRect.height - 12) top = roomRect.height - height - 12;
  tooltip.style.left = `${Math.max(12, left)}px`;
  tooltip.style.top = `${Math.max(12, top)}px`;
}

function bindHoverDetails() {
  document.addEventListener('pointerover', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const cardElement = target?.closest('.game-room.room-rebuild .drawer-card, .game-room.room-rebuild .deck-slot-item.filled');
    if (!cardElement) return;
    const room = cardElement.closest('.game-room.room-rebuild');
    const view = room?.__deckSelectView;
    const bagIndex = Number(cardElement.dataset.idx ?? cardElement.dataset.bagIdx);
    if (!room || !view || !Number.isInteger(bagIndex)) return;
    const tooltip = ensureTooltip(room);
    if (renderTooltip(view, tooltip, bagIndex)) positionTooltip(room, tooltip, event.clientX, event.clientY);
  }, true);

  document.addEventListener('pointermove', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const cardElement = target?.closest('.game-room.room-rebuild .drawer-card, .game-room.room-rebuild .deck-slot-item.filled');
    if (!cardElement) return;
    const room = cardElement.closest('.game-room.room-rebuild');
    const tooltip = room?.querySelector('.room-card-tooltip:not([hidden])');
    if (room && tooltip) positionTooltip(room, tooltip, event.clientX, event.clientY);
  }, true);

  document.addEventListener('pointerout', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const cardElement = target?.closest('.game-room.room-rebuild .drawer-card, .game-room.room-rebuild .deck-slot-item.filled');
    if (!cardElement || cardElement.contains(event.relatedTarget)) return;
    const tooltip = cardElement.closest('.game-room.room-rebuild')?.querySelector('.room-card-tooltip');
    if (tooltip) tooltip.hidden = true;
  }, true);
}

function patchDrawerPager() {
  let scheduled = false;

  const update = () => {
    scheduled = false;
    document.querySelectorAll('.game-room.room-rebuild .exact-drawer-pager').forEach((pager) => {
      const prev = pager.querySelector('[data-page="prev"]');
      const next = pager.querySelector('[data-page="next"]');
      if (prev && prev.textContent !== '上一页') prev.textContent = '上一页';
      if (next && next.textContent !== '下一页') next.textContent = '下一页';
    });
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(update);
  };

  update();
  const observer = new MutationObserver((records) => {
    const addedPager = records.some((record) => Array.from(record.addedNodes).some((node) => {
      if (!(node instanceof Element)) return false;
      return node.matches?.('.exact-drawer-pager') || Boolean(node.querySelector?.('.exact-drawer-pager'));
    }));
    if (addedPager) schedule();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  globalThis.__clbwzzzRoomPagerObserver = observer;
}

export function installBattleRoomCardPresentation() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  DeckSelectView.prototype._renderDeckSlots = renderDeckSlots;
  DeckSelectView.prototype._renderDrawer = renderDrawer;

  const originalRender = DeckSelectView.prototype.render;
  DeckSelectView.prototype.render = function renderWithCardPresentation(root, options = {}) {
    const result = originalRender.call(this, root, options);
    const room = root.querySelector('.game-room');
    if (room) room.__deckSelectView = this;
    this._renderDeckSlots(root);
    this._renderDrawer(root);
    return result;
  };

  bindHoverDetails();
  patchDrawerPager();
}
