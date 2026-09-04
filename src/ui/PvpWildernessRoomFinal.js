import {
  HAND_SLOT_COUNT,
  JUNGLE_ASSETS,
  usesFoodCost,
} from '../battle/BattleConfig.js';
import {
  formatCraftCardName,
  resolveCraftQuality,
} from '../core/constants.js';
import cardPartsAtlas from '../data/atlas/preload_cardParts.json' with { type: 'json' };
import { DeckSelectView } from './DeckSelectView.js';
import { RoomView } from './RoomView.js';
import { BattleView } from './BattleView.js';

const PATCH_FLAG = Symbol.for('clbwzzz.pvpWildernessRoomFinal');
const DECK_STORAGE_KEY = 'clbwz_room_decks_v4';
const DECK_TABS = ['default', 'team1', 'team2', 'team3'];
const MAPS = [
  { id: '1', label: '野外草原' },
  { id: '4', label: '极寒冰原' },
  { id: '7', label: '熔岩峡谷' },
];
const ATLAS_SIZE = 1024;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function clampQuality(value) {
  return Math.max(1, Math.min(5, Number(value) || 1));
}

function normalizeDeck(value) {
  return Array.isArray(value)
    ? value
        .map(Number)
        .filter((index) => Number.isInteger(index) && index >= 0)
        .slice(0, HAND_SLOT_COUNT)
    : [];
}

function matchesFingerprint(slot, fingerprint) {
  return Boolean(slot && fingerprint)
    && Number(slot.cardId) === Number(fingerprint.cardId)
    && Number(slot.craftQuality ?? 1) === Number(fingerprint.craftQuality ?? 1)
    && Number(slot.strengthLv ?? slot.star ?? 0) === Number(fingerprint.strengthLv ?? 0);
}

function reconcileFingerprints(cardInventory, cardDb, saved) {
  const inventory = cardInventory?.getSlots?.() ?? [];
  if (!Array.isArray(saved)) return [];
  const used = new Set();
  const result = [];

  for (const fingerprint of saved) {
    let index = Number(fingerprint?.index);
    if (!Number.isInteger(index) || used.has(index) || !matchesFingerprint(inventory[index], fingerprint)) {
      index = inventory.findIndex(
        (slot, candidate) => !used.has(candidate) && matchesFingerprint(slot, fingerprint),
      );
    }
    if (index < 0 || cardDb?.getById(inventory[index]?.cardId)?.battleUsable === false) continue;
    used.add(index);
    result.push(index);
    if (result.length >= HAND_SLOT_COUNT) break;
  }
  return result;
}

function readDeckState(view) {
  let parsed = null;
  try {
    parsed = JSON.parse(localStorage.getItem(DECK_STORAGE_KEY) || 'null');
  } catch {}

  const fallback = DeckSelectView.loadSavedDeck(view.cardInventory, view.db)
    ?? DeckSelectView.defaultDeckSlots(view.cardInventory, view.db);
  const decks = {};
  for (const tab of DECK_TABS) {
    decks[tab] = reconcileFingerprints(view.cardInventory, view.db, parsed?.decks?.[tab]);
  }
  if (!decks.default.length) decks.default = normalizeDeck(fallback);

  const activeTab = DECK_TABS.includes(view._pvpDeckTab)
    ? view._pvpDeckTab
    : DECK_TABS.includes(parsed?.activeTab)
      ? parsed.activeTab
      : 'default';

  return { activeTab, decks };
}

function fingerprintDeck(view, deck) {
  const slots = view.cardInventory?.getSlots?.() ?? [];
  return normalizeDeck(deck)
    .map((index) => {
      const slot = slots[index];
      if (!slot) return null;
      return {
        index,
        cardId: Number(slot.cardId),
        craftQuality: Number(slot.craftQuality ?? 1),
        strengthLv: Number(slot.strengthLv ?? slot.star ?? 0),
      };
    })
    .filter(Boolean);
}

function writeDeckState(view, tab, deck) {
  let parsed = null;
  try {
    parsed = JSON.parse(localStorage.getItem(DECK_STORAGE_KEY) || 'null');
  } catch {}
  const state = parsed && typeof parsed === 'object'
    ? parsed
    : { version: 4, activeTab: 'default', decks: {} };
  state.version = 4;
  state.activeTab = tab;
  state.decks ??= {};
  state.decks[tab] = fingerprintDeck(view, deck);
  state.updatedAt = Date.now();
  try {
    localStorage.setItem(DECK_STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function atlasFrame(name) {
  return cardPartsAtlas.sprites.find((frame) => frame.name === name) ?? null;
}

function atlasStyle(name) {
  const frame = atlasFrame(name);
  if (!frame) return '';
  const xRange = Math.max(1, ATLAS_SIZE - frame.width);
  const yRange = Math.max(1, ATLAS_SIZE - frame.height);
  return [
    `--atlas-size-x:${((ATLAS_SIZE / frame.width) * 100).toFixed(5)}%`,
    `--atlas-size-y:${((ATLAS_SIZE / frame.height) * 100).toFixed(5)}%`,
    `--atlas-pos-x:${((frame.x / xRange) * 100).toFixed(5)}%`,
    `--atlas-pos-y:${((frame.y / yRange) * 100).toFixed(5)}%`,
  ].join(';');
}

function getCardFunction(card) {
  if (card?.isActiveSkill?.() || Number(card?.type) === 4) return { label: '技能', frame: 'cardType_7' };
  if (Number(card?.type) === 3) return { label: '陷阱', frame: 'cardType_4' };
  if (Number(card?.type) === 2) return { label: '辅助', frame: 'cardType_3' };
  if (Number(card?.moveSpeed) > 0) return { label: '突击', frame: 'cardType_5' };
  if ([2, 3, 14, 17, 18, 19].includes(Number(card?.atkStyle))) {
    return { label: '远程', frame: 'cardType_1' };
  }
  if (Number(card?.atkStyle) === 1) return { label: '防御', frame: 'cardType_2' };
  return { label: '攻击', frame: 'cardType_1' };
}

function renderDeckCard(view, bagIndex, slotIndex) {
  const instance = view.cardInventory?.getSlots?.()?.[bagIndex];
  const card = instance ? view.db?.getById?.(instance.cardId) : null;
  if (!instance || !card) {
    return `<div class="pvp-room-card empty" data-slot="${slotIndex}"><span>空</span></div>`;
  }

  const quality = clampQuality(card.quality);
  const functionInfo = getCardFunction(card);
  const costIcon = usesFoodCost(card) ? JUNGLE_ASSETS.resFood : JUNGLE_ASSETS.resSun;
  const stars = Math.max(0, Number(instance.strengthLv ?? instance.star ?? 0));
  const craft = resolveCraftQuality(instance.craftQuality ?? 1);
  const title = `${formatCraftCardName(instance.craftQuality ?? 1, card.name)} · ${functionInfo.label}`;

  return `
    <div class="pvp-room-card quality-${quality}" data-slot="${slotIndex}" title="${escapeHtml(title)}">
      <span class="pvp-room-card-bg" style="${atlasStyle(`card_bg_${quality}`)}"></span>
      <span class="pvp-room-card-stars">${stars > 0 ? '★'.repeat(Math.min(6, stars)) : '·'}</span>
      <img class="pvp-room-card-art" src="/sprites/cards/${escapeHtml(card.spriteRes)}.png" alt="" draggable="false" />
      <span class="pvp-room-card-name">${escapeHtml(card.name)}</span>
      <span class="pvp-room-card-meta">
        <span class="pvp-room-card-resource"><img src="${costIcon}" alt="" /><b>${Number(card.cost) || 0}</b></span>
        <span class="pvp-room-card-craft" style="--craft:${craft.color}">${escapeHtml(craft.baseLabel)}</span>
        <span class="pvp-room-card-function" title="${functionInfo.label}">
          <i style="${atlasStyle(functionInfo.frame)}"></i><em>${functionInfo.label}</em>
        </span>
      </span>
    </div>`;
}

function memberAvatar(member) {
  const seed = Math.max(1, (Number(member?.userId) || 1) % 20);
  return `/sprites/cards/${seed}.png`;
}

function renderTeamSlot(view, member, team, index, meId, isHost) {
  if (!member) {
    return `
      <div class="pvp-player-slot empty team-${team}" data-team="${team}" data-index="${index}">
        <span class="pvp-player-question">?</span>
        <span class="pvp-player-empty-label">等待玩家</span>
      </div>`;
  }
  const isMe = String(member.userId) === String(meId);
  const canKick = isHost && !isMe;
  const state = member.connected === false
    ? '断线'
    : member.isHost
      ? '房主'
      : member.ready
        ? '已准备'
        : '未准备';

  return `
    <div class="pvp-player-slot occupied team-${team} ${isMe ? 'is-me' : ''} ${member.ready ? 'is-ready' : ''}">
      ${canKick ? `<button type="button" class="pvp-player-kick" data-kick-user="${member.userId}" title="移出房间">×</button>` : ''}
      <div class="pvp-player-avatar-wrap">
        <img class="pvp-player-avatar" src="${memberAvatar(member)}" alt="" draggable="false" />
        ${member.isHost ? '<span class="pvp-host-crown">房主</span>' : ''}
      </div>
      <div class="pvp-player-copy">
        <strong>${escapeHtml(member.nickname || '玩家')}</strong>
        <span>Lv.${Number(member.level) || 1}</span>
        <em class="pvp-player-state">${state}</em>
      </div>
    </div>`;
}

function mapInfo(room) {
  const id = String(room?.mapId || '4');
  return MAPS.find((item) => item.id === id) ?? MAPS[1];
}

function renderPvpRoom(view) {
  const panel = view.root?.querySelector?.('#lobby-room-inside');
  if (!panel || !view.room) return;
  if (view._pvpDeckEditorOpen) return;

  const members = [...(view.room.members ?? [])].sort((a, b) => (a.joinOrder ?? 0) - (b.joinOrder ?? 0));
  const blue = members.filter((member) => member.team === 'blue').slice(0, 3);
  const red = members.filter((member) => member.team === 'red').slice(0, 3);
  const meId = view.currentUserId();
  const me = members.find((member) => String(member.userId) === String(meId));
  const isHost = Boolean(me?.isHost);
  const deckState = readDeckState(view);
  view._pvpDeckTab = deckState.activeTab;
  view._pvpRoomDecks = deckState.decks;
  view._pvpDeckSlots = normalizeDeck(deckState.decks[deckState.activeTab]);
  if (!view._pvpDeckSlots.length) {
    view._pvpDeckSlots = DeckSelectView.loadSavedDeck(view.cardInventory, view.db)
      ?? DeckSelectView.defaultDeckSlots(view.cardInventory, view.db);
  }

  const othersReady = members.filter((member) => !member.isHost).every((member) => member.ready);
  const hasBothTeams = blue.length > 0 && red.length > 0;
  const balanced = blue.length === red.length;
  const canStart = isHost
    && hasBothTeams
    && othersReady
    && (view.room.allowUnbalanced || balanced);
  const map = mapInfo(view.room);
  const deckNo = view._pvpDeckTab === 'team2' ? 2 : view._pvpDeckTab === 'team3' ? 3 : 1;
  const readyLabel = isHost ? '开始战斗' : me?.ready ? '取消准备' : '准备';
  const roomNo = String(view.room.id ?? 1).padStart(3, '0');

  panel.className = 'lobby-room-inside pvp-wilderness-room-host';
  panel.innerHTML = `
    <section class="pvp-wilderness-room" data-room-id="${view.room.id}" data-my-team="${escapeHtml(me?.team || 'blue')}">
      <div class="pvp-wilderness-backdrop" aria-hidden="true"></div>
      <header class="pvp-room-header">
        <div class="pvp-room-title-block">
          <span class="pvp-room-kicker">PVP 战斗准备</span>
          <h1>${escapeHtml(view.room.name || '对战房间')}</h1>
          <span class="pvp-room-number">房间 ${roomNo}</span>
        </div>
        <div class="pvp-room-map-chip">
          <span>战斗场地</span><b>${escapeHtml(map.label)}</b>
        </div>
        <div class="pvp-room-rule-chip ${view.room.allowUnbalanced ? 'active' : ''}">
          ${view.room.allowUnbalanced ? '允许不对等' : '双方人数相等'}
        </div>
        <button type="button" class="pvp-room-exit" data-pvp-action="leave">退出房间</button>
      </header>

      <div class="pvp-room-main">
        <section class="pvp-team-panel blue">
          <div class="pvp-team-heading"><strong>蓝方</strong><span>${blue.length}/3</span></div>
          <div class="pvp-team-slots">
            ${Array.from({ length: 3 }, (_, index) => renderTeamSlot(view, blue[index], 'blue', index, meId, isHost)).join('')}
          </div>
        </section>

        <section class="pvp-room-center">
          <div class="pvp-vs-mark"><span>V</span><span>S</span></div>
          <div class="pvp-room-balance ${hasBothTeams && (balanced || view.room.allowUnbalanced) ? 'ok' : ''}">
            ${!hasBothTeams
              ? '等待另一阵营玩家加入'
              : !balanced && !view.room.allowUnbalanced
                ? `人数不一致：${blue.length} vs ${red.length}`
                : othersReady
                  ? '双方就绪，可以开始'
                  : '等待玩家准备'}
          </div>
          <button type="button" class="pvp-room-switch-team" data-pvp-action="switch-team">切换阵营</button>
        </section>

        <section class="pvp-team-panel red">
          <div class="pvp-team-heading"><strong>红方</strong><span>${red.length}/3</span></div>
          <div class="pvp-team-slots">
            ${Array.from({ length: 3 }, (_, index) => renderTeamSlot(view, red[index], 'red', index, meId, isHost)).join('')}
          </div>
        </section>
      </div>

      <section class="pvp-room-deck-section">
        <div class="pvp-room-deck-head">
          <div class="pvp-room-deck-title">
            <span>我的战团</span>
            <small>最多10张，至少1张才能准备</small>
          </div>
          <div class="pvp-room-deck-tabs">
            ${DECK_TABS.map((tab) => `
              <button type="button" class="pvp-room-deck-tab ${tab === view._pvpDeckTab ? 'active' : ''}" data-deck-tab="${tab}">
                ${tab === 'default' ? '默认' : `战团${tab.slice(-1)}`}
              </button>`).join('')}
          </div>
          <button type="button" class="pvp-room-edit-deck" data-pvp-action="edit-deck">换卡</button>
        </div>
        <div class="pvp-room-deck-cards">
          ${Array.from({ length: HAND_SLOT_COUNT }, (_, index) => renderDeckCard(view, view._pvpDeckSlots[index], index)).join('')}
        </div>
      </section>

      <footer class="pvp-room-footer">
        <div class="pvp-room-chat">
          <div class="pvp-room-chat-log" data-pvp-chat-log>
            ${(view.room.chat ?? []).slice(-6).map((entry) => `<div><b>${escapeHtml(entry.nickname)}：</b>${escapeHtml(entry.text)}</div>`).join('')}
          </div>
          <div class="pvp-room-chat-input-row">
            <input type="text" maxlength="200" placeholder="输入房间消息" data-pvp-chat-input />
            <button type="button" data-pvp-action="send-chat">发送</button>
          </div>
        </div>
        <div class="pvp-room-options">
          ${isHost ? '<button type="button" data-pvp-action="random-map">随机地图</button>' : ''}
          ${isHost ? `<button type="button" class="${view.room.allowUnbalanced ? 'active' : ''}" data-pvp-action="toggle-rule">房间规则</button>` : ''}
          <button type="button" class="pvp-room-ready ${me?.ready ? 'is-ready' : ''}" data-pvp-action="ready" data-deck-no="${deckNo}" ${isHost && !canStart ? 'disabled' : ''}>${readyLabel}</button>
        </div>
      </footer>
    </section>`;

  bindPvpRoomEvents(view, panel);
}

function bindPvpRoomEvents(view, panel) {
  panel.querySelector('[data-pvp-action="leave"]')?.addEventListener('click', () => view.leaveRoom());
  panel.querySelector('[data-pvp-action="switch-team"]')?.addEventListener('click', () => {
    view.socket.switchTeam().then((room) => view.refreshRoom(room)).catch((error) => view.notice(error.message));
  });
  panel.querySelector('[data-pvp-action="edit-deck"]')?.addEventListener('click', () => openDeckEditor(view));

  panel.querySelectorAll('[data-deck-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      view._pvpDeckTab = button.dataset.deckTab;
      const state = readDeckState(view);
      view._pvpRoomDecks = state.decks;
      view._pvpDeckSlots = normalizeDeck(state.decks[view._pvpDeckTab]);
      if (!view._pvpDeckSlots.length && view._pvpDeckTab === 'default') {
        view._pvpDeckSlots = DeckSelectView.loadSavedDeck(view.cardInventory, view.db)
          ?? DeckSelectView.defaultDeckSlots(view.cardInventory, view.db);
      }
      writeDeckState(view, view._pvpDeckTab, view._pvpDeckSlots);
      const deckNo = view._pvpDeckTab === 'team2' ? 2 : view._pvpDeckTab === 'team3' ? 3 : 1;
      view.socket.setDeck(deckNo).catch(() => {});
      renderPvpRoom(view);
    });
  });

  panel.querySelector('[data-pvp-action="ready"]')?.addEventListener('click', async () => {
    const members = view.room?.members ?? [];
    const me = members.find((member) => String(member.userId) === String(view.currentUserId()));
    if (!view._pvpDeckSlots?.length) {
      view.notice('战团至少需要携带1张卡牌');
      return;
    }
    try {
      const deckNo = view._pvpDeckTab === 'team2' ? 2 : view._pvpDeckTab === 'team3' ? 3 : 1;
      await view.socket.setDeck(deckNo);
      if (me?.isHost) await view.socket.startGame();
      else view.refreshRoom(await view.socket.setReady(!me?.ready));
    } catch (error) {
      view.notice(error.message);
    }
  });

  panel.querySelector('[data-pvp-action="random-map"]')?.addEventListener('click', () => {
    const current = mapInfo(view.room);
    const currentIndex = MAPS.findIndex((entry) => entry.id === current.id);
    const next = MAPS[(currentIndex + 1) % MAPS.length];
    view.socket.changeMap(next.id).then((room) => view.refreshRoom(room)).catch((error) => view.notice(error.message));
  });

  panel.querySelector('[data-pvp-action="toggle-rule"]')?.addEventListener('click', () => {
    view.socket.setRule(!view.room?.allowUnbalanced)
      .then((room) => view.refreshRoom(room))
      .catch((error) => view.notice(error.message));
  });

  panel.querySelectorAll('[data-kick-user]').forEach((button) => {
    button.addEventListener('click', () => {
      view.socket.kick(Number(button.dataset.kickUser))
        .then((room) => view.refreshRoom(room))
        .catch((error) => view.notice(error.message));
    });
  });

  const sendChat = () => {
    const input = panel.querySelector('[data-pvp-chat-input]');
    const text = input?.value.trim();
    if (!text) return;
    view.sendText(text);
    input.value = '';
  };
  panel.querySelector('[data-pvp-action="send-chat"]')?.addEventListener('click', sendChat);
  panel.querySelector('[data-pvp-chat-input]')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') sendChat();
  });
}

function openDeckEditor(view) {
  const panel = view.root?.querySelector?.('#lobby-room-inside');
  if (!panel) return;
  view._pvpDeckEditorOpen = true;
  panel.className = 'lobby-room-inside pvp-wilderness-room-host pvp-deck-editor-host';
  panel.innerHTML = `
    <div class="pvp-deck-editor-shell">
      <div class="pvp-deck-editor-title">编辑 ${view._pvpDeckTab === 'default' ? '默认战团' : `战团${view._pvpDeckTab.slice(-1)}`}</div>
      <div class="pvp-deck-editor-body"></div>
    </div>`;
  const body = panel.querySelector('.pvp-deck-editor-body');
  const editor = new DeckSelectView();
  view._pvpDeckEditor = editor;
  editor.render(body, {
    db: view.db,
    cardInventory: view.cardInventory,
    deckSlots: view._pvpDeckSlots,
    stageId: 1,
    stages: view.db.stages?.slice(0, 20) ?? [],
    mode: 'pvp',
    playerName: view.room?.members?.find((member) => String(member.userId) === String(view.currentUserId()))?.nickname || '玩家',
    playerLv: view.room?.members?.find((member) => String(member.userId) === String(view.currentUserId()))?.level || 1,
    isOwner: false,
    onConfirm: (slots) => {
      view._pvpDeckSlots = normalizeDeck(slots);
      DeckSelectView.saveDeck(view._pvpDeckSlots, view.cardInventory);
      writeDeckState(view, view._pvpDeckTab, view._pvpDeckSlots);
      view._pvpDeckEditorOpen = false;
      view._pvpDeckEditor = null;
      renderPvpRoom(view);
    },
    onBack: () => {
      view._pvpDeckEditorOpen = false;
      view._pvpDeckEditor = null;
      renderPvpRoom(view);
    },
  });
  body.querySelector('.game-room')?.classList.add('pvp-room-deck-editor');
}

function enterPvpBattle(view) {
  view._pvpDeckEditorOpen = false;
  const inside = view.root.querySelector('#lobby-room-inside');
  const panel = view.root.querySelector('#lobby-battle');
  inside?.classList.add('hidden');
  panel?.classList.remove('hidden');
  document.body.classList.add('battle-immersive', 'pvp-battle-active');

  const deckState = readDeckState(view);
  const activeTab = view._pvpDeckTab || deckState.activeTab;
  const deckSlots = normalizeDeck(view._pvpDeckSlots?.length ? view._pvpDeckSlots : deckState.decks[activeTab]);
  // 消费房间 dice「随机地图」选择（一次性，防止残留影响下一场默认黄沙）
  const mapScene = typeof window !== 'undefined' ? window.__pvpMapScene : null;
  if (typeof window !== 'undefined') window.__pvpMapScene = null;
  view.roomBattleView?.destroy?.();
  view.roomBattleView = new BattleView(view.db, {
    cardInventory: view.cardInventory,
    heroSkills: null,
    pvp: {
      roomId: view.room.id,
      room: view.room,
      team: view.myTeam,
      socket: view.socket,
      deckSlots,
      mapId: view.room.mapId || '4',
      mapScene,
    },
    onNavigate: view.onNavigate,
  });
  view.roomBattleView.render(panel);

  view._pvpExitBtn?.remove?.();
  view._pvpSettingsBtn?.remove?.();
  view._pvpOverlayControls?.remove?.();

  const controls = document.createElement('div');
  controls.id = 'pvp-overlay-controls';
  controls.style.cssText = 'position:fixed;top:12px;right:14px;z-index:400;display:flex;gap:8px;';

  const settings = document.createElement('button');
  settings.id = 'pvp-settings-ov';
  settings.className = 'pvp-exit-btn pvp-wilderness-battle-exit pvp-wilderness-settings';
  settings.type = 'button';
  settings.textContent = '设置';
  settings.style.position = 'static';
  settings.addEventListener('click', () => {
    const panel = view.roomBattleView?.viewRoot?.querySelector?.('#settings-panel');
    panel?.classList.toggle('hidden');
  });

  const exit = document.createElement('button');
  exit.id = 'pvp-exit-ov';
  exit.className = 'pvp-exit-btn pvp-wilderness-battle-exit';
  exit.type = 'button';
  exit.textContent = '退出战斗';
  exit.style.position = 'static';
  exit.addEventListener('click', () => {
    view.roomBattleView?.destroy?.();
    view.roomBattleView = null;
    controls.remove();
    view._pvpExitBtn = null;
    view._pvpSettingsBtn = null;
    view._pvpOverlayControls = null;
    view.exitBattle();
  });

  controls.append(settings, exit);
  document.body.append(controls);
  view._pvpExitBtn = exit;
  view._pvpSettingsBtn = settings;
  view._pvpOverlayControls = controls;
}

export function installPvpWildernessRoomFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  // 房间界面保持原始实现(DeckSelectView 准备房间)，本补丁只接管 PVP 战斗场地
  const originalEnterBattle = RoomView.prototype.enterBattle;
  RoomView.prototype.enterBattle = function enterBattleWithWildernessPvp() {
    if (this.room?.mode !== 'pvp') return originalEnterBattle.call(this);
    return enterPvpBattle(this);
  };

  const originalDestroy = RoomView.prototype.destroy;
  RoomView.prototype.destroy = function destroyWildernessPvpRoom() {
    this.roomBattleView?.destroy?.();
    this.roomBattleView = null;
    this._pvpExitBtn?.remove?.();
    this._pvpExitBtn = null;
    this._pvpSettingsBtn?.remove?.();
    this._pvpSettingsBtn = null;
    this._pvpOverlayControls?.remove?.();
    this._pvpOverlayControls = null;
    document.body.classList.remove('pvp-battle-active');
    return originalDestroy.call(this);
  };

  window.__verifyPvpWildernessRoomFinal = () => {
    const room = document.querySelector('.pvp-wilderness-room');
    return {
      enabled: true,
      roomVisible: Boolean(room),
      blueSlots: room?.querySelectorAll('.pvp-team-panel.blue .pvp-player-slot').length ?? 0,
      redSlots: room?.querySelectorAll('.pvp-team-panel.red .pvp-player-slot').length ?? 0,
      deckSlots: room?.querySelectorAll('.pvp-room-card').length ?? 0,
      hasVs: Boolean(room?.querySelector('.pvp-vs-mark')),
      hasReady: Boolean(room?.querySelector('[data-pvp-action="ready"]')),
    };
  };
}
