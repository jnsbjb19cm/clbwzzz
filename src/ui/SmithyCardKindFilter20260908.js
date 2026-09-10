import { SmithyView } from './SmithyView.js';

const INSTALL_FLAG = Symbol.for('clbwz.smithyCardKindFilter20260908');
const KIND_FILTERS = Object.freeze([
  ['all', '全部'],
  ['plant', '植物'],
  ['monster', '怪物'],
]);
const LEVEL_FILTERS = Object.freeze([
  ['all', '全部'],
  ['1', '1级'],
  ['2', '2级'],
  ['3', '3级'],
  ['4', '4级'],
  ['5', '5级'],
]);

function currentKind(view) {
  return KIND_FILTERS.some(([id]) => id === view?._smithyCardKind20260908)
    ? view._smithyCardKind20260908
    : 'all';
}

function currentLevel(view) {
  return LEVEL_FILTERS.some(([id]) => id === view?._smithyCardLevel20260908)
    ? view._smithyCardLevel20260908
    : 'all';
}

function matches(card, kind, level) {
  if (!card) return false;
  if (kind === 'plant' && card.isPlant?.() !== true) return false;
  if (kind === 'monster' && card.isMonster?.() !== true) return false;
  if (level !== 'all' && Number(card.quality) !== Number(level)) return false;
  return true;
}

function toolbarMarkup(kind, level) {
  return `<div class="smithy-card-filter-groups">
    <div class="smithy-kind-filter" role="tablist" aria-label="卡牌阵营筛选">
      ${KIND_FILTERS.map(([id, label]) => `<button type="button" class="smithy-kind-filter-btn${kind === id ? ' active' : ''}" data-smithy-kind="${id}">${label}</button>`).join('')}
    </div>
    <div class="smithy-level-filter" role="tablist" aria-label="卡牌等级筛选">
      ${LEVEL_FILTERS.map(([id, label]) => `<button type="button" class="smithy-level-filter-btn${level === id ? ' active' : ''}" data-smithy-level="${id}">${label}</button>`).join('')}
    </div>
  </div>`;
}

function bindToolbar(view, root, scope) {
  scope?.querySelectorAll?.('[data-smithy-kind]').forEach((button) => {
    button.addEventListener('click', () => {
      const next = button.dataset.smithyKind;
      view._smithyCardKind20260908 = KIND_FILTERS.some(([id]) => id === next) ? next : 'all';
      if (view.tab === 'craft') {
        const first = view.craftSys.getCraftableCards().find((card) => matches(card, currentKind(view), currentLevel(view)));
        if (first) view.targetCardId = first.id;
      }
      view.renderBody(root);
    });
  });
  scope?.querySelectorAll?.('[data-smithy-level]').forEach((button) => {
    button.addEventListener('click', () => {
      const next = button.dataset.smithyLevel;
      view._smithyCardLevel20260908 = LEVEL_FILTERS.some(([id]) => id === next) ? next : 'all';
      if (view.tab === 'craft') {
        const first = view.craftSys.getCraftableCards().find((card) => matches(card, currentKind(view), currentLevel(view)));
        if (first) view.targetCardId = first.id;
      }
      view.renderBody(root);
    });
  });
}

function filterCraftButtons(view, body) {
  const kind = currentKind(view);
  const level = currentLevel(view);
  const catalogue = body?.querySelector?.('.smithy-card-catalogue');
  if (!catalogue) return;
  catalogue.querySelector('.smithy-card-filter-groups')?.remove();
  catalogue.querySelector('h2')?.insertAdjacentHTML('afterend', toolbarMarkup(kind, level));
  catalogue.querySelectorAll('.smithy-pick-card[data-id]').forEach((button) => {
    const card = view.db.getById(Number(button.dataset.id));
    button.hidden = !matches(card, kind, level);
  });

  // The old explanatory copy was left behind when the names were swapped.
  const qualityCopy = body.querySelector('.smithy-craft-quality-panel .smithy-meta');
  if (qualityCopy && qualityCopy.textContent.includes('灰·劣质')) {
    qualityCopy.textContent = `灰·劣质 / 白·普通 / 绿·精良 / 蓝·优秀 / 紫·完美${view.useCharm ? ' · 保护符已提升高品质权重' : ''}`;
  }
  bindToolbar(view, view.root ?? body.closest?.('.page') ?? document, catalogue);
}

function filterUpgradeButtons(view, root, body) {
  const kind = currentKind(view);
  const level = currentLevel(view);
  const list = body?.querySelector?.('.starup-card-list');
  if (!list) return;
  list.querySelector('.smithy-card-filter-groups')?.remove();
  list.insertAdjacentHTML('afterbegin', toolbarMarkup(kind, level));

  list.querySelectorAll('.smithy-pick-card').forEach((button) => {
    const raw = button.dataset.mainIdx ?? button.dataset.subIdx;
    const index = Number(raw);
    const slot = view.cardInventory.getSlots()[index];
    const card = slot ? view.db.getById(slot.cardId) : null;
    button.hidden = !matches(card, kind, level);
  });
  bindToolbar(view, root, list);
}

function installStyles() {
  if (typeof document === 'undefined' || document.querySelector('#smithy-kind-filter-style-20260908')) return;
  const style = document.createElement('style');
  style.id = 'smithy-kind-filter-style-20260908';
  style.textContent = `
    .smithy-card-filter-groups{display:flex;flex-direction:column;gap:6px;margin:7px 0 10px}
    .smithy-kind-filter,.smithy-level-filter{display:flex;gap:7px;align-items:center;flex-wrap:wrap;padding:4px 5px;border-radius:8px;background:rgba(4,63,82,.26)}
    .smithy-level-filter{background:rgba(4,49,69,.32)}
    .smithy-kind-filter-btn,.smithy-level-filter-btn{min-width:54px;padding:5px 12px;border:1px solid rgba(255,226,111,.72);border-radius:14px;background:linear-gradient(#177aa0,#075777);color:#fff7c6;font-weight:700;cursor:pointer}
    .smithy-kind-filter-btn.active,.smithy-level-filter-btn.active{background:linear-gradient(#ffd95c,#ec9d12);color:#633700;box-shadow:0 0 7px rgba(255,218,76,.72)}
    .smithy-level-filter-btn{min-width:46px;border-color:rgba(126,196,232,.8)}
    .smithy-pick-card[hidden]{display:none!important}
  `;
  document.head.appendChild(style);
}

export function installSmithyCardKindFilter20260908() {
  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;
  installStyles();

  const originalRender = SmithyView.prototype.render;
  SmithyView.prototype.render = function renderWithKindFilterState20260908(root, ...args) {
    this.root = root;
    this._smithyCardKind20260908 = currentKind(this);
    this._smithyCardLevel20260908 = currentLevel(this);
    return originalRender.call(this, root, ...args);
  };

  const originalCraft = SmithyView.prototype.renderCraft;
  SmithyView.prototype.renderCraft = function renderCraftWithKindFilter20260908(root, body, ...args) {
    const result = originalCraft.call(this, root, body, ...args);
    filterCraftButtons(this, body);
    return result;
  };

  const originalUpgrade = SmithyView.prototype.renderUpgradeRoute;
  SmithyView.prototype.renderUpgradeRoute = function renderUpgradeWithKindFilter20260908(root, body, route, ...args) {
    const result = originalUpgrade.call(this, root, body, route, ...args);
    filterUpgradeButtons(this, root, body);
    return result;
  };
}
