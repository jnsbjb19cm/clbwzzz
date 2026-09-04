import jwt from 'jsonwebtoken';
import { config } from '../config.js';
/*检验登录状态*/
export function readBearerToken(req) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) return '';
  return header.slice(7).trim();
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

export function requireAuth(req, res, next) {
  try {
    const token = readBearerToken(req);
    if (!token) return res.status(401).json({ message: '未登录' });
    const payload = verifyToken(token);
    req.user = { id: Number(payload.id) };
    return next();
  } catch {
    return res.status(401).json({ message: '登录状态已失效' });
  }
}
