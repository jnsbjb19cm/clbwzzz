import crypto from 'node:crypto';
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

/**
 * 2026-10-10（用户要求）：地道工兵 / 钻地大蒜「回到自家基地」这套判定的**服务端权威 + 强加密**版本。
 *
 * 背景：这两个单位钻到敌方后排、爬出后返回自家基地。原实现是客户端 `unit.hp = 0; alive = false;`
 * —— 看起来就是「掉血死掉」。用户要求改成**直接从战场移除**（不掉血、不播死亡动画、不计击杀）。
 * 并且这个判定要「强加密」，所以我们不把规则写死在客户端：
 *
 *   1. 规则（哪些卡是钻地兵、回基地如何处理、是否返还资源）只存在于**服务端**；
 *   2. 客户端要能执行，就必须先跟服务端握手拿一把**会话密钥**（每账号一把，12 小时轮换）；
 *   3. 之后服务端用 **AES-256-GCM** 把规则/结算指令加密下发，客户端解出来照做 ——
 *      玩家在控制台里改不了「返回基地会返还资源」这种事，因为密钥和判定都不在他手里。
 *
 * 说明（诚实交代）：客户端必须持有会话密钥才能解密，所以这是「客户端看不懂 + 改不动判定」，
 * 不是密码学意义上的绝对安全。真正的防线是：**返还/奖励只认服务端自己的账**，客户端伪造无效。
 */

export const burrowAuthorityRouter20261010 = Router();
burrowAuthorityRouter20261010.use(requireAuth);

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * 钻地单位规则（明文只在这里存在，不下发）。
 * tunnelCardIds 与数据一致：card.json 里 atkStyle=6 的正好是 41 地道工兵 / 43 钻地大蒜。
 */
export const BURROW_RULES = Object.freeze({
  tunnelCardIds: Object.freeze([41, 43]),
  onReturn: 'remove',      // 回到自家基地 → 直接从战场移除（不再掉血死亡）
  refundOnReturn: false,   // 目前不返还部署资源
  playDeathAnimation: false,
  countAsKill: false,
});

const sessions = new Map(); // userId -> { key: Buffer, createdAt }

function sessionFor(userId) {
  const id = String(userId);
  const now = Date.now();
  const existing = sessions.get(id);
  if (existing && now - existing.createdAt < SESSION_TTL_MS) return existing;
  const fresh = { key: crypto.randomBytes(32), createdAt: now };
  sessions.set(id, fresh);
  // 顺手清掉过期的（房间数量有限，不会积太多）
  for (const [key, value] of sessions) {
    if (now - value.createdAt >= SESSION_TTL_MS) sessions.delete(key);
  }
  return fresh;
}

/** AES-256-GCM 加密：返回 { iv, tag, data }（都 base64），与 server/secret.js 同一套算法。 */
function sealJson(payload, key) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return {
    v: 1,
    alg: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
}

/** 握手：发一把会话密钥。密钥单独发、不跟密文同包，避免「密钥附在密文里」等于没加密。 */
burrowAuthorityRouter20261010.post('/burrow/session', (req, res) => {
  const userId = req.user?.id ?? req.userId ?? null;
  if (userId == null) return res.status(401).json({ error: '未登录' });
  const { key } = sessionFor(userId);
  return res.json({
    key: key.toString('base64'),
    alg: 'aes-256-gcm',
    ttlMs: SESSION_TTL_MS,
  });
});

/** 下发加密后的钻地规则（客户端解密后才知道哪些卡是钻地兵、回基地怎么处理）。 */
burrowAuthorityRouter20261010.get('/burrow/rules', (req, res) => {
  const userId = req.user?.id ?? req.userId ?? null;
  if (userId == null) return res.status(401).json({ error: '未登录' });
  const { key } = sessionFor(userId);
  return res.json({ ...sealJson(BURROW_RULES, key), issuedAt: Date.now() });
});

/**
 * 结算：钻地单位回到自家基地。
 * 判定完全在服务端 —— 客户端只负责把服务端给的加密指令照做（当前 = 直接移除、不返还）。
 */
burrowAuthorityRouter20261010.post('/burrow/return', (req, res) => {
  const userId = req.user?.id ?? req.userId ?? null;
  if (userId == null) return res.status(401).json({ error: '未登录' });
  const cardId = Number(req.body?.cardId);
  const isTunnel = BURROW_RULES.tunnelCardIds.includes(cardId);
  if (!isTunnel) return res.status(400).json({ error: '该卡不是钻地单位' });
  const { key } = sessionFor(userId);
  const instruction = {
    action: BURROW_RULES.onReturn,               // 'remove'
    refund: BURROW_RULES.refundOnReturn,         // false
    playDeathAnimation: BURROW_RULES.playDeathAnimation,
    countAsKill: BURROW_RULES.countAsKill,
    cardId,
    at: Date.now(),
  };
  return res.json(sealJson(instruction, key));
});

/** 仅供排查/测试：这把密钥在服务端用，客户端拿到的只是加密结果。 */
export function burrowSessionKeyForTest(userId) {
  return sessionFor(userId).key;
}
