import { Router } from 'express';
import { db, withTransaction } from '../database.js';
import { requireAuth } from '../middleware/auth.js';
import { isOnline } from '../online.js';

export const auctionRouter = Router();
auctionRouter.use(requireAuth);

function clampInt(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

async function addNonBoundItem(conn, userId, itemId, count) {
  if (!Number.isInteger(itemId) || itemId <= 0 || count <= 0) return;
  const existing = await conn.get(
    'SELECT * FROM player_items WHERE user_id=? AND item_id=? AND is_bound=0',
    [userId, itemId],
  );
  if (existing) {
    await conn.run('UPDATE player_items SET count=count+? WHERE user_id=? AND item_id=? AND is_bound=0', [count, userId, itemId]);
  } else {
    await conn.run('INSERT INTO player_items(user_id,item_id,count,is_bound) VALUES(?,?,?,0)', [userId, itemId, count]);
  }
}

auctionRouter.get('/', async (req, res) => {
  const rows = await db.all(`
    SELECT a.id AS listingId, a.item_id AS itemId, a.count, a.price,
           a.created_at AS createdAt,
           u.id AS sellerId, p.nickname AS sellerName, p.level AS sellerLevel
    FROM auction_listings a
    JOIN users u ON u.id=a.seller_id
    JOIN player_profiles p ON p.user_id=a.seller_id
    WHERE a.status='active'
    ORDER BY a.created_at DESC
    LIMIT 100
  `);
  return res.json({
    ok: true,
    listings: rows.map((row) => ({ ...row, sellerOnline: isOnline(row.sellerId) })),
  });
});

auctionRouter.get('/mine', async (req, res) => {
  const rows = await db.all(`
    SELECT id AS listingId, item_id AS itemId, count, price, status, created_at AS createdAt
    FROM auction_listings
    WHERE seller_id=?
    ORDER BY created_at DESC
  `, [req.user.id]);
  return res.json({ ok: true, listings: rows });
});

auctionRouter.get('/my-items', async (req, res) => {
  const rows = await db.all(`
    SELECT item_id AS itemId, SUM(count) AS count
    FROM player_items
    WHERE user_id=? AND is_bound=0 AND count>0
    GROUP BY item_id
    ORDER BY item_id
  `, [req.user.id]);
  return res.json({ ok: true, items: rows });
});

auctionRouter.post('/', async (req, res) => {
  const itemId = clampInt(req.body.itemId, 1, 100_000);
  const count = clampInt(req.body.count, 1, 10_000);
  const price = clampInt(req.body.price, 1, 1_000_000_000);
  const owned = await db.get(
    'SELECT count FROM player_items WHERE user_id=? AND item_id=? AND is_bound=0',
    [req.user.id, itemId],
  );
  if (!owned || Number(owned.count) < count) {
    return res.status(400).json({ message: '你的非绑定道具不足' });
  }
  const listingId = await withTransaction(async (conn) => {
    await conn.run(
      'UPDATE player_items SET count=count-? WHERE user_id=? AND item_id=? AND is_bound=0',
      [count, req.user.id, itemId],
    );
    const result = await conn.run(
      'INSERT INTO auction_listings(seller_id,item_id,count,price,status) VALUES(?,?,?,?,\'active\')',
      [req.user.id, itemId, count, price],
    );
    return result.lastInsertRowid ?? result.insertId;
  });
  return res.json({ ok: true, listingId });
});

auctionRouter.post('/buy', async (req, res) => {
  const listingId = clampInt(req.body.listingId, 1, 2_000_000_000);
  const listing = await db.get(
    'SELECT * FROM auction_listings WHERE id=? AND status=\'active\'',
    [listingId],
  );
  if (!listing) return res.status(404).json({ message: '拍卖品不存在或已售出' });
  if (Number(listing.seller_id) === Number(req.user.id)) {
    return res.status(400).json({ message: '不能购买自己挂的拍卖品' });
  }
  const buyer = await db.get('SELECT gold FROM player_profiles WHERE user_id=?', [req.user.id]);
  if (!buyer || Number(buyer.gold) < Number(listing.price)) {
    return res.status(400).json({ message: '金币不足' });
  }

  await withTransaction(async (conn) => {
    await conn.run('UPDATE player_profiles SET gold=gold-?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?', [listing.price, req.user.id]);
    await conn.run('UPDATE player_profiles SET gold=gold+?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?', [listing.price, listing.seller_id]);
    await addNonBoundItem(conn, req.user.id, listing.item_id, listing.count);
    await conn.run('UPDATE auction_listings SET status=\'sold\' WHERE id=?', [listingId]);
  });
  return res.json({ ok: true, message: '购买成功' });
});

auctionRouter.delete('/:id', async (req, res) => {
  const listingId = Number(req.params.id);
  const listing = await db.get(
    'SELECT * FROM auction_listings WHERE id=? AND seller_id=? AND status=\'active\'',
    [listingId, req.user.id],
  );
  if (!listing) return res.status(404).json({ message: '拍卖品不存在或无法取消' });
  await withTransaction(async (conn) => {
    await addNonBoundItem(conn, req.user.id, listing.item_id, listing.count);
    await conn.run('UPDATE auction_listings SET status=\'cancelled\' WHERE id=?', [listingId]);
  });
  return res.json({ ok: true });
});
