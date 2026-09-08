import { Router } from 'express';
import { config } from '../config.js';
import { db, withTransaction } from '../database.js';
import { requireAuth } from '../middleware/auth.js';

export const questPinPersistenceRouter20260908 = Router();
questPinPersistenceRouter20260908.use(requireAuth);

const QUEST_CATEGORIES = new Set([
  'main',
  'side',
  'daily',
  'weekly',
  'achievement',
  'challenge',
  'level',
]);

let tableReady = false;
let tablePromise = null;

async function ensureQuestPinTable() {
  if (tableReady) return;
  if (!tablePromise) {
    tablePromise = (async () => {
      if (config.db.client === 'mysql') {
        await db.run(`
          CREATE TABLE IF NOT EXISTS player_quest_pins (
            user_id BIGINT NOT NULL,
            category VARCHAR(32) NOT NULL,
            quest_id VARCHAR(128) NOT NULL,
            pinned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY(user_id, category, quest_id),
            CONSTRAINT fk_quest_pins_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
      } else {
        await db.run(`
          CREATE TABLE IF NOT EXISTS player_quest_pins (
            user_id INTEGER NOT NULL,
            category TEXT NOT NULL,
            quest_id TEXT NOT NULL,
            pinned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY(user_id, category, quest_id),
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
          )
        `);
      }
      tableReady = true;
    })().catch((error) => {
      tablePromise = null;
      throw error;
    });
  }
  await tablePromise;
}

function parsePinIdentity(categoryValue, questIdValue) {
  const category = String(categoryValue || '').trim();
  const questId = String(questIdValue || '').trim();
  if (!QUEST_CATEGORIES.has(category)) {
    const error = new Error('任务分类无效');
    error.statusCode = 400;
    throw error;
  }
  if (!questId || questId.length > 128) {
    const error = new Error('任务ID无效');
    error.statusCode = 400;
    throw error;
  }
  return { category, questId };
}

async function readPins(userId) {
  await ensureQuestPinTable();
  const rows = await db.all(`
    SELECT category, quest_id AS questId, pinned_at AS pinnedAt
    FROM player_quest_pins
    WHERE user_id=?
    ORDER BY pinned_at ASC, category ASC, quest_id ASC
  `, [Number(userId)]);
  return rows.map((row) => ({
    category: String(row.category),
    questId: String(row.questId),
    pinnedAt: row.pinnedAt,
  }));
}

questPinPersistenceRouter20260908.get('/quest-pins', async (req, res) => {
  try {
    return res.json({ ok: true, pins: await readPins(req.user.id) });
  } catch (error) {
    console.error('[quest-pins] read failed', error);
    return res.status(500).json({ message: '读取任务置顶失败' });
  }
});

questPinPersistenceRouter20260908.put('/quest-pins/:category/:questId', async (req, res) => {
  try {
    await ensureQuestPinTable();
    const { category, questId } = parsePinIdentity(req.params.category, req.params.questId);
    const pinned = Boolean(req.body?.pinned);
    const userId = Number(req.user.id);

    await withTransaction(async (conn) => {
      await conn.run(
        'DELETE FROM player_quest_pins WHERE user_id=? AND category=? AND quest_id=?',
        [userId, category, questId],
      );
      if (pinned) {
        await conn.run(
          'INSERT INTO player_quest_pins(user_id,category,quest_id) VALUES(?,?,?)',
          [userId, category, questId],
        );
      }
    });

    return res.json({ ok: true, pinned, category, questId, pins: await readPins(userId) });
  } catch (error) {
    console.error('[quest-pins] write failed', error);
    return res.status(error?.statusCode || 500).json({ message: error?.message || '保存任务置顶失败' });
  }
});
