import {
  formatCraftCardName,
  getInstanceStatMultiplier,
  resolveCraftQuality,
} from '../core/constants.js';
import {
  HAND_SLOT_COUNT, STARTER_DECK, TRAINING_STAGE_VALUE,
  roundBattleAmount,
} from '../battle/BattleConfig.js';
import { audio } from '../core/AudioManager.js';
import stageInfoData from '../data/stageInfo.json';
import worldMapData from '../data/worldMap.json';

const STORAGE_KEY = 'battle_deck_v2';
const LEGACY_KEY = 'battle_deck_ids';
const WORLD_MAP_STORAGE = 'clbwz_worldmap_v1';
const ROOM_SETTINGS_KEY = 'clbwz_room_settings_v1';

function loadWM() {
  try { const r = localStorage.getItem(WORLD_MAP_STORAGE); if (r) return JSON.parse(r); } catch {}
  return { stageClaimed: [], chapterUnlocked: 1 };
}

function loadRoomSettings() {
  try { const r = localStorage.getItem(ROOM_SETTINGS_KEY); if (r) return JSON.parse(r); } catch {}
  return { musicVol: 80, sfxVol: 80, showCardName: true };
}

function saveRoomSettings(s) {
  try { localStorage.setItem(ROOM_SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

function slotFingerprint(i, s) { return s ? { index: i, cardId: s.cardId, craftQuality: s.craftQuality ?? 1, strengthLv: s.strengthLv ?? 0 } : null; }
function matchesFingerprint(s, fp) { return s && fp && s.cardId === fp.cardId && (s.craftQuality ?? 1) === (fp.craftQuality ?? 1) && (s.strengthLv ?? 0) === (fp.strengthLv ?? 0); }
function isBattleSlot(db, slot) { return Boolean(slot && db?.getById(slot.cardId)?.battleUsable !== false); }

const byCh = {};
for (const s of stageInfoData) {
  if (!byCh[s.map_id]) byCh[s.map_id] = [];
  byCh[s.map_id].push(s);
}
for (const k of Object.keys(byCh)) byCh[k].sort((a, b) => (a.stage_num || 0) - (b.stage_num || 0));

export class DeckSelectView {
  static reconcileFingerprints(saved, ci) {
    if (!ci || !Array.isArray(saved) || !saved.length) return [];
    const bs = ci.getSlots(); const u = new Set(); const r = [];
    for (const fp of saved) {
      if (!fp || typeof fp.cardId !== 'number') continue;
      let p = -1;
      if (typeof fp.index === 'number' && bs[fp.index] && matchesFingerprint(bs[fp.index], fp) && !u.has(fp.index)) p = fp.index;
      else p = bs.findIndex((s, i) => s && !u.has(i) && matchesFingerprint(s, fp));
      if (p >= 0 && isBattleSlot(ci.cardDb, bs[p])) { u.add(p); r.push(p); }
    }
    return r;
  }
  static migrateLegacyIds(ids, ci, db) {
    if (!ci || !Array.isArray(ids)) return [];
    const bs = ci.getSlots(); const u = new Set(); const r = [];
    for (const raw of ids) {
      const id = Number(raw);
      if (!id || db.getById(id)?.battleUsable === false || !db.getById(id)) continue;
      const idx = bs.findIndex((s, i) => s?.cardId === id && !u.has(i));
      if (idx >= 0) { u.add(idx); r.push(idx); }
    }
    return r;
  }
  static defaultDeckSlots(ci, db) {
    if (!ci) return [];
    const bs = ci.getSlots(); const u = new Set(); const r = [];
    for (const id of STARTER_DECK) {
      const idx = bs.findIndex((s, i) => s?.cardId === id && !u.has(i));
      if (idx >= 0) { u.add(idx); r.push(idx); }
    }
    if (!r.length) bs.forEach((s, i) => { if (isBattleSlot(db, s) && r.length < HAND_SLOT_COUNT) r.push(i); });
    return r.slice(0, HAND_SLOT_COUNT);
  }
  static loadSavedDeck(ci, db) {
    if (!ci) return null;
    try {
      const r = localStorage.getItem(STORAGE_KEY);
      if (r) { const p = JSON.parse(r); if (Array.isArray(p) && p.length) { const rec = DeckSelectView.reconcileFingerprints(p, ci); if (rec.length) return rec; } }
    } catch {}
    try { const r = localStorage.getItem(LEGACY_KEY); if (r) { const m = DeckSelectView.migrateLegacyIds(JSON.parse(r), ci, db); if (m.length) return m; } } catch {}
    return null;
  }
  static saveDeck(si, ci) {
    if (!ci) return;
    const bs = ci.getSlots();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(si.map((i) => slotFingerprint(i, bs[i])).filter(Boolean)));
    localStorage.removeItem(LEGACY_KEY);
  }

  constructor() {
    this._tab = 'pvp';
    this._sid = 1;
    this._training = false;
    this._ch = 1;
    this._traps = [];
    this._roomSettings = loadRoomSettings();
    // 模拟房间状态
    this._isOwner = true;
    this._members = [
      { id: 1, name: '丛林勇士', lv: 1, owner: true, ready: true, avatar: '/sprites/cards/1.png' },
    ];
    this._enemyPlayers = []; // PVP时填充
    this._drawerOpen = false;
    this._deckTab = 'default';
    this._roomId = 1;
    this._allReady = false;
  }

  render(root, { db, cardInventory, deckSlots, stageId, stages, onConfirm, onBack, mode = 'pve', playerName = '丛林勇士', playerLv = 1, isOwner = true, roomState } = {}) {
    this._db = db;
    this._cardInventory = cardInventory;
    this._onConfirm = onConfirm;
    this._onBack = onBack;
    this._isOwner = isOwner;
    this._mode = mode; // 'pvp' | 'pve' | 'boss'
    this._roomState = roomState || null;

    // 真实房间数据(PVP/BOSS 房间由 RoomView 传入)：覆盖本地模拟成员
    if (this._roomState) {
      this._roomId = this._roomState.roomId ?? 1;
      this._myId = this._roomState.myUserId ?? null;
      if (this._roomState.stageName) this._stageName = this._roomState.stageName;
      if (this._roomState.allowUnbalanced != null) this._allowUnbalanced = this._roomState.allowUnbalanced;
      if (this._roomState.randomMatch != null) this._randomMatch = this._roomState.randomMatch;
      // 按队伍分边：蓝队左侧(含房主)，红队右侧 —— 玩家在哪个队就显示在哪边
      const membersAll = this._roomState.members ?? [];
      const blueMembers = membersAll.filter((m) => m.team === 'blue');
      const redMembers = membersAll.filter((m) => m.team === 'red');
      this._members = blueMembers.map((m, i) => ({
        id: m.userId ?? i + 1,
        name: m.nickname || '玩家',
        lv: m.level ?? 1,
        owner: Boolean(m.isHost),
        ready: Boolean(m.ready),
        avatar: '/sprites/cards/1.png',
      }));
      if (!this._members.length) {
        this._members = [{ id: 1, name: playerName || '玩家', lv: playerLv || 1, owner: isOwner, ready: false, avatar: '/sprites/cards/1.png' }];
      }
      // 敌方成员 / BOSS：红队(PVP)或 BOSS 卡
      if (mode === 'boss') {
        this._enemyPlayers = [];
        this._bossInfo = this._roomState.bossInfo || null;
      } else {
        this._enemyPlayers = redMembers.map((m, i) => ({ id: m.userId ?? 200 + i, name: m.nickname || '玩家', lv: m.level ?? 1, ready: Boolean(m.ready) }));
      }
    }

    const bagSlots = cardInventory?.getSlots() ?? [];
    const pool = bagSlots.map((s, i) => ({ slot: s, index: i })).filter(({ slot }) => isBattleSlot(db, slot));
    let selected = (deckSlots ?? []).filter((i) => isBattleSlot(db, bagSlots[i]));
    if (!selected.length) selected = DeckSelectView.defaultDeckSlots(cardInventory, db);
    this._selected = selected;
    this._bagSlots = bagSlots;
    this._pool = pool;

    this._tab = mode === 'pvp' ? 'pvp' : 'pve';
    this._sid = stageId === TRAINING_STAGE_VALUE ? 1 : stageId;
    this._training = stageId === TRAINING_STAGE_VALUE;

    // 关卡名称(roomState 模式用房间简介：PVP={昵称}的房间 / BOSS={BOSS名}[难度]，不覆盖)
    if (!this._roomState) {
      const stage = stages?.find(s => s.stage_id === this._sid) || stageInfoData.find(s => s.id === this._sid);
      this._stageName = stage?.stage_name || (this._training ? '训练场' : `第${this._sid}关`);
    }

    // 更新房主信息(仅非 roomState 模式，roomState 已有真实成员)
    if (!this._roomState) {
      this._members[0].name = playerName;
      this._members[0].lv = playerLv;
      this._members[0].owner = isOwner;
    }

    // 如果是PVP且没有敌方玩家，模拟一个(roomState 模式已有真实敌方)
    if (mode === 'pvp' && !this._enemyPlayers.length) {
      this._enemyPlayers = [
        { id: 101, name: '等待加入...', lv: '--', ready: false },
      ];
    } else if (mode !== 'pvp' && !this._roomState) {
      this._enemyPlayers = [];
    }

    this._buildUI(root);
    this._bindEvents(root);
    this._renderDeckSlots(root);
    this._renderDrawer(root);
    this._renderMembers(root);
    this._renderEnemy(root);
    this._updateReadyBtn(root);
    this._renderRoomStatus(root);
    // 标记房间模式(供 BattleRoomExact 等补丁判断：PVP/PVE 房间不追加难度)
    const gameRoomTag = root.querySelector('.game-room');
    if (gameRoomTag) gameRoomTag.dataset.mode = this._mode;
  }

  /** 房间状态提示(roomState 模式)：房主看玩家准备进度 + 房间规则入口 */
  _renderRoomStatus(root) {
    if (!this._roomState) return;
    const gameRoom = root.querySelector('.game-room');
    if (!gameRoom) return;

    // 准备进度提示(房主视角)
    if (this._mode === 'pvp') {
      const nonHost = (this._roomState.members ?? []).filter((m) => !m.isHost);
      const allReady = nonHost.length > 0 && nonHost.every((m) => m.ready);
      const readyCount = nonHost.filter((m) => m.ready).length;
      if (this._isOwner) {
        if (!allReady) {
          // 常驻提示：等待玩家准备(固定顶部，不移动)
          const bar = document.createElement('div');
          bar.className = 'room-status-bar';
          bar.textContent = `等待玩家准备…(${readyCount}/${nonHost.length})`;
          gameRoom.append(bar);
        }
      } else if (this._roomState.allowUnbalanced) {
        const bar = document.createElement('div');
        bar.className = 'room-status-bar';
        bar.textContent = '⚖ 已开启「允许不对等战斗」';
        gameRoom.append(bar);
      }
    }

    // 一次性 toast：所有玩家已准备，可开始啦(顶部弹出 → 上移 → 消失)
    if (this._isOwner && this._mode === 'pvp') {
      const nonHost = (this._roomState.members ?? []).filter((m) => !m.isHost);
      const allReady = nonHost.length > 0 && nonHost.every((m) => m.ready);
      if (allReady && !this._readyToastShown) {
        this._readyToastShown = true;
        const toast = document.createElement('div');
        toast.className = 'room-ready-toast';
        toast.textContent = '✓ 所有玩家已准备，可开始啦';
        document.body.append(toast);
        setTimeout(() => toast.remove(), 3200);
      } else if (!allReady) {
        this._readyToastShown = false;
      }
    }

    // 房间规则入口(PVP：所有人可见，房主可点开设置)
    if (this._mode === 'pvp') {
      const ruleBtn = document.createElement('button');
      ruleBtn.type = 'button';
      ruleBtn.className = 'room-rule-btn';
      ruleBtn.textContent = this._roomState.allowUnbalanced ? '⚖ 允许不对等(已开)' : '⚙ 房间规则';
      ruleBtn.addEventListener('click', () => {
        this._openRuleModal(root);
      });
      const topBar = root.querySelector('.room-top-bar');
      if (topBar) topBar.append(ruleBtn);
    }

    // 房主按钮强制为「开始」(防止补丁覆盖回「准备」)
    if (this._isOwner) {
      const readyText = root.querySelector('#room-ready-btn .ready-text');
      if (readyText) readyText.textContent = '开始';
      const readyBtnEl = root.querySelector('#room-ready-btn');
      if (readyBtnEl) readyBtnEl.classList.add('is-owner');
    }
  }

  /** 房间规则独立弹窗(PVP)：房主可勾选「允许不对等战斗」，其他玩家只读 */
  _openRuleModal(root) {
    let modal = root.querySelector('.room-rule-modal');
    if (modal) { modal.style.display = 'flex'; return; }
    modal = document.createElement('div');
    modal.className = 'room-rule-modal';
    const on = Boolean(this._roomState?.allowUnbalanced);
    modal.innerHTML = `
      <div class="room-rule-modal-box">
        <h3 class="room-rule-modal-title">房间规则</h3>
        <label class="room-rule-row ${this._isOwner ? '' : 'disabled'}">
          <input type="checkbox" id="rule-unbalanced" ${on ? 'checked' : ''} ${this._isOwner ? '' : 'disabled'} />
          <span><b>允许不对等战斗</b><br/><small>双方人数不等也可开始；胜利/失败不掉落任何物品且不加经验</small></span>
        </label>
        <div class="room-rule-modal-actions">
          ${this._isOwner ? '<button id="rule-save" class="btn-sm">保存</button>' : ''}
          <button id="rule-close" class="btn-sm btn-ghost">关闭</button>
        </div>
      </div>`;
    modal.querySelector('#rule-close').addEventListener('click', () => { modal.style.display = 'none'; });
    const save = modal.querySelector('#rule-save');
    if (save) {
      save.addEventListener('click', () => {
        const checked = modal.querySelector('#rule-unbalanced').checked;
        this._roomState?.onSetRule?.(checked);
        modal.style.display = 'none';
      });
    }
    root.append(modal);
  }

  _buildUI(root) {
    root.innerHTML = `
      <div class="page deck-select-page">
        <div class="game-room">
          <!-- 顶部信息栏 -->
          <div class="room-top-bar">
            <div class="room-title-group">
              <span class="room-title-text">房间</span>
              <span class="room-id-tag">房间号: <b id="room-id-display">${this._roomId}</b></span>
            </div>
            <div class="room-stage-display" id="room-stage-display">${this._stageName}</div>
          </div>

          <!-- 左侧我方成员 -->
          <div class="room-left-side" id="room-left-side">
            <div class="room-side-label side-blue">蓝队</div>
            <div class="member-slot owner" id="owner-slot">
              <div class="member-avatar">
                <img src="/sprites/cards/1.png" alt="" />
                <span class="member-lv">Lv.</span>
              </div>
              <div class="member-info">
                <strong class="member-name"></strong>
                <span class="member-tag owner-tag">房主</span>
              </div>
            </div>
            <div class="member-slots-row">
              <div class="member-slot empty" id="member-slot-1" data-idx="1">
                <span class="empty-slot-blank"></span>
              </div>
              <div class="member-slot empty" id="member-slot-2" data-idx="2">
                <span class="empty-slot-blank"></span>
              </div>
            </div>
          </div>

          <!-- 右侧敌方/问号 -->
          <div class="room-right-side" id="room-right-side">
            <div class="room-side-label side-red">红队</div>
            <div class="enemy-slot top-enemy" id="enemy-slot-0"></div>
            <div class="enemy-slots-row">
              <div class="enemy-slot" id="enemy-slot-1"></div>
              <div class="enemy-slot" id="enemy-slot-2"></div>
            </div>
          </div>

          <!-- 中间战团区域 -->
          <div class="room-center-area">
            <div class="deck-header">
              <span class="deck-title">我的战团</span>
              <div class="deck-tabs">
                <button type="button" class="deck-tab active" data-tab="default">默认</button>
                <button type="button" class="deck-tab" data-tab="team1">战团1</button>
                <button type="button" class="deck-tab" data-tab="team2">战团2</button>
                <button type="button" class="deck-tab" data-tab="team3">战团3</button>
              </div>
              <button type="button" class="swap-card-btn" id="swap-card-btn">
                <span class="swap-icon">⇅</span> 换卡
              </button>
            </div>
            <div class="deck-slots-row" id="deck-slots-row"></div>
          </div>

          <!-- VS 标志 -->
          <div class="room-vs">VS</div>

          <!-- 中部功能按钮 -->
          <div class="room-mid-actions">
            <button type="button" class="mid-btn dice-btn" title="随机地图">
              <span class="dice-icon">🎲</span>
              <span class="dice-label">随机地图</span>
            </button>
            <button type="button" class="mid-btn skill-btn" title="技能">
              <span class="skill-icon">⚔</span>
              <span class="skill-label">技能</span>
            </button>
            <button type="button" class="mid-btn team-btn" title="换队">
              <span class="team-icon">👥</span>
              <span class="team-label">换队</span>
            </button>
          </div>

          <!-- 准备/开始按钮 -->
          <button type="button" class="room-ready-btn" id="room-ready-btn">
            <span class="ready-text">准备</span>
          </button>

          <!-- 底部功能栏 -->
          <div class="room-bottom-bar">
            <button type="button" class="bottom-btn" data-action="shop">🏪 商城</button>
            <button type="button" class="bottom-btn" data-action="bag">🎒 背包</button>
            <button type="button" class="bottom-btn" data-action="smithy">🔨 打造</button>
            <button type="button" class="bottom-btn" data-action="hero">👤 人物</button>
            <button type="button" class="bottom-btn" data-action="mail">📧 邮件</button>
            <button type="button" class="bottom-btn" data-action="friend">👫 好友</button>
            <button type="button" class="bottom-btn more-btn" id="more-btn">⚙ 更多 ▾</button>
            <button type="button" class="bottom-btn back-btn" id="back-btn">↩ 返回</button>
          </div>

          <!-- 更多下拉菜单 -->
          <div class="more-dropdown" id="more-dropdown" style="display:none;">
            <button type="button" id="setting-btn">⚙ 设置</button>
          </div>

          <!-- 设置模态框 -->
          <div class="room-setting-modal" id="setting-modal" style="display:none;">
            <div class="setting-panel">
              <div class="setting-header">
                <h3>⚙ 设置</h3>
                <button type="button" class="setting-close" id="setting-close">✕</button>
              </div>
              <div class="setting-body">
                <div class="setting-row">
                  <label>音乐大小</label>
                  <input type="range" id="music-vol" min="0" max="100" value="${this._roomSettings.musicVol}" />
                  <span id="music-vol-val">${this._roomSettings.musicVol}</span>
                </div>
                <div class="setting-row">
                  <label>音效大小</label>
                  <input type="range" id="sfx-vol" min="0" max="100" value="${this._roomSettings.sfxVol}" />
                  <span id="sfx-vol-val">${this._roomSettings.sfxVol}</span>
                </div>
                <div class="setting-row checkbox-row">
                  <label>
                    <input type="checkbox" id="show-card-name" ${this._roomSettings.showCardName ? 'checked' : ''} />
                    战斗内显示卡牌名称
                  </label>
                </div>
                ${this._roomState && this._mode === 'pvp' && this._isOwner ? `
                <div class="setting-row checkbox-row rule-row">
                  <label title="开启后双方人数不等也可开始战斗，但胜利/失败不掉落物品且不加经验">
                    <input type="checkbox" id="allow-unbalanced" ${this._allowUnbalanced ? 'checked' : ''} />
                    允许不对等战斗
                  </label>
                  <span class="rule-hint">人数不等可开战，无掉落无经验</span>
                </div>
                <div class="setting-row checkbox-row rule-row">
                  <label title="开启后人数不足时由系统补人机，1v1只补1v1、2v2只补2v2">
                    <input type="checkbox" id="random-match" ${this._randomMatch ? 'checked' : ''} />
                    随机匹配（补人机）
                  </label>
                  <span class="rule-hint">人少也能开，系统补人机</span>
                </div>` : ''}
                ${this._roomState && this._roomState.allowUnbalanced ? '<div class="room-rule-badge">⚖ 已开启「允许不对等战斗」</div>' : ''}
                ${this._roomState && this._roomState.randomMatch ? '<div class="room-rule-badge">🎲 已开启随机匹配（人机补位）</div>' : ''}
              </div>
            </div>
          </div>

          <!-- 换卡抽屉 -->
          <div class="card-drawer" id="card-drawer">
            <div class="drawer-header">
              <span>选择卡牌</span>
              <button type="button" class="drawer-close" id="drawer-close">✕</button>
            </div>
            <div class="drawer-cards" id="drawer-cards"></div>
          </div>

          <!-- 踢人确认弹窗 -->
          <div class="kick-modal" id="kick-modal" style="display:none;">
            <div class="kick-panel">
              <p>确定要踢出玩家 <b id="kick-target-name"></b> 吗？</p>
              <div class="kick-actions">
                <button type="button" class="btn-cancel" id="kick-cancel">取消</button>
                <button type="button" class="btn-confirm" id="kick-confirm">确定</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _bindEvents(root) {
    // 战团标签切换
    root.querySelectorAll('.deck-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        audio.playSfx('click');
        root.querySelectorAll('.deck-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._deckTab = btn.dataset.tab;
      });
    });

    // 换卡按钮 / 抽屉开关
    const swapBtn = root.querySelector('#swap-card-btn');
    const drawer = root.querySelector('#card-drawer');
    const toggleDrawer = (open) => {
      this._drawerOpen = open;
      drawer.classList.toggle('open', open);
      swapBtn.classList.toggle('active', open);
    };
    swapBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      audio.playSfx('click');
      toggleDrawer(!this._drawerOpen);
    });
    root.querySelector('#drawer-close')?.addEventListener('click', () => toggleDrawer(false));

    // 点击抽屉外收起
    document.addEventListener('click', (e) => {
      if (this._drawerOpen && drawer && !drawer.contains(e.target) && !swapBtn.contains(e.target)) {
        toggleDrawer(false);
      }
    });

    // 更多菜单
    const moreBtn = root.querySelector('#more-btn');
    const moreDropdown = root.querySelector('#more-dropdown');
    moreBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      moreDropdown.style.display = moreDropdown.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', () => { if (moreDropdown) moreDropdown.style.display = 'none'; });

    // 设置
    root.querySelector('#setting-btn')?.addEventListener('click', () => {
      root.querySelector('#setting-modal').style.display = 'flex';
      if (moreDropdown) moreDropdown.style.display = 'none';
    });
    root.querySelector('#setting-close')?.addEventListener('click', () => {
      root.querySelector('#setting-modal').style.display = 'none';
    });
    root.querySelector('#setting-modal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
    });

    // 设置项变更
    const musicVol = root.querySelector('#music-vol');
    const sfxVol = root.querySelector('#sfx-vol');
    const showCardName = root.querySelector('#show-card-name');
    musicVol?.addEventListener('input', (e) => {
      this._roomSettings.musicVol = Number(e.target.value);
      root.querySelector('#music-vol-val').textContent = e.target.value;
      saveRoomSettings(this._roomSettings);
    });
    sfxVol?.addEventListener('input', (e) => {
      this._roomSettings.sfxVol = Number(e.target.value);
      root.querySelector('#sfx-vol-val').textContent = e.target.value;
      saveRoomSettings(this._roomSettings);
    });
    showCardName?.addEventListener('change', (e) => {
      this._roomSettings.showCardName = e.target.checked;
      saveRoomSettings(this._roomSettings);
    });
    const allowUnbalanced = root.querySelector('#allow-unbalanced');
    allowUnbalanced?.addEventListener('change', (e) => {
      this._allowUnbalanced = e.target.checked;
      this._roomState?.onSetRule?.(e.target.checked);
    });
    const randomMatch = root.querySelector('#random-match');
    randomMatch?.addEventListener('change', (e) => {
      this._randomMatch = e.target.checked;
      this._roomState?.onRandomMatch?.(e.target.checked);
    });

    // 底部按钮(占位功能)
    root.querySelectorAll('.bottom-btn[data-action]').forEach(btn => {
      if (btn.id === 'more-btn') return;
      btn.addEventListener('click', () => {
        audio.playSfx('click');
        const action = btn.dataset.action;
        if (action === 'bag') {
          // 通过事件让App导航
          window.dispatchEvent(new CustomEvent('clbwz:navigate', { detail: { route: 'bag' } }));
        } else if (action === 'smithy') {
          window.dispatchEvent(new CustomEvent('clbwz:navigate', { detail: { route: 'smithy' } }));
        } else if (action === 'shop') {
          window.dispatchEvent(new CustomEvent('clbwz:navigate', { detail: { route: 'shop' } }));
        } else {
          // 其他功能暂未开放提示
          this._showToast(root, `${btn.textContent.trim()} 功能即将开放`);
        }
      });
    });

    // 返回按钮
    root.querySelector('#back-btn')?.addEventListener('click', () => {
      audio.playButton('back');
      this._onBack?.();
    });

    // 准备/开始按钮
    const readyBtn = root.querySelector('#room-ready-btn');
    readyBtn?.addEventListener('click', () => {
      audio.playButton('sure');
      // 真实房间模式(socket 驱动)
      if (this._roomState) {
        const valid = this._selected.filter((i) => this._bagSlots[i]);
        if (!valid.length) { this._showToast(root, '请至少选择1张卡牌'); return; }
        DeckSelectView.saveDeck(this._selected, this._cardInventory);
        if (this._isOwner) {
          this._roomState.onStart?.();
        } else {
          this._roomState.onReady?.();
        }
        return;
      }
      if (this._isOwner) {
        // 房主点击：检查是否满足开始条件
        const valid = this._selected.filter((i) => this._bagSlots[i]);
        if (!valid.length) { this._showToast(root, '请至少选择1张卡牌'); return; }
        // PVE/Boss模式可直接开始
        if (this._mode !== 'pvp') {
          DeckSelectView.saveDeck(this._selected, this._cardInventory);
          this._onConfirm?.([...valid], this._sid, { trainingMode: this._training });
          return;
        }
        // PVP模式：需要所有人准备
        const others = this._members.filter(m => !m.owner);
        const allReady = others.length === 0 || others.every(m => m.ready);
        if (!allReady) { this._showToast(root, '等待所有玩家准备'); return; }
        DeckSelectView.saveDeck(this._selected, this._cardInventory);
        this._onConfirm?.([...valid], this._sid, { trainingMode: this._training });
      } else {
        // 普通玩家点击：切换准备状态(roomState 模式用真实 userId 匹配自己，可能在任一边)
        const me = this._roomState
          ? (this._members.find(m => m.id === this._myId) ?? this._enemyPlayers.find(m => m.id === this._myId))
          : this._members.find(m => m.id === 1);
        if (me) {
          me.ready = !me.ready;
          this._updateReadyBtn(root);
          this._renderMembers(root);
        }
      }
    });

    // 踢人相关
    this._pendingKickId = null;
    root.querySelector('#kick-cancel')?.addEventListener('click', () => {
      root.querySelector('#kick-modal').style.display = 'none';
      this._pendingKickId = null;
    });
    root.querySelector('#kick-confirm')?.addEventListener('click', () => {
      if (this._pendingKickId != null) {
        this._members = this._members.filter(m => m.id !== this._pendingKickId);
        this._renderMembers(root);
        this._updateReadyBtn(root);
      }
      root.querySelector('#kick-modal').style.display = 'none';
      this._pendingKickId = null;
    });
  }

  _renderDeckSlots(root) {
    const container = root.querySelector('#deck-slots-row');
    if (!container) return;
    container.innerHTML = Array.from({ length: HAND_SLOT_COUNT }, (_, i) => {
      const bi = this._selected[i];
      const s = bi != null ? this._bagSlots[bi] : null;
      const c = s ? this._db.getById(s.cardId) : null;
      if (c && s) {
        const cq = resolveCraftQuality(s.craftQuality);
        const mult = getInstanceStatMultiplier(s.craftQuality, s.strengthLv);
        return `
          <div class="deck-slot-item filled" data-slot-idx="${i}" data-bag-idx="${bi}">
            <div class="slot-card-img">
              <img src="/sprites/cards/${c.spriteRes}.png" alt="" draggable="false" />
              ${(s.strengthLv ?? 0) > 0 ? `<span class="slot-star">+${s.strengthLv}</span>` : ''}
            </div>
            <span class="slot-card-name" style="color:${cq.color}">${formatCraftCardName(s.craftQuality, c.name)}</span>
            <span class="slot-card-stats">⚔${roundBattleAmount(c.atk * mult)} ❤${Math.round(c.hp * mult)}</span>
          </div>
        `;
      }
      return `
        <div class="deck-slot-item empty" data-slot-idx="${i}">
          <span class="slot-empty-num">${i + 1}</span>
          <span class="slot-empty-label">空位</span>
        </div>
      `;
    }).join('');

    // 点击空槽位或已填槽位都打开抽屉
    container.querySelectorAll('.deck-slot-item').forEach(el => {
      el.addEventListener('click', () => {
        audio.playSfx('click');
        this._activeSwapSlot = Number(el.dataset.slotIdx);
        const drawer = root.querySelector('#card-drawer');
        const swapBtn = root.querySelector('#swap-card-btn');
        this._drawerOpen = true;
        drawer.classList.add('open');
        swapBtn.classList.add('active');
      });
    });
  }

  _renderDrawer(root) {
    const drawerCards = root.querySelector('#drawer-cards');
    if (!drawerCards) return;
    const isPicked = (i) => this._selected.includes(i);

    drawerCards.innerHTML = this._pool.length
      ? this._pool.map(({ slot, index }) => {
          const c = this._db.getById(slot.cardId);
          if (!c) return '';
          const cq = resolveCraftQuality(slot.craftQuality);
          const mult = getInstanceStatMultiplier(slot.craftQuality, slot.strengthLv);
          const on = isPicked(index);
          return `
            <button type="button" class="drawer-card ${on ? 'selected' : ''}" data-idx="${index}" style="--quality:${cq.color};${on ? `border-color:${cq.color}` : ''}">
              <img src="/sprites/cards/${c.spriteRes}.png" alt="" draggable="false" />
              <strong style="color:${cq.color}">${formatCraftCardName(slot.craftQuality, c.name)}</strong>
              <span>⚔${roundBattleAmount(c.atk * mult)} ❤${Math.round(c.hp * mult)}</span>
              <em>${c.typeLabel ?? ''}${(slot.strengthLv ?? 0) > 0 ? ` +${slot.strengthLv}` : ''}${on ? ' · 已选' : ''}</em>
            </button>
          `;
        }).join('')
      : '<p class="drawer-empty">卡牌背包为空，请先到背包领取或制作卡牌</p>';

    drawerCards.querySelectorAll('.drawer-card').forEach(btn => {
      btn.addEventListener('click', () => {
        audio.playClickCard();
        const idx = Number(btn.dataset.idx);
        const pi = this._selected.indexOf(idx);

        if (this._activeSwapSlot != null) {
          // 指定槽位换卡模式
          const slotIdx = this._activeSwapSlot;
          if (pi >= 0) {
            // 如果该卡已在其他位置，先移除
            this._selected.splice(pi, 1);
          }
          // 替换指定槽位
          this._selected[slotIdx] = idx;
          // 截断到HAND_SLOT_COUNT
          this._selected = this._selected.slice(0, HAND_SLOT_COUNT);
          this._activeSwapSlot = null;
        } else {
          // 普通切换模式
          if (pi >= 0) {
            this._selected.splice(pi, 1);
          } else if (this._selected.length >= HAND_SLOT_COUNT) {
            this._showToast(root, `最多 ${HAND_SLOT_COUNT} 张卡牌`);
            return;
          } else {
            this._selected.push(idx);
          }
        }

        this._renderDeckSlots(root);
        this._renderDrawer(root);
        // 收起抽屉
        const drawer = root.querySelector('#card-drawer');
        const swapBtn = root.querySelector('#swap-card-btn');
        this._drawerOpen = false;
        drawer.classList.remove('open');
        swapBtn.classList.remove('active');
      });
    });
  }

  _renderMembers(root) {
    const ownerSlot = root.querySelector('#owner-slot');
    const m1 = root.querySelector('#member-slot-1');
    const m2 = root.querySelector('#member-slot-2');
    if (!ownerSlot) return;

    // 房主
    const owner = this._members.find(m => m.owner);
    if (owner) {
      ownerSlot.innerHTML = `
        <div class="member-avatar">
          <img src="/sprites/cards/1.png" alt="" />
          <span class="member-lv">Lv.${owner.lv}</span>
        </div>
        <div class="member-info">
          <strong class="member-name">${owner.name}</strong>
          <span class="member-tag owner-tag">房主</span>
          ${owner.ready ? '<span class="ready-mark">✓ 已准备</span>' : ''}
        </div>
      `;
    }

    // 其他成员
    const others = this._members.filter(m => !m.owner);
    [m1, m2].forEach((slot, i) => {
      if (!slot) return;
      const m = others[i];
      if (m) {
        slot.classList.remove('empty');
        slot.innerHTML = `
          <div class="member-avatar">
            <img src="/sprites/cards/${(m.id % 20) + 1}.png" alt="" />
            <span class="member-lv">Lv.${m.lv}</span>
          </div>
          <div class="member-info">
            <strong class="member-name">${m.name}</strong>
            ${m.ready ? '<span class="ready-mark">✓ 已准备</span>' : '<span class="not-ready">未准备</span>'}
          </div>
          ${this._isOwner ? `<button type="button" class="kick-btn" data-kick-id="${m.id}" title="踢出">×</button>` : ''}
        `;
      } else {
        slot.classList.add('empty');
        slot.innerHTML = '<span class="empty-slot-blank"></span>';
      }
    });

    // 绑定踢人事件
    root.querySelectorAll('.kick-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = Number(btn.dataset.kickId);
        const m = this._members.find(x => x.id === id);
        if (m) {
          this._pendingKickId = id;
          root.querySelector('#kick-target-name').textContent = m.name;
          root.querySelector('#kick-modal').style.display = 'flex';
        }
      });
    });
  }

  _renderEnemy(root) {
    const container = root.querySelector('#room-right-side');
    if (!container) return;

    if (this._mode !== 'pvp') {
      // PVE/Boss模式：显示问号
      container.innerHTML = `
        <div class="enemy-slot question-mark top-enemy">
          <span class="qmark">?</span>
          <span class="qmark-label">未知敌人</span>
        </div>
        <div class="enemy-slots-row">
          <div class="enemy-slot question-mark">
            <span class="qmark">?</span>
          </div>
          <div class="enemy-slot question-mark">
            <span class="qmark">?</span>
          </div>
        </div>
      `;
    } else {
      // PVP模式：显示敌方玩家
      const enemies = this._enemyPlayers;
      container.innerHTML = `
        <div class="enemy-slot top-enemy ${enemies[0] ? '' : 'question-mark'}">
          ${enemies[0] ? `
            <div class="member-avatar">
              <img src="/sprites/cards/${(enemies[0].id % 20) + 1}.png" alt="" />
              <span class="member-lv">Lv.${enemies[0].lv}</span>
            </div>
            <div class="member-info">
              <strong class="member-name">${enemies[0].name}</strong>
              ${enemies[0].ready ? '<span class="ready-mark">✓ 已准备</span>' : '<span class="not-ready">未准备</span>'}
            </div>
          ` : ''}
        </div>
        <div class="enemy-slots-row">
          <div class="enemy-slot ${enemies[1] ? '' : 'question-mark'}">
            ${enemies[1] ? `
              <div class="member-avatar"><img src="/sprites/cards/${(enemies[1].id % 20) + 1}.png" alt="" /><span class="member-lv">Lv.${enemies[1].lv}</span></div>
              <div class="member-info"><strong class="member-name">${enemies[1].name}</strong></div>
            ` : ''}
          </div>
          <div class="enemy-slot ${enemies[2] ? '' : 'question-mark'}">
            ${enemies[2] ? `
              <div class="member-avatar"><img src="/sprites/cards/${(enemies[2].id % 20) + 1}.png" alt="" /><span class="member-lv">Lv.${enemies[2].lv}</span></div>
              <div class="member-info"><strong class="member-name">${enemies[2].name}</strong></div>
            ` : ''}
          </div>
        </div>
      `;
    }
  }

  _updateReadyBtn(root) {
    const btn = root.querySelector('#room-ready-btn');
    if (!btn) return;
    const textSpan = btn.querySelector('.ready-text');

    if (this._isOwner) {
      btn.classList.add('is-owner');
      if (textSpan) textSpan.textContent = '开始';
      // 房主按钮样式：绿色渐变
      btn.style.background = 'linear-gradient(180deg, #5cb85c 0%, #4cae4c 100%)';
    } else {
      btn.classList.remove('is-owner');
      const me = this._roomState
        ? (this._members.find(m => m.id === this._myId) ?? this._enemyPlayers.find(m => m.id === this._myId))
        : this._members.find(m => m.id === 1);
      const ready = me?.ready ?? false;
      if (textSpan) textSpan.textContent = ready ? '取消准备' : '准备';
      btn.style.background = ready
        ? 'linear-gradient(180deg, #d9534f 0%, #c9302c 100%)'
        : 'linear-gradient(180deg, #f0ad4e 0%, #ec971f 100%)';
    }
  }

  _showToast(root, msg) {
    let toast = root.querySelector('.room-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'room-toast';
      root.querySelector('.game-room')?.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => toast.classList.remove('show'), 2000);
  }
}
