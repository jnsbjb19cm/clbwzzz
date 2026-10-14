import * as dbmod from '../server/database.js';
const mod = dbmod.default ?? dbmod;
const db = mod.db ?? mod;
const all = (sql, p = []) => (typeof db.all === 'function' ? db.all(sql, p) : db.query(sql, p).then((r) => r[0]));
// 找"拥有 126 或有较多卡"的玩家，看看服务端真实顺序
const rows = await all('SELECT user_id, COUNT(*) AS n FROM player_cards GROUP BY user_id ORDER BY n DESC LIMIT 5');
console.log('卡最多的前 5 个玩家:', rows.map((r) => '#' + r.user_id + '(' + r.n + '张)').join(' '));
const top = rows[0];
const cards = await all('SELECT slot_index AS si, card_id AS cid FROM player_cards WHERE user_id=? ORDER BY slot_index LIMIT 12', [top.user_id]);
console.log('#' + top.user_id + ' 服务端前 12:', cards.map((c) => c.cid).join(','));
for (const r of rows.slice(0, 3)) {
  const has126 = await all('SELECT 1 AS x FROM player_cards WHERE user_id=? AND card_id=126 LIMIT 1', [r.user_id]);
  const has55 = await all('SELECT 1 AS x FROM player_cards WHERE user_id=? AND card_id=55 LIMIT 1', [r.user_id]);
  console.log('  #' + r.user_id + ' 服务端有 126?', has126.length ? '有' : '没有', '| 有 55?', has55.length ? '有' : '没有');
}
process.exit(0);
