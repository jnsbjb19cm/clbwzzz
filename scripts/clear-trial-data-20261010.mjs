/**
 * 2026-10-10：清除**已经发出去**的试玩数据（老账号里那份）。
 *
 * 背景：新号补给以前发两样东西：
 *   ① 客户端 ItemDatabase 的 STARTER_ITEMS + App 的 grantAllCollectibleCards（全卡）
 *      → 已在 d144871 清掉（只作用于新号）
 *   ② **服务端** server/domain/playerInventoryAuthority20260908.js 的 STARTER_ITEMS
 *      → 今天才找到并清掉（登录拉快照时发，实测新号 372 有 26 种道具共 17060 个）
 * 本脚本负责把 ②（以及可选的 ① 卡牌）从**已有账号**里扣回来 —— 只动「当初白送的那部分」。
 *
 * ⚠️ 用户决定（2026-10-10）：**历史数据不动** —— 已经发出去的算已发放的福利，不回收；
 * 本脚本只作为备用工具保留（默认只预览），将来真需要时可以用 --user 指定账号处理。
 *
 * 默认**只预览不修改**；确认后加 --apply。
 *   node scripts/clear-trial-data-20261010.mjs                  # 预览（道具）
 *   node scripts/clear-trial-data-20261010.mjs --apply          # 执行（道具）
 *   node scripts/clear-trial-data-20261010.mjs --apply --cards  # 连卡牌一起清
 *   node scripts/clear-trial-data-20261010.mjs --apply --user 372   # 只处理某个账号
 *
 * 安全边界：
 *   - 道具：按「当初发的数量」**最多扣回那么多**，不会把玩家自己赚的扣没（floor 0）。
 *   - 卡牌：只删「当初白送的那批卡」里 **star=0 且 craft_quality=1**（从没升过星/洗过品质）的，
 *     升级/洗练过的卡一律保留；花生射手(1)/核桃卫兵(2) 这两张新手教程卡永远保留。
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const WITH_CARDS = args.has('--cards');
const userArgIndex = process.argv.indexOf('--user');
const ONLY_USER = userArgIndex >= 0 ? Number(process.argv[userArgIndex + 1]) : null;

const config = require('../server/config.js');
const dbPath = config.databasePath || config.default?.databasePath
  || path.join(__dirname, '..', 'server', 'data', 'game.sqlite');

/** 当初服务端发出去的试玩道具（现在那份 STARTER_ITEMS 已清空，这里是历史值）。 */
const craftMaterials = require('../src/data/craftMaterials.json');
const TRIAL_ITEMS = [
  { itemId: 1, count: 20 },
  { itemId: 2, count: 10 },
  { itemId: 3, count: 100 },
  { itemId: 10001, count: 200 },
  { itemId: 10002, count: 150 },
  { itemId: 10003, count: 100 },
  { itemId: 10004, count: 80 },
  { itemId: 10005, count: 50 },
  { itemId: 30055, count: 300 },
  ...Object.entries(craftMaterials.starterCounts ?? {}).map(([itemId, count]) => ({
    itemId: Number(itemId),
    count: Number(count),
  })),
];

/** 当初客户端/服务端白送的卡（旧 STARTER_DECK + STARTER_EXTRA，共 30 张）。 */
const TRIAL_CARD_IDS = [
  1, 2, 4, 15, 19, 25, 22, 17, 11, 3,
  5, 6, 8, 12, 13, 20, 21, 23, 24, 26, 27, 28, 30, 31, 32, 33, 35, 36, 37, 38,
];
/** 新手教程必须有的两张，任何情况都不删。 */
const KEEP_CARD_IDS = new Set([1, 2]);

const db = new Database(dbPath);
console.log(`数据库：${dbPath}`);
console.log(APPLY ? '模式：**执行**（会改数据）' : '模式：预览（不改数据，加 --apply 才执行）');

const users = db.prepare(`
  SELECT user_id AS userId, seeded_at AS seededAt
  FROM player_inventory_bootstrap_20260908
  ORDER BY user_id
`).all().filter((row) => ONLY_USER == null || Number(row.userId) === ONLY_USER);

if (!users.length) {
  console.log('该范围内没有「发过试玩包」的账号。');
  db.close();
  process.exit(0);
}

let totalItemRows = 0;
let totalItemCount = 0;
let totalCardRows = 0;

const applyItems = db.transaction((userId) => {
  for (const { itemId, count } of TRIAL_ITEMS) {
    const row = db.prepare('SELECT rowid, count FROM player_items WHERE user_id=? AND item_id=? AND count>0').get(userId, itemId);
    if (!row) continue;
    const give = Math.min(Number(row.count) || 0, Number(count) || 0);
    if (give <= 0) continue;
    const left = (Number(row.count) || 0) - give;
    totalItemRows += 1;
    totalItemCount += give;
    if (left > 0) {
      db.prepare('UPDATE player_items SET count=? WHERE rowid=?').run(left, row.rowid);
    } else {
      db.prepare('DELETE FROM player_items WHERE rowid=?').run(row.rowid);
    }
  }
});

const applyCards = db.transaction((userId) => {
  for (const cardId of TRIAL_CARD_IDS) {
    if (KEEP_CARD_IDS.has(cardId)) continue;
    const rows = db.prepare(
      'SELECT id FROM player_cards WHERE user_id=? AND card_id=? AND star=0 AND craft_quality=1',
    ).all(userId, cardId);
    for (const row of rows) {
      totalCardRows += 1;
      db.prepare('DELETE FROM player_cards WHERE id=?').run(row.id);
      db.prepare('DELETE FROM player_card_instance_state WHERE card_instance_id=?').run(row.id);
    }
  }
});

for (const user of users) {
  const beforeItems = db.prepare('SELECT COUNT(*) c, COALESCE(SUM(count),0) s FROM player_items WHERE user_id=?').get(user.userId);
  const beforeCards = db.prepare('SELECT COUNT(*) c FROM player_cards WHERE user_id=?').get(user.userId);
  if (APPLY) {
    applyItems(user.userId);
    if (WITH_CARDS) applyCards(user.userId);
  }
  const afterItems = db.prepare('SELECT COUNT(*) c, COALESCE(SUM(count),0) s FROM player_items WHERE user_id=?').get(user.userId);
  const afterCards = db.prepare('SELECT COUNT(*) c FROM player_cards WHERE user_id=?').get(user.userId);
  console.log(
    `  账号 ${String(user.userId).padStart(4)}（${user.seededAt}）`
    + ` 道具 ${beforeItems.c}种/${beforeItems.s}个 → ${afterItems.c}种/${afterItems.s}个`
    + ` ｜ 卡牌 ${beforeCards.c} → ${afterCards.c}`,
  );
}

console.log('');
if (APPLY) {
  console.log(`已清除：道具 ${totalItemRows} 行 / 共 ${totalItemCount} 个${WITH_CARDS ? `，卡牌 ${totalCardRows} 张` : '（卡牌未处理，加 --cards）'}`);
  console.log('注意：已登录的玩家需要刷新页面（客户端会重新拉服务端快照）。');
} else {
  let wouldItems = 0;
  let wouldCount = 0;
  for (const user of users) {
    for (const { itemId, count } of TRIAL_ITEMS) {
      const row = db.prepare('SELECT count FROM player_items WHERE user_id=? AND item_id=? AND count>0').get(user.userId, itemId);
      if (!row) continue;
      wouldItems += 1;
      wouldCount += Math.min(Number(row.count) || 0, Number(count) || 0);
    }
  }
  let wouldCards = 0;
  for (const user of users) {
    for (const cardId of TRIAL_CARD_IDS) {
      if (KEEP_CARD_IDS.has(cardId)) continue;
      wouldCards += db.prepare('SELECT COUNT(*) c FROM player_cards WHERE user_id=? AND card_id=? AND star=0 AND craft_quality=1').get(user.userId, cardId).c;
    }
  }
  console.log(`预览结果：将清除道具 ${wouldItems} 行 / 共 ${wouldCount} 个；卡牌 ${wouldCards} 张（卡牌要 --cards 才会动）`);
  console.log('确认后执行：node scripts/clear-trial-data-20261010.mjs --apply');
}
db.close();
