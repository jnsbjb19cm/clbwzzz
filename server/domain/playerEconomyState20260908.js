import { db } from '../database.js';

const DEFAULT_ITEM_BAG_SLOTS = 120;
let readyPromise = null;

export async function ensurePlayerEconomyStateTables20260908() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await db.run(`CREATE TABLE IF NOT EXISTS player_item_bags (
        user_id BIGINT PRIMARY KEY,
        slot_count INTEGER NOT NULL DEFAULT 120
      )`);
      await db.run(`CREATE TABLE IF NOT EXISTS player_extra_resources (
        user_id BIGINT PRIMARY KEY,
        stamina INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
    })().catch((error) => {
      readyPromise = null;
      throw error;
    });
  }
  await readyPromise;
}

export async function readPlayerEconomyState20260908(userId) {
  const uid = Number(userId);
  await ensurePlayerEconomyStateTables20260908();
  let bag = await db.get('SELECT slot_count AS slotCount FROM player_item_bags WHERE user_id=?', [uid]);
  if (!bag) {
    await db.run('INSERT INTO player_item_bags(user_id,slot_count) VALUES(?,?)', [uid, DEFAULT_ITEM_BAG_SLOTS]);
    bag = { slotCount: DEFAULT_ITEM_BAG_SLOTS };
  }
  let extra = await db.get('SELECT stamina FROM player_extra_resources WHERE user_id=?', [uid]);
  if (!extra) {
    await db.run('INSERT INTO player_extra_resources(user_id,stamina) VALUES(?,0)', [uid]);
    extra = { stamina: 0 };
  }
  return {
    itemBag: { slotCount: Math.max(DEFAULT_ITEM_BAG_SLOTS, Number(bag.slotCount) || DEFAULT_ITEM_BAG_SLOTS) },
    extraResources: { stamina: Math.max(0, Number(extra.stamina) || 0) },
  };
}
