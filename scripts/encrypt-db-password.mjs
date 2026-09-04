#!/usr/bin/env node
/**
 * 把 MySQL 密码加密成 DB_PASSWORD_ENC，避免在 .env 中保存明文密码。
 *
 * 用法:
 *   node scripts/encrypt-db-password.mjs "你的数据库密码"
 *   DB_PASSWORD="你的数据库密码" node scripts/encrypt-db-password.mjs
 *
 * 如果需要重新生成 DB_MASTER_KEY，可先执行:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 * 然后把输出写入 .env 的 DB_MASTER_KEY。
 */
import crypto from 'node:crypto';
import { encryptText } from '../server/secret.js';

const plainPassword = process.argv[2] || process.env.DB_PASSWORD;
if (!plainPassword) {
  console.error('请传入要加密的数据库密码，例如: node scripts/encrypt-db-password.mjs "mypassword"');
  process.exit(1);
}

const existingKey = process.env.DB_MASTER_KEY;
const masterKey = existingKey || crypto.randomBytes(32).toString('hex');
const encrypted = encryptText(plainPassword, masterKey);

console.log(`DB_MASTER_KEY=${masterKey}`);
console.log(`DB_PASSWORD_ENC=${encrypted}`);
if (!existingKey) {
  console.log('');
  console.log('注意: DB_MASTER_KEY 是解密密钥，不要提交到 Git；请与其他敏感环境变量一起妥善保存。');
}
