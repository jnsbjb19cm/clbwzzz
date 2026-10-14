/**
 * 2026-10-12：直接查库，找出"战团里有、但 player_cards 里没有"的卡
 *
 * 用户现象：保存战团时服务端返回 {"message":"战团中包含未拥有的卡牌"}
 * 服务端判定（server/routes/player.js:158-160）：
 *   const owned = new Set((await db.all('SELECT card_id FROM player_cards WHERE user_id=?')).map(r => r.card_id));
 *   if (cards.some(id => !owned.has(id))) -> 403
 *
 * 本脚本用**同一套判定**在库里跑一遍，直接把"缺哪张卡"打出来 —— 这就是可红的回路。
 *
 * 运行：node scripts/diagnose-deck-ownership-20261012.mjs [userId]
 */
import * as dbmod from '../server/database.js';

const mod = dbmod.default ?? dbmod;
const db = mod.db ?? mod;

async function all(sql, params = []) {
  if (typeof db.all === 'function') return db.all(sql, params);
  if (typeof db.query === 'function') {
    const [rows] = await db.query(sql, params);
    return rows;
  }
  throw new Error('找不到可用的查询方法（db.all / db.query）');
}

console.log('可用导出:', Object.keys(mod).slice(0, 12).join(', '));

const argUser = Number(process.argv[2] || 0);

// 1) 有哪些玩家
const users = await all('SELECT id FROM users ORDER BY id DESC');
console.log('\n最近的玩家:', users.map((u) => `#${u.id} ${u.nickname ?? ''}`).join(' | '));

const targetIds = argUser ? [argUser] : users.map((u) => Number(u.id));

for (const userId of targetIds) {
  const ownedRows = await all('SELECT card_id FROM player_cards WHERE user_id=?', [userId]);
  const owned = new Set(ownedRows.map((r) => Number(r.card_id)));

  const decks = await all('SELECT id, deck_no FROM player_decks WHERE user_id=?', [userId]);
  let bad = [];
  for (const deck of decks) {
    const rows = await all('SELECT card_id FROM deck_cards WHERE deck_id=?', [deck.id]);
    const ids = rows.map((r) => Number(r.card_id));
    const missing = ids.filter((id) => !owned.has(id));
    if (missing.length) {
      bad.push({ deckNo: deck.deck_no, cards: ids, missing });
    }
  }

  const has126 = owned.has(126);
  console.log(`\n== 玩家 #${userId} ==`);
  console.log(`   拥有卡 ${owned.size} 张${has126 ? '（其中包含 126 怪物冷萃机 ✗）' : ''}`);
  if (!bad.length) {
    if (owned.size < 10) console.log('   · 战团正常，但拥有卡极少（' + owned.size + ' 张）—— 可能从未成功补卡');
  } else {
    for (const item of bad) {
      console.log(`   ✗ 战团 ${item.deckNo} 引用了未拥有的卡: ${item.missing.join(', ')}`);
      console.log(`     （该战团全部卡: ${item.cards.join(', ')}）`);
    }
  }
}

process.exit(0);
