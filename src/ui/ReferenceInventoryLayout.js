import characterAtlas from '../data/atlas/dyload_createCharacter.json';

// Use the existing character artwork, not a CSS-drawn placeholder. Equipment
// composition is not implemented by the original views, so this is a preview.
export function referenceCharacterMarkup(player) {
  const female = ['female', '女', '2'].includes(String(player?.gender ?? player?.sex ?? ''));
  const sprite = characterAtlas.sprites.find(s => s.name === (female ? 'female' : 'male'));
  return `<span class="reference-character" role="img" aria-label="角色预览（原版素材）"><i style="width:${sprite.width}px;height:${sprite.height}px;background-position:-${sprite.x}px -${sprite.y}px"></i></span>`;
}

export function refreshReferenceInventory(view, root) {
  const grid = root.querySelector('#bag-grid');
  const key = [view.mode, view.tab, view.cardKeyword, view.cardQuality, view.referenceFaction].join('|');
  if (view._referencePageKey !== key) { view._referencePageKey = key; view._referencePage = 0; }
  const pageSize = view.mode === 'card' ? 30 : 48;
  const slots = [...grid.children];
  const pages = Math.max(1, Math.ceil(slots.length / pageSize));
  view._referencePage = Math.min(pages - 1, Math.max(0, view._referencePage || 0));
  slots.forEach((slot, index) => { slot.hidden = Math.floor(index / pageSize) !== view._referencePage; });
  let pager = root.querySelector('.reference-bag-pager');
  if (!pager) {
    pager = document.createElement('nav'); pager.className = 'reference-bag-pager';
    pager.setAttribute('aria-label', '背包翻页');
    root.querySelector('.classic-bag-footer').before(pager);
  }
  pager.innerHTML = `<button type="button" data-bag-page-prev ${view._referencePage === 0 ? 'disabled' : ''}>上一页</button><span>${view._referencePage + 1} / ${pages}</span><button type="button" data-bag-page-next ${view._referencePage === pages - 1 ? 'disabled' : ''}>下一页</button>`;
  for (const [selector, step] of [['[data-bag-page-prev]', -1], ['[data-bag-page-next]', 1]]) {
    pager.querySelector(selector).addEventListener('click', () => {
      view._referencePage += step; view.selectedIndex = -1;
      view.refresh(root, {rebuildToolbar:false});
    });
  }
  const toolbar = root.querySelector('#bag-toolbar');
  if (view.mode === 'card' && !toolbar.querySelector('.reference-faction-tabs')) {
    const factions = document.createElement('div'); factions.className = 'reference-faction-tabs';
    factions.innerHTML = [['all','全部阵营'],['plant','植物'],['monster','怪物']].map(([id,label]) => `<button type="button" data-bag-faction="${id}">${label}</button>`).join('');
    toolbar.prepend(factions);
    factions.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
      view.referenceFaction = button.dataset.bagFaction; view.selectedIndex = -1;
      view.refresh(root, {rebuildToolbar:false});
    }));
  }
  toolbar.querySelectorAll('[data-bag-faction]').forEach(button => button.classList.toggle('active', button.dataset.bagFaction === (view.referenceFaction || 'all')));
  if (!toolbar.querySelector('.reference-bag-tools')) {
    const menu = document.createElement('details'); menu.className = 'reference-bag-tools';
    menu.innerHTML = '<summary>背包操作 ▾</summary><div class="reference-bag-tools-menu"></div>';
    // Move existing nodes, preserving every original handler and identifier.
    for (const button of [...toolbar.children].filter(el => el.tagName === 'BUTTON')) menu.lastElementChild.append(button);
    toolbar.append(menu);
  }
  const detail = root.querySelector('#bag-detail');
  if (!detail.classList.contains('empty')) {
    const close = document.createElement('button'); close.type = 'button'; close.className = 'reference-detail-close';
    close.textContent = '×'; close.setAttribute('aria-label', '关闭物品详情');
    close.addEventListener('click', () => {view.selectedIndex = -1; view.refresh(root, {rebuildToolbar:false});});
    detail.prepend(close);
  }
}
