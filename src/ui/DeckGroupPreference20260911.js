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
import { authStore } from '../core/AuthStore.js';
import { SocketClient } from '../network/SocketClient.js';
import { DeckSelectView } from './DeckSelectView.js';
import {
  storageKeyForDeckGroup20260906,
  deckGroupToNumber20260906,
  deckNumberToGroup20260906,
  normalizeDeckGroup20260906,
} from './DeckGroupSelection20260906.js';

const STORAGE_KEY = 'clbwz_deck_group_v1';

export const DECK_GROUP_BY_NO_20260911 = { 0: 'default', 1: 'team1', 2: 'team2', 3: 'team3' };
const DECK_NO_BY_GROUP_20260911 = { default: 0, team1: 1, team2: 2, team3: 3 };

export function deckNoForGroup20260911(group) {
  return DECK_NO_BY_GROUP_20260911[normalizeDeckGroup20260906(group)] ?? 0;
}

/** 账号里记住的战团（服务端为准，跨设备/换浏览器一致）。 */
export function accountDeckGroup20260911() {
  const raw = String(authStore?.snapshot?.profile?.selectedDeckGroup ?? '').trim();
  return raw in DECK_NO_BY_GROUP_20260911 ? raw : null;
}

/** 读取玩家记住的卡组；从没选过返回 null（调用方应回退到服务端/默认值）。 */
export function readRememberedDeckGroup20260911() {
  // 本地（最近一次操作，立即写入）优先；本地没有（换设备/清缓存）再用账号里的值。
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw != null && raw !== '') return normalizeDeckGroup20260906(raw);
  } catch {
    /* 隐私模式等场景忽略 */
  }
  return accountDeckGroup20260911();
}

let selectedDeckSyncTimer = null;
let selectedDeckPending = null;

function flushSelectedDeckGroup() {
  const group = selectedDeckPending;
  selectedDeckPending = null;
  selectedDeckSyncTimer = null;
  if (!group || !authStore?.isLoggedIn?.()) return;
  // 后台提交：不阻塞界面；失败也无所谓，本地已经生效，下次切组会再提交。
  void Promise.resolve(authStore.api.put('/player/selected-deck', { group }))
    .then(() => {
      const profile = authStore.snapshot?.profile;
      if (profile) profile.selectedDeckGroup = group;
    })
    .catch(() => {});
}

/**
 * 记住玩家的卡组选择（"保存要快"）：
 * 本地立即生效，服务端提交做 400ms 去抖合并 —— 连续切页签只发一次请求。
 */
export function rememberDeckGroup20260911(group) {
  const normalized = normalizeDeckGroup20260906(group);
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, normalized);
  } catch {
    /* 隐私模式等场景忽略 */
  }
  const profile = authStore?.snapshot?.profile;
  if (profile) profile.selectedDeckGroup = normalized;
  selectedDeckPending = normalized;
  if (selectedDeckSyncTimer) clearTimeout(selectedDeckSyncTimer);
  selectedDeckSyncTimer = setTimeout(flushSelectedDeckGroup, 400);
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
  // 2026-10-11（用户：「选 a 进游戏却是 b」仍是这个问题）：
  // 以前这里**先看 `cardInventory.__activeDeckGroup20260907`** —— 而这个环境标记会被
  // BattleCriticalFixes / BattleRoomFlowPatch / BattleRoomDeckUiV3 / AdventureCoopBridge /
  // BattleUserRegressionFix 等 6 处到处写，很容易残留成**上一场/房间**的战团，
  // 于是"界面看着是战团1、进战斗却按战团3 取牌"→ 拿到的当然是另一张（同类型的）卡。
  // 本文件下面那段注释早就警告过"不要用它当依据"，这里把优先级反过来：
  //   玩家**明确记住**的战团（切页签时写入）优先；环境标记只当兜底。
  return normalizeDeckGroup20260906(
    readRememberedDeckGroup20260911()
      ?? cardInventory?.__activeDeckGroup20260907
      ?? 'default',
  );
}

export function loadBattleDeckSlots20260911(cardInventory, db, group = null) {
  const normalized = resolveDeckGroup20260911(cardInventory, group);
  // 2026-10-11：用户反复报「选 a 进游戏却是 b」。为了不再靠猜，这里把**实际用到的牌组**
  // 打点出来（战团来源、每个战团键里的内容、最终拿到的每张卡的 cardId/品质/星级）。
  // 控制台里搜 `[deck]` 即可看到；也可以随时执行 __clbwzDeckDebug() 打印最近一次。
  const record = describeDeckResolve20261011(cardInventory, db, normalized, group);
  try {
    globalThis.clbwzLastDeckResolve = record;
    console.log('[deck] 进战斗用哪套牌', record);
  } catch { /* 打点失败不影响战斗 */ }
  const saved = DeckSelectView.loadSavedDeck(cardInventory, db, normalized);
  if (Array.isArray(saved)) return saved;
  if (normalized === 'default') return DeckSelectView.defaultDeckSlots(cardInventory, db) ?? [];
  return [];
}

/** 把这次"进战斗到底用了哪套牌"整理成一条可读记录（诊断用）。 */
function describeDeckResolve20261011(cardInventory, db, normalized, explicitGroup) {
  const slots = cardInventory?.getSlots?.() ?? [];
  const readKey = (key) => {
    try {
      const raw = globalThis.localStorage?.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      return parsed.map((fp) => (fp && typeof fp === 'object'
        ? `#${fp.cardId}q${fp.craftQuality ?? 1}s${fp.strengthLv ?? 0}@${fp.index}`
        : String(fp)));
    } catch { return 'parse-error'; }
  };
  return {
    explicitGroup: explicitGroup ?? null,
    remembered: readRememberedDeckGroup20260911(),
    ambientMarker: cardInventory?.__activeDeckGroup20260907 ?? null,
    resolvedGroup: normalized,
    localDecks: {
      default: readKey('battle_deck_v2'),
      team1: readKey('battle_deck_v2_team1'),
      team2: readKey('battle_deck_v2_team2'),
      team3: readKey('battle_deck_v2_team3'),
      legacyIds: readKey('battle_deck_ids'),
    },
    // 2026-10-11：把背包槽位的**真实字段**和"按组存档能否比对成功"一起打出来，
    // 用于判断是"字段缺失/改名导致比对失败"还是"存档本身就被写坏了"。
    bagSlotSample: slots.slice(0, 30).map((s, i) => (s ? `${i}:${Object.keys(s).join("/")}#${s.cardId}q${s.craftQuality ?? "-"}s${s.strengthLv ?? "-"}` : null)).filter(Boolean).slice(0, 6),
    keyedReconcile: (() => {
      try {
        const raw = globalThis.localStorage?.getItem(normalized === 'default' ? 'battle_deck_v2' : `battle_deck_v2_${normalized}`);
        if (!raw) return "no-key";
        const parsed = JSON.parse(raw);
        const rec = DeckSelectView.reconcileFingerprints(parsed, cardInventory) ?? [];
        return `key=${parsed.length}条 → 比对成功 ${rec.length} 条`;
      } catch (error) { return "error: " + error.message; }
    })(),
    resolvedCards: (DeckSelectView.loadSavedDeck(cardInventory, db, normalized) ?? []).map((i) => {
      const s = slots[i];
      return s ? `slot${i}:#${s.cardId}q${s.craftQuality ?? 1}s${s.strengthLv ?? 0}` : `slot${i}:空`;
    }),
  };
}

/**
 * 诊断入口：控制台执行 __clbwzDeckDebug() —— 打印"最近一次进战斗用了哪套牌"。
 * 如果看到的卡不是自己选的那张，把这条输出发我即可定位。
 */
if (typeof window !== 'undefined') {
  window.__clbwzDeckDebug = () => {
    const last = globalThis.clbwzLastDeckResolve ?? null;
    if (!last) return '还没有进过战斗（或打点未触发）。先在卡组界面选好牌、进一次关卡，再执行本命令。';
    console.table?.(last.localDecks);
    console.log('战团解析：', {
      explicitGroup: last.explicitGroup,
      玩家记住的战团: last.remembered,
      环境残留标记: last.ambientMarker,
      最终采用: last.resolvedGroup,
    });
    console.log('这次战斗实际拿到的卡：', last.resolvedCards);
    return last;
  };
}

/**
 * 玩家此刻选中的那套卡组：**组名 + 槽位一起给出**。
 *
 * 战斗入口必须成对使用这两个值 —— 槽位决定"打什么牌"，组名决定"打完写回哪一组"。
 * 拆成两次调用就会出现"按 A 组取牌、按 B 组写回"的串组：2026-09-12 用户报告的
 * 「界面选战团1、开打却用默认组，而且战团1 被写成了默认组」就是 PVP 战斗入口
 * 自己按默认组取牌，而保存时按"当前选中组=战团1"落盘造成的。
 */
/**
 * 2026-09-12：**房间里"这场战斗要用哪套卡组"**。
 *
 * 规则（用户要求"界面看到哪套、打的就是哪套"）：
 *   1. 房间成员当前选中的战团 → 用它（房间里玩家自己选的，最高优先）；
 *   2. 成员还没有选择（服务端刚按账号重建成员）→ 用玩家记住的战团；
 *   3. 再没有 → default。
 *
 * 注意**不要**用 `cardInventory.__activeDeckGroup20260907` 当依据：那是个会被各路
 * 流程到处写的环境标记，很容易是上一场的残留，从而把玩家重定向到别的战团
 * （用户报告："在默认/战团1/战团3，重定向就重定向战团2"）。
 */
export function roomDeckGroup20260912(view) {
  const room = view?.room ?? view?._roomState ?? null;
  const members = room?.members ?? [];
  const meId = view?.currentUserId?.() ?? view?._myId ?? room?.myUserId ?? null;
  const me = members.find((member) => String(member?.userId) === String(meId));
  if (me?.selectedDeckNo != null) return deckNumberToGroup20260906(me.selectedDeckNo);
  const remembered = readRememberedDeckGroup20260911();
  return remembered != null ? normalizeDeckGroup20260906(remembered) : 'default';
}

/**
 * 2026-09-12：**战斗里这套牌属于哪一组** —— 写盘/退出时必须用它，不许再用"当前选中组"猜。
 *
 * 优先级：显式指定（战斗入口带进来的）→ 房间战斗交接（`__roomBattleDeckSelection20260908`）
 *        → 玩家当前选中的组（单机冒险就是它）。
 *
 * 用户报告：「选战团2 进游戏，退出后默认组里居然是上次的卡牌；切到战团2 又发现战团2 变成了默认卡组的牌」
 * 就是因为"手里这副牌"和"写回哪一组"来自两个不同的来源。
 */
export function battleDeckGroup20260912(view, explicit = null) {
  if (explicit != null) return normalizeDeckGroup20260906(explicit);
  const fromView = view?.pvp?.deckGroup ?? view?.deckGroup ?? view?.battleDeckGroup ?? null;
  if (fromView != null) return normalizeDeckGroup20260906(fromView);
  const handoff = view?.cardInventory?.__roomBattleDeckSelection20260908;
  if (handoff?.group != null) return normalizeDeckGroup20260906(handoff.group);
  return resolveDeckGroup20260911(view?.cardInventory ?? null, null);
}

export function selectedBattleDeck20260912(cardInventory, db, group = null) {
  const resolved = resolveDeckGroup20260911(cardInventory, group);
  return { group: resolved, slots: loadBattleDeckSlots20260911(cardInventory, db, resolved) };
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
/**
 * 账号里的某一组卡组 → 背包槽位下标（用于把账号数据写回本地缓存）。
 * 账号里"明确保存为空"返回 []；账号里没有这一组返回 null。
 */
function accountDeckIndices20260911(deckNo, cardInventory, localFingerprints = []) {
  const decks = authStore?.snapshot?.decks;
  if (!Array.isArray(decks) || !cardInventory?.getSlots) return null;
  const deck = decks.find((entry) => Number(entry?.deckNo ?? entry?.deck_no) === Number(deckNo));
  if (!deck || !Array.isArray(deck.cards)) return null;
  const slots = cardInventory.getSlots() ?? [];
  const used = new Set();
  const selected = [];
  // 2026-10-11（用户实测数据）：花生射手本来是【完美(品质5)】，进战斗却变成【品质2】那张。
  // 原因：账号牌组里**只有 cardId**（服务端没存品质/星级），换算时落到"第一张同 id 的卡"。
  // 所以这里先记下**玩家本地已经选过的那些卡**（哪个品质、在哪个槽），
  // 换算时优先复用本地那一格 —— 账号数据只用来决定"这一组有哪些卡"，不再决定"用哪一张实例"。
  const localByCardId = new Map();
  for (const fp of Array.isArray(localFingerprints) ? localFingerprints : []) {
    if (!fp || typeof fp.cardId !== 'number') continue;
    if (!localByCardId.has(fp.cardId)) localByCardId.set(fp.cardId, fp);
  }
  for (const raw of deck.cards) {
    const cardId = Number(raw?.cardId ?? raw);
    if (!Number.isInteger(cardId) || cardId <= 0) continue;
    const wantQuality = Number(raw?.craftQuality ?? raw?.craft_quality ?? 0);
    const wantStar = Number(raw?.strengthLv ?? raw?.strength_lv ?? raw?.star ?? 0);
    let index = -1;
    // ① 账号里真带了品质/星级 → 按指纹精确匹配
    if (wantQuality > 0 || wantStar > 0) {
      index = slots.findIndex((slot, slotIndex) => {
        if (used.has(slotIndex) || Number(slot?.cardId) !== cardId) return false;
        if (wantQuality > 0 && (slot.craftQuality ?? 1) !== wantQuality) return false;
        if (wantStar > 0 && (slot.strengthLv ?? 0) !== wantStar) return false;
        return true;
      });
    }
    // ② 本地这一组里已经选过这张卡 → 复用本地那一格（保住玩家选的实例）
    if (index < 0) {
      const fp = localByCardId.get(cardId);
      const fpIndex = fp?.index;
      if (Number.isInteger(fpIndex) && fpIndex >= 0 && !used.has(fpIndex)) {
        const slot = slots[fpIndex];
        const sameCard = Number(slot?.cardId) === cardId;
        const sameQuality = (slot?.craftQuality ?? 1) === (fp.craftQuality ?? 1);
        const sameStar = (slot?.strengthLv ?? 0) === (fp.strengthLv ?? 0);
        if (sameCard && sameQuality && sameStar) index = fpIndex;
      }
    }
    if (index < 0) {
      index = slots.findIndex((slot, slotIndex) => (
        !used.has(slotIndex) && Number(slot?.cardId) === cardId
      ));
    }
    if (index >= 0) { used.add(index); selected.push(index); }
  }
  return selected;
}

/** 读取本地"按组"存档（battle_deck_v2[_teamN]）里的槽位下标。 */
function localGroupIndices20260911(group, cardInventory) {
  try {
    const raw = globalThis.localStorage?.getItem(storageKeyForDeckGroup20260906(group));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    if (!parsed.length) return [];
    const reconciled = DeckSelectView.reconcileFingerprints?.(parsed, cardInventory) ?? [];
    return reconciled.length ? reconciled : [];
  } catch {
    return null;
  }
}

function sameIndices20260911(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  return a.every((value, index) => Number(value) === Number(b[index]));
}

/**
 * 用账号里的卡组纠正本地缓存。
 *
 * 背景：以前有段时间"组"会串写，本地 battle_deck_v2_teamN / 房间界面用的旧聚合里
 * 可能留着别的战团的牌；只把"读账号"接上还不够——界面和本地键仍然是旧数据。
 * 这里在登录拿到快照后，把 4 个组按账号内容重写一遍（内容相同就跳过，不产生多余请求）。
 */
export function mirrorAccountDecksToLocal20260911(cardInventory, db) {
  if (!cardInventory || !Array.isArray(authStore?.snapshot?.decks)) return 0;
  let fixed = 0;
  for (const group of ['default', 'team1', 'team2', 'team3']) {
    const deckNo = deckNoForGroup20260911(group);
    const slotsNow = cardInventory.getSlots() ?? [];
    // 先把**本地已经选好的**那些卡拿出来（含品质/星级），交给换算函数复用 ——
    // 账号里只有 cardId 时，绝不能让换算结果把玩家选的实例（比如"完美花生射手"）换成同 id 的另一张。
    const local = localGroupIndices20260911(group, cardInventory);
    const localFps = (Array.isArray(local) ? local : []).map((i) => ({
      index: i,
      cardId: Number(slotsNow[i]?.cardId) || 0,
      craftQuality: slotsNow[i]?.craftQuality ?? 1,
      strengthLv: slotsNow[i]?.strengthLv ?? 0,
    }));
    const account = accountDeckIndices20260911(deckNo, cardInventory, localFps);
    if (!Array.isArray(account)) continue;
    if (sameIndices20260911(local, account)) continue;
    // 2026-10-11：只要**卡片组成**（按 cardId 的序列）已经和账号一致，就不重写 —— 保留玩家的实例选择；
    // 只有组成真的不同（比如串组、缺卡）才用账号内容纠正。
    const idsOf = (list) => (Array.isArray(list) ? list : []).map((i) => Number(slotsNow[i]?.cardId) || 0);
    if (local && sameIndices20260911(idsOf(local), idsOf(account))) continue;
    try {
      DeckSelectView.saveDeck(account, cardInventory, group);
      fixed += 1;
    } catch {
      /* 忽略：本地缓存纠正失败不影响账号数据 */
    }
  }
  return fixed;
}
const ACCOUNT_MIRROR_FLAG = Symbol.for('clbwz.accountDeckMirror20260911');

/** 房间/选卡组界面每次渲染前，先用账号里的卡组纠正本地缓存（含旧聚合）。 */
export function installAccountDeckMirror20260911() {
  if (globalThis[ACCOUNT_MIRROR_FLAG]) return;
  globalThis[ACCOUNT_MIRROR_FLAG] = true;
  const previousRender = DeckSelectView.prototype.render;
  DeckSelectView.prototype.render = function renderWithAccountDeckMirror(root, options = {}) {
    try {
      const fixed = mirrorAccountDecksToLocal20260911(options.cardInventory, options.db);
      if (fixed > 0) {
        // 纠正完之后把"上一次页签"恢复成玩家记住的组，别让镜像过程改掉它。
        const remembered = readRememberedDeckGroup20260911();
        if (remembered) {
          for (const key of ['clbwz_room_decks_v4', 'clbwz_room_decks_v3']) {
            try {
              const parsed = JSON.parse(globalThis.localStorage?.getItem(key) || 'null');
              if (parsed && typeof parsed === 'object') {
                parsed.activeTab = remembered;
                globalThis.localStorage?.setItem(key, JSON.stringify(parsed));
              }
            } catch { /* 忽略 */ }
          }
        }
      }
    } catch {
      /* 镜像失败不影响正常渲染 */
    }
    return previousRender.call(this, root, options);
  };
}
