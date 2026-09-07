import { Router } from 'express';
import { db, withTransaction } from '../database.js';
import { requireAuth } from '../middleware/auth.js';

export const economyAuthorityRouter20260907 = Router();
economyAuthorityRouter20260907.use(requireAuth);

function clampReward(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1000000, Math.min(1000000, Math.floor(n)));
}

economyAuthorityRouter20260907.post('/reward', async (req, res) => {
  const amount = clampReward(req.body.amount);
  if (!amount) return res.status(400).json({ message: '奖励数量无效' });

  const wallet = await withTransaction(async (conn) => {
    await conn.run(
      'UPDATE player_profiles SET gold=MAX(0,gold+?), updated_at=CURRENT_TIMESTAMP WHERE user_id=?',
      [amount, req.user.id],
    );
    return conn.get('SELECT gold FROM player_profiles WHERE user_id=?', [req.user.id]);
  });

  return res.json({ ok: true, gold: Number(wallet?.gold ?? 0) });
});
