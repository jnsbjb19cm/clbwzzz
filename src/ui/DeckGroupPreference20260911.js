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
