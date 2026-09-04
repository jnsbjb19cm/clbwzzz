import { audio } from '../core/AudioManager.js';
import { App } from './App.js';
import { BagView } from './BagView.js';
import { ShopView } from './ShopView.js';
import { SmithyView } from './SmithyView.js';
import { TalentView } from './TalentView.js';
import { QuestView } from './QuestView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleRoomPolish');
const ROOM_SELECTOR = '.game-room.room-rebuild';

const ACTION_TITLES = Object.freeze({
  shop: '商城',
  bag: '背包',
  smithy: '打造',
  hero: '人物',
  mail: '邮件',
  friend: '好友',
});

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

let currentApp = null;

function syncRoomMode(room) {
  const pveLike = Boolean(room.querySelector('.room-right-side .question-mark'));
  room.classList.add('room-polish');
  room.classList.toggle('room-pve-like', pveLike);
  room.classList.toggle('room-pvp-like', !pveLike);
}

function rectanglesOverlap(a, b, tolerance = 1) {
  return a.left < b.right - tolerance
    && a.right > b.left + tolerance
    && a.top < b.bottom - tolerance
    && a.bottom > b.top + tolerance;
}

function verifyPolish(room = document.querySelector(ROOM_SELECTOR)) {
  if (!(room instanceof HTMLElement)) {
    return { ok: false, errors: ['未找到准备房'] };
  }

  const errors = [];
  const roomRect = room.getBoundingClientRect();
  const left = room.querySelector('.room-left-side')?.getBoundingClientRect();
  const right = room.querySelector('.room-right-side')?.getBoundingClientRect();
  const vs = room.querySelector('.room-vs')?.getBoundingClientRect();
  const actions = room.querySelector('.room-mid-actions')?.getBoundingClientRect();
  const ready = room.querySelector('#room-ready-btn')?.getBoundingClientRect();
  const fontSize = Number.parseFloat(getComputedStyle(room).fontSize || '0');
  const pveLike = room.classList.contains('room-pve-like');

  if (fontSize < 12) errors.push(`准备房基础字号过小：${fontSize}px`);

  if (left && right && left.width > 0) {
    if (Math.abs(left.width - right.width) > 4) {
      errors.push(`左右阵营宽度不一致：${left.width.toFixed(1)} / ${right.width.toFixed(1)}`);
    }
  }

  if (vs) {
    const roomCenter = roomRect.left + roomRect.width / 2;
    const vsCenter = vs.left + vs.width / 2;
    if (Math.abs(roomCenter - vsCenter) > roomRect.width * 0.03) {
      errors.push(`VS 未居中：偏差 ${Math.round(vsCenter - roomCenter)}px`);
    }
  }

  if (actions && ready && rectanglesOverlap(actions, ready, 3)) {
    errors.push('随机地图/技能区域与开始按钮发生重叠');
  }

  if (pveLike) {
    const teamButton = room.querySelector('.team-btn');
    if (teamButton && getComputedStyle(teamButton).display === 'none') {
      errors.push('PVE/BOSS 房间仍显示换队按钮');
    }
  }

  const more = room.querySelector('.more-dropdown');
  if (more && getComputedStyle(more).display !== 'none') {
    const moreRect = more.getBoundingClientRect();
    if (moreRect.height > roomRect.height * 0.16) {
      errors.push(`设置菜单异常过高：${moreRect.height.toFixed(1)}px`);
    }
  }

  const overlay = room.querySelector('.room-tool-overlay');
  if (overlay) {
    const overlayRect = overlay.getBoundingClientRect();
    if (overlay.parentElement !== room) errors.push('房间工具面板不在准备房内部');
    if (overlayRect.left < roomRect.left || overlayRect.right > roomRect.right) {
      errors.push('房间工具面板横向越界');
    }
    if (currentApp?.route !== 'battle') {
      errors.push(`打开房间工具面板后路由被改成 ${currentApp?.route ?? 'unknown'}`);
    }
  }

  const result = { ok: errors.length === 0, errors };
  room.dataset.roomPolishVerify = result.ok ? 'pass' : 'fail';

  const signature = errors.join('|');
  if (!result.ok && room.dataset.roomPolishLastWarning !== signature) {
    room.dataset.roomPolishLastWarning = signature;
    console.warn('[RoomPolishVerify]', ...errors);
  } else if (result.ok) {
    delete room.dataset.roomPolishLastWarning;
  }

  return result;
}

function closeRoomToolOverlay(room) {
  const overlay = room?.querySelector('.room-tool-overlay');
  overlay?.remove();
  room?.classList.remove('room-tool-open');
}

function createRoomToolOverlay(room, action) {
  closeRoomToolOverlay(room);

  const overlay = document.createElement('section');
  const title = ACTION_TITLES[action] ?? '功能';
  overlay.className = 'room-tool-overlay';
  overlay.dataset.action = action;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', title);
  overlay.innerHTML = `
    <div class="room-tool-window">
      <div class="room-tool-title">${title}</div>
      <button type="button" class="room-tool-close" aria-label="关闭${title}">×</button>
      <div class="room-tool-content"></div>
    </div>
  `;
  room.appendChild(overlay);
  room.classList.add('room-tool-open');

  const close = () => closeRoomToolOverlay(room);
  overlay.querySelector('.room-tool-close')?.addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  return {
    overlay,
    content: overlay.querySelector('.room-tool-content'),
    close,
  };
}

function renderPlaceholder(content, title, message) {
  content.innerHTML = `
    <div class="room-tool-placeholder">
      <div>
        <h2>${title}</h2>
        <p>${message}</p>
      </div>
    </div>
  `;
}

function openRoomTool(app, action, options = {}) {
  const room = document.querySelector(ROOM_SELECTOR);
  if (!app || !(room instanceof HTMLElement)) return;

  const normalizedAction = ROUTE_TO_ACTION[action] ?? action;
  const { content } = createRoomToolOverlay(room, normalizedAction);
  if (!(content instanceof HTMLElement)) return;

  audio.playSfx?.('click');
  const onPlayerUpdate = () => app.updatePlayerDisplay();
  const onNavigateInsideRoom = (route, nestedOptions = {}) => {
    openRoomTool(app, ROUTE_TO_ACTION[route] ?? route, nestedOptions);
  };

  if (normalizedAction === 'bag') {
    const bag = new BagView(
      app.itemDb,
      app.inventory,
      app.db,
      app.cardInventory,
      app.player,
      {
        onPlayerUpdate,
        onNavigate: onNavigateInsideRoom,
      },
    );
    bag.render(content);
  } else if (normalizedAction === 'shop') {
    const shop = new ShopView(
      app.itemDb,
      app.inventory,
      app.db,
      app.cardInventory,
      app.player,
      { onPlayerUpdate },
    );
    shop.render(content);
  } else if (normalizedAction === 'smithy') {
    const smithy = new SmithyView(
      app.db,
      app.itemDb,
      app.inventory,
      app.cardInventory,
      app.player,
      {
        onPlayerUpdate,
        onQuestEvent: (event, data) => QuestView.dispatch(event, data),
        initialTab: options.tab,
        initialCardIndex: options.cardIndex,
      },
    );
    smithy.render(content);
  } else if (normalizedAction === 'hero') {
    const talent = new TalentView(
      app.db,
      app.heroSkills,
      app.player,
      { onPlayerUpdate },
    );
    talent.render(content);
  } else if (normalizedAction === 'mail') {
    renderPlaceholder(content, '邮件', '邮件列表将在服务器账号与消息系统接入后显示；当前面板会保留准备房状态。');
  } else if (normalizedAction === 'friend') {
    renderPlaceholder(content, '好友', '好友、邀请和在线状态将在房间 Socket 接入后显示；当前面板不会离开准备房。');
  } else {
    renderPlaceholder(content, ACTION_TITLES[normalizedAction] ?? '功能', '该功能正在接入。');
  }

  requestAnimationFrame(() => verifyPolish(room));
}

function scanRooms() {
  document.querySelectorAll(ROOM_SELECTOR).forEach((room) => {
    syncRoomMode(room);
    requestAnimationFrame(() => verifyPolish(room));
  });
}

export function installBattleRoomPolish() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const originalMount = App.prototype.mount;
  App.prototype.mount = function mountWithRoomPolish(...args) {
    currentApp = this;
    return originalMount.apply(this, args);
  };

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const bottomButton = target.closest(`${ROOM_SELECTOR} .bottom-btn[data-action]`);
    const skillButton = target.closest(`${ROOM_SELECTOR} .skill-btn`);
    const action = bottomButton?.dataset.action || (skillButton ? 'hero' : null);
    if (!action || !ACTION_TITLES[action]) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openRoomTool(currentApp, action);
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const room = document.querySelector(ROOM_SELECTOR);
    if (room?.querySelector('.room-tool-overlay')) {
      event.preventDefault();
      closeRoomToolOverlay(room);
    }
  });

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
    const roomTreeChanged = records.some((record) => Array.from(record.addedNodes).some((node) => {
      if (!(node instanceof Element)) return false;
      return node.matches?.(ROOM_SELECTOR) || Boolean(node.querySelector?.(ROOM_SELECTOR));
    }));
    if (roomTreeChanged) schedule();
  });

  const start = () => {
    scanRooms();
    observer.observe(document.documentElement, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  window.__verifyBattleRoomPolish = () => verifyPolish();
  window.__openBattleRoomTool = (action, options) => openRoomTool(currentApp, action, options);
}
