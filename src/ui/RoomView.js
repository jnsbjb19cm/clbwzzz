/**
 * 战斗大厅(全屏，素材1.png 样式)→ 房间 → 对战。
 *
 * 大厅：房间列表(PVP/BOSS/PVE)· 加入/观战按钮 · 快速加入/查找/创建
 * 创建弹窗：PVP(规模)或 BOSS 挑战(选 BOSS + 难度)
 * 房间简介：PVP={昵称}的房间；BOSS={BOSS名}[难度]；PVE=关卡名
 */
import { SocketClient } from '../network/SocketClient.js';
import { authStore } from '../core/AuthStore.js';
import { BattleRenderer } from '../battle/BattleRenderer.js';
import { BattleView } from './BattleView.js';
import { BattleUnit } from '../battle/BattleUnit.js';
import { LANES, COLS, CELL_W, CELL_H, cellX, cellY, FIELD_LEFT, FIELD_TOP, FIELD_BOTTOM, FIELD_W, FIELD_H } from '../battle/BattleConfig.js';
import { audio } from '../core/AudioManager.js';
import { BOSS_LIST } from '../data/bossList.js';
import { resolveBattleBackground } from '../battle/BattleBackground.js';
import { DeckSelectView } from './DeckSelectView.js';
import { BagView } from './BagView.js';
import { QuestView } from './QuestView.js';

const SIZE_OPTIONS = [
  { size: '1v1', label: '1v1' },
  { size: '2v2', label: '2v2' },
  { size: '3v3', label: '3v3' },
];

const TYPE_LABEL = { pvp: 'PVP', boss: 'BOSS', pve: 'PVE' };

export class RoomView {
  constructor(db, {
    cardInventory,
    itemDb,
    inventory,
    player,
    createBoss,
    stageId,
    mapId,
    stageName,
    enemyRandomMode = false,
    autoCreate = false,
    onPlayerUpdate,
    onNavigate,
  } = {}) {
    this.db = db;
    this.cardInventory = cardInventory;
    this.onNavigate = onNavigate;
    this.createBoss = createBoss || null;
    this.itemDb = itemDb;
    this.inventory = inventory;
    this.player = player;
    this.stageId = stageId;
    this.mapId = mapId;
    this.stageName = stageName;
    this.enemyRandomMode = Boolean(enemyRandomMode);
    this.shouldAutoCreate = Boolean(autoCreate);
    this.onPlayerUpdate = onPlayerUpdate;
    this._autoCreateStarted = false;
    this.socket = new SocketClient({ getToken: () => authStore.token });
    this.room = null;
    this.rooms = [];
    this.snap = null;
    this.myTeam = 'blue';
    this.watchingRoomId = null;
    this.watchingRoom = null;
    this.roomBattleView = null;
    this._spectatorExitBtn = null;
    this.pendingCard = null;
    this.unsubs = [];
    this.filter = 'all';
    this.onResize = null;
  }

  render(root) {
    this.root = root;
    // 刷新场景：先恢复登录态(否则 currentUserId 为空，队伍/房主判定失效)
    if (!authStore.user && authStore.isLoggedIn()) {
      authStore.restore().catch(() => {}).then(() => {
        if (!this.root) return;
        this.renderShell();
        this.bindEvents();
        void this.refreshRooms();
        this.autoCreateRoom();
      });
      return;
    }
    this.renderShell();
    this.bindEvents();
    void this.refreshRooms();
    this.autoCreateRoom();
  }

  autoCreateRoom() {
    if (this._autoCreateStarted) return;
    if (this.createBoss) {
      this._autoCreateStarted = true;
      // 野外冒险创建 BOSS 房间：BOSS名[难度] 房间简介由服务端生成
      this.socket
        .createRoom({ mode: 'boss', bossId: this.createBoss.bossId, difficulty: this.createBoss.difficulty })
        .then((room) => this.enterRoom(room))
        .catch((e) => this.notice(e.message));
      return;
    }
    if (this.shouldAutoCreate && this.stageId != null) {
      this._autoCreateStarted = true;
      this.socket
        .createRoom({
          mode: 'pve',
          stageId: this.stageId,
          mapId: this.mapId,
          name: this.stageName,
        })
        .then((room) => this.enterRoom(room))
        .catch((e) => {
          this._autoCreateStarted = false;
          this.notice(e.message);
        });
    }
  }

  renderShell() {
    this.root.innerHTML = `
      <div class="lobby-fullscreen classic-game-hall">
        <div class="lobby-stage">
          <div class="lobby-title-bar"><span class="lobby-title">游戏大厅</span></div>
          <div class="lobby-tabs">
            ${['all', 'pvp', 'boss', 'pve', 'practice']
              .map((t, i) => `<button class="lobby-tab ${i === 0 ? 'active' : ''}" data-filter="${t}">${this.tabLabel(t)}</button>`)
              .join('')}
          </div>

          <div class="lobby-rooms">
            <div id="lobby-room-grid" class="lobby-room-grid"></div>
            <div class="lobby-pager">
              <button class="lobby-pg-btn">首页</button>
              <button class="lobby-pg-btn">上一页</button>
              <span class="lobby-pg-info">1/1</span>
              <button class="lobby-pg-btn">下一页</button>
              <button class="lobby-pg-btn">末页</button>
            </div>
          </div>

          <div class="lobby-player">
            <div class="lobby-player-rank"><span>萝卜人</span><b>排名　4044</b></div>
            <div class="lobby-player-name" id="lobby-player-name">玩家</div>
            <div class="lobby-player-avatar"></div>
            <div class="lobby-player-stats">
              <div class="lobby-stat"><span class="lobby-stat-label">竞技积分</span><span class="lobby-stat-bar" style="--fill:#E7E54A" id="lobby-stat-honor"></span></div>
              <div class="lobby-stat"><span class="lobby-stat-label">经验</span><span class="lobby-stat-bar" style="--fill:#F4A62A" id="lobby-stat-exp"></span></div>
              <div class="lobby-stat"><span class="lobby-stat-label">生命</span><span class="lobby-stat-bar" style="--fill:#F04432;--edge:#9B2118" id="lobby-stat-hp"></span></div>
              <div class="lobby-stat"><span class="lobby-stat-label">魔法</span><span class="lobby-stat-bar" style="--fill:#16A9E8;--edge:#0879B0" id="lobby-stat-mp"></span></div>
            </div>
            <div class="lobby-level">Lv.<span id="lobby-player-level">1</span></div>
            <div class="lobby-player-record">
              <span>性别</span><b>男</b><span>等级</span><b id="lobby-player-level-copy">1</b>
            </div>
          </div>

          <div class="lobby-chat">
            <div id="lobby-chat-list" class="lobby-chat-list">
              <div class="lobby-chat-item">[系统] 欢迎来到游戏大厅，请选择房间或快速加入。</div>
              <div class="lobby-chat-item">[公会] 森林守卫：组队挑战正在招募成员。</div>
            </div>
            <div class="lobby-chat-input-row">
              <input id="lobby-chat-input" type="text" maxlength="200" placeholder="输入消息…" />
              <button id="lobby-chat-send" class="btn-sm">发送</button>
            </div>
          </div>

          <button class="lobby-btn lobby-btn-quick" id="lobby-quick">快速加入</button>
          <button class="lobby-btn lobby-btn-find" id="lobby-find">查找</button>
          <button class="lobby-btn lobby-btn-create" id="lobby-create">创建</button>
          <button class="lobby-btn lobby-btn-recharge" id="lobby-recharge">钻石充值</button>

          <div class="lobby-menu">
            <button class="lobby-menu-btn" data-fn="gold">金币</button>
            <button class="lobby-menu-btn" data-fn="trophy">奖杯</button>
            <button class="lobby-menu-btn" data-fn="mail">邮件</button>
            <button class="lobby-menu-btn" data-fn="backpack" id="lobby-fn-backpack">背包</button>
            <button class="lobby-menu-btn" data-fn="friend">好友</button>
            <button class="lobby-menu-btn" data-fn="quest">任务</button>
            <button class="lobby-menu-btn" data-fn="settings">设置</button>
            <button class="lobby-menu-btn lobby-menu-exit" id="lobby-exit">退出</button>
          </div>

          <!-- 创建说明(只创建 PVP，不选规模) -->
          <div id="lobby-room-inside" class="lobby-room-inside hidden"></div>
          <div id="lobby-battle" class="lobby-battle hidden"></div>
        </div>
      </div>`;
    this.bindShellEvents();
    this.renderRoomList();
    this.fitScale();
  }

  fitScale() {
    const stage = this.root?.querySelector('.lobby-stage');
    if (!stage) return;
    const apply = () => {
      const s = Math.min(window.innerWidth / 1632, window.innerHeight / 918);
      stage.style.transform = `scale(${s})`;
    };
    apply();
    window.removeEventListener('resize', this.onResize);
    this.onResize = apply;
    window.addEventListener('resize', this.onResize);
  }

  bindShellEvents() {
    const keepToolInsideRoom = (selector, kind) => {
      this.root.querySelector(selector)?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.openLobbyTool(kind);
      });
    };
    keepToolInsideRoom('#lobby-fn-backpack', 'bag');
    keepToolInsideRoom('.lobby-menu-btn[data-fn=quest]', 'quest');
    keepToolInsideRoom('.lobby-menu-btn[data-fn=settings]', 'settings');

    this.root.querySelectorAll('.lobby-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.filter = btn.dataset.filter;
        this.root.querySelectorAll('.lobby-tab').forEach((b) => b.classList.toggle('active', b === btn));
        this.renderRoomList();
      });
    });
    this.root.querySelector('#lobby-create').addEventListener('click', () => {
      // 战斗大厅只能创建 PVP 房间(不询问规模，双方人数相等即可开始)
      this.socket
        .createRoom({ mode: 'pvp' })
        .then((room) => this.enterRoom(room))
        .catch((e) => this.notice(e.message));
    });
    this.root.querySelector('#lobby-quick').addEventListener('click', () => {
      const room = (this.rooms ?? []).find((r) => r.status === 'waiting');
      if (!room) return this.notice('暂无可用房间');
      this.socket.joinRoom(room.id).then((r) => this.enterRoom(r)).catch((e) => this.notice(e.message));
    });
    this.root.querySelector('#lobby-find').addEventListener('click', () => {
      void this.refreshRooms();
      this.notice('已刷新房间列表');
    });
    this.root.querySelector('#lobby-chat-send').addEventListener('click', () => this.sendChat());
    this.root.querySelector('#lobby-chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.sendChat();
    });
    this.root.querySelector('#lobby-recharge').addEventListener('click', () => this.notice('充值功能开发中'));
    this.root.querySelector('.lobby-menu-btn[data-fn="gold"]')?.addEventListener('click', () => this.onNavigate?.('shop'));
    this.root.querySelector('.lobby-menu-btn[data-fn="trophy"]')?.addEventListener('click', () => this.onNavigate?.('hall'));
    this.root.querySelector('#lobby-exit').addEventListener('click', () => this.onNavigate?.('main'));
    this.root.querySelector('#lobby-fn-backpack').addEventListener('click', () => this.onNavigate?.('bag'));
    this.root.querySelector('.lobby-menu-btn[data-fn="quest"]').addEventListener('click', () => this.onNavigate?.('quest'));
    this.root.querySelector('.lobby-menu-btn[data-fn="settings"]').addEventListener('click', () => this.notice('设置功能开发中'));
  }

  openLobbyTool(kind) {
    this.root.querySelector('#lobby-tool-overlay')?.remove();
    const overlay = document.createElement('section');
    overlay.id = 'lobby-tool-overlay';
    overlay.style.cssText = 'position:absolute;inset:4%;z-index:100000;background:rgba(12,30,35,.94);border:2px solid #b9df67;border-radius:14px;overflow:auto;color:#fff;';
    overlay.innerHTML = `<button type='button' id='lobby-tool-close' style='position:sticky;float:right;top:10px;right:12px;z-index:2;font-size:24px'>×</button><div id='lobby-tool-content' style='min-height:100%;padding:18px'></div>`;
    this.root.querySelector('.lobby-stage')?.append(overlay);
    overlay.querySelector('#lobby-tool-close')?.addEventListener('click', () => overlay.remove());
    const content = overlay.querySelector('#lobby-tool-content');

    if (kind === 'bag' && this.itemDb && this.inventory) {
      new BagView(
        this.itemDb,
        this.inventory,
        this.db,
        this.cardInventory,
        this.player,
        { onPlayerUpdate: this.onPlayerUpdate },
      ).render(content);
    } else if (kind === 'quest' && this.player) {
      new QuestView(this.db, this.cardInventory, this.player, {
        onPlayerUpdate: this.onPlayerUpdate,
        itemDb: this.itemDb,
        inventory: this.inventory,
      }).render(content);
    } else if (kind === 'settings') {
      content.innerHTML = `<div style='max-width:520px;margin:70px auto'><h2>设置</h2><label style='display:block;margin:22px 0'>音乐音量 <input id='lobby-music-volume' type='range' min='0' max='100' value='${Math.round(audio.volume * 100)}'></label><label style='display:block;margin:22px 0'>音效音量 <input id='lobby-sfx-volume' type='range' min='0' max='100' value='${Math.round(audio.sfxVolume * 100)}'></label><button type='button' id='lobby-mute-toggle'>${audio.isMuted() ? '恢复声音' : '静音'}</button></div>`;
      content.querySelector('#lobby-music-volume')?.addEventListener('input', (event) => {
        audio.volume = Number(event.target.value) / 100;
        if (audio.bgm) audio.bgm.volume = audio.volume;
      });
      content.querySelector('#lobby-sfx-volume')?.addEventListener('input', (event) => {
        audio.sfxVolume = Number(event.target.value) / 100;
      });
      content.querySelector('#lobby-mute-toggle')?.addEventListener('click', (event) => {
        event.currentTarget.textContent = audio.toggleMute() ? '恢复声音' : '静音';
      });
    } else {
      content.innerHTML = '<p>该功能当前不可用。</p>';
    }
    audio.playBgm('room');
  }

  tabLabel(t) {
    return { all: '全部', pvp: 'PVP', boss: 'BOSS', pve: '副本', practice: '练习' }[t] ?? t;
  }

  sendChat() {
    const input = this.root.querySelector('#lobby-chat-input');
    const text = input?.value.trim();
    if (!text) return;
    this.sendText(text);
    if (input) input.value = '';
  }

  bindEvents() {
    this.unsubs = [
      this.socket.on('rooms:list', (rooms) => {
        this.rooms = rooms ?? [];
        if (!this.room && !this.roomBattleView) this.renderRoomList();
      }),
      this.socket.on('room:snapshot', (room) => {
        if (room && this.room) { this.refreshRoom(room); return; }
        // 观战房间：更新房间状态，战斗开始后自动进入只读战场
        if (room && this.watchingRoomId && Number(room.id) === Number(this.watchingRoomId)) {
          this.watchingRoom = room;
          if (['starting', 'battling'].includes(room.status) && !this.roomBattleView) {
            this.enterSpectatorBattle(room);
          }
          return;
        }
        // 未进房间但收到快照：可能是刷新后残留的旧房间，也可能正在创建/加入(快照先于 ack 到达)
        // 延迟检查：若 600ms 后仍未进房间(非创建/加入场景)，才离开旧房间
        if (room && !this._staleCleanupScheduled) {
          this._staleCleanupScheduled = true;
          setTimeout(() => {
            this._staleCleanupScheduled = false;
            if (!this.room) this.socket.leaveRoom().catch(() => {});
          }, 600);
        }
      }),
      this.socket.on('room:starting', (payload = {}) => {
        if (this.watchingRoomId) {
          if (payload?.room) this.watchingRoom = payload.room;
          if (!this.roomBattleView) {
            this.enterSpectatorBattle(payload?.room ?? this.watchingRoom ?? { id: this.watchingRoomId });
          }
          return;
        }
        this.enterBattle();
      }),
      this.socket.on('room:chat', (msg) => this.appendChat(msg)),
      this.socket.on('lobby:chat', (msg) => this.appendChat(msg)),
      this.socket.on('room:kicked', () => {
        this.room = null;
        this.notice('你已被房主移出房间');
        audio.playBgm('room', { fade: true });
        this.exitRoom();
      }),
      this.socket.on('pvp:snapshot', (snap) => {
        this.snap = snap;
        this.renderBattle();
      }),
      this.socket.on('pvp:end', ({ winner }) => {
        this.notice(winner === this.myTeam ? '胜利！' : '失败…');
      }),
    ];
    this.bindRoomChat();
  }

  destroy() {
    this.exitSpectatorBattleSilent();
    for (const off of this.unsubs) off();
    this.unsubs = [];
    if (this.chatSendHandler) { window.removeEventListener('clbwz:room-chat-send', this.chatSendHandler); this.chatSendHandler = null; }
    window.removeEventListener('resize', this.onResize);
    if (this.snap) this.exitBattle();
    else if (this.room) this.socket.leaveRoom().catch(() => {});
    this.socket.disconnect();
  }

  async refreshRooms() {
    try {
      this.rooms = await this.socket.listRooms();
      this.renderRoomList();
    } catch (e) {
      this.notice(e.message);
    }
  }

  renderRoomList() {
    const grid = this.root.querySelector('#lobby-room-grid');
    if (!grid) return;
    let list = (this.rooms ?? []).filter((r) => ['waiting', 'starting', 'battling'].includes(r.status));
    if (this.filter !== 'all' && this.filter !== 'practice') {
      list = list.filter((r) => r.mode === this.filter);
    }
    const cells = [];
    for (let i = 0; i < 6; i++) {
      const room = list[i];
      cells.push(
        room
          ? `<div class="lobby-room-cell" data-room-id="${room.id}">
              <div class="lobby-room-cell-top">
                <span class="lobby-room-cell-no">房间 ${String(room.id).padStart(3, '0')}</span>
                <span class="lobby-room-cell-type type-${room.mode}">${TYPE_LABEL[room.mode] ?? room.mode}</span>
              </div>
              <div class="lobby-room-cell-name">${this.escapeHtml(room.name || '对战房间')}</div>
              <div class="lobby-room-cell-meta">${room.size || ''} · ${room.members?.length ?? 0}人 · ${this.roomStatusLabel(room.status)}</div>
              <div class="lobby-room-cell-actions">
                ${room.status === 'waiting' ? '<button type="button" class="btn-sm room-join-btn">加入</button>' : ''}
                <button type="button" class="btn-sm btn-ghost room-watch-btn">${room.status === 'battling' ? '观战' : '观战'}</button>
              </div>
            </div>`
          : '<div class="lobby-room-cell lobby-room-cell-empty">空位</div>',
      );
    }
    grid.innerHTML = cells.join('');
    grid.querySelectorAll('.lobby-room-cell[data-room-id]').forEach((el) => {
      const roomId = Number(el.dataset.roomId);
      el.querySelector('.room-join-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.socket.joinRoom(roomId).then((r) => this.enterRoom(r)).catch((err) => this.notice(err.message));
      });
      el.querySelector('.room-watch-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.watchRoom(roomId);
      });
    });
    this.renderPlayerInfo();
  }

  roomStatusLabel(status) {
    if (status === 'battling') return '战斗中';
    if (status === 'starting') return '开始中';
    return '等待中';
  }

  /** 观战：订阅房间快照(只读)。等待中的房间会在开始后自动进入战斗画面。 */
  watchRoom(roomId) {
    const previous = this.watchingRoomId;
    if (previous != null && Number(previous) !== Number(roomId)) {
      this.socket.leaveSpectate(previous).catch(() => {});
      this.socket.leaveWatch().catch(() => {});
      this.exitSpectatorBattleSilent();
    }
    const room = (this.rooms ?? []).find((r) => r.id === roomId) ?? this.watchingRoom;
    this.watchingRoomId = Number(roomId);
    this.watchingRoom = room || null;
    this.socket.watchRoom(Number(roomId))
      .then((r) => {
        this.watchingRoom = r;
        if (['starting', 'battling', 'finished'].includes(r.status)) {
          this.enterSpectatorBattle(r);
        } else {
          this.notice(`正在观战房间 ${roomId}${r.name ? '「' + r.name + '」' : ''}，战斗开始后自动显示`);
        }
      })
      .catch((e) => this.notice(e.message));
  }

  /** 进入观战战场：只读渲染服务端快照，隐藏手牌/技能/部署 UI。 */
  enterSpectatorBattle(room) {
    if (!this.root || !room) return;
    this.exitSpectatorBattleSilent();
    this.watchingRoomId = Number(room.id ?? this.watchingRoomId);
    this.watchingRoom = room;

    const inside = this.root.querySelector('#lobby-room-inside');
    const panel = this.root.querySelector('#lobby-battle');
    this.root.querySelectorAll('.lobby-stage > *').forEach((el) => {
      if (!el.id || !['lobby-battle'].includes(el.id)) el.classList.add('hidden');
    });
    inside?.classList.add('hidden');
    panel?.classList.remove('hidden');
    document.body.classList.add('battle-immersive', 'pvp-battle-active', 'spectator-active');
    audio.playBgm('battle', { fade: true });

    this.roomBattleView = new BattleView(this.db, {
      cardInventory: this.cardInventory,
      heroSkills: null,
      pvp: {
        roomId: Number(room.id),
        team: 'blue',
        spectator: true,
        mode: room.mode || 'pvp',
        mapId: room.mapId || '4',
        socket: this.socket,
        deckSlots: [],
      },
      onNavigate: this.onNavigate,
    });
    this.roomBattleView.render(panel);

    // 观战只保留战场画布 + 基地血量；移除手牌/技能/重启/关卡选择等交互 UI
    this.roomBattleView.viewRoot?.querySelectorAll?.(
      '#hand, .skill-panel, .battle-fab, #battle-skill, #settings-panel, #stage-picker, #restart-btn, #result-retry, #result-next',
    ).forEach((el) => el?.remove?.());
    this.roomBattleView.viewRoot?.querySelector?.('.battle-immersive-dock')?.classList?.add('hidden');
    this.roomBattleView.viewRoot?.querySelector?.('#place-grid-overlay')?.classList?.add('hidden');

    const exit = document.createElement('button');
    exit.id = 'pvp-exit-ov';
    exit.className = 'pvp-exit-btn spectator-exit-btn';
    exit.type = 'button';
    exit.textContent = '退出观战';
    exit.addEventListener('click', () => this.exitSpectatorBattle());
    document.body.append(exit);
    this._spectatorExitBtn = exit;
  }

  exitSpectatorBattle() {
    const roomId = this.watchingRoomId;
    this.exitSpectatorBattleSilent();
    if (roomId != null) {
      this.socket.leaveSpectate(roomId).catch(() => {});
      this.socket.leaveWatch().catch(() => {});
    }
    audio.playBgm('room', { fade: true });
    void this.refreshRooms();
  }

  exitSpectatorBattleSilent() {
    this.roomBattleView?.destroy?.();
    this.roomBattleView = null;
    this._spectatorExitBtn?.remove?.();
    this._spectatorExitBtn = null;
    document.body.classList.remove('battle-immersive', 'pvp-battle-active', 'spectator-active');
    if (this.root) {
      this.root.querySelector('#lobby-battle')?.classList.add('hidden');
      this.root.querySelector('#lobby-room-inside')?.classList.add('hidden');
      this.root.querySelectorAll('.lobby-stage > *').forEach((el) => {
        if (!el.id || !['lobby-room-inside', 'lobby-battle'].includes(el.id)) el.classList.remove('hidden');
      });
    }
    this.watchingRoomId = null;
    this.watchingRoom = null;
  }

  renderPlayerInfo() {
    const p = authStore.snapshot?.profile;
    if (!p) return;
    const nameEl = this.root.querySelector('#lobby-player-name');
    if (nameEl) nameEl.textContent = p.nickname || '玩家';
    const lv = this.root.querySelector('#lobby-player-level');
    if (lv) lv.textContent = p.level ?? 1;
    const lvCopy = this.root.querySelector('#lobby-player-level-copy');
    if (lvCopy) lvCopy.textContent = p.level ?? 1;
    const set = (id, val) => {
      const el = this.root.querySelector(id);
      if (el) el.textContent = val ?? '--';
    };
    set('#lobby-stat-honor', p.honor ?? 0);
    set('#lobby-stat-exp', p.exp ?? 0);
    set('#lobby-stat-hp', p.hp ?? 1000);
    set('#lobby-stat-mp', '--');
  }

  appendChat(msg) {
    if (!msg) return;
    const list = this.root.querySelector('#lobby-chat-list');
    if (!list) return;
    list.innerHTML += `<div class="lobby-chat-item">${this.escapeHtml(msg.nickname || '')}：${this.escapeHtml(msg.text || '')}</div>`;
    list.scrollTop = list.scrollHeight;
    const log = this.root.querySelector('.exact-room-chat-log');
    if (log) {
      const row = document.createElement('div');
      row.className = 'exact-room-chat-message';
      row.innerHTML = `<b>${this.escapeHtml(msg.nickname || '')}：</b><span>${this.escapeHtml(msg.text || '')}</span>`;
      log.append(row);
      log.scrollTop = log.scrollHeight;
    }
  }

  // ---------------- 房间内(统一用 DeckSelectView 原选卡组界面) ----------------
  enterRoom(room) {
    this.room = room;
    this.myTeam = room.members?.find((m) => String(m.userId) === String(this.currentUserId()))?.team ?? 'blue';
    this.root.querySelectorAll('.lobby-stage > *').forEach((el) => {
      if (!el.id || !['lobby-room-inside', 'lobby-battle'].includes(el.id)) el.classList.add('hidden');
    });
    const inside = this.root.querySelector('#lobby-room-inside');
    inside.classList.remove('hidden');
    audio.playBgm('room', { fade: true });
    this.renderRoomInside();
  }

  currentUserId() {
    return authStore.snapshot?.profile?.userId ?? authStore.user?.id ?? '';
  }

  /** 房间快照更新：重新渲染房间界面(成员/规则同步) */
  refreshRoom(room) {
    if (room) this.room = room;
    if (!this.room || !this.root) return;
    this.myTeam = this.room.members?.find((m) => String(m.userId) === String(this.currentUserId()))?.team ?? this.myTeam;
    // 房主随机地图广播（room.mapId）→ 全员同步场景（2=草地、4=冰川、7=黄沙）
    if (this.room.mode === 'pvp' && typeof window !== 'undefined') {
      const sceneByMap = { '2': 'grass', '4': 'ice', '7': 'rock' };
      const synced = sceneByMap[String(this.room.mapId)];
      if (synced) window.__pvpMapScene = synced;
    }
    this.renderRoomInside();
  }

  renderRoomInside() {
    const panel = this.root.querySelector('#lobby-room-inside');
    if (!panel || !this.room) return;
    // PVP 房间显示房主随机的地图（全员同步 room.mapId → 地图名）
    if (this.room.mode === 'pvp' && typeof window !== 'undefined') {
      const sceneByMap = { '2': '草地', '4': '冰川', '7': '黄沙' };
      const synced = sceneByMap[String(this.room.mapId)];
      if (synced) window.__pvpMapScene = { 草地: 'grass', 冰川: 'ice', 黄沙: 'rock' }[synced];
    }
    const members = this.room.members ?? [];
    const meId = this.currentUserId();
    console.log('[room-debug] meId=', meId, 'myTeam=', this.myTeam, 'members=', members.map((m) => m.nickname + ':' + m.team + ':' + m.userId).join(' | '));
    const myMember = members.find((m) => String(m.userId) === String(meId));
    const isHost = myMember?.isHost;
    const isBoss = this.room.mode === 'boss';
    const boss = BOSS_LIST.find((b) => b.id === this.room.bossId);
    const stageId = isBoss ? 1 : Number(this.room.stageId || 1);

    // 房间内统一使用 DeckSelectView(原选卡组界面)；房间简介显示在标题
    if (!this.deckSelect) this.deckSelect = new DeckSelectView();
    this.deckSelect.render(panel, {
      db: this.db,
      cardInventory: this.cardInventory,
      deckSlots: undefined,
      stageId,
      stages: this.db.stages?.slice(0, 20) ?? [],
      mode: this.room.mode,
      playerName: myMember?.nickname || authStore.snapshot?.profile?.nickname || '玩家',
      playerLv: myMember?.level ?? authStore.snapshot?.profile?.level ?? 1,
      isOwner: Boolean(isHost),
      roomState: {
        roomId: this.room.id,
        myUserId: meId,
        stageName: this.room.name || '对战房间',
        members,
        myTeam: this.myTeam,
        allowUnbalanced: Boolean(this.room.allowUnbalanced),
        randomMatch: Boolean(this.room.randomMatch),
        bossInfo: isBoss && boss ? { name: boss.name, difficulty: this.room.difficulty || boss.difficulty, hp: boss.hp } : null,
        onReady: () => this.socket.setReady(!myMember?.ready).then((r) => this.refreshRoom(r)).catch((e) => this.notice(e.message)),
        onStart: () => this.socket.startGame().catch((e) => this.notice(e.message)),
        onSetRule: (v) => this.socket.setRule(v).then((r) => this.refreshRoom(r)).catch((e) => this.notice(e.message)),
        onRandomMatch: (v) => this.socket.setRandomMatch(v).then((r) => this.refreshRoom(r)).catch((e) => this.notice(e.message)),
        onChangeMap: (mapId) => this.socket.changeMap(mapId).then((r) => this.refreshRoom(r)).catch((e) => this.notice(e.message)),
        onSwitch: () => this.socket.switchTeam().then((r) => this.refreshRoom(r)).catch((e) => this.notice(e.message)),
      },
      onConfirm: () => this.socket.startGame().catch((e) => this.notice(e.message)),
      onBack: () => this.leaveRoom(),
    });

    // 渲染后按房间地图(room.mapId)更新随机地图按钮显示（房主/其他玩家都可见）
    if (this.room.mode === 'pvp') {
      const sceneByMap = { '2': { icon: '🌿', label: '草地' }, '4': { icon: '❄️', label: '冰川' }, '7': { icon: '🏜️', label: '黄沙' } };
      const info = sceneByMap[String(this.room.mapId)];
      if (info) {
        const labelEl = panel.querySelector('.dice-label');
        if (labelEl) labelEl.textContent = `${info.label}地图`;
        const iconEl = panel.querySelector('.dice-icon');
        if (iconEl) iconEl.textContent = info.icon;
        const btn = panel.querySelector('.dice-btn');
        if (btn) btn.title = `随机地图（当前：${info.label}地图）`;
      }
    }
  }

  /** 房间内聊天：监听 BattleRoomExact 聊天框的发送事件(clbwz:room-chat-send) */
  bindRoomChat() {
    if (this.chatSendHandler) return;
    this.chatSendHandler = (e) => {
      const text = e.detail?.message;
      if (text) this.sendText(String(text));
    };
    window.addEventListener('clbwz:room-chat-send', this.chatSendHandler);
  }

  /** 发送消息：房间内走房间聊天，大厅走全局聊天 */
  sendText(text) {
    if (!text || !text.trim()) return;
    if (this.room) this.socket.sendChat(text.trim()).catch((e) => this.notice(e.message));
    else this.socket.sendLobbyChat(text.trim()).catch((e) => this.notice(e.message));
  }

  exitRoom() {
    this.room = null;
    const inside = this.root.querySelector('#lobby-room-inside');
    if (inside) { inside.classList.add('hidden'); inside.innerHTML = ''; }
    this.root.querySelectorAll('.lobby-stage > *').forEach((el) => {
      if (!el.id || !['lobby-room-inside', 'lobby-battle'].includes(el.id)) el.classList.remove('hidden');
    });
    this.root.querySelector('#lobby-room-inside')?.classList.add('hidden');
    this.root.querySelector('#lobby-battle')?.classList.add('hidden');
    void this.refreshRooms();
  }

  leaveRoomSilent() {
    this.socket.leaveRoom().catch(() => {});
  }

  leaveRoom() {
    this.socket.leaveRoom().then(() => {
      this.room = null;
      audio.playBgm('room', { fade: true });
      this.exitRoom();
    }).catch((e) => this.notice(e.message));
  }

  // ---------------- 对战战场 ----------------
  enterBattle() {
    if (this.room?.mode === 'pve') {
      this.onNavigate?.('battle', {
        stageId: Number(this.room.stageId || this.stageId || 1),
        enemyRandomMode: this.enemyRandomMode,
      });
      return;
    }
    this.root.querySelector('#lobby-room-inside').classList.add('hidden');
    const panel = this.root.querySelector('#lobby-battle');
    panel.classList.remove('hidden');
    // PVP：房间容器内直接渲染野外战斗(BattleView 完整实现：背景/柱子/资源/手牌/放置/攻击，本地引擎 + 部署转发)
    if (this.room?.mode === 'pvp') {
      this.roomBattleView = new BattleView(this.db, {
        cardInventory: this.cardInventory,
        heroSkills: null,
        pvp: { roomId: this.room.id },
        onNavigate: this.onNavigate,
      });
      this.roomBattleView.render(panel);
      this.attachPvpExit(panel);
      return;
    }
    // BOSS/PVE 快照战场（BOSS 按 BOSS 定义选场景背景）
    document.body.classList.add('battle-immersive');
    const isBossMode = this.room?.mode === 'boss';
    const roomBoss = isBossMode && this.room?.bossId ? BOSS_LIST.find((b) => b.id === this.room.bossId) : null;
    const roomBg = resolveBattleBackground({ stage_type: roomBoss ? 2 : 0 }, { bossId: this.room?.bossId || null });
    panel.innerHTML = `
      <div class="page battle-page battle-immersive-page">
        <div class="battle-stage-bar">
          <span class="battle-map-label">🗺️ ${roomBg.sceneLabel}地图</span>
        </div>
        <div class="battle-game-wrap battle-scene" style="--field-left:${FIELD_LEFT}px;--field-top:${FIELD_TOP}px;--field-bottom:${FIELD_BOTTOM}px;--bg-grass:url('${roomBg.baseUrl}');--bg-map:url('${roomBg.baseUrl}');--bg-base:url('${roomBg.baseUrl}')">
          <div class="game-container">
            <div class="top-ui">
              <span class="res-hud res-sun">☀ <b id="pvp-energy">--</b></span>
              <div id="hand" class="hand-cards"></div>
            </div>
            <div class="base-hp-slot player"><div class="base-hp-bg" aria-hidden="true"></div><div class="hp" id="orb-player-hp">--</div><div class="label">己方基地</div></div>
            <div class="base-hp-slot enemy"><div class="base-hp-bg" aria-hidden="true"></div><div class="hp" id="orb-enemy-hp">--</div><div class="label">敌方基地</div></div>
            <div class="battlefield-wrap">
              <div id="place-grid-overlay" class="place-grid-overlay"></div>
              <canvas id="battle-canvas" class="battle-canvas"></canvas>
            </div>
            <div id="deploy-tip" class="deploy-tip"></div>
            <button type="button" id="pvp-exit" class="pvp-exit-btn">退出战斗</button>
          </div>
        </div>
      </div>`;
    // 网格 cells(同野外：12×5)
    const overlay = panel.querySelector('#place-grid-overlay');
    if (overlay) {
      const cells = [];
      for (let lane = 0; lane < LANES; lane++) {
        for (let col = 0; col < COLS; col++) {
          cells.push(`<div class="place-grid-cell" data-lane="${lane}" data-col="${col}" style="left:${cellX(col)}px;top:${cellY(lane)}px;width:${CELL_W}px;height:${CELL_H}px"></div>`);
        }
      }
      overlay.innerHTML = cells.join('');
    }
    // canvas 尺寸(同野外：战场 wrap 实际尺寸 + 网格同 scale)
    const stage = panel.querySelector('.battlefield-wrap');
    const canvas = panel.querySelector('#battle-canvas');
    if (stage && canvas) {
      const w = Math.max(1, stage.clientWidth);
      const h = Math.max(1, stage.clientHeight);
      canvas.width = w;
      canvas.height = h;
      const scale = Math.min(w / FIELD_W, h / FIELD_H);
      this.renderer = new BattleRenderer(canvas);
      this.renderer.fieldScale = scale;
      if (overlay) {
        Object.assign(overlay.style, {
          width: `${FIELD_W * scale}px`,
          height: `${FIELD_H * scale}px`,
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
        });
      }
    } else {
      this.renderer = new BattleRenderer(canvas);
      this.renderer.resize?.();
    }
    panel.querySelector('#pvp-exit').addEventListener('click', () => this.exitBattle());
    canvas.addEventListener('click', (e) => {
      if (!this.snap || !this.pendingCard) return;
      const rect = canvas.getBoundingClientRect();
      const col = Math.floor(((e.clientX - rect.left) / rect.width) * 12);
      const lane = Math.floor(((e.clientY - rect.top) / rect.height) * 5);
      this.socket.pvpDeploy(this.pendingCard.id, lane, col)
        .then(() => { this.pendingCard = null; this.updateDeployTip(); this.renderHand(); })
        .catch((err) => this.notice(err.message));
    });
    this.renderBattle();
  }

  /** PVP：退出战斗(离开房间回大厅) */
  attachPvpExit(panel) {
    if (!panel || panel.querySelector('#pvp-exit-ov')) return;
    const btn = document.createElement('button');
    btn.id = 'pvp-exit-ov';
    btn.textContent = '退出战斗';
    btn.className = 'pvp-exit-btn';
    btn.style.cssText = 'position:fixed;top:14px;right:16px;z-index:400;';
    btn.addEventListener('click', () => {
      this.roomBattleView?.stopLoop?.();
      this.roomBattleView?.pvpSocket?.disconnect?.();
      this.roomBattleView = null;
      this.exitBattle();
    });
    document.body.append(btn);
    this._pvpExitBtn = btn;
  }

  exitBattle() {
    document.body.classList.remove('battle-immersive');
    // 战斗已开始：退出直接离开房间回大厅
    this.renderer = null;
    this.snap = null;
    if (this.room) {
      this.leaveRoom();
      return;
    }
    this.root.querySelector('#lobby-battle').classList.add('hidden');
    this.root.querySelector('#lobby-room-inside').classList.remove('hidden');
    this.renderRoomInside();
  }

  renderBattle() {
    if (!this.snap || !this.renderer) return;
    const fakeEngine = {
      time: this.snap.t ?? 0,
      status: this.snap.status ?? 'playing',
      units: (this.snap.units ?? []).map((u) => {
        const card = this.db.getById(u.cardId);
        const unit = new BattleUnit({ card, lane: u.lane, col: u.col, team: u.team });
        unit.uid = u.uid;
        unit.hp = u.hp;
        unit.maxHp = u.maxHp;
        if (u.state === 'stun') unit.stunnedUntil = this.snap.t + 1;
        if (u.state === 'frozen') unit.frozenUntil = this.snap.t + 1;
        return unit;
      }),
      getBattleSpriteRes: () => new Set(
        (this.snap.units ?? []).map((u) => String(u.res ?? u.cardId ?? '')),
      ),
      projectiles: [], floats: [], deployEffects: [], impactFx: [], bumpFx: [], logs: [],
      heroHp: this.snap.heroHp?.blue ?? 0,
      enemyHeroHp: this.snap.heroHp?.red ?? 0,
      sunlight: this.snap.energy?.blue ?? 0,
      food: 0,
    };
    this.renderer.draw(fakeEngine);
    const orbB = this.root.querySelector('#orb-player-hp');
    if (orbB) orbB.textContent = fakeEngine.heroHp;
    const orbR = this.root.querySelector('#orb-enemy-hp');
    if (orbR) orbR.textContent = fakeEngine.enemyHeroHp;
    const en = this.root.querySelector('#pvp-energy');
    if (en) en.textContent = Math.floor(this.snap.energy?.[this.myTeam] ?? 0);
    this.renderHand();
  }

  /** 手牌：野外卡牌样式(deck-slot)，点击选卡 → 点击战场部署 */
  renderHand() {
    const hand = this.root.querySelector('#hand');
    if (!hand) return;
    hand.innerHTML = '';
    const energy = this.snap?.energy?.[this.myTeam] ?? 0;
    const candidates = this.db.cards.filter((c) => c.id < 500).slice(0, 8);
    for (const card of candidates) {
      const affordable = Number(card.costA ?? 1) <= energy;
      const selected = this.pendingCard?.id === card.id;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `deck-slot ${selected ? 'selected' : ''} ${affordable ? '' : 'unavailable'}`;
      btn.dataset.handIdx = String(card.id);
      btn.title = card.desc ?? card.name;
      btn.innerHTML = `
        <span class="slot-face">
          <img class="slot-portrait" src="/sprites/cards/${card.spriteRes}.png" alt="" draggable="false" />
        </span>
        <span class="slot-meta">
          <span class="slot-name">${this.escapeHtml(card.name)}</span>
          <span class="slot-cost">☀${card.costA ?? 1}</span>
        </span>`;
      btn.addEventListener('click', () => {
        this.pendingCard = this.pendingCard?.id === card.id ? null : card;
        this.updateDeployTip();
        this.renderHand();
      });
      hand.append(btn);
    }
  }

  /** 放置提示：选卡后提示点击战场 */
  updateDeployTip() {
    const tip = this.root.querySelector('#deploy-tip');
    if (!tip) return;
    tip.textContent = this.pendingCard
      ? `放置【${this.pendingCard.name}】→ 点击己方半场网格部署`
      : '';
    tip.classList.toggle('visible', Boolean(this.pendingCard));
  }

  escapeHtml(text) {
    return String(text ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  notice(text) {
    const box = this.root.querySelector('.lobby-fullscreen');
    if (!box) return;
    let toast = box.querySelector('.lobby-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'lobby-toast';
      box.append(toast);
    }
    toast.textContent = text;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  }
}
