/**
 * 2026-09-11：邀请弹窗全局化（原来只在"房间"界面里能收到邀请）。
 *
 * 问题现象：房主点"邀请玩家"→ 显示"已发送"，但被邀请方（在主城/背包/商城等界面）什么都看不到。
 *
 * 根因：RoomView 在构造函数里自己 new 了一个 SocketClient，邀请弹窗的监听
 * （RoomInviteRuntime20260906.js → RoomView.prototype.bindEvents 里的 room:invite 订阅）
 * 只挂在这条连接上；而玩家在主城时用的是 ClassicCityChrome 的 lobbySocket（另一条连接）。
 * 服务端 RoomInviteService20260906 是往"该用户的所有 socket"发 room:invite 的，
 * 所以事件确实到了客户端，但主城那条连接上没有任何监听 → 静默丢弃。
 *
 * 做法（不动服务端、不加新协议）：
 *  1. 登录后维持一条常驻 socket，在任何界面都监听 room:invite，用浮层弹出邀请；
 *  2. 接受时先切到"房间"界面（让 RoomView 的 socket 建立并保持房间快照/聊天链路正常），
 *     再用那条 socket 应答，加入的房间连接与原来完全一致；
 *  3. 同一邀请如果已经由房间界面的原弹窗显示，这里不重复弹（按 inviteId 去重）。
 */
import { authStore } from '../core/AuthStore.js';
import { SocketClient } from '../network/SocketClient.js';

const PATCH_FLAG = Symbol.for('clbwz.roomInviteGlobal20260911');
const STYLE_ID = 'room-invite-global-style-20260911';
const PROMPT_CLASS = 'room-invite-prompt-20260906';
const GLOBAL_PROMPT_CLASS = 'room-invite-prompt-global-20260911';
const TOAST_CLASS = 'room-invite-toast-20260911';
const ROOM_READY_TIMEOUT_MS = 6000;

let socketClient = null;
let unsubscribes = [];
let loginWatchTimer = null;
let installed = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function appInstance() {
  return globalThis.__clbwzAppInstance ?? null;
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.${PROMPT_CLASS}.${GLOBAL_PROMPT_CLASS} {
  position: fixed;
  top: 12vh;
  left: 50%;
  transform: translateX(-50%);
  z-index: 620;
}
.${TOAST_CLASS} {
  position: fixed;
  left: 50%;
  bottom: 12vh;
  transform: translateX(-50%);
  z-index: 621;
  max-width: min(28em, calc(100vw - 2em));
  padding: .55em 1.05em;
  border: .12em solid #85652a;
  border-radius: .55em;
  background: rgba(20, 36, 24, .95);
  color: #f7f5df;
  font-weight: 700;
  text-align: center;
  pointer-events: none;
  opacity: 0;
  transition: opacity .18s ease;
}
.${TOAST_CLASS}.show { opacity: 1; }
`;
  document.head.appendChild(style);
}

/** 轻量提示（不依赖具体界面，任意路由都能显示）。 */
function toast(text) {
  if (!text || !document.body) return;
  let node = document.querySelector(`.${TOAST_CLASS}`);
  if (!node) {
    node = document.createElement('div');
    node.className = TOAST_CLASS;
    document.body.appendChild(node);
  }
  node.textContent = String(text);
  node.classList.add('show');
  clearTimeout(node.__hideTimer20260911);
  node.__hideTimer20260911 = setTimeout(() => node.classList.remove('show'), 2800);
}

function findPrompt(inviteId) {
  const id = String(inviteId ?? '');
  for (const node of document.querySelectorAll(`.${PROMPT_CLASS}`)) {
    if (String(node.dataset.inviteId) === id) return node;
  }
  return null;
}

function removePrompt(inviteId = null) {
  for (const node of document.querySelectorAll(`.${PROMPT_CLASS}`)) {
    if (!inviteId || String(node.dataset.inviteId) === String(inviteId)) node.remove();
  }
}

function inBattle() {
  return Boolean(appInstance()?.views?.battle);
}

function roomModeLabel(mode) {
  return { pvp: 'PVP', boss: 'BOSS', pve: 'PVE' }[String(mode || '').toLowerCase()] || String(mode || '房间');
}

/**
 * 应答邀请：接受时先进入房间界面，保证"加入房间的是房间界面那条 socket"，
 * 这样房间快照、房间聊天等既有链路都不受影响。
 */
async function resolveInviteSocket(accept) {
  const app = appInstance();
  if (!app) throw new Error('游戏未就绪，请稍后重试');
  if (accept) {
    if (!app.views?.room) app.navigate?.('room');
    const deadline = Date.now() + ROOM_READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const view = app.views?.room;
      if (view?.socket) {
        if (!view.socket.socket?.connected) {
          try { view.socket.connect(); } catch { /* 继续等 */ }
        }
        if (view.socket.socket?.connected) return view.socket;
      }
      await sleep(120);
    }
    // 房间 socket 一直连不上时退回家里的常驻连接：服务端仍会把该 socket 加入房间，
    // 只是房间内的实时快照要等页面重新进入房间后才刷新。
    if (socketClient?.socket?.connected) return socketClient;
    throw new Error('连接超时，请检查网络后重试');
  }
  return app.views?.room?.socket ?? socketClient;
}

function showInvitePrompt(invite = {}) {
  if (!invite?.inviteId || !document.body) return;
  // 房间界面那份弹窗已经在显示同一条邀请 → 不重复弹。
  if (findPrompt(invite.inviteId)) return;
  // 战斗中不打扰（服务端在接受时也会再校验一次，战斗中的邀请本来就无法加入）。
  if (inBattle()) return;

  injectStyle();
  const prompt = document.createElement('section');
  prompt.className = `${PROMPT_CLASS} ${GLOBAL_PROMPT_CLASS}`;
  prompt.dataset.inviteId = String(invite.inviteId);

  const title = document.createElement('strong');
  title.textContent = '房间邀请';
  const text = document.createElement('p');
  const inviter = invite.inviter?.nickname || '玩家';
  const roomName = invite.room?.name || `房间 ${invite.room?.id ?? ''}`;
  text.textContent = `${inviter} 邀请你加入「${roomName}」 · ${roomModeLabel(invite.room?.mode)}`;
  const remaining = document.createElement('small');
  remaining.textContent = '邀请将在短时间内失效';
  const snoozeHint = document.createElement('small');
  snoozeHint.className = 'room-invite-prompt-snooze';
  snoozeHint.textContent = '拒绝后 5 分钟内不再接收该玩家的邀请';

  const actions = document.createElement('div');
  actions.className = 'room-invite-prompt-actions';
  const reject = document.createElement('button');
  reject.type = 'button';
  reject.className = 'room-invite-reject-btn';
  reject.textContent = '拒绝';
  const accept = document.createElement('button');
  accept.type = 'button';
  accept.className = 'room-invite-accept-btn';
  accept.textContent = '接受';
  actions.append(reject, accept);
  prompt.append(title, text, remaining, snoozeHint, actions);
  document.body.appendChild(prompt);

  const lock = (value) => {
    reject.disabled = value;
    accept.disabled = value;
  };

  reject.addEventListener('click', async () => {
    lock(true);
    try {
      const socket = await resolveInviteSocket(false);
      const result = await socket.respondRoomInvite(invite.inviteId, false);
      prompt.remove();
      const minutes = Math.max(1, Math.round((Number(result?.snoozeMs) || 5 * 60 * 1000) / 60_000));
      toast(`已拒绝，${minutes} 分钟内不再接收该玩家的邀请`);
    } catch (error) {
      lock(false);
      toast(error.message);
      if (/过期|失效|不存在/.test(String(error.message))) prompt.remove();
    }
  });

  accept.addEventListener('click', async () => {
    lock(true);
    try {
      const socket = await resolveInviteSocket(true);
      const result = await socket.respondRoomInvite(invite.inviteId, true);
      prompt.remove();
      const view = appInstance()?.views?.room;
      if (result?.room && view?.enterRoom) view.enterRoom(result.room);
      toast('已加入房间');
    } catch (error) {
      lock(false);
      toast(error.message);
      if (/过期|失效|不存在|离开|不在大厅/.test(String(error.message))) prompt.remove();
    }
  });

  const expiresAt = Number(invite.expiresAt);
  if (Number.isFinite(expiresAt)) {
    const delay = Math.max(0, expiresAt - Date.now()) + 250;
    setTimeout(() => prompt.remove(), Math.min(delay, 60_000));
  }
}

function bindSocket(socket) {
  for (const off of unsubscribes) {
    try { off?.(); } catch { /* 忽略 */ }
  }
  unsubscribes = [
    socket.on('room:invite', (invite) => showInvitePrompt(invite)),
    socket.on('room:invite:resolved', ({ inviteId } = {}) => removePrompt(inviteId)),
    // 邀请人不在房间界面时，也能看到"对方接受/拒绝"的结果。
    socket.on('room:invite:result', ({ accepted, targetUserId, reason, message } = {}) => {
      if (appInstance()?.views?.room?.room) return; // 房间界面自己会提示，避免重复
      if (accepted) {
        toast(`玩家 ${targetUserId} 已接受房间邀请`);
        return;
      }
      if (reason === 'rejected' || !reason) toast(message || '不好意思，我现在没时间，抱歉啦');
    }),
  ];
}

/** 登录后维持常驻连接：没有 token 时等登录，token 变了则重连。 */
function ensureSocket() {
  if (!installed) return;
  const token = String(authStore?.token || '');
  if (!token) return;
  if (!socketClient) {
    socketClient = new SocketClient({ getToken: () => authStore.token });
    bindSocket(socketClient);
    socketClient.connect();
    return;
  }
  const current = socketClient.socket;
  if (current && !current.connected && !current.active) return; // 正在重连，交给 socket.io
  if (current && String(current.auth?.token || '') !== token) {
    try { current.disconnect(); } catch { /* 忽略 */ }
    socketClient.connect();
  }
}

export function installRoomInviteGlobalRuntime20260911() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;
  installed = true;
  if (typeof document === 'undefined') return;
  injectStyle();
  ensureSocket();
  // 登录可能晚于本模块安装（登录页 → 进入游戏），轮询到有 token 再连接。
  if (!loginWatchTimer) {
    loginWatchTimer = setInterval(() => {
      ensureSocket();
      if (authStore?.token && socketClient?.socket?.connected && loginWatchTimer) {
        clearInterval(loginWatchTimer);
        loginWatchTimer = null;
      }
    }, 1000);
    loginWatchTimer.unref?.();
  }
}
