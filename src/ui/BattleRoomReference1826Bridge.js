const PATCH_FLAG = Symbol.for('clbwzzz.battleRoomReference1536Bridge');
const ROOM_SELECTOR = '.game-room.room-exact';
const REFERENCE_CLASS = 'room-reference-1536';

const MAPS = Object.freeze([
  { id: '2', label: '草地', scene: 'grass' },
  { id: '4', label: '冰川', scene: 'ice' },
  { id: '7', label: '黄沙', scene: 'rock' },
]);

function roomView(room) {
  return room?.__deckUiV3View ?? null;
}

function showHint(view, root, message) {
  if (view?._showToast) {
    view._showToast(root, message);
    return;
  }
  let toast = root?.querySelector?.('.room-toast');
  if (!toast && root instanceof HTMLElement) {
    toast = document.createElement('div');
    toast.className = 'room-toast';
    root.append(toast);
  }
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(toast.__referenceTimer);
  toast.__referenceTimer = window.setTimeout(() => toast.classList.remove('show'), 1800);
}

function removeInline(element, properties) {
  if (!(element instanceof HTMLElement)) return;
  properties.forEach((property) => element.style.removeProperty(property));
}

function releaseLegacyRoomGeometry(room) {
  if (!(room instanceof HTMLElement)) return;
  removeInline(room, ['font-size', 'overflow', 'isolation', 'background', 'background-image']);
  removeInline(room.querySelector('.room-left-side'), [
    'position', 'left', 'right', 'top', 'bottom', 'width', 'height', 'transform', 'z-index',
  ]);
  removeInline(room.querySelector('.room-right-side'), [
    'position', 'left', 'right', 'top', 'bottom', 'width', 'height', 'margin', 'padding', 'overflow',
    'border', 'background', 'transform', 'z-index', 'pointer-events',
  ]);
  removeInline(room.querySelector('.room-right-side .top-enemy'), [
    'position', 'left', 'right', 'top', 'bottom', 'width', 'height', 'margin', 'transform', 'z-index', 'pointer-events',
  ]);
  removeInline(room.querySelector('.room-right-side .enemy-slots-row'), [
    'position', 'left', 'right', 'top', 'bottom', 'width', 'height', 'display', 'grid-template-columns',
    'gap', 'margin', 'transform', 'z-index', 'pointer-events',
  ]);
  room.querySelectorAll('.room-right-side .enemy-slots-row > .enemy-slot').forEach((slot) => removeInline(slot, [
    'position', 'inset', 'left', 'right', 'top', 'bottom', 'width', 'height', 'min-width', 'min-height',
    'margin', 'transform', 'overflow', 'pointer-events',
  ]));

  const actions = room.querySelector('.room-mid-actions');
  removeInline(actions, [
    'position', 'inset', 'left', 'right', 'top', 'bottom', 'width', 'height', 'display', 'grid-template-columns',
    'gap', 'margin', 'transform', 'overflow', 'z-index',
  ]);
  actions?.querySelectorAll(':scope > .mid-btn, :scope > button').forEach((button) => removeInline(button, [
    'position', 'inset', 'left', 'right', 'top', 'bottom', 'width', 'height', 'min-width', 'min-height',
    'margin', 'transform', 'display',
  ]));
  removeInline(room.querySelector('#room-ready-btn'), [
    'position', 'left', 'right', 'top', 'bottom', 'width', 'height', 'margin', 'transform', 'z-index',
  ]);
  removeInline(room.querySelector('.room-vs'), [
    'position', 'left', 'right', 'top', 'bottom', 'width', 'height', 'transform', 'z-index',
  ]);
  removeInline(room.querySelector('.room-bottom-bar'), [
    'position', 'left', 'right', 'top', 'bottom', 'width', 'height', 'transform', 'z-index',
  ]);
}

function ensureRechargeButton(room) {
  if (!(room instanceof HTMLElement) || room.querySelector('.reference-room-recharge')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'reference-room-recharge';
  button.setAttribute('aria-label', '钻石储值');
  button.innerHTML = '<span>钻石储值</span>';
  room.append(button);
}

function mapByScene(scene) {
  return MAPS.find((entry) => entry.scene === String(scene || '')) ?? null;
}

function currentMap(room, view) {
  const button = room?.querySelector?.('.dice-btn');
  const dataId = String(button?.dataset?.mapId || view?._roomState?.mapId || '');
  const fromId = MAPS.find((entry) => entry.id === dataId);
  if (fromId) return fromId;

  const fromScene = mapByScene(typeof window !== 'undefined' ? window.__pvpMapScene : null);
  if (fromScene) return fromScene;

  const title = String(button?.title || '');
  const fromTitle = MAPS.find((entry) => title.includes(entry.label));
  if (fromTitle) return fromTitle;

  return MAPS[2];
}

function ensureMapTypeBadge(room) {
  const button = room?.querySelector?.('.dice-btn');
  if (!(button instanceof HTMLElement)) return null;
  let badge = button.querySelector('.reference-room-map-type');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'reference-room-map-type';
    button.append(badge);
  }
  return badge;
}

function syncMapType(room, forcedMap = null) {
  const view = roomView(room);
  const map = forcedMap ?? currentMap(room, view);
  const button = room?.querySelector?.('.dice-btn');
  const badge = ensureMapTypeBadge(room);
  if (button) {
    button.dataset.mapId = map.id;
    button.dataset.mapType = map.scene;
    button.title = `随机地图（当前：${map.label}地图）`;
  }
  if (badge) badge.textContent = `当前地图：${map.label}`;
  if (room) {
    room.dataset.currentMapId = map.id;
    room.dataset.currentMapType = map.scene;
  }
  return map;
}

function randomIndex(length) {
  if (length <= 1) return 0;
  if (globalThis.crypto?.getRandomValues) {
    const value = new Uint32Array(1);
    globalThis.crypto.getRandomValues(value);
    return value[0] % length;
  }
  return Math.floor(Math.random() * length);
}

function pickDifferentMap(currentId) {
  const candidates = MAPS.filter((entry) => entry.id !== String(currentId));
  return candidates[randomIndex(candidates.length)] ?? MAPS[0];
}

async function randomizeMap(room) {
  const view = roomView(room);
  if (!view) return;
  if (view._mode !== 'pvp' || typeof view._roomState?.onChangeMap !== 'function') {
    showHint(view, room, '当前模式不能随机地图');
    return;
  }
  const isOwner = Boolean(view._roomState?.isOwner ?? view._isOwner);
  if (!isOwner) {
    showHint(view, room, '只有房主可以随机地图');
    return;
  }
  if (room.dataset.mapRandomPending === '1') return;

  const before = syncMapType(room);
  const next = pickDifferentMap(before.id);
  room.dataset.mapRandomPending = '1';
  room.dataset.lastRandomMapId = next.id;
  syncMapType(room, next);
  if (typeof window !== 'undefined') window.__pvpMapScene = next.scene;

  try {
    await Promise.resolve(view._roomState.onChangeMap(next.id));
  } finally {
    delete room.dataset.mapRandomPending;
  }
}

function decorateRoom(room) {
  if (!(room instanceof HTMLElement)) return;
  room.classList.remove('room-reference-1826');
  room.classList.add(REFERENCE_CLASS);

  window.__applyBattleRoomStateGuard?.();
  window.__applyBattleRoomEnemyGeometry?.();
  releaseLegacyRoomGeometry(room);

  ensureRechargeButton(room);
  syncMapType(room);

  if (!room.__reference1536ResizeObserver && typeof ResizeObserver !== 'undefined') {
    const resizeObserver = new ResizeObserver(() => {
      releaseLegacyRoomGeometry(room);
      syncMapType(room);
    });
    resizeObserver.observe(room);
    room.__reference1536ResizeObserver = resizeObserver;
  }
}

function scanRooms() {
  document.querySelectorAll(ROOM_SELECTOR).forEach(decorateRoom);
}

function stopOwnedClick(event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function rectsOverlap(a, b, tolerance = 2) {
  if (!a || !b || a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return false;
  return a.left < b.right - tolerance
    && a.right > b.left + tolerance
    && a.top < b.bottom - tolerance
    && a.bottom > b.top + tolerance;
}

function verifyReferenceRoom() {
  const room = document.querySelector(`${ROOM_SELECTOR}.${REFERENCE_CLASS}`);
  const view = roomView(room);
  const map = room ? syncMapType(room) : null;
  const rect = (selector) => room?.querySelector(selector)?.getBoundingClientRect?.() ?? null;
  const pairs = [
    ['聊天/随机地图', rect('.exact-room-chat'), rect('.dice-btn')],
    ['随机地图/技能', rect('.dice-btn'), rect('.skill-btn')],
    ['技能/换队', rect('.skill-btn'), rect('.team-btn')],
    ['换队/准备', rect('.team-btn'), rect('#room-ready-btn')],
    ['技能/底栏', rect('.skill-btn'), rect('.room-bottom-bar')],
    ['换队/底栏', rect('.team-btn'), rect('.room-bottom-bar')],
    ['准备/底栏', rect('#room-ready-btn'), rect('.room-bottom-bar')],
    ['储值/底栏', rect('.reference-room-recharge'), rect('.room-bottom-bar')],
  ];
  const overlaps = pairs.filter(([, a, b]) => rectsOverlap(a, b)).map(([name]) => name);
  const roomRect = room?.getBoundingClientRect?.();
  const backgroundImage = room ? getComputedStyle(room).backgroundImage : '';

  return {
    enabled: Boolean(room),
    fullWidth: Boolean(roomRect && Math.abs(roomRect.width - window.innerWidth) <= 3),
    fullHeight: Boolean(roomRect && Math.abs(roomRect.height - window.innerHeight) <= 3),
    usesFullRoomImage: /gameroom\.png|1000110618|参考图/i.test(backgroundImage),
    deckSlots: room?.querySelectorAll('#deck-slots-row .deck-slot-item').length ?? 0,
    hasChat: Boolean(room?.querySelector('.exact-room-chat')),
    hasRandomMap: Boolean(room?.querySelector('.dice-btn')),
    hasMapType: Boolean(room?.querySelector('.reference-room-map-type')),
    currentMapId: map?.id ?? null,
    currentMapLabel: map?.label ?? null,
    hasSkill: Boolean(room?.querySelector('.skill-btn')),
    hasSwitchTeam: Boolean(room?.querySelector('.team-btn')),
    hasReady: Boolean(room?.querySelector('#room-ready-btn')),
    hasRecharge: Boolean(room?.querySelector('.reference-room-recharge')),
    switchConnected: typeof view?._roomState?.onSwitch === 'function',
    readyConnected: typeof view?._roomState?.onReady === 'function' || typeof view?._roomState?.onStart === 'function',
    mapConnected: typeof view?._roomState?.onChangeMap === 'function',
    overlaps,
    noOverlap: overlaps.length === 0,
  };
}

export function installBattleRoomReference1826Bridge() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const room = target?.closest?.(`${ROOM_SELECTOR}.${REFERENCE_CLASS}`);
    if (!room) return;

    if (target.closest('.dice-btn')) {
      stopOwnedClick(event);
      void randomizeMap(room);
      return;
    }

    if (target.closest('.team-btn')) {
      stopOwnedClick(event);
      const view = roomView(room);
      if (!view) return;
      if (view._mode !== 'pvp' || typeof view._roomState?.onSwitch !== 'function') {
        showHint(view, room, '当前模式不能换队');
        return;
      }
      view._roomState.onSwitch();
      return;
    }

    if (target.closest('.reference-room-recharge')) {
      stopOwnedClick(event);
      if (typeof window.__openBattleRoomTool === 'function') {
        window.__openBattleRoomTool('shop');
      } else {
        window.dispatchEvent(new CustomEvent('clbwz:navigate', { detail: { route: 'shop' } }));
      }
    }
  }, true);

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
    window.addEventListener('resize', schedule, { passive: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  window.__verifyBattleRoomReference1536 = verifyReferenceRoom;
  window.__verifyBattleRoomReference1826 = verifyReferenceRoom;
  window.__randomizeBattleRoomMap1536 = () => {
    const room = document.querySelector(`${ROOM_SELECTOR}.${REFERENCE_CLASS}`);
    return room ? randomizeMap(room) : undefined;
  };
  window.__randomizeBattleRoomMap1826 = window.__randomizeBattleRoomMap1536;
}