import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, createPlayerData } from '../database.js';
import { config } from '../config.js';
/* 此为用户注册 / 登录 / 密码找回 auth.js */
export const authRouter = Router();

let recoveryTableReady = null;

function token(user) {
  return jwt.sign({ id: user.id }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

function normalizeRecoveryCode(value) {
  const compact = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return compact ? compact.match(/.{1,4}/g).join('-') : '';
}

function createRecoveryCode() {
  const raw = crypto.randomBytes(9).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const safe = raw.padEnd(12, 'X').slice(0, 12);
  return safe.match(/.{1,4}/g).join('-');
}

async function ensureRecoveryTable() {
  if (!recoveryTableReady) {
    recoveryTableReady = db.run(`
      CREATE TABLE IF NOT EXISTS account_recovery (
        user_id BIGINT PRIMARY KEY,
        recovery_hash VARCHAR(255) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).catch((error) => {
      recoveryTableReady = null;
      throw error;
    });
  }
  await recoveryTableReady;
}

async function saveRecoveryCode(userId, recoveryCode) {
  await ensureRecoveryTable();
  const recoveryHash = await bcrypt.hash(normalizeRecoveryCode(recoveryCode), config.bcryptRounds);
  const exists = await db.get('SELECT user_id FROM account_recovery WHERE user_id=?', [userId]);
  if (exists) {
    await db.run(
      'UPDATE account_recovery SET recovery_hash=?, created_at=CURRENT_TIMESTAMP WHERE user_id=?',
      [recoveryHash, userId],
    );
  } else {
    await db.run(
      'INSERT INTO account_recovery(user_id,recovery_hash) VALUES(?,?)',
      [userId, recoveryHash],
    );
  }
}

async function issueRecoveryCode(userId) {
  const recoveryCode = createRecoveryCode();
  await saveRecoveryCode(userId, recoveryCode);
  return recoveryCode;
}

async function issueRecoveryCodeIfMissing(userId) {
  await ensureRecoveryTable();
  const exists = await db.get('SELECT user_id FROM account_recovery WHERE user_id=?', [userId]);
  if (exists) return '';
  return issueRecoveryCode(userId);
}

authRouter.post('/register', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  if (username.length < 3 || password.length < 6) {
    return res.status(400).json({ message: '账号或密码长度错误' });
  }
  const exists = await db.get('SELECT id FROM users WHERE username=?', [username]);
  if (exists) return res.status(409).json({ message: '用户名已存在' });

  const hash = await bcrypt.hash(password, config.bcryptRounds);
  const result = await db.run('INSERT INTO users(username,password_hash) VALUES(?,?)', [username, hash]);
  const userId = Number(result.lastInsertRowid);
  // 不再要求单独填写名字；游戏昵称默认就是账号名，之后可在人物资料里改名。
  await createPlayerData(userId, username);
  const recoveryCode = await issueRecoveryCode(userId);
  const user = { id: userId, username };
  return res.json({ token: token(user), user, recoveryCode });
});

authRouter.post('/login', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const user = await db.get('SELECT * FROM users WHERE username=?', [username]);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ message: '账号或密码错误' });
  }
  await db.run('UPDATE users SET last_login=CURRENT_TIMESTAMP WHERE id=?', [user.id]);

  // 老账号升级到新版本时，如果还没有恢复码，只在这一次登录时发一个给用户保存。
  const recoveryCode = await issueRecoveryCodeIfMissing(user.id);
  return res.json({
    token: token(user),
    user: { id: user.id, username: user.username },
    ...(recoveryCode ? { recoveryCode } : {}),
  });
});

authRouter.post('/forgot-password/reset', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const recoveryCode = normalizeRecoveryCode(req.body.recoveryCode);
  const newPassword = String(req.body.newPassword || '');

  if (username.length < 3 || recoveryCode.length < 8 || newPassword.length < 6) {
    return res.status(400).json({ message: '账号、恢复码或新密码格式不正确' });
  }

  await ensureRecoveryTable();
  const user = await db.get('SELECT id, username FROM users WHERE username=?', [username]);
  const recovery = user
    ? await db.get('SELECT recovery_hash FROM account_recovery WHERE user_id=?', [user.id])
    : null;
  const valid = recovery?.recovery_hash
    ? await bcrypt.compare(recoveryCode, recovery.recovery_hash)
    : false;

  if (!user || !valid) {
    return res.status(401).json({ message: '账号或恢复码错误' });
  }

  const passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds);
  await db.run('UPDATE users SET password_hash=? WHERE id=?', [passwordHash, user.id]);

  // 恢复码用过即作废，立即轮换新恢复码，防止旧恢复码被再次利用。
  const nextRecoveryCode = await issueRecoveryCode(user.id);
  return res.json({
    ok: true,
    message: '密码已重置，请使用新密码登录',
    recoveryCode: nextRecoveryCode,
  });
});
