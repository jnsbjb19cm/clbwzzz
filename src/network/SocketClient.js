import { io } from 'socket.io-client';

const DEFAULT_SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (
  import.meta.env.DEV ? 'http://localhost:3001' : (globalThis.location?.origin || '')
);

export class SocketClient {
  constructor({ url = DEFAULT_SOCKET_URL, getToken = () => '' } = {}) {
    this.url = url;
    this.getToken = getToken;
    this.socket = null;
  }

  connect() {
    if (this.socket?.connected) return this.socket;
    if (!this.socket) {
      this.socket = io(this.url, {
        autoConnect: false,
        auth: { token: this.getToken() },
        transports: ['websocket', 'polling'],
      });
    }
    this.socket.auth = { token: this.getToken() };
    this.socket.connect();
    return this.socket;
  }

  disconnect() {
    this.socket?.disconnect();
  }

  emitAck(event, payload = {}) {
    const socket = this.connect();
    return new Promise((resolve, reject) => {
      socket.timeout(8000).emit(event, payload, (error, response) => {
        if (error) return reject(new Error('服务器响应超时'));
        if (!response?.ok) return reject(new Error(response?.message || '操作失败'));
        return resolve(response);
      });
    });
  }

  // ---------- 房间 ----------
  listRooms() {
    return this.emitAck('rooms:list').then((r) => r.rooms);
  }

  createRoom({ mode = 'pvp', size = '3v3', stageId, mapId, bossId, difficulty, name } = {}) {
    return this.emitAck('room:create', {
      mode,
      size,
      stageId,
      mapId,
      bossId,
      difficulty,
      name,
    }).then((r) => r.room);
  }

  joinRoom(roomId, team = 'blue') {
    return this.emitAck('room:join', { roomId, team }).then((r) => r.room);
  }

  /** 观战：订阅房间快照/开始事件（不入成员、不可部署） */
  watchRoom(roomId) {
    return this.emitAck('room:watch', { roomId }).then((r) => r.room);
  }

  leaveWatch() {
    return this.emitAck('room:leave-watch').then((r) => r);
  }

  /** 观战：订阅服务端权威战斗快照 */
  spectateRoom(roomId) {
    return this.emitAck('pvp:authority:spectate', { roomId }).then((r) => r);
  }

  leaveSpectate(roomId) {
    return this.emitAck('pvp:authority:leave-spectate', { roomId });
  }

  leaveRoom() {
    return this.emitAck('room:leave').then((r) => r.room);
  }

  setReady(ready) {
    return this.emitAck('room:ready', { ready }).then((r) => r.room);
  }

  setDeck(deckNo) {
    return this.emitAck('room:set-deck', { deckNo }).then((r) => r.room);
  }

  switchTeam() {
    return this.emitAck('room:switch-team').then((r) => r.room);
  }

  changeMap(mapId) {
    return this.emitAck('room:change-map', { mapId }).then((r) => r.room);
  }

  setRule(allowUnbalanced) {
    return this.emitAck('room:set-rule', { allowUnbalanced }).then((r) => r.room);
  }

  setRandomMatch(enabled) {
    return this.emitAck('room:random-match', { enabled }).then((r) => r.room);
  }

  sendPvpDeploy(payload) {
    return this.emitAck('pvp:deploy', payload);
  }

  sendLobbyChat(text, channel = 'current', targetId = null) {
    return this.emitAck('lobby:chat', { text, channel, targetId });
  }

  sendChat(text) {
    return this.emitAck('room:chat', { text }).then((r) => r.message);
  }

  kick(userId) {
    return this.emitAck('room:kick', { userId }).then((r) => r.room);
  }

  startGame() {
    return this.emitAck('room:start').then((r) => r.room);
  }

  // ---------- 服务端权威战斗(PVP / 多人 BOSS) ----------
  pvpDeploy(cardId, lane, col) {
    return this.emitAck('pvp:deploy', { cardId, lane, col }).then((r) => r.result);
  }

  // ---------- 事件订阅 ----------
  on(event, handler) {
    const socket = this.connect();
    socket.on(event, handler);
    return () => socket.off(event, handler);
  }
}
