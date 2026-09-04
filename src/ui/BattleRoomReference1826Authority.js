const PATCH_FLAG = Symbol.for('clbwzzz.battleRoomReference1536AuthorityV2');
const ROOM_SELECTOR = '.game-room.room-exact';
const REF_W = 1536;
const REF_H = 940;

const REF = Object.freeze({
  owner: [0, 0, 264, 307],
  member1: [0, 322, 264, 298],
  member2: [278, 322, 272, 298],
  enemyTop: [1257, 0, 266, 307],
  enemy1: [966, 318, 277, 302],
  enemy2: [1258, 318, 266, 302],
  title: [282, 0, 966, 71],
  deck: [296, 96, 941, 81],
  slots: [296, 193, 941, 95],
  vs: [598, 365, 340, 190],
  chat: [0, 626, 727, 306],
  dice: [737, 626, 230, 205],
  skill: [981, 649, 163, 158],
  team: [1164, 649, 163, 158],
  ready: [1346, 649, 168, 158],
  recharge: [744, 839, 199, 79],
  footer: [963, 837, 560, 96],
});

function important(element, declarations) {
  if (!(element instanceof HTMLElement)) return;
  for (const [property, value] of Object.entries(declarations)) {
    const next = String(value);
    if (
      element.style.getPropertyValue(property) === next
      && element.style.getPropertyPriority(property) === 'important'
    ) continue;
    element.style.setProperty(property, next, 'important');
  }
}

function stageMetrics() {
  const vw = Math.max(1, window.innerWidth || document.documentElement.clientWidth || REF_W);
  const vh = Math.max(1, window.innerHeight || document.documentElement.clientHeight || REF_H);
  const scale = Math.min(vw / REF_W, vh / REF_H);
  const width = REF_W * scale;
  const height = REF_H * scale;
  return {
    vw,
    vh,
    scale,
    width,
    height,
    x: Math.max(0, (vw - width) / 2),
    y: Math.max(0, (vh - height) / 2),
  };
}

function applyReferenceBox(element, stage, ref, { z = null, pointer = null } = {}) {
  if (!(element instanceof HTMLElement) || !Array.isArray(ref)) return;
  const [x, y, width, height] = ref;
  important(element, {
    position: 'absolute',
    inset: 'auto',
    left: `${stage.x + x * stage.scale}px`,
    right: 'auto',
    top: `${stage.y + y * stage.scale}px`,
    bottom: 'auto',
    width: `${width * stage.scale}px`,
    height: `${height * stage.scale}px`,
    'min-width': '0',
    'min-height': '0',
    'max-width': 'none',
    'max-height': 'none',
    margin: '0',
    transform: 'none',
    'box-sizing': 'border-box',
    ...(z == null ? {} : { 'z-index': z }),
    ...(pointer == null ? {} : { 'pointer-events': pointer }),
  });
}

function resetViewportShell(room) {
  const page = room.closest('.deck-select-page');
  const viewRoot = room.closest('#view-root') || room.closest('.view-root');
  const shell = room.closest('.app-shell');
  const app = room.closest('#app');

  important(app, {
    position: 'fixed', inset: '0', width: '100vw', height: '100vh',
    margin: '0', padding: '0', overflow: 'hidden', 'max-width': 'none', 'max-height': 'none',
  });
  important(shell, {
    position: 'absolute', inset: '0', width: '100%', height: '100%',
    margin: '0', padding: '0', overflow: 'hidden', 'max-width': 'none', 'max-height': 'none',
  });
  important(viewRoot, {
    position: 'absolute', inset: '0', width: '100%', height: '100%',
    margin: '0', padding: '0', overflow: 'hidden', 'max-width': 'none', 'max-height': 'none',
  });
  important(page, {
    position: 'absolute', inset: '0', width: '100%', height: '100%',
    'min-height': '0', 'max-width': 'none', 'max-height': 'none',
    margin: '0', padding: '0', display: 'block', overflow: 'hidden',
    background: '#86b735',
  });
}

function stabilizeFooter(room, stage) {
  const footer = room.querySelector('.room-bottom-bar');
  applyReferenceBox(footer, stage, REF.footer, { z: 40, pointer: 'auto' });
  important(footer, {
    display: 'grid',
    'grid-template-columns': 'repeat(8, minmax(0, 1fr))',
    'grid-template-rows': '1fr',
    gap: '0',
    'align-items': 'stretch',
    'justify-items': 'stretch',
    overflow: 'hidden',
    background: 'transparent',
  });

  const buttons = [...room.querySelectorAll('.room-bottom-bar > .bottom-btn')];
  buttons.forEach((button, index) => {
    important(button, {
      position: 'relative',
      inset: 'auto',
      left: 'auto', right: 'auto', top: 'auto', bottom: 'auto',
      width: '100%', height: '100%',
      'min-width': '0', 'min-height': '0',
      'max-width': 'none', 'max-height': 'none',
      margin: '0', padding: '0',
      transform: 'none',
      overflow: 'hidden',
      'grid-column': String(index + 1),
      'grid-row': '1',
      display: 'flex',
      'flex-direction': 'column',
      'align-items': 'center',
      'justify-content': 'center',
    });
  });

  const back = room.querySelector('#back-btn');
  important(back, {
    display: 'flex',
    visibility: 'visible',
    opacity: '1',
    'grid-column': '8',
    'grid-row': '1',
    transform: 'none',
  });
}

function stabilizeDeck(room, stage) {
  const center = room.querySelector('.room-center-area');
  important(center, {
    position: 'absolute', inset: '0', width: '100%', height: '100%',
    margin: '0', padding: '0', border: '0', background: 'transparent',
    'box-shadow': 'none', transform: 'none', 'z-index': '24',
    'pointer-events': 'none', overflow: 'visible',
  });

  const header = room.querySelector('.deck-header');
  applyReferenceBox(header, stage, REF.deck, { z: 25, pointer: 'auto' });
  important(header, {
    display: 'grid',
    'grid-template-columns': `${190 * stage.scale}px minmax(0, 1fr) ${178 * stage.scale}px`,
    'align-items': 'center',
    gap: `${12 * stage.scale}px`,
    padding: `0 ${16 * stage.scale}px`,
    overflow: 'hidden',
  });

  const title = room.querySelector('.deck-title');
  important(title, {
    position: 'relative', inset: 'auto', width: 'auto', height: 'auto',
    margin: '0', padding: '0', transform: 'none',
    'align-self': 'center', 'justify-self': 'start',
    'line-height': '1', 'white-space': 'nowrap',
  });

  const tabs = room.querySelector('.deck-tabs');
  important(tabs, {
    position: 'relative', inset: 'auto', width: '100%', height: '100%',
    margin: '0', padding: '0', transform: 'none', overflow: 'hidden',
    display: 'grid', 'grid-template-columns': 'repeat(4, minmax(0, 1fr))',
    'align-items': 'center', gap: `${6 * stage.scale}px`,
  });
  room.querySelectorAll('.deck-tab').forEach((tab) => important(tab, {
    position: 'relative', inset: 'auto', width: '100%', height: '100%',
    'min-width': '0', 'min-height': '0', margin: '0',
    display: 'flex', 'align-items': 'center', 'justify-content': 'center',
    transform: 'none', overflow: 'hidden', 'line-height': '1',
    'white-space': 'nowrap',
  }));

  const swap = room.querySelector('#swap-card-btn');
  important(swap, {
    position: 'relative', inset: 'auto', left: 'auto', right: 'auto', top: 'auto', bottom: 'auto',
    width: '100%', height: `${48 * stage.scale}px`, 'min-width': '0', 'min-height': '0',
    margin: '0', transform: 'none', 'align-self': 'center', 'justify-self': 'stretch',
  });

  const slots = room.querySelector('#deck-slots-row');
  applyReferenceBox(slots, stage, REF.slots, { z: 26, pointer: 'auto' });
  important(slots, {
    display: 'grid',
    'grid-template-columns': 'repeat(10, minmax(0, 1fr))',
    'grid-template-rows': '1fr',
    gap: `${4 * stage.scale}px`,
    overflow: 'hidden',
  });
}

function apply(room) {
  if (!(room instanceof HTMLElement)) return;

  room.classList.add('room-reference-1826', 'room-reference-1536', 'room-reference-authority');
  resetViewportShell(room);

  const stage = stageMetrics();
  room.__referenceStage = stage;
  room.style.setProperty('--room-scale', String(stage.scale));
  room.style.setProperty('--room-stage-x', `${stage.x}px`);
  room.style.setProperty('--room-stage-y', `${stage.y}px`);
  room.style.setProperty('--room-stage-width', `${stage.width}px`);
  room.style.setProperty('--room-stage-height', `${stage.height}px`);

  important(room, {
    position: 'absolute', inset: '0', left: '0', top: '0', right: 'auto', bottom: 'auto',
    width: '100vw', height: '100vh', 'max-width': 'none', 'max-height': 'none',
    'aspect-ratio': 'auto', margin: '0', padding: '0', overflow: 'hidden', isolation: 'isolate',
    border: '0', 'border-radius': '0', 'box-shadow': 'none', transform: 'none',
  });
  room.style.removeProperty('background-image');

  room.querySelectorAll(
    '.room-rebuild-chrome,.room-frame-screw,.room-frame-rail,.room-reference-frame,.room-reference-corner,.room-reference-rail,.room-side-label,.room-status-bar',
  ).forEach((element) => important(element, { display: 'none' }));

  const left = room.querySelector('.room-left-side');
  important(left, {
    position: 'absolute', inset: '0', width: '100%', height: '100%', margin: '0', padding: '0',
    border: '0', background: 'transparent', 'box-shadow': 'none', transform: 'none',
    'z-index': '12', 'pointer-events': 'none', overflow: 'visible',
  });
  applyReferenceBox(room.querySelector('#owner-slot'), stage, REF.owner, { z: 13, pointer: 'auto' });
  important(room.querySelector('.member-slots-row'), {
    position: 'static', inset: 'auto', display: 'contents', width: 'auto', height: 'auto',
    margin: '0', padding: '0', transform: 'none',
  });
  applyReferenceBox(room.querySelector('#member-slot-1'), stage, REF.member1, { z: 13, pointer: 'auto' });
  applyReferenceBox(room.querySelector('#member-slot-2'), stage, REF.member2, { z: 13, pointer: 'auto' });

  const right = room.querySelector('.room-right-side');
  important(right, {
    position: 'absolute', inset: '0', width: '100%', height: '100%', margin: '0', padding: '0',
    border: '0', background: 'transparent', 'box-shadow': 'none', transform: 'none',
    'z-index': '12', 'pointer-events': 'none', overflow: 'visible',
  });
  applyReferenceBox(right?.querySelector('.top-enemy'), stage, REF.enemyTop, { z: 13, pointer: 'auto' });
  important(right?.querySelector('.enemy-slots-row'), {
    position: 'static', inset: 'auto', display: 'contents', width: 'auto', height: 'auto',
    margin: '0', padding: '0', transform: 'none',
  });
  const enemies = right?.querySelectorAll('.enemy-slots-row > .enemy-slot') ?? [];
  if (enemies[0]) applyReferenceBox(enemies[0], stage, REF.enemy1, { z: 13, pointer: 'auto' });
  if (enemies[1]) applyReferenceBox(enemies[1], stage, REF.enemy2, { z: 13, pointer: 'auto' });

  applyReferenceBox(room.querySelector('.room-top-bar'), stage, REF.title, { z: 22, pointer: 'auto' });
  stabilizeDeck(room, stage);
  applyReferenceBox(room.querySelector('.room-vs'), stage, REF.vs, { z: 18, pointer: 'none' });
  applyReferenceBox(room.querySelector('.exact-room-chat'), stage, REF.chat, { z: 30, pointer: 'auto' });

  const actions = room.querySelector('.room-mid-actions');
  important(actions, {
    position: 'absolute', inset: '0', width: '100%', height: '100%', margin: '0', padding: '0',
    display: 'block', border: '0', background: 'transparent', 'box-shadow': 'none', transform: 'none',
    overflow: 'visible', 'z-index': '31', 'pointer-events': 'none',
  });
  actions?.querySelectorAll(':scope > .mid-btn,:scope > button').forEach((button) => important(button, {
    position: 'absolute', inset: 'auto', margin: '0', padding: '0', 'box-sizing': 'border-box',
    'min-width': '0', 'min-height': '0', 'max-width': 'none', 'max-height': 'none',
    transform: 'none', 'pointer-events': 'auto',
  }));

  applyReferenceBox(room.querySelector('.dice-btn'), stage, REF.dice, { z: 32, pointer: 'auto' });
  applyReferenceBox(room.querySelector('.skill-btn'), stage, REF.skill, { z: 32, pointer: 'auto' });
  applyReferenceBox(room.querySelector('.team-btn'), stage, REF.team, { z: 32, pointer: 'auto' });
  applyReferenceBox(room.querySelector('#room-ready-btn'), stage, REF.ready, { z: 32, pointer: 'auto' });
  applyReferenceBox(room.querySelector('.reference-room-recharge'), stage, REF.recharge, { z: 38, pointer: 'auto' });
  stabilizeFooter(room, stage);
}

function overlaps(a, b, tolerance = 2) {
  if (!a || !b || a.width <= 0 || b.width <= 0) return false;
  return a.left < b.right - tolerance
    && a.right > b.left + tolerance
    && a.top < b.bottom - tolerance
    && a.bottom > b.top + tolerance;
}

function outside(inner, outer, tolerance = 2) {
  if (!inner || !outer) return false;
  return inner.left < outer.left - tolerance
    || inner.top < outer.top - tolerance
    || inner.right > outer.right + tolerance
    || inner.bottom > outer.bottom + tolerance;
}

function verify() {
  const room = document.querySelector(`${ROOM_SELECTOR}.room-reference-1536`);
  if (!room) return { ok: false, errors: ['未找到1536参考房间'] };

  const q = (selector) => room.querySelector(selector)?.getBoundingClientRect?.() ?? null;
  const errors = [];
  const stage = room.__referenceStage ?? stageMetrics();
  const stageRect = {
    left: stage.x,
    top: stage.y,
    right: stage.x + stage.width,
    bottom: stage.y + stage.height,
    width: stage.width,
    height: stage.height,
  };
  const viewportRect = {
    left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight,
    width: window.innerWidth, height: window.innerHeight,
  };

  const roomRect = room.getBoundingClientRect();
  if (Math.abs(roomRect.left) > 2 || Math.abs(roomRect.top) > 2) errors.push(`房间根节点偏移:${roomRect.left.toFixed(1)},${roomRect.top.toFixed(1)}`);
  if (Math.abs(roomRect.width - window.innerWidth) > 3) errors.push(`房间未铺满宽度:${roomRect.width.toFixed(1)}/${window.innerWidth}`);
  if (Math.abs(roomRect.height - window.innerHeight) > 3) errors.push(`房间未铺满高度:${roomRect.height.toFixed(1)}/${window.innerHeight}`);

  const backgroundImage = getComputedStyle(room).backgroundImage;
  if (/gameroom\.png|参考图|1000110618/i.test(backgroundImage)) errors.push('检测到整张房间图片作为背景');

  const keyRects = [
    ['房主', q('#owner-slot')], ['左槽1', q('#member-slot-1')], ['左槽2', q('#member-slot-2')],
    ['右上', q('.room-right-side .top-enemy')],
    ['右下1', q('.room-right-side .enemy-slots-row > .enemy-slot:nth-child(1)')],
    ['右下2', q('.room-right-side .enemy-slots-row > .enemy-slot:nth-child(2)')],
    ['标题', q('.room-top-bar')], ['战团', q('.deck-header')], ['卡槽', q('#deck-slots-row')],
    ['VS', q('.room-vs')], ['聊天', q('.exact-room-chat')], ['随机地图', q('.dice-btn')],
    ['技能', q('.skill-btn')], ['换队', q('.team-btn')], ['准备', q('#room-ready-btn')],
    ['储值', q('.reference-room-recharge')], ['底栏', q('.room-bottom-bar')], ['返回', q('#back-btn')],
  ];
  keyRects.forEach(([name, value]) => {
    if (value && outside(value, stageRect, 4)) errors.push(`${name}越出1536参考舞台`);
    if (value && outside(value, viewportRect, 2)) errors.push(`${name}越出浏览器屏幕`);
  });

  for (const [name, a, b] of [
    ['聊天/随机地图', q('.exact-room-chat'), q('.dice-btn')],
    ['随机地图/技能', q('.dice-btn'), q('.skill-btn')],
    ['技能/换队', q('.skill-btn'), q('.team-btn')],
    ['换队/准备', q('.team-btn'), q('#room-ready-btn')],
    ['随机地图/底栏', q('.dice-btn'), q('.room-bottom-bar')],
    ['储值/底栏', q('.reference-room-recharge'), q('.room-bottom-bar')],
  ]) {
    if (overlaps(a, b)) errors.push(`${name}重叠`);
  }

  const title = room.querySelector('.room-title-text')?.textContent?.trim();
  if (title !== '房间') errors.push(`房间标题错误:${title || '空'}`);

  const headerRect = q('.deck-header');
  for (const tab of room.querySelectorAll('.deck-tab')) {
    const rect = tab.getBoundingClientRect();
    if (headerRect && (rect.top < headerRect.top - 2 || rect.bottom > headerRect.bottom + 2)) {
      errors.push('战团标签越出战团条');
      break;
    }
  }

  const backRect = q('#back-btn');
  const footerRect = q('.room-bottom-bar');
  if (backRect && footerRect && outside(backRect, footerRect, 2)) errors.push('返回按钮越出底部导航栏');

  return {
    ok: errors.length === 0,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    stage: { x: stage.x, y: stage.y, width: stage.width, height: stage.height, scale: stage.scale },
    backgroundImage,
    errors,
  };
}

export function installBattleRoomReference1826Authority() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      document.querySelectorAll(ROOM_SELECTOR).forEach(apply);
    });
  };

  const observer = new MutationObserver((records) => {
    if (records.some((record) => record.type === 'childList' || record.attributeName === 'class')) schedule();
  });

  const start = () => {
    schedule();
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    window.addEventListener('resize', schedule, { passive: true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  window.__applyBattleRoomReference1536Authority = schedule;
  window.__verifyBattleRoomReference1536Authority = verify;
}