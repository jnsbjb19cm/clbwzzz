import { Router } from 'express';
import { createHash } from 'node:crypto';
import { db, withTransaction } from '../database.js';
import { requireAuth } from '../middleware/auth.js';
import { isOnline } from '../online.js';
import './cardInventoryPersistence20260906.js';

export const auctionRouter = Router();
auctionRouter.use(requireAuth);
// A separate escrow preserves every card-instance field without changing legacy
// item listings or their ids. Active listings own the card until purchase/return.
await db.run(`CREATE TABLE IF NOT EXISTS auction_card_escrow (
  listing_id BIGINT PRIMARY KEY, card_id INTEGER NOT NULL, star INTEGER NOT NULL,
  craft_quality INTEGER NOT NULL, state_json TEXT NOT NULL
)`);

function integer(value, min, max, label) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`${label}无效`);
  return n;
}
function extra(row) { return JSON.parse(row.stateJson || '{}'); }
function saleKey(row) {
  return createHash('sha256').update(JSON.stringify([row.id, row.cardId, row.star, row.craftQuality, row.stateJson || '{}'])).digest('hex');
}
function cardFields(row) {
  const state = extra(row);
  return { kind: 'card', cardId: Number(row.cardId), star: Number(row.star), craftQuality: Number(row.craftQuality), customName: state.customName || null };
}
const CARD_JOIN = 'LEFT JOIN auction_card_escrow c ON c.listing_id=a.id';
const CARD_COLUMNS = 'c.card_id AS cardId, c.star, c.craft_quality AS craftQuality, c.state_json AS stateJson';
function listing(row) {
  const { stateJson, ...publicRow } = row;
  return { ...publicRow, ...(row.cardId != null ? cardFields(row) : { kind: 'item' }), sellerOnline: isOnline(row.sellerId) };
}
async function lockPlayers(conn, ids) {
  for (const id of [...new Set(ids.map(Number))].sort((a, b) => a - b)) {
    await conn.run('UPDATE player_profiles SET gold=gold WHERE user_id=?', [id]);
  }
}
async function addItem(conn, userId, itemId, count) {
  const row = await conn.get('SELECT count FROM player_items WHERE user_id=? AND item_id=? AND is_bound=0', [userId, itemId]);
  if (row) await conn.run('UPDATE player_items SET count=count+? WHERE user_id=? AND item_id=? AND is_bound=0', [count, userId, itemId]);
  else await conn.run('INSERT INTO player_items(user_id,item_id,count,is_bound) VALUES(?,?,?,0)', [userId, itemId, count]);
}
async function restoreCard(conn, userId, card) {
  const bag = await conn.get('SELECT slot_count AS slotCount FROM player_card_bags WHERE user_id=?', [userId]);
  const capacity = Math.max(200, Math.min(500, Number(bag?.slotCount) || 200));
  const rows = await conn.all('SELECT slot_index AS slotIndex FROM player_cards WHERE user_id=?', [userId]);
  const used = new Set(rows.map((r) => Number(r.slotIndex)));
  let slot = 0; while (slot < capacity && used.has(slot)) slot++;
  if (slot >= capacity) throw new Error('卡牌背包已满，请先腾出一个位置');
  await conn.run('INSERT INTO player_cards(user_id,slot_index,card_id,star,craft_quality) VALUES(?,?,?,?,?)', [userId, slot, card.cardId, card.star, card.craftQuality]);
  await conn.run('DELETE FROM player_card_instance_state WHERE user_id=? AND slot_index=?', [userId, slot]);
  await conn.run('INSERT INTO player_card_instance_state(user_id,slot_index,state_json) VALUES(?,?,?)', [userId, slot, card.stateJson]);
}
// Serialize this router's writes in SQLite as its connection is shared. MySQL
// also obtains row locks, so competing workers cannot sell a listing twice.
let writes = Promise.resolve();
function transaction(fn) {
  const result = writes.then(() => withTransaction(fn));
  writes = result.catch(() => {});
  return result;
}
function route(fn) {
  return async (req, res) => {
    try { return res.json(await fn(req)); }
    catch (error) { return res.status(400).json({ message: error.message || '交易失败' }); }
  };
}
auctionRouter.get('/', route(async () => {
  const rows = await db.all(`SELECT a.id AS listingId,a.item_id AS itemId,a.count,a.price,a.status,a.created_at AS createdAt,
    a.seller_id AS sellerId,p.nickname AS sellerName,p.level AS sellerLevel,${CARD_COLUMNS}
    FROM auction_listings a JOIN player_profiles p ON p.user_id=a.seller_id ${CARD_JOIN}
    WHERE a.status='active' ORDER BY a.created_at DESC,a.id DESC`);
  return { ok: true, listings: rows.map(listing) };
}));
auctionRouter.get('/mine', route(async (req) => {
  const rows = await db.all(`SELECT a.id AS listingId,a.item_id AS itemId,a.count,a.price,a.status,a.created_at AS createdAt,
    a.seller_id AS sellerId,${CARD_COLUMNS} FROM auction_listings a ${CARD_JOIN}
    WHERE a.seller_id=? ORDER BY a.created_at DESC,a.id DESC`, [req.user.id]);
  return { ok: true, listings: rows.map(listing) };
}));
auctionRouter.get('/my-items', route(async (req) => ({ ok: true, items: await db.all(`SELECT item_id AS itemId,SUM(count) AS count FROM player_items
  WHERE user_id=? AND is_bound=0 AND count>0 GROUP BY item_id ORDER BY item_id`, [req.user.id]) })));
auctionRouter.get('/my-cards', route(async (req) => {
  const rows = await db.all(`SELECT pc.id,pc.slot_index AS slotIndex,pc.card_id AS cardId,pc.star,pc.craft_quality AS craftQuality,ps.state_json AS stateJson
    FROM player_cards pc LEFT JOIN player_card_instance_state ps ON ps.user_id=pc.user_id AND ps.slot_index=pc.slot_index
    WHERE pc.user_id=? ORDER BY pc.slot_index`, [req.user.id]);
  return { ok: true, cards: rows.filter((row) => !extra(row).bound).map((row) => ({ ...cardFields(row), slotIndex: Number(row.slotIndex), count: 1, saleKey: saleKey(row) })) };
}));
auctionRouter.post('/', route(async (req) => transaction(async (conn) => {
  const userId = req.user.id;
  const price = integer(req.body.price, 1, 1e9, '总价');
  await lockPlayers(conn, [userId]);
  let card = null;
  let itemId, count;
  if (req.body.kind === 'card') {
    const slotIndex = integer(req.body.slotIndex, 0, 499, '卡牌位置');
    await conn.run('UPDATE player_cards SET star=star WHERE user_id=? AND slot_index=?', [userId, slotIndex]);
    card = await conn.get(`SELECT pc.id,pc.card_id AS cardId,pc.star,pc.craft_quality AS craftQuality,ps.state_json AS stateJson
      FROM player_cards pc LEFT JOIN player_card_instance_state ps ON ps.user_id=pc.user_id AND ps.slot_index=pc.slot_index
      WHERE pc.user_id=? AND pc.slot_index=?`, [userId, slotIndex]);
    if (!card || saleKey(card) !== req.body.saleKey) throw new Error('卡牌已发生变化，请刷新后重新选择');
    if (extra(card).bound) throw new Error('绑定卡牌不能寄售');
    const equipped = await conn.get('SELECT dc.card_id FROM deck_cards dc JOIN player_decks d ON d.id=dc.deck_id WHERE d.user_id=? AND dc.card_id=?', [userId, card.cardId]);
    const owned = await conn.get('SELECT COUNT(*) AS count FROM player_cards WHERE user_id=? AND card_id=?', [userId, card.cardId]);
    if (equipped && Number(owned.count) <= 1) throw new Error('请先从战团移除这张卡牌再寄售');
    itemId = Number(card.cardId); count = 1;
    await conn.run('DELETE FROM player_card_instance_state WHERE user_id=? AND slot_index=?', [userId, slotIndex]);
    await conn.run('DELETE FROM player_cards WHERE user_id=? AND slot_index=?', [userId, slotIndex]);
  } else {
    itemId = integer(req.body.itemId, 1, 100000, '道具'); count = integer(req.body.count, 1, 10000, '数量');
    const changed = await conn.run('UPDATE player_items SET count=count-? WHERE user_id=? AND item_id=? AND is_bound=0 AND count>=?', [count, userId, itemId, count]);
    if (Number(changed.changes ?? changed.affectedRows) !== 1) throw new Error('你的非绑定道具不足');
  }
  const created = await conn.run("INSERT INTO auction_listings(seller_id,item_id,count,price,status) VALUES(?,?,?,?,'active')", [userId, itemId, count, price]);
  const listingId = Number(created.lastInsertRowid ?? created.insertId);
  if (card) await conn.run('INSERT INTO auction_card_escrow(listing_id,card_id,star,craft_quality,state_json) VALUES(?,?,?,?,?)', [listingId, card.cardId, card.star, card.craftQuality, card.stateJson || '{}']);
  return { ok: true, listingId, kind: card ? 'card' : 'item' };
})));
async function completeListing(req, buy) {
  const id = integer(buy ? req.body.listingId : req.params.id, 1, 2147483647, '寄售编号');
  return transaction(async (conn) => {
    await conn.run('UPDATE auction_listings SET price=price WHERE id=?', [id]);
    const row = await conn.get(`SELECT a.*,${CARD_COLUMNS} FROM auction_listings a ${CARD_JOIN} WHERE a.id=?`, [id]);
    if (!row || row.status !== 'active') throw new Error('寄售已售出或已取回，请刷新列表');
    if (buy && Number(row.seller_id) === req.user.id) throw new Error('不能购买自己的寄售');
    if (!buy && Number(row.seller_id) !== req.user.id) throw new Error('只能取回自己的寄售');
    await lockPlayers(conn, [req.user.id, row.seller_id]);
    if (buy) {
      const changed = await conn.run('UPDATE player_profiles SET gold=gold-?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND gold>=?', [row.price, req.user.id, row.price]);
      if (Number(changed.changes ?? changed.affectedRows) !== 1) throw new Error('金币不足');
    }
    if (row.cardId != null) await restoreCard(conn, req.user.id, row);
    else await addItem(conn, req.user.id, Number(row.item_id), Number(row.count));
    if (buy) await conn.run('UPDATE player_profiles SET gold=gold+?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?', [row.price, row.seller_id]);
    await conn.run('UPDATE auction_listings SET status=? WHERE id=?', [buy ? 'sold' : 'cancelled', id]);
    return { ok: true, kind: row.cardId != null ? 'card' : 'item' };
  });
}
auctionRouter.post('/buy', route((req) => completeListing(req, true)));
auctionRouter.delete('/:id', route((req) => completeListing(req, false)));
