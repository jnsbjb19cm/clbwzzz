/**
 * 2026-09-11：卡组预设（默认／战团1／战团2／战团3）"记住选择"。
 *
 * 问题现象：在房间里切到战团2/3，退出再进房间（或刷新页面）就退回"默认／战团1"。
 *
 * 根因：切换页签只调用了 socket 的 room:set-deck，而服务端 RoomDeckSelection20260907 的 setDeck
 * 只改「房间成员」的 selectedDeckNo，从不写账号；成员每次进房都是按账号里的
 * player_profiles.selected_deck_no 重新创建（默认 1），所以选择出了房间就丢。
 * （服务端其实有 PUT /api/player/selected-deck，但客户端一次都没调用，
 *  而且那条接口只允许 1~3，客户端有 4 个页签，无法表达"默认=0"。）
 *
 * 做法：把玩家的选择记在本地（localStorage），并在"进入房间"时用它作为首选：
 *  - 本地没记录过 → 保持原行为（用服务端的值），不打扰老账号；
 *  - 一旦选过 → 进房时以本地记忆为准，并把该选择同步给房间成员（room:set-deck），
 *    这样房间、开打用的卡组和界面上的页签三者一致。
 */
import { SocketClient } from '../network/SocketClient.js';
import { DeckSelectView } from './DeckSelectView.js';
import {
  deckGroupToNumber20260906,
  normalizeDeckGroup20260906,
} from './DeckGroupSelection20260906.js';

const STORAGE_KEY = 'clbwz_deck_group_v1';

/** 读取玩家记住的卡组；从没选过返回 null（调用方应回退到服务端/默认值）。 */
export function readRememberedDeckGroup20260911() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw == null || raw === '') return null;
    return normalizeDeckGroup20260906(raw);
  } catch {
    return null;
  }
}

/** 记住玩家的卡组选择。 */
export function rememberDeckGroup20260911(group) {
  const normalized = normalizeDeckGroup20260906(group);
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, normalized);
  } catch {
    /* 隐私模式等场景忽略 */
  }
  return normalized;
}

/** 记住的卡组对应的编号（0~3），没记录返回 null。 */
export function rememberedDeckNumber20260911() {
  const group = readRememberedDeckGroup20260911();
  return group == null ? null : deckGroupToNumber20260906(group);
}

/**
 * 进房时的首选卡组：本地记过就用本地的，否则用传入的服务端值。
 * 返回值同时给出"是否需要同步给房间成员"，调用方据此调 room:set-deck。
 */
export function preferredRoomDeckGroup20260911(serverDeckNo) {
  const remembered = readRememberedDeckGroup20260911();
  if (remembered == null) return { group: null, number: null, needsSync: false };
  const number = deckGroupToNumber20260906(remembered);
  const server = Number(serverDeckNo);
  return {
    group: remembered,
    number,
    needsSync: !Number.isFinite(server) || server !== number,
  };
}

/**
 * 取"本局战斗要用哪套卡组"。
 *
 * 关键点：非默认的战团如果还没配置卡牌，**不能**悄悄退回默认卡组 —— 原来
 * BattleView 里写的是 `loadSavedDeck(...) ?? defaultDeckSlots(...)`，
 * 而无参调用还会落到默认组，于是"切了战团2，进去卡槽还是默认卡组"。
 * 这里按玩家选中的卡组取：
 *   - 该组有卡组（含明确保存为空组）→ 用它；
 *   - 默认组没有 → 用系统初始卡组；
 *   - 其它组没有 → 返回空（尊重玩家的选择，由界面提示去配置）。
 */
export function resolveDeckGroup20260911(cardInventory, group = null) {
  if (group != null) return normalizeDeckGroup20260906(group);
  return normalizeDeckGroup20260906(
    cardInventory?.__activeDeckGroup20260907
      ?? readRememberedDeckGroup20260911()
      ?? 'default',
  );
}

export function loadBattleDeckSlots20260911(cardInventory, db, group = null) {
  const normalized = resolveDeckGroup20260911(cardInventory, group);
  const saved = DeckSelectView.loadSavedDeck(cardInventory, db, normalized);
  if (Array.isArray(saved)) return saved;
  if (normalized === 'default') return DeckSelectView.defaultDeckSlots(cardInventory, db) ?? [];
  return [];
}

const START_GUARD_FLAG = Symbol.for('clbwz.deckGroupStartGuard20260911');
const DECK_GROUP_LABEL = { default: '默认', team1: '战团1', team2: '战团2', team3: '战团3' };

/**
 * 空战团不允许开打（用户要求）：选中战团还没配置卡牌时，
 * 点"开始战斗"只弹提示、不真的开始，避免打起来发现手上没牌。
 * 挂在 SocketClient.startGame 上，房间内所有开始入口都会被拦到。
 */
export function installDeckGroupStartGuard20260911() {
  if (globalThis[START_GUARD_FLAG]) return;
  globalThis[START_GUARD_FLAG] = true;
  const proto = SocketClient.prototype;
  const previousStartGame = proto.startGame;
  proto.startGame = function startGameWithDeckGroupGuard(...args) {
    try {
      const app = globalThis.__clbwzAppInstance;
      const view = app?.views?.room ?? null;
      const inventory = view?.cardInventory ?? null;
      const db = view?.db ?? null;
      if (view?.room?.status === 'waiting' && inventory && db) {
        const group = resolveDeckGroup20260911(inventory, null);
        if (group !== 'default') {
          const deck = loadBattleDeckSlots20260911(inventory, db, group);
          if (!Array.isArray(deck) || deck.length === 0) {
            const label = DECK_GROUP_LABEL[group] ?? group;
            const message = `「${label}」还没有配置卡牌，请先配置或切回默认卡组再开始`;
            try { view.notice?.(message); } catch { /* 忽略 */ }
            try { app?.showGlobalNotice?.('无法开始战斗', `<div>${message}</div>`); } catch { /* 忽略 */ }
            // 不发开始请求：服务端不会广播 room:starting，界面停在房间。
            return Promise.resolve(view.room ?? null);
          }
        }
      }
    } catch {
      /* 守卫自身出错不应影响正常开始 */
    }
    return previousStartGame.apply(this, args);
  };
}
