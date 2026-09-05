import './CardBindingBadge20260905.css';
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
  // 当前卡牌数据还没有单独的绑定字段；旧卡与新卡默认都按绑定卡处理。
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

export function installCardLoreDetailPatch() {
  if (BagView.prototype[PATCH_FLAG]) return;
  BagView.prototype[PATCH_FLAG] = true;

  const originalRenderCardGrid = BagView.prototype.renderCardGrid;
  if (typeof originalRenderCardGrid === 'function') {
    BagView.prototype.renderCardGrid = function patchedRenderCardGrid(root) {
      const result = originalRenderCardGrid.call(this, root);
      const slots = this.cardInventory?.getSlots?.() ?? [];
      root?.querySelectorAll?.('.bag-card-slot[data-index]').forEach((cell) => {
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
