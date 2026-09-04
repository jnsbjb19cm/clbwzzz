const PATCH_FLAG = Symbol.for('clbwzzz.battleRoomRebuild');
const ROOM_SELECTOR = '.game-room.room-exact';

const BUTTON_ICONS = Object.freeze({
  shop: 'shop',
  bag: 'bag',
  smithy: 'smithy',
  hero: 'hero',
  mail: 'mail',
  friend: 'friend',
  more: 'more',
  back: 'back',
  dice: 'dice',
  skill: 'skill',
  team: 'team',
});

function setVectorButton(button, icon, label) {
  if (!button || button.dataset.roomVectorIcon === icon) return;
  button.dataset.roomVectorIcon = icon;
  button.innerHTML = `
    <span class="room-vector-icon room-vector-icon--${icon}" aria-hidden="true"></span>
    <span class="room-vector-label">${label}</span>
  `;
  button.setAttribute('aria-label', label);
}

function decorateButtons(room) {
  for (const [action, icon] of Object.entries(BUTTON_ICONS)) {
    if (['more', 'back', 'dice', 'skill', 'team'].includes(action)) continue;
    const button = room.querySelector(`.bottom-btn[data-action="${action}"]`);
    const labels = { shop: '商城', bag: '背包', smithy: '打造', hero: '人物', mail: '邮件', friend: '好友' };
    setVectorButton(button, icon, labels[action] || action);
  }
  setVectorButton(room.querySelector('#more-btn'), BUTTON_ICONS.more, '更多');
  setVectorButton(room.querySelector('#back-btn'), BUTTON_ICONS.back, '返回');
  setVectorButton(room.querySelector('.dice-btn'), BUTTON_ICONS.dice, '随机地图');
  setVectorButton(room.querySelector('.skill-btn'), BUTTON_ICONS.skill, '技能');
  setVectorButton(room.querySelector('.team-btn'), BUTTON_ICONS.team, '换队');
}

function decorateRoomFrame(room) {
  if (room.querySelector('.room-rebuild-chrome')) return;
  const chrome = document.createElement('div');
  chrome.className = 'room-rebuild-chrome';
  chrome.setAttribute('aria-hidden', 'true');
  chrome.innerHTML = `
    <i class="room-frame-screw room-frame-screw--tl"></i>
    <i class="room-frame-screw room-frame-screw--tr"></i>
    <i class="room-frame-screw room-frame-screw--bl"></i>
    <i class="room-frame-screw room-frame-screw--br"></i>
    <i class="room-frame-rail room-frame-rail--top"></i>
    <i class="room-frame-rail room-frame-rail--bottom"></i>
  `;
  room.prepend(chrome);
}

function decorateDrawer(room) {
  const drawer = room.querySelector('#card-drawer');
  if (!drawer || drawer.dataset.roomRebuildDrawer === '1') return;
  drawer.dataset.roomRebuildDrawer = '1';
  drawer.setAttribute('role', 'region');
  drawer.setAttribute('aria-label', '换卡抽屉');
  drawer.setAttribute('aria-hidden', String(!drawer.classList.contains('open')));

  let track = drawer.querySelector('.drawer-slide-grip, .room-drawer-track');
  if (!track) {
    track = document.createElement('div');
    drawer.prepend(track);
  }
  track.className = 'room-drawer-track';
  track.setAttribute('aria-hidden', 'true');
  track.innerHTML = '<span></span><b>卡牌仓库</b><span></span>';

  const observer = new MutationObserver(() => {
    const open = drawer.classList.contains('open');
    drawer.setAttribute('aria-hidden', String(!open));
    room.classList.toggle('room-drawer-open', open);
    if (open) requestAnimationFrame(() => verifyRoomGeometry(room));
  });
  observer.observe(drawer, { attributes: true, attributeFilter: ['class'] });
  room.__roomDrawerObserver = observer;
}

function isInside(parent, child, tolerance = 2) {
  return child.left >= parent.left - tolerance
    && child.top >= parent.top - tolerance
    && child.right <= parent.right + tolerance
    && child.bottom <= parent.bottom + tolerance;
}

export function verifyRoomGeometry(room = document.querySelector(ROOM_SELECTOR)) {
  if (!(room instanceof HTMLElement)) {
    return { ok: false, errors: ['未找到准备房根节点'] };
  }

  const errors = [];
  const roomRect = room.getBoundingClientRect();
  const reference1536 = room.classList.contains('room-reference-1536');
  if (reference1536) {
    if (Math.abs(roomRect.width - window.innerWidth) > 3) {
      errors.push(`参考房未铺满宽度：${roomRect.width.toFixed(1)}/${window.innerWidth}`);
    }
    if (Math.abs(roomRect.height - window.innerHeight) > 3) {
      errors.push(`参考房未铺满高度：${roomRect.height.toFixed(1)}/${window.innerHeight}`);
    }
  } else {
    const expectedAspect = 640 / 406;
    const actualAspect = roomRect.width / Math.max(1, roomRect.height);
    if (Math.abs(actualAspect - expectedAspect) > 0.035) {
      errors.push(`准备房比例异常：${actualAspect.toFixed(3)}`);
    }
  }

  const backgroundImage = getComputedStyle(room).backgroundImage;
  if (/gameroom\.png|1000110618|参考图/i.test(backgroundImage)) {
    errors.push('仍在使用整张房间图片背景');
  }

  const requiredSelectors = [
    '.room-top-bar',
    '.room-center-area',
    '.room-left-side',
    '.room-right-side',
    '.exact-room-chat',
    '.room-mid-actions',
    '#room-ready-btn',
    '.room-bottom-bar',
  ];
  for (const selector of requiredSelectors) {
    const element = room.querySelector(selector);
    if (!(element instanceof HTMLElement)) {
      errors.push(`缺少元素：${selector}`);
      continue;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) errors.push(`元素不可见：${selector}`);
    if (!isInside(roomRect, rect, 3)) errors.push(`元素越界：${selector}`);
  }

  const slots = room.querySelectorAll('#deck-slots-row .deck-slot-item');
  if (slots.length !== 10) errors.push(`战团卡槽数量不是10：${slots.length}`);
  if (room.querySelectorAll('#card-drawer .room-drawer-track').length !== 1) {
    errors.push('换卡抽屉拉条数量异常');
  }

  const overflowX = room.scrollWidth - room.clientWidth;
  const overflowY = room.scrollHeight - room.clientHeight;
  if (overflowX > 3) errors.push(`准备房横向溢出 ${overflowX}px`);
  if (overflowY > 3) errors.push(`准备房纵向溢出 ${overflowY}px`);

  const result = { ok: errors.length === 0, errors };
  room.dataset.roomVerify = result.ok ? 'pass' : 'fail';
  room.__roomVerifyResult = result;
  if (!result.ok) console.warn('[RoomVerify]', ...errors);
  return result;
}

function decorateRoom(room) {
  if (!(room instanceof HTMLElement) || room.dataset.roomRebuild === '1') return;
  room.dataset.roomRebuild = '1';
  room.classList.add('room-rebuild');
  decorateRoomFrame(room);
  decorateButtons(room);
  decorateDrawer(room);
  requestAnimationFrame(() => requestAnimationFrame(() => verifyRoomGeometry(room)));
}

function scanRooms() {
  document.querySelectorAll(ROOM_SELECTOR).forEach(decorateRoom);
}

export function installBattleRoomRebuild() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

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

  window.__verifyBattleRoom = () => verifyRoomGeometry();
}
