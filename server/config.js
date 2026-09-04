import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { decryptText } from './secret.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbClient = String(process.env.DB_CLIENT || 'sqlite').trim().toLowerCase();
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const corsAllowAll = String(process.env.CORS_ALLOW_ALL || 'false').toLowerCase() === 'true';
const corsOrigins = clientOrigin.split(',').map((value) => value.trim()).filter(Boolean);
const trustProxyRaw = String(process.env.TRUST_PROXY || 'false').toLowerCase();
const trustProxyValue = trustProxyRaw === 'true'
  ? true
  : trustProxyRaw === 'false'
    ? false
    : Number.isFinite(Number(trustProxyRaw)) && Number(trustProxyRaw) > 0
      ? Number(trustProxyRaw)
      : false;

function resolveDbPassword() {
  if (process.env.DB_PASSWORD_FILE) {
    const file = path.resolve(process.env.DB_PASSWORD_FILE);
    return fs.readFileSync(file, 'utf8').trim();
  }
  if (process.env.DB_PASSWORD_ENC) {
    if (!process.env.DB_MASTER_KEY) {
      throw new Error('设置了 DB_PASSWORD_ENC 时必须同时设置 DB_MASTER_KEY');
    }
    return decryptText(process.env.DB_PASSWORD_ENC, process.env.DB_MASTER_KEY);
  }
  return process.env.DB_PASSWORD || '';
}

export const config = Object.freeze({
  port: Number(process.env.SERVER_PORT || 3001),
  clientOrigin,
  corsOrigins,
  corsAllowAll,
  trustProxy: trustProxyValue,
  jwtSecret: process.env.JWT_SECRET || 'development-only-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  databasePath: process.env.DATABASE_PATH || path.join(__dirname, 'data', 'game.sqlite'),
  bcryptRounds: Math.max(10, Number(process.env.BCRYPT_ROUNDS || 12)),
  db: Object.freeze({
    client: dbClient,
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || 'clbwzzz',
    user: process.env.DB_USER || 'root',
    password: resolveDbPassword(),
    poolSize: Math.max(1, Number(process.env.DB_POOL_SIZE || 10)),
    connectTimeout: Math.max(1000, Number(process.env.DB_CONNECT_TIMEOUT || 10000)),
  }),
});

if (process.env.NODE_ENV === 'production' && config.jwtSecret === 'development-only-change-me') {
  throw new Error('生产环境必须设置 JWT_SECRET');
}
