const PATCH_FLAG = Symbol.for('clbwzzz.battleRoomToolCompact');
const OVERLAY_SELECTOR = '.game-room .room-tool-overlay';

function wrapContent(overlay) {
  if (!(overlay instanceof HTMLElement)) return;
  const content = overlay.querySelector('.room-tool-content');
  if (!(content instanceof HTMLElement)) return;

  const action = overlay.dataset.action || 'tool';
  overlay.classList.add('room-tool-compact', `room-tool-${action}`);

  if (content.firstElementChild?.classList.contains('room-tool-surface')) return;
  const surface = document.createElement('div');
  surface.className = `room-tool-surface room-tool-surface-${action}`;
  while (content.firstChild) surface.appendChild(content.firstChild);
  content.appendChild(surface);
}

function scan() {
  document.querySelectorAll(OVERLAY_SELECTOR).forEach(wrapContent);
}

export function installBattleRoomToolCompact() {
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
    const relevant = records.some((record) => record.addedNodes.length || record.removedNodes.length);
    if (relevant) schedule();
  });

  const start = () => {
    scan();
    observer.observe(document.documentElement, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  window.__compactBattleRoomTools = scan;
}
