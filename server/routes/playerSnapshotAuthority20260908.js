import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getAuthoritativePlayerSnapshot20260908 } from '../domain/playerInventoryAuthority20260908.js';

export const playerSnapshotAuthorityRouter20260908 = Router();
playerSnapshotAuthorityRouter20260908.use(requireAuth);

playerSnapshotAuthorityRouter20260908.get('/snapshot', async (req, res) => {
  const snapshot = await getAuthoritativePlayerSnapshot20260908(req.user.id);
  if (!snapshot) return res.status(404).json({ message: '玩家数据不存在' });
  return res.json(snapshot);
});
