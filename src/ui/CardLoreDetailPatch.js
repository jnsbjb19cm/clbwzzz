import './CardBindingBadge20260905.css';
import { installInventoryBindingPatch20260905 } from '../core/InventoryBindingPatch20260905.js';
import { BagView } from './BagView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.cardLoreDetailPatch');

function createSection(title, text, className) {
  const section = document.createElement('section');
  section.className = `bag-card-lore-section ${className}`;

  const heading = document.createElement('h3');
  heading.className = 'bag-card-lore-title';
  heading.textContent = title;

  const body = document.createElement('p');
  body.className = 'bag-card-lore-text';
  body.textContent = text || '暂无内容';

  section.append(heading, body);
  return section;
}

function isCardBound(slot) {
  if (!slot) return false;
  const raw = slot.isBound ?? slot.bound;
  // 当前卡牌表尚未单独存 is_bound；历史卡和新手卡默认按绑定卡处理。
  if (raw == null) return true;
  return raw === true || raw === 1 || raw === '1';
}

function isItemBound(slot) {
  if (!slot) return false;
  const raw = slot.isBound ?? slot.bound;
  // 旧本地背包没有绑定字段：按绑定处理；战斗掉落会明确写成 false。
  if (raw == null) return true;
  return raw === true || raw === 1 || raw === '1';
}

function appendBoundDetail(detail, slot) {
  if (!detail || !isCardBound(slot) || detail.querySelector('.bag-card-bound-detail')) return;
  const badge = document.createElement('span');
  badge.className = 'bag-card-bound-detail';
  badge.textContent = '绑定';
  const title = detail.querySelector('h2, h3, .bag-detail-name, .bag-card-name');
  if (title) title.insertAdjacentElement('afterend', badge);
  else detail.prepend(badge);
}

function appendItemBindingDetail(detail, slot) {
  if (!detail || !slot || detail.querySelector('.bag-item-binding-detail')) return;
  const bound = isItemBound(slot);
  const badge = document.createElement('span');
  badge.className = `bag-item-binding-detail ${bound ? 'is-bound' : 'is-tradable'}`;
  badge.textContent = bound ? '绑定' : '非绑定 · 可交易';
  const title = detail.querySelector('h2, h3, .bag-detail-name');
  if (title) title.insertAdjacentElement('afterend', badge);
  else detail.prepend(badge);
}

export function installCardLoreDetailPatch() {
  installInventoryBindingPatch20260905();
  if (BagView.prototype[PATCH_FLAG]) return;
  BagView.prototype[PATCH_FLAG] = true;

  const originalRenderItemGrid = BagView.prototype.renderItemGrid;
  if (typeof originalRenderItemGrid === 'function') {
    BagView.prototype.renderItemGrid = function patchedRenderItemGrid(root, grid) {
      const result = originalRenderItemGrid.call(this, root, grid);
      const slots = this.inventory?.getSlots?.() ?? [];
      const scope = grid ?? root;
      scope?.querySelectorAll?.('.bag-slot:not(.empty)[data-index]').forEach((cell) => {
        const slot = slots[Number(cell.dataset.index)];
        if (!slot || cell.querySelector('.bag-item-binding-badge')) return;
        const bound = isItemBound(slot);
        const badge = document.createElement('span');
        badge.className = `bag-item-binding-badge ${bound ? 'is-bound' : 'is-tradable'}`;
        badge.textContent = bound ? '绑定' : '非绑定';
        cell.append(badge);
      });
      return result;
    };
  }

  const originalRenderItemDetail = BagView.prototype.renderItemDetail;
  if (typeof originalRenderItemDetail === 'function') {
    BagView.prototype.renderItemDetail = function patchedRenderItemDetail(root) {
      const result = originalRenderItemDetail.call(this, root);
      const slot = this.inventory?.getSlots?.()?.[this.selectedIndex];
      const detail = root?.querySelector?.('#bag-detail');
      appendItemBindingDetail(detail, slot);
      return result;
    };
  }

  const originalRenderCardGrid = BagView.prototype.renderCardGrid;
  if (typeof originalRenderCardGrid === 'function') {
    // BagView.renderCardGrid 的真实签名是 (root, grid)。
    // 旧补丁只转发 root，导致 grid === undefined，切换“卡牌”页时直接在 grid.innerHTML 崩溃。
    BagView.prototype.renderCardGrid = function patchedRenderCardGrid(root, grid) {
      const result = originalRenderCardGrid.call(this, root, grid);
      const slots = this.cardInventory?.getSlots?.() ?? [];
      const scope = grid ?? root;
      scope?.querySelectorAll?.('.card-bag-slot[data-index], .bag-card-slot[data-index]').forEach((cell) => {
        const slot = slots[Number(cell.dataset.index)];
        if (!isCardBound(slot) || cell.querySelector('.bag-card-bound-badge')) return;
        const badge = document.createElement('span');
        badge.className = 'bag-card-bound-badge';
        badge.textContent = '绑定';
        cell.append(badge);
      });
      return result;
    };
  }

  const originalRenderCardDetail = BagView.prototype.renderCardDetail;
  if (typeof originalRenderCardDetail !== 'function') return;

  BagView.prototype.renderCardDetail = function patchedRenderCardDetail(root) {
    originalRenderCardDetail.call(this, root);

    const slot = this.cardInventory?.getSlots?.()?.[this.selectedIndex];
    const card = slot ? this.cardDb?.getById?.(slot.cardId) : null;
    const detail = root?.querySelector?.('#bag-detail');
    if (!card || !detail) return;

    appendBoundDetail(detail, slot);

    const oldDesc = detail.querySelector('.bag-detail-desc');
    if (!oldDesc) return;

    // 经验材料卡只保留原说明，不显示角色图鉴介绍。
    if (card.isExperienceCard) {
      oldDesc.textContent = card.trait || card.desc || '暂无描述';
      return;
    }

    const trait = String(card.trait || card.desc || '').trim();
    const intro = String(card.intro || card.flavor || '').trim();

    const wrapper = document.createElement('div');
    wrapper.className = 'bag-card-lore-block';
    wrapper.append(
      createSection('卡牌特性', trait, 'trait'),
      createSection('卡牌介绍', intro, 'intro'),
    );

    oldDesc.replaceWith(wrapper);
  };
}
