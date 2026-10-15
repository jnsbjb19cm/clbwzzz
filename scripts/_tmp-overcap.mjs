import * as dbmod from '../server/database.js';
const mod = dbmod.default ?? dbmod; const db = mod.db ?? mod;
const all = (sql, p = []) => (typeof db.all === 'function' ? db.all(sql, p) : db.query(sql, p).then((r) => r[0]));
const CAP = { 1: 4, 2: 7, 3: 10, 4: 13, 5: 15, 6: 15 };
// 拿卡牌等级表
import { readFileSync } from 'node:fs';
const list = JSON.parse(readFileSync('src/data/card.json', 'utf8'));
const cards = Array.isArray(list) ? list : list.cards;
const levelOf = new Map(cards.map((c) => [Number(c.card_id), Math.max(1, Math.min(6, Number(c.card_quality) || 1))]));
const rows = await all('SELECT user_id AS uid, card_id AS cid, star FROM player_cards');
let over = 0; const byLevel = {}; const samples = [];
for (const r of rows) {
  const lv = levelOf.get(Number(r.cid)) ?? 5;
  const cap = CAP[lv] ?? 15;
  const star = Math.max(0, Number(r.star) || 0);
  if (star > cap) {
    over += 1;
    byLevel[lv] = (byLevel[lv] || 0) + 1;
    if (samples.length < 8) samples.push(`#${r.cid}(等级${lv}) ${star}星 > 上限${cap} · 玩家 ${r.uid}`);
  }
}
console.log('  全库卡牌总数:', rows.length, '| 超过新上限的:', over, '张');
console.log('  按等级分布:', JSON.stringify(byLevel));
for (const s of samples) console.log('   例:', s);
process.exit(0);
