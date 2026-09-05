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

export function installCardLoreDetailPatch() {
  if (BagView.prototype[PATCH_FLAG]) return;
  BagView.prototype[PATCH_FLAG] = true;

  const originalRenderCardDetail = BagView.prototype.renderCardDetail;
  if (typeof originalRenderCardDetail !== 'function') return;

  BagView.prototype.renderCardDetail = function patchedRenderCardDetail(root) {
    originalRenderCardDetail.call(this, root);

    const slot = this.cardInventory?.getSlots?.()?.[this.selectedIndex];
    const card = slot ? this.cardDb?.getById?.(slot.cardId) : null;
    const detail = root?.querySelector?.('#bag-detail');
    if (!card || !detail) return;

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
