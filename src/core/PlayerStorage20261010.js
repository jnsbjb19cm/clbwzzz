/**
 * 2026-10-10：把「玩家数据」的 localStorage 键按账号隔离 —— 修玩家反馈的「换号串数据」。
 *
 * 问题现场：A 号进入游戏 → 登出 → 换 B 号登录，B 看到的是 A 的背包/卡牌/任务/地图进度。
 *
 * 根因有两层：
 *   ① localStorage 里那些键是**固定名字**（clbwz_player_v1 / clbwz_card_inventory_v1 /
 *      clbwz_inventory_v1 / clbwz_quest_v12 / clbwz_craft_state_v1 / clbwz_worldmap_v1 /
 *      clbwz_room_decks_v4 / 教程完成标记…），A 写进去的值 B 直接读到了；
 *   ② App 实例是复用的（登出只做了 authStore.logout() + mount()），
 *      在内存里的 inventory / cardInventory / player 也没重建 → 即使存储隔离了，
 *      同一次会话里换了号，看到的还是上一个号的运行时对象。
 *
 * 本模块解决 ①：包一层 localStorage，把名单里的键在读写时自动加上 `#u<userId>` 后缀。
 * 好处：十几个模块一行都不用改，将来新增的键只要加进 PLAYER_SCOPED_BASES 就自动隔离。
 *
 * 老数据兼容：某个键第一次被访问时，如果「只有旧的全局键」存在，就把它**搬**（rename）
 * 到当前账号下、并删掉全局键。搬家只可能发生一次，所以不会把 A 的数据送给 B，
 * 同时老玩家的存档也不会丢。
 *
 * ② 由 App.resetPlayerState() 处理（登录成功 / 登出时重建玩家相关运行时对象）。
 */

/** 需要按账号隔离的键（基础名，不带后缀）。 */
export const PLAYER_SCOPED_BASES = Object.freeze([
  'clbwz_player_v1',                            // App 的玩家数据
  'clbwz_card_inventory_v1',                    // 卡牌背包
  'clbwz_inventory_v1',                         // 道具背包
  'clbwz_quest_v12',                            // 任务进度
  'clbwz_craft_state_v1',                       // 制作状态
  'clbwz_worldmap_v1',                          // 世界地图进度
  'clbwz_room_decks_v4',                        // 房间卡组
  'clbwz_room_chat_history_20260906',           // 房间聊天记录（也是玩家级）
  'clbwz_new_player_tutorial_completed_v1',     // 新手教程已完成标记
  'battle_deck_ids',                            // 战斗卡组
  'battle_deck_v2',
]);

const SEP = '#u';

let currentUserId = null;
let installed = false;

/** 当前用于隔离的账号 id（未登录为 null）。 */
export function playerStorageUserId() {
  return currentUserId;
}

/**
 * 登录成功后调用（传 user.id）；登出时传 null。
 * 注意：**必须在读取任何玩家数据之前调用**，否则那一轮读到的还是未隔离的全局键。
 */
export function setPlayerStorageUser(userId) {
  const next = userId == null || userId === '' ? null : String(userId);
  currentUserId = next;
  return next;
}

function scopedKey(base) {
  return currentUserId ? `${base}${SEP}${currentUserId}` : base;
}

/** 传入的键是否属于「按账号隔离」名单，返回它对应的基础名。 */
function baseOf(key) {
  if (typeof key !== 'string') return null;
  for (const base of PLAYER_SCOPED_BASES) {
    if (key === base || key.startsWith(`${base}${SEP}`)) return base;
  }
  return null;
}

/**
 * 装一次即可（幂等）。包 Storage.prototype，所以 localStorage / sessionStorage 都会经过这里
 *  —— 但只有名单里的键会被改名，其它键（音量、画质、登录 token 等设备级设置）行为不变。
 */
export function installPlayerStorageScope() {
  if (installed) return false;
  if (typeof window === 'undefined' || !window.Storage?.prototype) return false;
  installed = true;

  const proto = window.Storage.prototype;
  const rawGet = proto.getItem;
  const rawSet = proto.setItem;
  const rawRemove = proto.removeItem;

  /** 旧全局键 → 当前账号键：只搬一次，搬完删掉全局键，避免被下一个账号继承。 */
  const adoptLegacy = (store, base) => {
    if (!currentUserId) return;
    const legacy = rawGet.call(store, base);
    if (legacy == null) return;
    const target = scopedKey(base);
    if (rawGet.call(store, target) == null) rawSet.call(store, target, legacy);
    rawRemove.call(store, base);
  };

  proto.getItem = function getItemScopedByPlayer(key) {
    const base = baseOf(key);
    if (!base) return rawGet.call(this, key);
    if (!currentUserId) return rawGet.call(this, key);
    adoptLegacy(this, base);
    return rawGet.call(this, scopedKey(base));
  };

  proto.setItem = function setItemScopedByPlayer(key, value) {
    const base = baseOf(key);
    if (!base || !currentUserId) return rawSet.call(this, key, value);
    return rawSet.call(this, scopedKey(base), value);
  };

  proto.removeItem = function removeItemScopedByPlayer(key) {
    const base = baseOf(key);
    if (!base) return rawRemove.call(this, key);
    // 旧的全局键也一并清掉：否则它会被下一个登录的账号「继承」。
    rawRemove.call(this, key);
    if (!currentUserId) return undefined;
    return rawRemove.call(this, scopedKey(base));
  };

  return true;
}
