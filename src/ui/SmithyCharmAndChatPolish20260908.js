import { SMITHY_MATERIAL_ART } from './SmithyMaterialArtwork.js';

const PATCH_FLAG = Symbol.for('clbwz.smithyCharmAndChatPolish20260908');
const STYLE_ID = 'smithy-charm-chat-polish-20260908';
const chatHomes = new WeakMap();
let layoutQueued = false;

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* 铁匠铺底部不再保留单独的钻石储值按钮。 */
    .classic-smithy-screen .smithy-stone-btn,
    #lobby-recharge,
    .lobby-btn-recharge {
      display: none !important;
    }

    .classic-chat {
      transition: height .18s ease, max-height .18s ease, min-height .18s ease;
    }

    .classic-chat > .classic-chat-collapse {
      position: absolute;
      right: 10px;
      top: 5px;
      z-index: 8;
      width: 56px;
      height: 44px;
      display: grid;
      place-items: center;
      padding: 0;
      border: 2px solid rgba(222, 189, 94, .9);
      border-radius: 10px;
      color: #ffe59a;
      background: linear-gradient(180deg, rgba(15, 103, 139, .98), rgba(4, 55, 79, .98));
      box-shadow: inset 0 1px rgba(255,255,255,.18), 0 3px 8px rgba(0,0,0,.32);
      font: 700 26px/1 'Microsoft YaHei', sans-serif;
      cursor: pointer;
      touch-action: manipulation;
    }

    .classic-chat > .classic-chat-collapse:hover {
      filter: brightness(1.14);
    }

    .classic-chat > .classic-chat-collapse:focus-visible {
      outline: 2px solid #ffe59a;
      outline-offset: 2px;
    }

    .classic-chat.is-minimized {
      height: 58px !important;
      min-height: 58px !important;
      max-height: 58px !important;
      overflow: hidden !important;
    }

    .classic-chat.is-minimized .classic-chat-log,
    .classic-chat.is-minimized .classic-chat-compose,
    .classic-chat.is-minimized .classic-chat-tools {
      display: none !important;
    }

    .classic-chat.is-minimized > .classic-chat-collapse {
      top: 6px;
    }

    /* 房间聊天属于房间本身，不再作为页面级 fixed 浮层漂在左下角。 */
    #lobby-room-inside {
      position: relative;
    }

    #lobby-room-inside > .classic-chat[data-room-docked='true'] {
      position: absolute !important;
      left: 12px !important;
      right: auto !important;
      top: auto !important;
      bottom: 12px !important;
      width: min(360px, calc(100% - 24px)) !important;
      max-width: calc(100% - 24px) !important;
      margin: 0 !important;
      transform: none !important;
      z-index: 80 !important;
    }

    /*
     * 100% 浏览器缩放下左侧保护符曾仍按单列排布，宽屏媒体规则只写了
     * grid-template-columns 却没有真正启用 grid，缩放后触发布局变化才“看起来恢复”。
     * 这里直接锁定真实网格和内部滚动，四个保护符在正常缩放即可完整访问。
     */
    .classic-smithy-screen[data-smithy-mode='strengthen'] .starup-info {
      max-height: min(560px, calc(100dvh - 300px)) !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      padding-bottom: 18px !important;
      scroll-padding-bottom: 28px !important;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
    }

    .classic-smithy-screen[data-smithy-mode='strengthen'] .star-charm-list {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) !important;
      align-items: stretch;
      gap: 5px !important;
      min-width: 0;
    }

    .classic-smithy-screen[data-smithy-mode='strengthen'] .star-charm {
      min-height: 52px;
      min-width: 0;
      padding: 5px 8px !important;
    }

    @media (max-height: 920px) {
      .classic-smithy-screen[data-smithy-mode='strengthen'] .starup-info {
        max-height: max(390px, calc(100dvh - 310px)) !important;
        scroll-padding-bottom: 28px !important;
      }

      .classic-smithy-screen[data-smithy-mode='strengthen'] .starup-info > h3 {
        margin-top: 7px !important;
        margin-bottom: 6px !important;
      }

      .classic-smithy-screen[data-smithy-mode='strengthen'] .starup-info > p {
        margin-top: 6px !important;
        margin-bottom: 6px !important;
      }

      .classic-smithy-screen[data-smithy-mode='strengthen'] .star-charm-list {
        gap: 5px !important;
      }

      .classic-smithy-screen[data-smithy-mode='strengthen'] .star-charm {
        min-height: 48px;
        padding: 4px 7px !important;
      }
    }

    /* 你截图这种宽屏、低高度窗口直接 2×2，不依赖浏览器缩放触发。 */
    @media (max-height: 920px) and (min-width: 1050px) {
      .classic-smithy-screen[data-smithy-mode='strengthen'] .star-charm-list {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      }

      .classic-smithy-screen[data-smithy-mode='strengthen'] .star-charm {
        gap: 4px;
      }

      .classic-smithy-screen[data-smithy-mode='strengthen'] .star-charm span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .classic-smithy-screen[data-smithy-mode='strengthen'] .star-charm b {
        flex: 0 0 auto;
        font-size: .78rem;
      }
    }
  `;
  document.head.appendChild(style);
}

function fixFourthCharm(scope = document) {
  const level4 = SMITHY_MATERIAL_ART.charm?.[3];
  if (!level4) return;
  const buttons = [];
  if (scope.matches?.('[data-charm-id="50024"]')) buttons.push(scope);
  for (const button of scope.querySelectorAll?.('[data-charm-id="50024"]') ?? []) buttons.push(button);
  for (const button of buttons) {
    const art = button.querySelector('.smithy-material-art');
    const image = art?.querySelector('img');
    if (!art || !image) continue;
    art.dataset.tier = '4';
    image.src = level4;
    image.alt = '';
  }
}

function removeRechargeButtons(scope = document) {
  const buttons = [];
  if (scope.matches?.('.classic-smithy-screen .smithy-stone-btn, .smithy-stone-btn, #lobby-recharge, .lobby-btn-recharge')) {
    buttons.push(scope);
  }
  for (const button of scope.querySelectorAll?.('.classic-smithy-screen .smithy-stone-btn, #lobby-recharge, .lobby-btn-recharge') ?? []) {
    buttons.push(button);
  }
  for (const button of buttons) button.remove();
}

function enhanceChat(scope = document) {
  const chats = [];
  if (scope.matches?.('.classic-chat')) chats.push(scope);
  for (const chat of scope.querySelectorAll?.('.classic-chat') ?? []) chats.push(chat);

  for (const chat of chats) {
    if (chat.dataset.minimizeBound === 'true') continue;
    chat.dataset.minimizeBound = 'true';
    if (getComputedStyle(chat).position === 'static') chat.style.position = 'relative';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'classic-chat-collapse';
    button.dataset.classicChatCollapse = 'true';
    button.textContent = '—';
    button.title = '最小化聊天栏';
    button.setAttribute('aria-label', '最小化聊天栏');
    button.setAttribute('aria-expanded', 'true');

    button.addEventListener('click', () => {
      const minimized = chat.classList.toggle('is-minimized');
      button.textContent = minimized ? '□' : '—';
      button.title = minimized ? '展开聊天栏' : '最小化聊天栏';
      button.setAttribute('aria-label', button.title);
      button.setAttribute('aria-expanded', minimized ? 'false' : 'true');
    });

    chat.appendChild(button);
  }
}

function rememberChatHome(chat) {
  if (chatHomes.has(chat) || !chat.parentNode) return;
  const marker = document.createComment('classic-chat-home');
  chat.parentNode.insertBefore(marker, chat);
  chatHomes.set(chat, marker);
}

function syncRoomChatDock() {
  const room = document.querySelector('#lobby-room-inside');
  const roomActive = Boolean(room && room.isConnected && !room.classList.contains('hidden'));

  for (const chat of document.querySelectorAll('.classic-chat')) {
    if (roomActive) {
      if (chat.parentElement !== room) {
        rememberChatHome(chat);
        room.appendChild(chat);
      }
      chat.dataset.roomDocked = 'true';
      continue;
    }

    if (chat.dataset.roomDocked !== 'true') continue;
    const marker = chatHomes.get(chat);
    if (marker?.parentNode) marker.parentNode.insertBefore(chat, marker.nextSibling);
    delete chat.dataset.roomDocked;
  }
}

function normalizeSmithyLayout() {
  for (const screen of document.querySelectorAll('.classic-smithy-screen[data-smithy-mode="strengthen"]')) {
    const info = screen.querySelector('.starup-info');
    const list = screen.querySelector('.star-charm-list');
    if (info) {
      info.style.overflowY = 'auto';
      info.style.overflowX = 'hidden';
    }
    if (list) {
      list.style.display = 'grid';
      /* 强制读取一次几何信息，让隐藏→显示/字体加载后的首次 100% 布局立即落地。 */
      void list.getBoundingClientRect().height;
    }
  }
}

function runLayoutSync() {
  layoutQueued = false;
  removeRechargeButtons(document);
  normalizeSmithyLayout();
  syncRoomChatDock();
}

function queueLayoutSync() {
  if (layoutQueued) return;
  layoutQueued = true;
  const raf = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (callback) => setTimeout(callback, 0);
  raf(() => raf(runLayoutSync));
}

function enhance(scope = document) {
  removeRechargeButtons(scope);
  fixFourthCharm(scope);
  enhanceChat(scope);
  queueLayoutSync();
}

export function installSmithyCharmAndChatPolish20260908() {
  if (globalThis[PATCH_FLAG] || typeof document === 'undefined') return;
  globalThis[PATCH_FLAG] = true;
  ensureStyle();
  enhance(document);

  const observer = new MutationObserver((mutations) => {
    let needsEnhance = false;
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        needsEnhance = true;
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('.classic-chat, [data-charm-id="50024"], .smithy-stone-btn, #lobby-recharge, .lobby-btn-recharge, #lobby-room-inside, .classic-smithy-screen')) {
          enhance(node.parentElement ?? node);
          needsEnhance = false;
        } else if (node.querySelector?.('.classic-chat, [data-charm-id="50024"], .smithy-stone-btn, #lobby-recharge, .lobby-btn-recharge, #lobby-room-inside, .classic-smithy-screen')) {
          enhance(node);
          needsEnhance = false;
        }
      }
    }
    if (needsEnhance) queueLayoutSync();
    else queueLayoutSync();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'data-smithy-mode'],
  });

  window.addEventListener('resize', queueLayoutSync, { passive: true });
  window.addEventListener('orientationchange', queueLayoutSync, { passive: true });

  if (typeof ResizeObserver === 'function') {
    const resizeObserver = new ResizeObserver(() => queueLayoutSync());
    resizeObserver.observe(document.documentElement);
  }

  document.fonts?.ready?.then?.(() => queueLayoutSync()).catch?.(() => {});
  queueLayoutSync();
}
