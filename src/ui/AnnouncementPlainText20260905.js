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
  if (!data?.text) return removeFallbackAnnouncement();
  const visibleBar = [...document.querySelectorAll('.classic-system-broadcast')].some((bar) => (
    bar.getClientRects().length > 0 && getComputedStyle(bar).visibility !== 'hidden'
  ));
  if (visibleBar) {
    removeFallbackAnnouncement();
    return;
  }

  let bar = document.getElementById(FALLBACK_ID);
  if (!bar) {
    bar = document.createElement('div');
    bar.id = FALLBACK_ID;
    bar.setAttribute('role', 'status');
    bar.setAttribute('aria-live', 'polite');
    bar.style.cssText = [
      'position:fixed',
      'left:50%',
      'top:18px',
      'transform:translateX(-50%)',
      'z-index:250000',
      'max-width:min(900px,calc(100vw - 32px))',
      'box-sizing:border-box',
      'padding:10px 22px',
      'border:2px solid rgba(225,190,82,.95)',
      'border-radius:12px',
      'background:linear-gradient(180deg,rgba(13,92,118,.98),rgba(4,49,69,.98))',
      'box-shadow:0 5px 18px rgba(0,0,0,.38),inset 0 1px rgba(255,255,255,.2)',
      'color:#fff2b0',
      'font:700 16px/1.5 "Microsoft YaHei",sans-serif',
      'text-align:center',
      'pointer-events:none',
    ].join(';');
    document.body.appendChild(bar);
  }

  const title = String(data.title || '系统广播').replace(DECORATION_RE, '').trim();
  const text = `${title}：${String(data.text)}`;
  if (bar.textContent !== text) bar.textContent = text;
  // Lifetime belongs to SystemAnnouncementClient, including its queue/clear event.
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
