import { RoomView } from './RoomView.js';
import './RoomInviteRuntime20260906.css';

const PATCH_FLAG = Symbol.for('clbwz.roomInviteRuntime20260906');

function roomModeLabel(mode) {
  return { pvp: 'PVP', boss: 'BOSS', pve: 'PVE' }[String(mode || '').toLowerCase()] || String(mode || '房间');
}

function removeInvitePanel(view) {
  view?.root?.querySelector?.('.room-invite-panel-20260906')?.remove?.();
}

function removeInvitePrompt(view, inviteId = null) {
  view?.root?.querySelectorAll?.('.room-invite-prompt-20260906').forEach((node) => {
    if (!inviteId || String(node.dataset.inviteId) === String(inviteId)) node.remove();
  });
}

async function openInvitePanel(view) {
  if (!view?.room || view.room.status !== 'waiting') {
    view?.notice?.('只有等待中的房间可以邀请大厅玩家');
    return;
  }
  removeInvitePanel(view);

  const roomRoot = view.root?.querySelector?.('.game-room.room-exact, .game-room');
  if (!roomRoot) return;
  const panel = document.createElement('section');
  panel.className = 'room-invite-panel-20260906';
  panel.innerHTML = `
    <header><strong>邀请大厅玩家</strong><button type="button" class="room-invite-close" aria-label="关闭">×</button></header>
    <div class="room-invite-status">正在读取大厅在线玩家…</div>
    <div class="room-invite-player-list"></div>
    <footer>仅显示当前在线、仍在大厅且尚未进入其他房间的玩家。</footer>
  `;
  roomRoot.append(panel);
  panel.querySelector('.room-invite-close')?.addEventListener('click', () => panel.remove());

  try {
    const players = await view.socket.listRoomInviteCandidates();
    if (!panel.isConnected) return;
    const status = panel.querySelector('.room-invite-status');
    const list = panel.querySelector('.room-invite-player-list');
    if (!players.length) {
      if (status) status.textContent = '当前没有可邀请的大厅玩家';
      return;
    }
    if (status) status.textContent = `可邀请 ${players.length} 人`;
    for (const player of players) {
      const row = document.createElement('div');
      row.className = 'room-invite-player-row';
      const meta = document.createElement('div');
      meta.className = 'room-invite-player-meta';
      const name = document.createElement('strong');
      name.textContent = player.nickname || player.username || `玩家${player.userId}`;
      const level = document.createElement('span');
      level.textContent = `Lv.${Number(player.level) || 1} · ID ${player.userId}`;
      meta.append(name, level);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'room-invite-send-btn';
      button.textContent = '邀请';
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          const result = await view.socket.sendRoomInvite(player.userId);
          button.textContent = result?.duplicated ? '已邀请' : '已发送';
          view.notice?.(`已邀请 ${name.textContent}`);
        } catch (error) {
          button.disabled = false;
          button.textContent = '邀请';
          view.notice?.(error.message);
        }
      });
      row.append(meta, button);
      list.append(row);
    }
  } catch (error) {
    const status = panel.querySelector('.room-invite-status');
    if (status) status.textContent = error.message || '读取大厅玩家失败';
  }
}

function ensureInviteButton(view) {
  if (!view?.room || view.room.status !== 'waiting') return;
  const roomRoot = view.root?.querySelector?.('.game-room.room-exact, .game-room');
  if (!roomRoot || roomRoot.querySelector('.room-lobby-invite-btn-20260906')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'room-lobby-invite-btn-20260906';
  button.textContent = '邀请大厅玩家';
  button.title = '邀请当前仍在游戏大厅的在线玩家加入本房间';
  button.addEventListener('click', () => void openInvitePanel(view));
  roomRoot.append(button);
}

function showInvitePrompt(view, invite = {}) {
  if (!view?.root || view.room || !invite.inviteId) return;
  removeInvitePrompt(view, invite.inviteId);
  const host = view.root.querySelector('.lobby-fullscreen') || view.root;
  const prompt = document.createElement('section');
  prompt.className = 'room-invite-prompt-20260906';
  prompt.dataset.inviteId = String(invite.inviteId);

  const title = document.createElement('strong');
  title.textContent = '房间邀请';
  const text = document.createElement('p');
  const inviter = invite.inviter?.nickname || '玩家';
  const roomName = invite.room?.name || `房间 ${invite.room?.id ?? ''}`;
  text.textContent = `${inviter} 邀请你加入「${roomName}」 · ${roomModeLabel(invite.room?.mode)}`;
  const remaining = document.createElement('small');
  remaining.textContent = '邀请将在短时间内失效';
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
  prompt.append(title, text, remaining, actions);
  host.append(prompt);

  const lock = (value) => {
    reject.disabled = value;
    accept.disabled = value;
  };
  reject.addEventListener('click', async () => {
    lock(true);
    try {
      await view.socket.respondRoomInvite(invite.inviteId, false);
      prompt.remove();
    } catch (error) {
      lock(false);
      view.notice?.(error.message);
    }
  });
  accept.addEventListener('click', async () => {
    lock(true);
    try {
      const result = await view.socket.respondRoomInvite(invite.inviteId, true);
      prompt.remove();
      if (result?.room) view.enterRoom(result.room);
    } catch (error) {
      lock(false);
      view.notice?.(error.message);
      if (/过期|失效|不存在/.test(String(error.message))) prompt.remove();
    }
  });

  const expiresAt = Number(invite.expiresAt);
  if (Number.isFinite(expiresAt)) {
    const delay = Math.max(0, expiresAt - Date.now()) + 250;
    window.setTimeout(() => prompt.remove(), Math.min(delay, 60_000));
  }
}

export function installRoomInviteRuntime20260906() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const previousBindEvents = RoomView.prototype.bindEvents;
  RoomView.prototype.bindEvents = function bindRoomInviteEvents20260906(...args) {
    const result = previousBindEvents.apply(this, args);
    this.socket.setLobbyPresence('lobby').catch(() => {});
    this.unsubs.push(
      this.socket.on('room:invite', (invite) => showInvitePrompt(this, invite)),
      this.socket.on('room:invite:resolved', ({ inviteId } = {}) => removeInvitePrompt(this, inviteId)),
      this.socket.on('room:invite:result', ({ accepted, targetUserId } = {}) => {
        if (accepted) this.notice?.(`玩家 ${targetUserId} 已接受房间邀请`);
      }),
    );
    return result;
  };

  const previousRenderRoomInside = RoomView.prototype.renderRoomInside;
  RoomView.prototype.renderRoomInside = function renderRoomInviteControl20260906(...args) {
    const result = previousRenderRoomInside.apply(this, args);
    queueMicrotask(() => ensureInviteButton(this));
    return result;
  };

  const previousEnterRoom = RoomView.prototype.enterRoom;
  RoomView.prototype.enterRoom = function enterRoomInvitePresence20260906(...args) {
    const result = previousEnterRoom.apply(this, args);
    this.socket.setLobbyPresence('room').catch(() => {});
    removeInvitePrompt(this);
    queueMicrotask(() => ensureInviteButton(this));
    return result;
  };

  const previousExitRoom = RoomView.prototype.exitRoom;
  RoomView.prototype.exitRoom = function exitRoomInvitePresence20260906(...args) {
    const result = previousExitRoom.apply(this, args);
    removeInvitePanel(this);
    this.socket.setLobbyPresence('lobby').catch(() => {});
    return result;
  };

  const previousEnterBattle = RoomView.prototype.enterBattle;
  RoomView.prototype.enterBattle = function enterBattleInvitePresence20260906(...args) {
    this.socket.setLobbyPresence('battle').catch(() => {});
    removeInvitePanel(this);
    removeInvitePrompt(this);
    return previousEnterBattle.apply(this, args);
  };

  const previousDestroy = RoomView.prototype.destroy;
  RoomView.prototype.destroy = function destroyRoomInviteRuntime20260906(...args) {
    try { this.socket.setLobbyPresence('offline').catch(() => {}); } catch {}
    removeInvitePanel(this);
    removeInvitePrompt(this);
    return previousDestroy.apply(this, args);
  };
}
