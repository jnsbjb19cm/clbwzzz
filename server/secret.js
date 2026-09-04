import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const PREFIX = 'v1';

function deriveKey(secret) {
  if (!secret || typeof secret !== 'string' || secret.length < 8) {
    throw new Error('DB_MASTER_KEY 至少需要 8 个字符，建议使用 24 位以上随机字符串');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptText(plain, secretKey) {
  const key = deriveKey(secretKey);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plain), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX,
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64'),
  ].join('.');
}

export function decryptText(payload, secretKey) {
  const parts = String(payload || '').split('.');
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error('无法解析加密数据，请确认 DB_PASSWORD_ENC 格式');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const key = deriveKey(secretKey);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
