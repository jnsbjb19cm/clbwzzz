import { ApiClient } from '../network/ApiClient.js';
import { authStore } from '../core/AuthStore.js';
import {
  FALLBACK_RULES,
  burrowRules as storedBurrowRules,
  burrowRulesSource,
  setBurrowRules,
} from './BurrowRulesStore20261010.js';

/**
 * 2026-10-10（用户要求）：钻地单位（地道工兵 41 / 钻地大蒜 43）「回自家基地」判定的客户端侧。
 *
 * 规则不在客户端写死，而是：
 *   1. 跟服务端握手 `/api/player/burrow/session` 拿一把**会话密钥**（AES-256-GCM，256 位）；
 *   2. `/api/player/burrow/rules` 拿**加密**过的规则（哪些卡是钻地兵、回基地是移除还是返还）；
 *   3. 用 WebCrypto 解密后缓存明文 —— 战斗循环只读这份缓存（同步，不阻塞帧）。
 *   4. 单位真的回到基地时，再要一份**服务端结算指令**（同样加密）来确认动作。
 *
 * 诚实说明：前端要解密就必须持有密钥，所以这不是密码学意义上的绝对防破解，
 * 而是「代码里没有明文规则 + 判定在服务端」。真正防作弊的点在于**返还要认服务端的账**。
 *
 * 兜底：密钥/网络任何一步失败，都用 DEFAULT_RULES（与服务端当前规则一致），
 * 保证战斗永远不会因为加密流程卡住 —— 这是刻意的降级策略。
 */

/** ApiClient 是实例类（get/post 不是静态方法）：这里用 authStore 的 token 自建一个。 */
let api = null;
function apiClient() {
  if (!api) api = new ApiClient({ getToken: () => authStore.token });
  return api;
}

const SESSION_PATH = '/player/burrow/session';
const RULES_PATH = '/player/burrow/rules';
const RETURN_PATH = '/player/burrow/return';

const DEFAULT_RULES = FALLBACK_RULES;

let sessionKey = null;      // CryptoKey
let unlockedRules = null;   // 解密后的规则明文
let unlockPromise = null;
let lastError = null;

/* ------------------------------- AES-256-GCM 解密 ------------------------------- */

const b64ToBytes = (base64) => {
  const binary = atob(String(base64 ?? ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

async function importSessionKey(base64Key) {
  const raw = b64ToBytes(base64Key);
  if (raw.length !== 32) throw new Error('会话密钥长度不对（应为 256 位）');
  return globalThis.crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
}

/** 解开服务端下发的 { iv, tag, data } —— GCM 自带完整性校验，被改过会直接抛错。 */
async function openSealed(sealed) {
  if (!sessionKey) throw new Error('还没有会话密钥');
  if (!sealed?.iv || !sealed?.data || !sealed?.tag) throw new Error('密文格式不对');
  const plain = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(sealed.iv), tagLength: 128 },
    sessionKey,
    // WebCrypto 的 AES-GCM 约定：认证标签拼在密文尾部
    new Uint8Array([...b64ToBytes(sealed.data), ...b64ToBytes(sealed.tag)]),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

/* ---------------------------------- 对外接口 ---------------------------------- */

/**
 * 同步取规则（战斗循环用）。没解锁成功就返回兜底规则 —— 绝不返回 null 让战斗崩。
 */
export function burrowRules() {
  return unlockedRules ?? storedBurrowRules();
}



export function burrowCipherState() {
  return {
    hasSessionKey: Boolean(sessionKey),
    unlocked: Boolean(unlockedRules),
    source: burrowRulesSource(),
    rules: storedBurrowRules(),
    lastError: lastError ? String(lastError?.message ?? lastError) : null,
  };
}

/** 握手 + 拉取规则并解密（幂等；失败会记住错误并用兜底规则继续）。 */
export function unlockBurrowRules() {
  if (unlockedRules) return Promise.resolve(unlockedRules);
  if (unlockPromise) return unlockPromise;
  unlockPromise = (async () => {
    try {
      const session = await apiClient().post(SESSION_PATH, {});
      sessionKey = await importSessionKey(session?.key);
      const sealed = await apiClient().get(RULES_PATH);
      const rules = await openSealed(sealed);
      unlockedRules = setBurrowRules(rules, 'server');
      lastError = null;
      return unlockedRules;
    } catch (error) {
      // 降级：用与当前服务端一致的兜底规则，战斗照常进行
      lastError = error;
      return DEFAULT_RULES;
    } finally {
      unlockPromise = null;
    }
  })();
  return unlockPromise;
}

/**
 * 单位回到自家基地时向服务端要一份**加密结算指令**。
 * 战斗循环不等它（同步按当前规则移除），这里只用于确认与日志 ——
 * 如果服务端说「要返还」，也会以服务端为准（客户端无法自己编）。
 */
export async function requestBurrowReturnInstruction(cardId) {
  try {
    await unlockBurrowRules();
    const sealed = await apiClient().post(RETURN_PATH, { cardId: Number(cardId) });
    return await openSealed(sealed);
  } catch (error) {
    lastError = error;
    return { action: burrowRules().onReturn, refund: false, source: 'fallback' };
  }
}

/** 登录后调用（拿 token 之后再握手，否则 401）。 */
export function installBurrowCipher20261010() {
  // 不阻塞启动：后台握手即可，战斗里读不到就用兜底规则。
  Promise.resolve().then(() => unlockBurrowRules()).catch(() => {});
  if (typeof window !== 'undefined') {
    window.__burrowCipher20261010 = () => burrowCipherState();
  }
}
