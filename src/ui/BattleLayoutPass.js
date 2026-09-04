import {
  FIELD_H,
  FIELD_W,
  GAME_H,
  GAME_W,
  GRID_BODY_H,
  GRID_BODY_W,
  GRID_BOX_TOP_FIELD_Y,
} from '../battle/BattleConfig.js';
import { BattleView } from './BattleView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.battleLayoutPass');

const BOTTOM_BUTTONS = {
  shop: ['🛒', '商城'],
  bag: ['🎒', '背包'],
  smithy: ['🔨', '打造'],
  hero: ['👤', '人物'],
  mail: ['✉', '邮件'],
  friend: ['👥', '好友'],
};

function setButtonContent(button, icon, label) {
  if (!button || button.dataset.layoutLabel === label) return;
  button.dataset.layoutLabel = label;
  button.innerHTML = `<span class="room-nav-icon" aria-hidden="true">${icon}</span><span class="room-nav-label">${label}</span>`;
  button.setAttribute('aria-label', label);
}

function decorateRoom(room) {
  if (!(room instanceof HTMLElement) || room.dataset.layoutPass === '1') return;
  room.dataset.layoutPass = '1';

  for (const [action, [icon, label]] of Object.entries(BOTTOM_BUTTONS)) {
    setButtonContent(room.querySelector(`.bottom-btn[data-action="${action}"]`), icon, label);
  }
  setButtonContent(room.querySelector('#more-btn'), '⚙', '更多');
  setButtonContent(room.querySelector('#back-btn'), '↩', '返回');

  setButtonContent(room.querySelector('.dice-btn'), '🎲', '随机地图');
  setButtonContent(room.querySelector('.skill-btn'), '⚔', '技能');
  setButtonContent(room.querySelector('.team-btn'), '⇄', '换队');

  const drawer = room.querySelector('#card-drawer');
  if (drawer && !drawer.querySelector('.drawer-slide-grip')) {
    drawer.setAttribute('aria-modal', 'false');
    drawer.setAttribute('aria-label', '向下展开的换卡抽屉');
    const grip = document.createElement('div');
    grip.className = 'drawer-slide-grip';
    grip.innerHTML = '<span></span><b>卡牌仓库</b><span></span>';
    drawer.prepend(grip);
  }

  const pager = drawer?.querySelector('.exact-drawer-pager');
  const prev = pager?.querySelector('[data-page="prev"]');
  const next = pager?.querySelector('[data-page="next"]');
  if (prev) {
    prev.textContent = '▲';
    prev.setAttribute('aria-label', '向上翻页');
  }
  if (next) {
    next.textContent = '▼';
    next.setAttribute('aria-label', '向下翻页');
  }

  const chatInput = room.querySelector('.exact-room-chat-form input');
  if (chatInput) chatInput.placeholder = '输入聊天内容，Enter 发送';
  const chatButton = room.querySelector('.exact-room-chat-form button');
  if (chatButton) chatButton.textContent = '发送';
}

function scanRooms() {
  document.querySelectorAll('.game-room.room-exact').forEach(decorateRoom);
}

export function installBattleLayoutPass() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  BattleView.prototype.fitBattleScale = function fitBattleScaleStable(root) {
    const wrap = root?.querySelector?.('.battle-game-wrap');
    const game = root?.querySelector?.('.game-container');
    if (!wrap || !game) return;
    const availableWidth = Math.max(1, wrap.clientWidth - 12);
    const availableHeight = Math.max(1, wrap.clientHeight - 12);
    const scale = Math.max(0.35, Math.min(availableWidth / GAME_W, availableHeight / GAME_H));
    game.style.setProperty('--battle-scale', String(scale));

    // 战场画布 1:1(消除拉伸变形)：canvas 属性 = battlefield-wrap 显示尺寸，
    // 渲染器按 fieldScale 等比放大战场网格(GRID_BODY 区域)，网格 overlay 同 scale 同偏移 → 格子像素对齐、正方形、不压缩
    const stage = root?.querySelector?.('.battlefield-wrap');
    const canvas = root?.querySelector?.('#battle-canvas');
    const overlay = root?.querySelector?.('#place-grid-overlay');
    if (stage && canvas) {
      const stageW = Math.max(1, stage.clientWidth);
      const stageH = Math.max(1, stage.clientHeight);
      canvas.width = stageW;
      canvas.height = stageH;
      // 战场宽度优先铺满(全屏场地)，高度不足时退回 contain，垂直居中
      let fs = stageW / GRID_BODY_W;
      if (GRID_BODY_H * fs > stageH) fs = stageH / GRID_BODY_H;
      fs = Math.max(0.1, fs);
      const ox = (stageW - GRID_BODY_W * fs) / 2;
      const oy = (stageH - GRID_BODY_H * fs) / 2;
      if (this.renderer) {
        this.renderer.fieldScale = fs;
        this.renderer.fieldOffsetX = ox;
        this.renderer.fieldOffsetY = oy;
      }
      if (overlay) {
        Object.assign(overlay.style, {
          left: ox + 'px',
          top: (oy + GRID_BOX_TOP_FIELD_Y * fs) + 'px',
          width: GRID_BODY_W + 'px',
          height: GRID_BODY_H + 'px',
          transform: 'scale(' + fs + ')',
          transformOrigin: '0 0',
        });
      }
    }
  };

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scanRooms();
    });
  };

  const observer = new MutationObserver(schedule);
  const start = () => {
    scanRooms();
    observer.observe(document.documentElement, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}
