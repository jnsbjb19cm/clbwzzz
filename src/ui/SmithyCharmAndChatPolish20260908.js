import { SMITHY_MATERIAL_ART } from './SmithyMaterialArtwork.js';

const PATCH_FLAG = Symbol.for('clbwz.smithyCharmAndChatPolish20260908');
const STYLE_ID = 'smithy-charm-chat-polish-20260908';

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .classic-chat {
      transition: height .18s ease, max-height .18s ease, min-height .18s ease;
    }

    .classic-chat > .classic-chat-collapse {
      position: absolute;
      right: 8px;
      top: 6px;
      z-index: 8;
      width: 28px;
      height: 24px;
      display: grid;
      place-items: center;
      padding: 0;
      border: 1px solid rgba(222, 189, 94, .85);
      border-radius: 6px;
      color: #ffe59a;
      background: linear-gradient(180deg, rgba(15, 93, 125, .96), rgba(4, 55, 79, .96));
      box-shadow: inset 0 1px rgba(255,255,255,.16), 0 2px 5px rgba(0,0,0,.28);
      font: 700 16px/1 'Microsoft YaHei', sans-serif;
      cursor: pointer;
    }

    .classic-chat > .classic-chat-collapse:hover {
      filter: brightness(1.12);
    }

    .classic-chat.is-minimized {
      height: 38px !important;
      min-height: 38px !important;
      max-height: 38px !important;
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
  `;
  document.head.appendChild(style);
}

function fixFourthCharm(scope = document) {
  const level4 = SMITHY_MATERIAL_ART.charm?.[3];
  if (!level4) return;
  for (const button of scope.querySelectorAll?.('[data-charm-id="50024"]') ?? []) {
    const art = button.querySelector('.smithy-material-art');
    const image = art?.querySelector('img');
    if (!art || !image) continue;
    art.dataset.tier = '4';
    if (image.src !== level4) image.src = level4;
  }
}

function enhanceChat(scope = document) {
  for (const chat of scope.querySelectorAll?.('.classic-chat') ?? []) {
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
        if (node.matches?.('.classic-chat, [data-charm-id="50024"]')) enhance(node.parentElement ?? node);
        else if (node.querySelector?.('.classic-chat, [data-charm-id="50024"]')) enhance(node);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
