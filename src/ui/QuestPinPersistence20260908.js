import { authStore } from '../core/AuthStore.js';

const PIN_STYLE_ID = 'quest-pin-persistence-style-20260908';
const PIN_BOUND_ATTR = 'data-quest-pin-bound-20260908';

export function installQuestPinPersistence20260908() {
  if (typeof document === 'undefined') return;
  if (globalThis.__clbwzQuestPinPersistence20260908Installed) return;
  globalThis.__clbwzQuestPinPersistence20260908Installed = true;

  installStyles();

  const pins = new Set();
  let loaded = false;
  let loadPromise = null;
  let scheduled = false;
  let reordering = false;

  const pinKey = (category, questId) => `${category}:${questId}`;

  async function ensureLoaded() {
    if (loaded) return;
    if (!loadPromise) {
      loadPromise = authStore.api.get('/player/quest-pins')
        .then((data) => {
          pins.clear();
          for (const entry of data?.pins || []) {
            const category = String(entry?.category || '').trim();
            const questId = String(entry?.questId || '').trim();
            if (category && questId) pins.add(pinKey(category, questId));
          }
          loaded = true;
        })
        .catch((error) => {
          console.warn('[quest-pins] load failed', error);
          loadPromise = null;
        });
    }
    await loadPromise;
  }

  function currentCategory() {
    return document.querySelector('.quest-category-btn.active')?.dataset?.category || 'main';
  }

  function applyPinLabel(control, pinned) {
    control.classList.toggle('is-pinned', pinned);
    control.textContent = pinned ? '已置顶' : '置顶';
    control.setAttribute('aria-label', pinned ? '取消置顶任务' : '置顶任务');
    control.title = pinned ? '取消置顶' : '置顶';
  }

  async function togglePin(item, control) {
    const category = currentCategory();
    const questId = String(item.dataset.entry || '').trim();
    if (!questId || item.classList.contains('claimed')) return;

    await ensureLoaded();
    if (!loaded) {
      alert('任务置顶数据暂时无法读取，请稍后重试');
      return;
    }

    const key = pinKey(category, questId);
    const nextPinned = !pins.has(key);
    control.classList.add('is-saving');
    try {
      const result = await authStore.api.put(
        `/player/quest-pins/${encodeURIComponent(category)}/${encodeURIComponent(questId)}`,
        { pinned: nextPinned },
      );
      if (result?.pinned) pins.add(key);
      else pins.delete(key);
      applyPinLabel(control, pins.has(key));
      decorateQuestList();
    } catch (error) {
      alert(error?.message || '保存任务置顶失败');
    } finally {
      control.classList.remove('is-saving');
    }
  }

  function bindPinControl(item, category) {
    const questId = String(item.dataset.entry || '').trim();
    if (!questId || item.hasAttribute(PIN_BOUND_ATTR)) return;
    item.setAttribute(PIN_BOUND_ATTR, '1');

    if (item.classList.contains('claimed')) return;

    const control = document.createElement('span');
    control.className = 'quest-pin-toggle-20260908';
    control.setAttribute('role', 'button');
    control.setAttribute('tabindex', '0');
    control.dataset.questPinCategory = category;
    control.dataset.questPinId = questId;
    applyPinLabel(control, pins.has(pinKey(category, questId)));

    control.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void togglePin(item, control);
    });
    control.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      void togglePin(item, control);
    });

    item.appendChild(control);
  }

  function sortActiveItems(list, category) {
    if (reordering) return;
    const separator = list.querySelector('.quest-list-section-sep');
    const activeItems = [...list.querySelectorAll('.quest-list-item[data-entry]:not(.claimed)')];
    if (activeItems.length < 2) return;

    const ordered = activeItems
      .map((node, index) => ({
        node,
        index,
        pinned: pins.has(pinKey(category, String(node.dataset.entry || ''))),
      }))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.index - b.index)
      .map((entry) => entry.node);

    const alreadySorted = ordered.every((node, index) => node === activeItems[index]);
    if (alreadySorted) return;

    reordering = true;
    try {
      for (const node of ordered) list.insertBefore(node, separator || null);
    } finally {
      reordering = false;
    }
  }

  async function decorateQuestList() {
    const list = document.querySelector('#quest-list.quest-list');
    if (!list) return;
    await ensureLoaded();
    if (!loaded) return;

    const category = currentCategory();
    list.querySelectorAll('.quest-list-item[data-entry]').forEach((item) => bindPinControl(item, category));
    sortActiveItems(list, category);
  }

  function scheduleDecorate() {
    if (scheduled || reordering) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      void decorateQuestList();
    });
  }

  const observer = new MutationObserver(scheduleDecorate);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scheduleDecorate();
}

function installStyles() {
  if (document.getElementById(PIN_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PIN_STYLE_ID;
  style.textContent = `
    .quest-list-item[data-entry] {
      position: relative;
      padding-right: 70px !important;
    }
    .quest-pin-toggle-20260908 {
      position: absolute;
      top: 7px;
      right: 7px;
      z-index: 2;
      min-width: 46px;
      padding: 3px 7px;
      border: 1px solid rgba(120, 88, 40, .52);
      border-radius: 999px;
      background: rgba(244, 226, 173, .82);
      color: #6b4b20;
      font-size: 11px;
      font-style: normal;
      line-height: 1.25;
      text-align: center;
      cursor: pointer;
      user-select: none;
      box-shadow: 0 1px 3px rgba(0, 0, 0, .18);
    }
    .quest-pin-toggle-20260908:hover,
    .quest-pin-toggle-20260908:focus-visible {
      background: #ffe49c;
      outline: 1px solid rgba(118, 78, 20, .75);
    }
    .quest-pin-toggle-20260908.is-pinned {
      background: #d19a42;
      border-color: #8b5b1c;
      color: #fff8dd;
      font-weight: 700;
    }
    .quest-pin-toggle-20260908.is-saving {
      opacity: .55;
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);
}
