import { Router } from 'express';
import { db, withTransaction } from '../database.js';
import { requireAuth } from '../middleware/auth.js';

export const playerStateDocumentRouter20260908 = Router();
playerStateDocumentRouter20260908.use(requireAuth);

const ALLOWED_KEYS = new Set([
  'quest',
  'hero_skills',
  'boss_progress',
  'worldmap',
  'player_meta',
]);
const MAX_STATE_JSON_BYTES = 256 * 1024;
let readyPromise = null;

async function ensureTable() {
  if (!readyPromise) {
    readyPromise = db.run(`CREATE TABLE IF NOT EXISTS player_state_documents (
      user_id BIGINT NOT NULL,
      state_key VARCHAR(64) NOT NULL,
      state_json TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_id, state_key)
    )`).catch((error) => {
      readyPromise = null;
      throw error;
    });
  }
  await readyPromise;
}

function validKey(value) {
  const key = String(value || '').trim();
  return ALLOWED_KEYS.has(key) ? key : null;
}

function normalizeState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('状态数据格式无效');
  }
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json, 'utf8') > MAX_STATE_JSON_BYTES) {
    throw new Error('状态数据过大');
  }
  return json;
}

playerStateDocumentRouter20260908.get('/state/:key', async (req, res) => {
  const key = validKey(req.params.key);
  if (!key) return res.status(400).json({ message: '状态类型无效' });
  await ensureTable();
  const row = await db.get(
    'SELECT state_json AS stateJson, updated_at AS updatedAt FROM player_state_documents WHERE user_id=? AND state_key=?',
    [Number(req.user.id), key],
  );
  if (!row) return res.json({ ok: true, key, state: null, updatedAt: null });
  try {
    return res.json({ ok: true, key, state: JSON.parse(String(row.stateJson || '{}')), updatedAt: row.updatedAt });
  } catch {
    return res.status(500).json({ message: '数据库状态损坏' });
  }
});

playerStateDocumentRouter20260908.put('/state/:key', async (req, res) => {
  const key = validKey(req.params.key);
  if (!key) return res.status(400).json({ message: '状态类型无效' });
  try {
    const json = normalizeState(req.body?.state);
    await ensureTable();
    await withTransaction(async (conn) => {
      await conn.run('DELETE FROM player_state_documents WHERE user_id=? AND state_key=?', [Number(req.user.id), key]);
      await conn.run(
        'INSERT INTO player_state_documents(user_id,state_key,state_json,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP)',
        [Number(req.user.id), key, json],
      );
    });
    return res.json({ ok: true, key });
  } catch (error) {
    return res.status(400).json({ message: error?.message || '保存状态失败' });
  }
});
