/**
 * 更新公告 · 独立面板（2026-10-06）
 *
 * 为什么单独拆出来：更新公告跟幸运大转盘是两件事，之前把它塞在转盘弹窗里，
 * 点开看到的是"幸运大转盘"的标题 —— 现在自己一个面板，标题就是"更新公告"。
 *
 * 入口有两处，都调 openUpdateLogPanel()：
 *   · 主城"试玩公告"面板里的「更新公告」按钮
 *   · 转盘弹窗右上角的「更新公告」按钮
 */
import { UPDATE_LOG } from '../data/UpdateLog.js';

const MASK_CLASS = 'update-log-mask';

function markup() {
  return `
    <div class="${MASK_CLASS}" hidden>
      <section class="update-log-panel" role="dialog" aria-label="更新公告">
        <header class="update-log-head">
          <strong>更新公告</strong>
          <button type="button" class="update-log-close" data-update-log-close aria-label="关闭">×</button>
        </header>
        <div class="update-log-body">
          ${UPDATE_LOG.map((entry) => `
            <article>
              <h3><time>${entry.date}</time>${entry.title}</h3>
              <ul>${entry.items.map((line) => `<li>${line}</li>`).join('')}</ul>
            </article>`).join('')}
        </div>
      </section>
    </div>`;
}

function ensurePanel() {
  if (typeof document === 'undefined') return null;
  let mask = document.querySelector(`.${MASK_CLASS}`);
  if (!mask) {
    document.body.insertAdjacentHTML('beforeend', markup());
    mask = document.querySelector(`.${MASK_CLASS}`);
  }
  if (mask && mask.dataset.bound !== '1') {
    mask.dataset.bound = '1';
    mask.querySelector('[data-update-log-close]')?.addEventListener('click', () => { mask.hidden = true; });
    mask.addEventListener('click', (event) => { if (event.target === mask) mask.hidden = true; });
  }
  return mask;
}

/** 打开更新公告（两处入口共用这一个出口） */
export function openUpdateLogPanel() {
  const mask = ensurePanel();
  if (!mask) return false;
  mask.hidden = false;
  return true;
}

export function installUpdateLogPanel20261006() {
  if (typeof document === 'undefined') return;
  ensurePanel();
}
