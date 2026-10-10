/**
 * 2026-10-10：钻地单位规则的**纯数据存放处**（零依赖，Node 里也能安全 import）。
 *
 * 为什么单独拆一个文件：判定要能在 BattleUnit（战斗内核）里同步读取，
 * 而真正去跟服务端握手/解密的是 BurrowCipher20261010.js（会 import ApiClient，浏览器侧）。
 * 战斗内核只依赖这里，避免把网络模块拖进内核（也避免 Node 测试环境里碰 window）。
 *
 * 数据的写入方：BurrowCipher20261010.js 解密服务端下发的规则后 setBurrowRules()。
 */

/** 与服务端 BURROW_RULES 一致的兜底值（加密流程不可用时用，保证战斗照常跑）。 */
const FALLBACK_RULES = Object.freeze({
  tunnelCardIds: Object.freeze([41, 43]),
  onReturn: 'remove',
  refundOnReturn: false,
  playDeathAnimation: false,
  countAsKill: false,
});

let rules = FALLBACK_RULES;
let source = 'fallback';

export function setBurrowRules(next, from = 'server') {
  if (!next || !Array.isArray(next.tunnelCardIds)) return rules;
  rules = Object.freeze({
    tunnelCardIds: Object.freeze(next.tunnelCardIds.map(Number)),
    onReturn: String(next.onReturn ?? FALLBACK_RULES.onReturn),
    refundOnReturn: next.refundOnReturn === true,
    playDeathAnimation: next.playDeathAnimation === true,
    countAsKill: next.countAsKill === true,
  });
  source = from;
  return rules;
}

export function burrowRules() {
  return rules;
}

export function burrowRulesSource() {
  return source;
}

/** 这张卡是不是钻地单位。 */
export function isBurrowUnitCard(cardId) {
  return rules.tunnelCardIds.includes(Number(cardId));
}

/** 回到自家基地时该做什么：'remove' = 直接从战场移除（当前规则）。 */
export function burrowReturnAction() {
  return rules.onReturn;
}

export { FALLBACK_RULES };
