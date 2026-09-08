import { SMITHY_MATERIAL_ART } from './SmithyMaterialArtwork.js';

const PATCH_FLAG = Symbol.for('clbwz.smithyCharmAndChatPolish20260908');
const STYLE_ID = 'smithy-charm-chat-polish-20260908';
const chatHomes = new WeakMap();
const POWDER_TIER_BY_LABEL = Object.freeze({
  '一级强化粉': 1,
  '二级强化粉': 2,
  '三级强化粉': 3,
  '四级强化粉': 4,
  '五级强化粉': 5,
});
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

    .classic-smithy-screen[data-smithy-mode='strengthen'] .starup-info {
      max-height: min(560px, calc(100dvh - 300px)) !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      padding-bottom: 18px !important;
      scroll-padding-bottom: 28px !important;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
    }

    /*
     * 保护符固定两行两列。左侧 starup-info 已向左扩宽，所以不再需要横向轨道，
     * 每格可以完整容纳图标、一级/二级/三级/四级保护符名称以及数量。
     */
    .classic-smithy-screen[data-smithy-mode='strengthen'] .star-charm-list {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      grid-template-rows: repeat(2, minmax(0, auto)) !important;
      grid-auto-flow: row !important;
      align-items: stretch !important;
      gap: 8px !important;
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
      overflow: visible !important;
      padding: 0 !important;
    }

    .classic-smithy-screen[data-smithy-mode='strengthen'] .star-charm {
      box-sizing: border-box !important;
      display: flex !important;
      align-items: center !important;
      min-height: 58px !important;
      min-width: 0 !important;
      width: 100% !important;
      padding: 6px 10px !important;
      gap: 7px !important;
    }

    .classic-smithy-screen[data-smithy-mode='strengthen'] .star-charm > .smithy-material-art {
      flex: 0 0 auto !important;
    }

    .classic-smithy-screen[data-smithy-mode='strengthen'] .star-charm > span:not(.smithy-material-art) {
      flex: 1 1 auto !important;
      min-width: 0 !important;
      overflow: visible !important;
      text-overflow: clip !important;
      white-space: nowrap !important;
      font-size: .9rem !important;
    }

    .classic-smithy-screen[data-smithy-mode='strengthen'] .star-charm > b {
      flex: 0 0 auto !important;
      white-space: nowrap !important;
      font-size: .82rem !important;
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

      .classic-smithy-screen[data-smithy-mode='strengthen'] .star-charm {
        min-height: 52px !important;
        padding: 5px 8px !important;
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

/*
 * 强化粉消耗本身由 CardStrengthenSystem 的 powderNeed.itemId 决定，界面文字也是
 * 根据该 itemId 输出；之前只有图标错误地用 star + 1 选帧，导致每升一星图标就变。
 * 这里以实际显示的强化粉物品名为权威，把 powder.png 帧固定到真正消耗的粉末等级。
 */
function fixPowderArtwork(scope = document) {
  const lines = [];
  if (scope.matches?.('.smithy-material-line')) lines.push(scope);
  for (const line of scope.querySelectorAll?.('.smithy-material-line') ?? []) lines.push(line);

  for (const line of lines) {
    const art = line.querySelector('[data-smithy-art="powder"]');
    if (!art) continue;
    const text = line.textContent ?? '';
    const matched = Object.entries(POWDER_TIER_BY_LABEL).find(([label]) => text.includes(label));
    if (!matched) continue;
    const tier = matched[1];
    const visualTier = Math.max(1, Math.min(4, tier));
    const offset = ((visualTier - 1) / 3) * 100;
    art.dataset.tier = String(tier);
    art.style.backgroundSize = '100% 400%';
    art.style.backgroundPosition = `50% ${offset}%`;
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
      void list.getBoundingClientRect().height;
    }
  }
}

function runLayoutSync() {
  layoutQueued = false;
  removeRechargeButtons(document);
  fixPowderArtwork(document);
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
  fixPowderArtwork(scope);
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
        if (node.matches?.('.classic-chat, [data-charm-id="50024"], [data-smithy-art="powder"], .smithy-material-line, .smithy-stone-btn, #lobby-recharge, .lobby-btn-recharge, #lobby-room-inside, .classic-smithy-screen')) {
          enhance(node.parentElement ?? node);
          needsEnhance = false;
        } else if (node.querySelector?.('.classic-chat, [data-charm-id="50024"], [data-smithy-art="powder"], .smithy-material-line, .smithy-stone-btn, #lobby-recharge, .lobby-btn-recharge, #lobby-room-inside, .classic-smithy-screen')) {
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
