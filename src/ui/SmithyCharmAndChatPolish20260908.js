import { SMITHY_MATERIAL_ART } from './SmithyMaterialArtwork.js';

const PATCH_FLAG = Symbol.for('clbwz.smithyCharmAndChatPolish20260908');
const STYLE_ID = 'smithy-charm-chat-polish-20260908';

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* 铁匠铺底部不再保留单独的钻石储值按钮。 */
    .classic-smithy-screen .smithy-stone-btn {
      display: none !important;
    }

    .classic-chat {
      transition: height .18s ease, max-height .18s ease, min-height .18s ease;
    }

    .classic-chat > .classic-chat-collapse {
      position: absolute;
      right: 10px;
      top: 7px;
      z-index: 8;
      width: 44px;
      height: 36px;
      display: grid;
      place-items: center;
      padding: 0;
      border: 2px solid rgba(222, 189, 94, .9);
      border-radius: 9px;
      color: #ffe59a;
      background: linear-gradient(180deg, rgba(15, 103, 139, .98), rgba(4, 55, 79, .98));
      box-shadow: inset 0 1px rgba(255,255,255,.18), 0 3px 8px rgba(0,0,0,.32);
      font: 700 22px/1 'Microsoft YaHei', sans-serif;
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
      height: 50px !important;
      min-height: 50px !important;
      max-height: 50px !important;
      overflow: hidden !important;
    }

    .classic-chat.is-minimized .classic-chat-log,
    .classic-chat.is-minimized .classic-chat-compose,
    .classic-chat.is-minimized .classic-chat-tools {
      display: none !important;
    }

    .classic-chat.is-minimized > .classic-chat-collapse {
      top: 7px;
    }

    /*
     * 保护符列表之前在 100% 缩放、较矮视口下会落到底部 HUD/聊天栏后面。
     * 这里把左侧滚动区限制在真实可视高度内，并给末尾留安全滚动空间，
     * 让四级保护符在正常缩放下也能滚到完整可见的位置。
     */
    .classic-smithy-screen[data-smithy-mode='strengthen'] .starup-info {
      max-height: min(560px, calc(100dvh - 330px)) !important;
      padding-bottom: 14px !important;
      scroll-padding-bottom: 84px !important;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
    }

    .classic-smithy-screen[data-smithy-mode='strengthen'] .star-charm-list {
      gap: 5px !important;
    }

    .classic-smithy-screen[data-smithy-mode='strengthen'] .star-charm {
      min-height: 52px;
      min-width: 0;
      padding: 5px 8px !important;
    }

    @media (max-height: 920px) {
      .classic-smithy-screen[data-smithy-mode='strengthen'] .starup-info {
        max-height: max(360px, calc(100dvh - 350px)) !important;
        scroll-padding-bottom: 84px !important;
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
        gap: 4px !important;
      }

      .classic-smithy-screen[data-smithy-mode='strengthen'] .star-charm {
        min-height: 48px;
        padding: 4px 7px !important;
      }

      .classic-smithy-screen[data-smithy-mode='strengthen'] .star-charm-list::after {
        content: '';
        display: block;
        height: 84px;
        pointer-events: none;
      }
    }

    /* 宽屏但高度不足时改成 2×2，四个保护符无需浏览器缩放即可同时出现。 */
    @media (max-height: 920px) and (min-width: 1050px) {
      .classic-smithy-screen[data-smithy-mode='strengthen'] .star-charm-list {
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

      .classic-smithy-screen[data-smithy-mode='strengthen'] .star-charm-list::after {
        grid-column: 1 / -1;
        height: 64px;
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

function removeSmithyRecharge(scope = document) {
  const buttons = [];
  if (scope.matches?.('.classic-smithy-screen .smithy-stone-btn, .smithy-stone-btn')) buttons.push(scope);
  for (const button of scope.querySelectorAll?.('.classic-smithy-screen .smithy-stone-btn') ?? []) buttons.push(button);
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

function enhance(scope = document) {
  removeSmithyRecharge(scope);
  fixFourthCharm(scope);
  enhanceChat(scope);
}

export function installSmithyCharmAndChatPolish20260908() {
  if (globalThis[PATCH_FLAG] || typeof document === 'undefined') return;
  globalThis[PATCH_FLAG] = true;
  ensureStyle();
  enhance(document);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('.classic-chat, [data-charm-id="50024"], .smithy-stone-btn')) {
          enhance(node.parentElement ?? node);
        } else if (node.querySelector?.('.classic-chat, [data-charm-id="50024"], .smithy-stone-btn')) {
          enhance(node);
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
