const PATCH_FLAG = Symbol.for('clbwzzz.battleRoomEnemyGeometryFix');
const LEGACY_REFERENCE_ROOM_CLASS = 'room-reference-1826';
const FINAL_REFERENCE_ROOM_CLASS = 'room-reference-1536';

function setImportant(element, declarations) {
  if (!(element instanceof HTMLElement)) return;
  Object.entries(declarations).forEach(([property, value]) => {
    element.style.setProperty(property, String(value), 'important');
  });
}

function removeInline(element, properties) {
  if (!(element instanceof HTMLElement)) return;
  properties.forEach((property) => element.style.removeProperty(property));
}

function releaseLegacyReferenceEnemyGeometry(room) {
  const right = room.querySelector('.room-right-side');
  const top = right?.querySelector('.top-enemy');
  const row = right?.querySelector('.enemy-slots-row');
  removeInline(right, [
    'position', 'left', 'right', 'top', 'bottom', 'width', 'height', 'margin', 'padding', 'overflow',
    'border', 'background', 'transform', 'z-index', 'pointer-events',
  ]);
  removeInline(top, [
    'position', 'left', 'right', 'top', 'bottom', 'width', 'height', 'margin', 'transform', 'z-index', 'pointer-events',
  ]);
  removeInline(row, [
    'position', 'left', 'right', 'top', 'bottom', 'width', 'height', 'display', 'grid-template-columns', 'gap',
    'margin', 'transform', 'z-index', 'pointer-events',
  ]);
  right?.querySelectorAll('.enemy-slots-row > .enemy-slot').forEach((slot) => removeInline(slot, [
    'position', 'inset', 'left', 'right', 'top', 'bottom', 'width', 'height', 'min-width', 'min-height',
    'margin', 'transform', 'overflow', 'pointer-events',
  ]));
}

function applyEnemyGeometry(room) {
  if (!(room instanceof HTMLElement)) return;

  // The final 1536 authority owns every enemy-slot rectangle. The old fix must
  // not remove or rewrite its inline !important values; doing so caused the red
  // side to jump/crop and repeatedly fought the final authority every frame.
  if (room.classList.contains(FINAL_REFERENCE_ROOM_CLASS)) return;

  if (room.classList.contains(LEGACY_REFERENCE_ROOM_CLASS)) {
    releaseLegacyReferenceEnemyGeometry(room);
    return;
  }

  const mode = String(room.dataset.roomMode || room.dataset.roomModeResolved || 'pve').toLowerCase();
  const right = room.querySelector('.room-right-side');
  const top = right?.querySelector('.top-enemy');
  const row = right?.querySelector('.enemy-slots-row');
  if (!right) return;

  setImportant(right, {
    position: 'absolute',
    left: 'auto',
    right: '2.2%',
    top: '3.45%',
    width: '36.8%',
    height: '64.5%',
    margin: '0',
    padding: '0',
    overflow: 'visible',
    border: '0',
    background: 'none',
    transform: 'none',
    'z-index': '42',
    'pointer-events': 'none',
  });

  setImportant(top, {
    position: 'absolute',
    left: 'auto',
    right: '0',
    top: '0',
    bottom: 'auto',
    width: '48.5%',
    height: '58.5%',
    margin: '0',
    transform: 'none',
    'z-index': '2',
    'pointer-events': 'auto',
  });

  setImportant(row, {
    position: 'absolute',
    left: '0',
    right: '0',
    top: '59.8%',
    bottom: 'auto',
    width: '100%',
    height: '40.2%',
    display: 'grid',
    'grid-template-columns': 'repeat(2, minmax(0, 1fr))',
    gap: '3.1%',
    margin: '0',
    transform: 'none',
    'z-index': '3',
    'pointer-events': 'auto',
  });

  right.querySelectorAll('.enemy-slots-row > .enemy-slot').forEach((slot) => setImportant(slot, {
    position: 'relative',
    inset: 'auto',
    width: '100%',
    height: '100%',
    'min-width': '0',
    'min-height': '0',
    margin: '0',
    transform: 'none',
    overflow: 'hidden',
    'pointer-events': 'auto',
  }));

  room.dataset.enemyGeometryMode = mode;
}

function scan() {
  document.querySelectorAll('.game-room.room-rebuild').forEach((room) => applyEnemyGeometry(room));
}

export function installBattleRoomEnemyGeometryFix() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scan();
    });
  };

  const observer = new MutationObserver((records) => {
    if (records.some((record) => record.addedNodes.length || record.removedNodes.length)) schedule();
  });

  const start = () => {
    scan();
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('resize', schedule, { passive: true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  window.__applyBattleRoomEnemyGeometry = scan;
}