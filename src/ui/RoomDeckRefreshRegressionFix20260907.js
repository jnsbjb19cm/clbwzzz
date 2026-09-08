import { DeckSelectView } from './DeckSelectView.js';
import { RoomView } from './RoomView.js';
import {
  deckNumberToGroup20260906,
  normalizeDeckGroup20260906,
} from './DeckGroupSelection20260906.js';

const INSTALL_FLAG = Symbol.for('clbwz.roomDeckRefreshRegressionFix20260907');

function memberFor(room, userId) {
  return (room?.members ?? []).find((member) => String(member?.userId) === String(userId)) ?? null;
}

function hostId(room) {
  return String((room?.members ?? []).find((member) => member?.isHost)?.userId ?? '');
}

function roomShellChanged(previous, next) {
  if (!previous || !next) return true;
  return String(previous.id) !== String(next.id)
    || String(previous.mode) !== String(next.mode)
    || String(previous.status) !== String(next.status)
    || String(previous.stageId ?? '') !== String(next.stageId ?? '')
    || String(previous.bossId ?? '') !== String(next.bossId ?? '')
    || String(previous.name ?? '') !== String(next.name ?? '')
    || hostId(previous) !== hostId(next);
}

function roomDeckGroup(room, userId, fallbackGroup = 'default') {
  const me = memberFor(room, userId);
  if (!me || me.selectedDeckNo == null) return normalizeDeckGroup20260906(fallbackGroup);
  return deckNumberToGroup20260906(me.selectedDeckNo);
}

function copyDeck(value) {
  return Array.isArray(value)
    ? value.map(Number).filter((index) => Number.isInteger(index) && index >= 0)
    : [];
}

function syncDeckTabs(root, group) {
  root?.querySelectorAll?.('.deck-tab')?.forEach?.((button) => {
    const active = button.dataset.tab === group;
    button.classList.toggle('active', active);
    button.setAttribute('aria-checked', String(active));
  });
}

function loadGroupIntoView(view, root, group, { force = false } = {}) {
  if (!view?._cardInventory || !view?._db) return;
  const normalized = normalizeDeckGroup20260906(group);
  if (!force && normalizeDeckGroup20260906(view._deckTab) === normalized) {
    syncDeckTabs(root, normalized);
    return;
  }

  view._deckTab = normalized;
  view._cardInventory.__activeDeckGroup20260907 = normalized;
  const saved = DeckSelectView.loadSavedDeck(view._cardInventory, view._db, normalized);
  const selected = Array.isArray(saved)
    ? copyDeck(saved)
    : (normalized === 'default'
        ? copyDeck(DeckSelectView.defaultDeckSlots(view._cardInventory, view._db))
        : []);

  view._selected = selected;
  if (view._v3Decks) view._v3Decks[normalized] = copyDeck(selected);
  if (view._v3Committed) view._v3Committed[normalized] = copyDeck(selected);
  view._activeSwapSlot = null;
  view._renderDeckSlots?.(root);
  view._renderDrawer?.(root);
  syncDeckTabs(root, normalized);
}

function saveCurrentDeck(view) {
  if (!view?._cardInventory) return;
  const group = normalizeDeckGroup20260906(
    view._deckTab ?? view._cardInventory.__activeDeckGroup20260907 ?? 'default',
  );
  DeckSelectView.saveDeck(copyDeck(view._selected), view._cardInventory, group);
}

function reportRoomAction(owner, promise) {
  return Promise.resolve(promise).catch((error) => {
    owner?.notice?.(error?.message ?? String(error));
    return null;
  });
}

function installStableRoomCallbacks(owner, view) {
  const state = view?._roomState;
  if (!state || !owner?.socket) return;

  const originalStart = state.__stableOriginalStart20260907 ?? state.onStart;
  state.__stableOriginalStart20260907 = originalStart;

  state.onReady = () => {
    saveCurrentDeck(view);
    const me = memberFor(owner.room, owner.currentUserId?.());
    return reportRoomAction(owner, owner.socket.setReady(!me?.ready));
  };
  state.onSetDeck = (deckNo) => reportRoomAction(owner, owner.socket.setDeck(deckNo));
  state.onSetRule = (value) => reportRoomAction(owner, owner.socket.setRule(value));
  state.onRandomMatch = (value) => reportRoomAction(owner, owner.socket.setRandomMatch(value));
  state.onChangeMap = (mapId) => reportRoomAction(owner, owner.socket.changeMap(mapId));
  state.onSwitch = () => reportRoomAction(owner, owner.socket.switchTeam());
  state.onStart = () => {
    saveCurrentDeck(view);
    return originalStart?.();
  };
}

function roomMemberUi(member, fallbackId) {
  return {
    id: member?.userId ?? fallbackId,
    name: member?.nickname || '玩家',
    lv: member?.level ?? 1,
    owner: Boolean(member?.isHost),
    ready: Boolean(member?.ready),
    avatar: '/sprites/cards/1.png',
  };
}

function syncRoomStatusBar(view, root) {
  const roomEl = root?.querySelector?.('.game-room');
  if (!roomEl || view?._mode !== 'pvp') return;
  const nonHost = (view._roomState?.members ?? []).filter((member) => !member.isHost);
  const readyCount = nonHost.filter((member) => member.ready).length;
  const allReady = nonHost.length > 0 && readyCount === nonHost.length;
  let bar = roomEl.querySelector('.room-status-bar');

  if (view._isOwner && !allReady) {
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'room-status-bar';
      roomEl.append(bar);
    }
    bar.textContent = `等待玩家准备…(${readyCount}/${nonHost.length})`;
  } else {
    bar?.remove();
  }

  const ruleBtn = root.querySelector('.room-rule-btn');
  if (ruleBtn) {
    ruleBtn.textContent = view._roomState?.allowUnbalanced
      ? '⚖ 允许不对等(已开)'
      : '⚙ 房间规则';
  }
}

function syncMapButton(root, mapId) {
  const sceneByMap = {
    '2': { icon: '🌿', label: '草地', key: 'grass' },
    '4': { icon: '❄️', label: '冰川', key: 'ice' },
    '7': { icon: '🏜️', label: '黄沙', key: 'rock' },
  };
  const info = sceneByMap[String(mapId)];
  if (!info) return;
  if (typeof window !== 'undefined') window.__pvpMapScene = info.key;
  const label = root?.querySelector?.('.dice-label');
  if (label) label.textContent = `${info.label}地图`;
  const icon = root?.querySelector?.('.dice-icon');
  if (icon) icon.textContent = info.icon;
  const button = root?.querySelector?.('.dice-btn');
  if (button) button.title = `随机地图（当前：${info.label}地图）`;
}

function syncRoomInsideInPlace(owner, room) {
  const root = owner?.root?.querySelector?.('#lobby-room-inside');
  const view = owner?.deckSelect;
  if (!root || !view || !root.querySelector('.game-room')) return false;

  const userId = owner.currentUserId?.();
  const me = memberFor(room, userId);
  owner.myTeam = me?.team ?? owner.myTeam;

  const members = room.members ?? [];
  const blueMembers = members.filter((member) => member.team === 'blue');
  const redMembers = members.filter((member) => member.team === 'red');

  view._roomId = room.id ?? view._roomId;
  view._myId = userId;
  view._isOwner = Boolean(me?.isHost);
  view._stageName = room.name || view._stageName;
  view._allowUnbalanced = Boolean(room.allowUnbalanced);
  view._randomMatch = Boolean(room.randomMatch);
  view._members = blueMembers.map((member, index) => roomMemberUi(member, index + 1));
  view._enemyPlayers = room.mode === 'pvp'
    ? redMembers.map((member, index) => roomMemberUi(member, 200 + index))
    : [];

  if (!view._members.length && room.mode !== 'pvp') {
    view._members = [roomMemberUi(me, 1)];
  }

  view._roomState = {
    ...(view._roomState ?? {}),
    roomId: room.id,
    myUserId: userId,
    stageName: room.name || '对战房间',
    members,
    myTeam: owner.myTeam,
    selectedDeckNo: me?.selectedDeckNo ?? 0,
    allowUnbalanced: Boolean(room.allowUnbalanced),
    randomMatch: Boolean(room.randomMatch),
  };
  installStableRoomCallbacks(owner, view);

  const roomId = root.querySelector('#room-id-display');
  if (roomId) roomId.textContent = String(room.id ?? '');
  const stage = root.querySelector('#room-stage-display');
  if (stage) stage.textContent = room.name || '对战房间';

  view._renderMembers?.(root);
  view._renderEnemy?.(root);
  view._updateReadyBtn?.(root);
  syncRoomStatusBar(view, root);

  const allowRule = root.querySelector('#allow-unbalanced');
  if (allowRule) allowRule.checked = Boolean(room.allowUnbalanced);
  const randomMatch = root.querySelector('#random-match');
  if (randomMatch) randomMatch.checked = Boolean(room.randomMatch);
  syncMapButton(root, room.mapId);

  const group = roomDeckGroup(room, userId, view._deckTab ?? 'default');
  if (normalizeDeckGroup20260906(view._deckTab) !== group) {
    loadGroupIntoView(view, root, group, { force: true });
  } else {
    if (view._cardInventory) view._cardInventory.__activeDeckGroup20260907 = group;
    syncDeckTabs(root, group);
  }
  return true;
}

function installDeckRenderGuard() {
  const previousRender = DeckSelectView.prototype.render;
  if (previousRender?.__roomDeckRefreshGuard20260907) return;

  function renderWithDeckGroupGuard(root, options = {}) {
    const result = previousRender.call(this, root, options);
    if (!options.roomState) return result;

    const group = roomDeckGroup(
      { members: options.roomState.members ?? [] },
      options.roomState.myUserId,
      options.roomState.selectedDeckNo == null ? (this._deckTab ?? 'default') : deckNumberToGroup20260906(options.roomState.selectedDeckNo),
    );
    if (this._cardInventory) this._cardInventory.__activeDeckGroup20260907 = group;

    // BattleRoomDeckUiV3.initializeState() 会读取自己的 activeTab，并可能把刚由
    // 服务器 selectedDeckNo 选中的战团重新改回旧 tab。这里在所有旧补丁之后收口。
    loadGroupIntoView(this, root, group, { force: true });

    // V3 的“确定”按钮调用的是安装时捕获的旧 saveDeck。把这条陈旧引用改成
    // 运行时最终 saveDeck，让 team1/team2/team3 始终携带当前 group 写入。
    this.__originalSaveDeck = (selected, cardInventory) => {
      const activeGroup = normalizeDeckGroup20260906(
        this._deckTab ?? cardInventory?.__activeDeckGroup20260907 ?? group,
      );
      DeckSelectView.saveDeck(selected, cardInventory, activeGroup);
    };

    const owner = this.__roomDeckRefreshOwner20260907;
    if (owner) installStableRoomCallbacks(owner, this);
    return result;
  }

  renderWithDeckGroupGuard.__roomDeckRefreshGuard20260907 = true;
  DeckSelectView.prototype.render = renderWithDeckGroupGuard;
}

function installRoomRenderGuard() {
  const previousRenderRoomInside = RoomView.prototype.renderRoomInside;
  if (previousRenderRoomInside?.__roomDeckRefreshGuard20260907) return;

  function renderRoomInsideStable20260907(...args) {
    const result = previousRenderRoomInside.apply(this, args);
    if (this.deckSelect) {
      this.deckSelect.__roomDeckRefreshOwner20260907 = this;
      const root = this.root?.querySelector?.('#lobby-room-inside');
      const group = roomDeckGroup(this.room, this.currentUserId?.(), this.deckSelect._deckTab ?? 'default');
      loadGroupIntoView(this.deckSelect, root, group, { force: true });
      installStableRoomCallbacks(this, this.deckSelect);
    }
    return result;
  }

  renderRoomInsideStable20260907.__roomDeckRefreshGuard20260907 = true;
  RoomView.prototype.renderRoomInside = renderRoomInsideStable20260907;

  const previousRefreshRoom = RoomView.prototype.refreshRoom;
  function refreshRoomWithoutFullFlash20260907(room) {
    const previous = this.room;
    if (room) this.room = room;
    if (!this.room || !this.root) return;

    // 换地图、换战团、准备、取消准备、换队、房间规则、随机匹配，以及同房间成员
    // ready/team 的普通变化，都只更新对应 DOM。只有房间壳本身发生变化才允许整页重建。
    if (!roomShellChanged(previous, this.room) && syncRoomInsideInPlace(this, this.room)) return;
    return previousRefreshRoom.call(this, this.room);
  }

  refreshRoomWithoutFullFlash20260907.__roomDeckRefreshGuard20260907 = true;
  RoomView.prototype.refreshRoom = refreshRoomWithoutFullFlash20260907;
}

export function installRoomDeckRefreshRegressionFix20260907() {
  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;
  installDeckRenderGuard();
  installRoomRenderGuard();
}
