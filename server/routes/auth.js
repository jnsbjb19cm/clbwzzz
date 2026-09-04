import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, createPlayerData } from '../database.js';
import { config } from '../config.js';
/*此为用户注册auth.js*/
export const authRouter = Router();

function token(user) {
  return jwt.sign({ id: user.id }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

authRouter.post('/register', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const nickname = String(req.body.nickname || username).trim();
  if (username.length < 3 || password.length < 6) {
    return res.status(400).json({ message: '账号或密码长度错误' });
  }
  const exists = await db.get('SELECT id FROM users WHERE username=?', [username]);
  if (exists) return res.status(409).json({ message: '用户名已存在' });
  const hash = await bcrypt.hash(password, config.bcryptRounds);
  const result = await db.run('INSERT INTO users(username,password_hash) VALUES(?,?)', [username, hash]);
  await createPlayerData(result.lastInsertRowid, nickname);
  const user = { id: Number(result.lastInsertRowid), username };
  res.json({ token: token(user), user });
});

authRouter.post('/login', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const user = await db.get('SELECT * FROM users WHERE username=?', [username]);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ message: '账号或密码错误' });
  }
  await db.run('UPDATE users SET last_login=CURRENT_TIMESTAMP WHERE id=?', [user.id]);
  res.json({ token: token(user), user: { id: user.id, username: user.username } });
});
