const PATCH_FLAG = Symbol.for('clbwz.announcementPlainText20260905');
const DECORATION_RE = /^[\s📣📌🃏✨]+/u;
const FALLBACK_ID = 'clbwz-system-announcement-fallback-20260908';

function cleanAnnouncementDecorations(root = document) {
  root?.querySelectorAll?.('.classic-broadcast-label').forEach((label) => {
    const next = String(label.textContent ?? '').replace(DECORATION_RE, '').trimStart();
    if (next !== label.textContent) label.textContent = next;
  });
  root?.querySelectorAll?.('.trial-bulletin-pin').forEach((node) => node.remove());
}

function removeFallbackAnnouncement() {
  document.getElementById(FALLBACK_ID)?.remove();
}

function ensureFallbackAnnouncement(data) {
  // 不再创建顶部悬浮的 fallback 播报条：战斗/房间没有 classic-system-broadcast 时，
  // 系统消息仍会进入左下角战斗聊天；主城/铁匠铺仍保留原有 classic 广播条。
  removeFallbackAnnouncement();
}

function syncAnnouncementVisibility(root = document) {
  const data = globalThis.__clbwzLastSystemAnnouncement ?? null;
  const bars = [...(root?.querySelectorAll?.('.classic-system-broadcast') ?? [])];
  if (root?.matches?.('.classic-system-broadcast')) bars.unshift(root);

  if (data?.text) {
    for (const bar of bars) {
      bar.hidden = false;
      bar.classList.remove('hidden', 'is-idle');
      bar.style.visibility = 'visible';
      bar.style.opacity = '1';
      const label = bar.querySelector('.classic-broadcast-label');
      if (label) label.textContent = String(data.title || '系统广播').replace(DECORATION_RE, '').trim();
      const track = bar.querySelector('.classic-broadcast-track');
      if (track && !track.textContent?.includes(String(data.text))) {
        track.replaceChildren();
        const item = document.createElement('b');
        item.className = 'classic-broadcast-item';
        item.textContent = String(data.text);
        track.append(item);
      }
    }
  }

  cleanAnnouncementDecorations(root);
  ensureFallbackAnnouncement(data);
}

export function installAnnouncementPlainText20260905() {
  if (globalThis[PATCH_FLAG] || typeof document === 'undefined') return;
  globalThis[PATCH_FLAG] = true;

  const options = {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'hidden', 'style'],
  };
  // Updating hidden/class/style/text itself generates mutations. Disconnect while
  // rendering so the observer cannot recursively trigger itself and freeze RAF.
  const sync = () => {
    observer.disconnect();
    try { syncAnnouncementVisibility(document); }
    finally { observer.observe(document.documentElement, options); }
  };
  const observer = new MutationObserver(sync);
  sync();

  window.addEventListener('clbwz:system-announcement', (event) => {
    if (event.detail?.clear) removeFallbackAnnouncement();
    sync();
  });
  globalThis.__clbwzAnnouncementPlainTextObserver = observer;
}
