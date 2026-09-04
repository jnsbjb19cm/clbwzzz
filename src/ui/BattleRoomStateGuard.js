const PATCH_FLAG = Symbol.for('clbwzzz.battleRoomStateGuard');
const ROOM_SELECTOR = '.game-room';
const REFERENCE_ROOM_CLASS = 'room-reference-1826';
const FINAL_REFERENCE_ROOM_CLASS = 'room-reference-1536';
const TOOL_ROUTES = new Set(['shop', 'bag', 'smithy', 'talent', 'hero', 'mail', 'friend', 'social']);
const ROUTE_TO_ACTION = Object.freeze({
  shop: 'shop',
  bag: 'bag',
  smithy: 'smithy',
  talent: 'hero',
  hero: 'hero',
  mail: 'mail',
  friend: 'friend',
  social: 'friend',
});

function important(element, declarations) {
  if (!(element instanceof HTMLElement)) return;
  for (const [property, value] of Object.entries(declarations)) {
    element.style.setProperty(property, String(value), 'important');
  }
}

function removeInlineImportant(element, properties) {
  if (!(element instanceof HTMLElement)) return;
  for (const property of properties) element.style.removeProperty(property);
}

function releaseReferenceGeometry(room) {
  removeInlineImportant(room, ['font-size', 'overflow', 'isolation', 'background']);
  removeInlineImportant(room.querySelector('.room-left-side'), [
    'position', 'left', 'right', 'top', 'bottom', 'width', 'height', 'transform', 'z-index',
  ]);
  removeInlineImportant(room.querySelector('.room-right-side'), [
    'position', 'left', 'right', 'top', 'bottom', 'width', 'height', 'margin', 'padding', 'overflow',
    'border', 'background', 'transform', 'z-index', 'pointer-events',
  ]);
  removeInlineImportant(room.querySelector('.room-right-side .top-enemy'), [
    'position', 'left', 'right', 'top', 'bottom', 'width', 'height', 'margin', 'transform', 'z-index', 'pointer-events',
  ]);
  const enemyRow = room.querySelector('.room-right-side .enemy-slots-row');
  removeInlineImportant(enemyRow, [
    'position', 'left', 'right', 'top', 'bottom', 'width', 'height', 'display', 'grid-template-columns',
    'gap', 'margin', 'transform', 'z-index', 'pointer-events',
  ]);
  room.querySelectorAll('.room-right-side .enemy-slots-row > .enemy-slot').forEach((slot) => removeInlineImportant(slot, [
    'position', 'inset', 'left', 'right', 'top', 'bottom', 'width', 'height', 'min-width', 'min-height',
    'margin', 'transform', 'overflow', 'pointer-events',
  ]));

  const actions = room.querySelector('.room-mid-actions');
  removeInlineImportant(actions, [
    'position', 'inset', 'left', 'right', 'top', 'bottom', 'width', 'height', 'display', 'grid-template-columns',
    'gap', 'margin', 'transform', 'overflow', 'z-index',
  ]);
  actions?.querySelectorAll(':scope > .mid-btn, :scope > button').forEach((button) => removeInlineImportant(button, [
    'position', 'inset', 'left', 'right', 'top', 'bottom', 'width', 'height', 'min-width', 'min-height',
    'margin', 'transform', 'display',
  ]));
  removeInlineImportant(room.querySelector('#room-ready-btn'), [
    'position', 'left', 'right', 'top', 'bottom', 'width', 'height', 'margin', 'transform', 'z-index',
  ]);
  removeInlineImportant(room.querySelector('.room-vs'), [
    'position', 'left', 'right', 'top', 'bottom', 'width', 'height', 'transform', 'z-index',
  ]);
  removeInlineImportant(room.querySelector('.room-bottom-bar'), [
    'position', 'left', 'right', 'top', 'bottom', 'width', 'height', 'transform', 'z-index',
  ]);
}

function detectRoomMode(room) {
  const explicit = String(room.dataset.roomMode || room.dataset.mode || '').toLowerCase();
  if (explicit === 'pvp') return 'pvp';
  if (explicit === 'pve' || explicit === 'boss') return explicit;

  const right = room.querySelector('.room-right-side');
  const hasQuestionSlot = Boolean(right?.querySelector('.question-mark, .qmark'));
  return hasQuestionSlot ? 'pve' : 'pvp';
}

function applyEnemyGeometry(room, pveLike) {
  const right = room.querySelector('.room-right-side');
  const topEnemy = right?.querySelector('.top-enemy');
  const enemyRow = right?.querySelector('.enemy-slots-row');
  if (!right) return;

  important(right, {
    position: 'absolute',
    left: 'auto',
    right: '2.2%',
    top: '3.45%',
    width: '36.8%',
    height: '64.5%',
    transform: 'none',
    'pointer-events': 'none',
  });

  important(topEnemy, {
    position: 'absolute',
    left: 'auto',
    right: '0',
    top: '0',
    width: '48.5%',
    height: '58.5%',
    transform: 'none',
    'pointer-events': 'auto',
  });

  important(enemyRow, {
    position: 'absolute',
    left: '0',
    right: '0',
    top: 'auto',
    bottom: '0',
    width: '100%',
    height: '40.2%',
    display: 'grid',
    'grid-template-columns': 'repeat(2, minmax(0, 1fr))',
    gap: '3.1%',
    transform: 'none',
    'pointer-events': 'auto',
  });

  right.querySelectorAll('.enemy-slots-row > .enemy-slot').forEach((slot) => important(slot, {
    width: '100%',
    height: '100%',
    'min-width': '0',
    'min-height': '0',
    margin: '0',
    transform: 'none',
  }));
}

function applyActionGeometry(room, pveLike) {
  const actions = room.querySelector('.room-mid-actions');
  const ready = room.querySelector('#room-ready-btn');
  const team = actions?.querySelector('.team-btn');

  important(actions, {
    position: 'absolute',
    left: '48.6%',
    right: 'auto',
    top: 'auto',
    bottom: '10.5%',
    width: '38%',
    height: '19.2%',
    display: 'grid',
    'grid-template-columns': 'repeat(3, minmax(0, 1fr))',
    gap: '2%',
    margin: '0',
    transform: 'none',
    overflow: 'visible',
    'z-index': '76',
  });

  actions?.querySelectorAll(':scope > .mid-btn, :scope > button').forEach((button) => important(button, {
    position: 'relative',
    inset: 'auto',
    left: 'auto',
    right: 'auto',
    top: 'auto',
    bottom: 'auto',
    width: '100%',
    height: '100%',
    'min-width': '0',
    'min-height': '0',
    margin: '0',
    transform: 'none',
  }));

  important(team, { display: 'flex' });

  important(ready, {
    position: 'absolute',
    left: '88.2%',
    right: 'auto',
    top: 'auto',
    bottom: '10.5%',
    width: '9.6%',
    height: '19.2%',
    margin: '0',
    transform: 'none',
    'z-index': '76',
  });
}

function applyOverlayGeometry(room) {
  important(room.querySelector('.room-tool-overlay'), {
    position: 'absolute',
    inset: '1.6%',
    display: 'grid',
    'place-items': 'center',
    overflow: 'hidden',
    'z-index': '100000',
    background: 'rgba(15, 35, 10, .82)',
    'pointer-events': 'auto',
  });
  important(room.querySelector('.room-tool-window'), {
    position: 'relative',
    width: '90%',
    height: '86%',
    overflow: 'hidden',
    'z-index': '100001',
    background: 'linear-gradient(180deg, #e2f8a8 0%, #8bb84d 100%)',
    opacity: '1',
  });
  important(room.querySelector('.room-tool-content'), {
    position: 'absolute',
    inset: '10% 2% 2%',
    overflow: 'auto',
    'z-index': '100002',
    background: '#173a43',
    opacity: '1',
  });
  room.querySelectorAll('.room-tool-content > .page, .room-tool-content > section, .room-tool-content > div')
    .forEach((page) => important(page, {
      position: 'relative',
      width: '100%',
      'max-width': 'none',
      'min-height': '100%',
      margin: '0',
      opacity: '1',
    }));
}

function applyRoomState(room) {
  if (!(room instanceof HTMLElement)) return;

  room.classList.add('room-rebuild', 'room-polish', 'room-state-guard');
  const mode = detectRoomMode(room);
  const pveLike = mode !== 'pvp';
  room.dataset.roomModeResolved = mode;
  room.classList.toggle('room-pve-like', pveLike);
  room.classList.toggle('room-pvp-like', !pveLike);

  // The final 1536 authority already owns inline geometry. Do not remove or
  // rewrite any of it here; this guard is allowed to keep tool overlays safe only.
  if (room.classList.contains(FINAL_REFERENCE_ROOM_CLASS)) {
    applyOverlayGeometry(room);
    return;
  }

  // Compatibility for older reference implementations that relied on the old
  // marker and CSS rather than the new inline 1536 authority.
  if (room.classList.contains(REFERENCE_ROOM_CLASS)) {
    releaseReferenceGeometry(room);
    applyOverlayGeometry(room);
    return;
  }

  const roomWidth = room.getBoundingClientRect().width || room.clientWidth || 1280;
  const fontSize = Math.max(16, Math.min(21, roomWidth / 76));
  important(room, {
    'font-size': `${fontSize.toFixed(2)}px`,
    overflow: 'clip',
    isolation: 'isolate',
    background: 'radial-gradient(circle at 50% 48%, #dfff7e 0%, #8abb42 35%, #4f7426 100%)',
  });

  important(room.querySelector('.room-left-side'), {
    position: 'absolute',
    left: '2.2%',
    right: 'auto',
    top: '3.45%',
    width: '36.8%',
    height: '64.5%',
    transform: 'none',
  });

  applyEnemyGeometry(room, pveLike);
  applyActionGeometry(room, pveLike);

  important(room.querySelector('.room-vs'), {
    position: 'absolute',
    left: '39.4%',
    top: '40.8%',
    width: '21.2%',
    height: '22.8%',
    transform: 'skewX(-8deg)',
    'z-index': '60',
  });

  important(room.querySelector('.room-bottom-bar'), {
    position: 'absolute',
    left: '48.6%',
    right: '1.7%',
    top: 'auto',
    bottom: '1.05%',
    height: '7.45%',
    transform: 'none',
    'z-index': '84',
  });

  applyOverlayGeometry(room);
}

function scanRooms() {
  document.querySelectorAll(ROOM_SELECTOR).forEach((room) => {
    applyRoomState(room);
    if (!room.__roomStateGuardResizeObserver) {
      const resizeObserver = new ResizeObserver(() => applyRoomState(room));
      resizeObserver.observe(room);
      room.__roomStateGuardResizeObserver = resizeObserver;
    }
  });
}

function openRoomToolWithoutNavigation(route, options = {}) {
  const action = ROUTE_TO_ACTION[route] || route;
  queueMicrotask(() => {
    window.__openBattleRoomTool?.(action, options);
    requestAnimationFrame(scanRooms);
  });
}

export function installBattleRoomStateGuard() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scanRooms();
    });
  };

  const observer = new MutationObserver((records) => {
    if (records.some((record) => record.addedNodes.length || record.removedNodes.length)) schedule();
  });

  const start = () => {
    scanRooms();
    observer.observe(document.documentElement, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  window.addEventListener('clbwz:navigate', (event) => {
    const route = event.detail?.route;
    const room = document.querySelector('.game-room.room-rebuild');
    if (!room || !TOOL_ROUTES.has(route)) return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    openRoomToolWithoutNavigation(route, event.detail?.options || {});
  }, true);

  window.addEventListener('clbwz:room-tool-request', (event) => {
    const action = event.detail?.action;
    if (!TOOL_ROUTES.has(action)) return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    openRoomToolWithoutNavigation(action, event.detail?.options || {});
  }, true);

  window.__applyBattleRoomStateGuard = scanRooms;
}