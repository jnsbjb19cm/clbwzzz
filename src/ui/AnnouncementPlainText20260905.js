const PATCH_FLAG = Symbol.for('clbwz.announcementPlainText20260905');
const DECORATION_RE = /^[\s📣📌🃏✨]+/u;

function cleanAnnouncementDecorations(root = document) {
  root?.querySelectorAll?.('.classic-broadcast-label').forEach((label) => {
    const next = String(label.textContent ?? '').replace(DECORATION_RE, '').trimStart();
    if (next !== label.textContent) label.textContent = next;
  });
  root?.querySelectorAll?.('.trial-bulletin-pin').forEach((node) => node.remove());
}

export function installAnnouncementPlainText20260905() {
  if (globalThis[PATCH_FLAG] || typeof document === 'undefined') return;
  globalThis[PATCH_FLAG] = true;

  const clean = () => cleanAnnouncementDecorations(document);
  clean();

  const observer = new MutationObserver(() => clean());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  window.addEventListener('clbwz:system-announcement', () => clean());
  globalThis.__clbwzAnnouncementPlainTextObserver = observer;
}
