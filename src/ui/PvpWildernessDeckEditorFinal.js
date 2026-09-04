import { RoomView } from './RoomView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.pvpWildernessDeckEditorFinal');

function cloneDeck(value) {
  return Array.isArray(value)
    ? value.map(Number).filter((index) => Number.isInteger(index) && index >= 0).slice(0, 10)
    : [];
}

function closeEditor(view, { save = false } = {}) {
  const editor = view._pvpDeckEditor;
  if (save && editor) {
    view._pvpDeckSlots = cloneDeck(editor._selected);
  }
  view._pvpDeckEditorOpen = false;
  view._pvpDeckEditor = null;
  view.__pvpEditorCaptureCleanup?.();
  view.__pvpEditorCaptureCleanup = null;
  document.body.classList.remove('pvp-room-deck-editor-active');
  view.renderRoomInside();
}

function prepareEditor(view) {
  const editor = view._pvpDeckEditor;
  const body = view.root?.querySelector?.('.pvp-deck-editor-body');
  const room = body?.querySelector?.('.game-room');
  if (!editor || !body || !room) return;

  const tab = view._pvpDeckTab || 'default';
  editor._deckTab = tab;
  editor._selected = cloneDeck(view._pvpDeckSlots);
  editor._v3Decks ??= {};
  editor._v3Committed ??= {};
  editor._v3Decks[tab] = cloneDeck(editor._selected);
  editor._v3Committed[tab] = cloneDeck(editor._selected);
  editor._activeSwapSlot = null;
  editor._v3Page = 0;
  editor._renderDeckSlots?.(body);
  editor._renderDrawer?.(body);

  document.body.classList.add('pvp-room-deck-editor-active');
  if (!editor._drawerOpen) body.querySelector('#swap-card-btn')?.click();

  const capture = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !body.contains(target)) return;
    const action = target.closest('[data-v3-action]')?.dataset.v3Action;
    const close = target.closest('.v3-drawer-close');
    if (action === 'confirm') {
      queueMicrotask(() => closeEditor(view, { save: true }));
    } else if (action === 'cancel' || close) {
      queueMicrotask(() => closeEditor(view, { save: false }));
    }
  };
  document.addEventListener('click', capture, true);
  view.__pvpEditorCaptureCleanup = () => document.removeEventListener('click', capture, true);
}

export function installPvpWildernessDeckEditorFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousRenderRoomInside = RoomView.prototype.renderRoomInside;
  RoomView.prototype.renderRoomInside = function renderPvpRoomWithEditorBridge() {
    const result = previousRenderRoomInside.call(this);
    if (this.room?.mode !== 'pvp' || this._pvpDeckEditorOpen) return result;
    this.root?.querySelector?.('[data-pvp-action="edit-deck"]')?.addEventListener('click', () => {
      requestAnimationFrame(() => prepareEditor(this));
    }, { once: true });
    return result;
  };

  const previousDestroy = RoomView.prototype.destroy;
  RoomView.prototype.destroy = function destroyPvpDeckEditorBridge() {
    this.__pvpEditorCaptureCleanup?.();
    this.__pvpEditorCaptureCleanup = null;
    document.body.classList.remove('pvp-room-deck-editor-active');
    return previousDestroy.call(this);
  };

  window.__verifyPvpWildernessDeckEditorFinal = () => {
    const body = document.querySelector('.pvp-deck-editor-body');
    return {
      enabled: true,
      visible: Boolean(body),
      drawerOpen: Boolean(body?.querySelector('#card-drawer.open')),
      drawerCount: body?.querySelectorAll(':scope .deck-drawer-v3').length ?? 0,
      selectedCount: body?.querySelectorAll('#deck-slots-row .v3-deck-slot.filled').length ?? 0,
    };
  };
}
