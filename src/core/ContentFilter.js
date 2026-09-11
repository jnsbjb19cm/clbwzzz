/**
 * 2026-09-11：低俗 / 色情 / 涉政 词汇过滤。
 *
 * 设计原则：
 *  - **不读取 block.txt**（按用户要求；读取外部词表这条链路被绕开，避免触发 401）。
 *  - 词表内置一份「最小可用」默认值，运营可以在运行时继续追加（见 addBlockedWords / EXTRA）。
 *  - 客户端与服务端共用同一份实现（server 直接 import 本文件），保证判据只有一处。
 *  - 匹配前先做归一化：全角转半角、去空白/标点/零宽字符、英文小写、常见形近数字还原，
 *    这样「傻 逼」「傻-逼」「傻B」这类绕过写法也能命中。
 *
 * 注意：本文件只做「包含匹配 + 屏蔽/拒绝」，不改变任何账号或存档数据；违规昵称的改名策略
 * 由登录流程 / player 路由各自实现。
 */

/** 默认屏蔽词（最小可用，可扩展）。 */
const DEFAULT_BLOCKED_WORDS = Object.freeze([
  // 低俗 / 人身攻击
  '傻逼', '傻b', '沙比', '煞笔', '傻叉', '蠢货', '贱人', '贱货', '畜生', '杂种',
  '王八蛋', '狗东西', '死全家', '滚你妈', '妈的', '你妈', '草泥马', '操你', '干你',
  '智障', '脑残', '废物', '垃圾玩意',
  // 色情 / 露骨
  '色情', '做爱', '性爱', '裸聊', '援交', '一夜情', '约炮', '嫖娼', '卖淫', '黄片',
  '成人片', '自慰', '肉棒', '阴道',
  // 涉政 / 违法（示例占位，运营可继续追加）
  '法轮功', '台独', '港独', '疆独', '藏独', '反党', '反华', '颠覆国家', '煽动颠覆',
  '暴力革命', '邪教',
  // 广告 / 诈骗常见词
  '加微信', '加qq', '代充', '刷单', '博彩', '赌博', '私彩', '开挂', '外挂',
]);

const EXTRA_BLOCKED_WORDS = new Set();

/** 归一化：全角→半角、小写、去空白与常见分隔符、还原形近字符。 */
export function normalizeForFilter(text) {
  let s = String(text ?? '');
  if (!s) return '';
  try {
    s = s.normalize('NFKC');
  } catch {
    /* 老浏览器忽略 */
  }
  s = s.toLowerCase();
  // 常见形近替换（英文/数字 -> 字母）
  s = s
    .replace(/[@ａ]/g, 'a')
    .replace(/[0ｏ]/g, 'o')
    .replace(/[1ｉ!|]/g, 'i')
    .replace(/[3ｅ]/g, 'e')
    .replace(/[4]/g, 'a')
    .replace(/[5$ｓ]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[8]/g, 'b');
  // 去掉所有空白、标点、零宽字符
  s = s.replace(/[\s\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\ufeff]/g, '');
  s = s.replace(/[.,!?;:'"`~^&*_\-+=/\\()[\]{}<>，。！？；：、“”‘’《》【】（）…—·|]/g, '');
  return s;
}

/** 追加自定义屏蔽词（服务端/客户端都可调用）。 */
export function addBlockedWords(words = []) {
  for (const word of words) {
    const normalized = normalizeForFilter(word);
    if (normalized) EXTRA_BLOCKED_WORDS.add(normalized);
  }
  return EXTRA_BLOCKED_WORDS.size;
}

export function getBlockedWords() {
  const all = new Set(DEFAULT_BLOCKED_WORDS.map((w) => normalizeForFilter(w)).filter(Boolean));
  for (const word of EXTRA_BLOCKED_WORDS) all.add(word);
  return [...all];
}

/** 返回命中的屏蔽词（原始文本里能找到的第一个），没有返回 null。 */
export function findBlockedWord(text, extraWords = null) {
  const haystack = normalizeForFilter(text);
  if (!haystack) return null;
  const words = extraWords?.length
    ? [...getBlockedWords(), ...extraWords.map((w) => normalizeForFilter(w)).filter(Boolean)]
    : getBlockedWords();
  for (const word of words) {
    if (word && haystack.includes(word)) return word;
  }
  return null;
}

export function containsBlockedWord(text, extraWords = null) {
  return Boolean(findBlockedWord(text, extraWords));
}

/**
 * 把文本里的屏蔽词替换成掩码字符，用于「接收到的消息」显示兜底。
 * 用「字符之间允许插入分隔符」的正则，兼容 傻 逼 / 傻-逼 这类写法。
 */
export function maskBlockedWords(text, { mask = '＊', extraWords = null } = {}) {
  let out = String(text ?? '');
  if (!out) return out;
  const words = extraWords?.length ? [...DEFAULT_BLOCKED_WORDS, ...extraWords] : DEFAULT_BLOCKED_WORDS;
  for (const word of words) {
    const raw = String(word ?? '').trim();
    if (!raw) continue;
    const chars = [...raw].map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!chars.length) continue;
    const pattern = chars.join('[\\s\\u200b\\-_.·,，。!！?？]*');
    try {
      out = out.replace(new RegExp(pattern, 'gi'), mask.repeat(chars.length));
    } catch {
      // 单个词失败不影响其它词
    }
  }
  return out;
}

/** 昵称规则：去首尾空白后 1~20 字符，且不含屏蔽词。 */
export function validateNickname(name) {
  const value = String(name ?? '').trim();
  if (value.length < 1 || value.length > 20) {
    return { ok: false, reason: 'length', message: '游戏昵称长度必须为1到20个字符' };
  }
  const hit = findBlockedWord(value);
  if (hit) return { ok: false, reason: 'blocked', message: '昵称包含违规词汇，请重新输入' };
  return { ok: true, value };
}

const FALLBACK_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 违规昵称的兜底名：违规昵称 + 6 位随机字符。 */
export function randomFallbackNickname(prefix = '违规昵称') {
  let suffix = '';
  const rand = (max) => {
    if (globalThis.crypto?.getRandomValues) {
      const buf = new Uint32Array(1);
      globalThis.crypto.getRandomValues(buf);
      return buf[0] % max;
    }
    return Math.floor(Math.random() * max);
  };
  for (let i = 0; i < 6; i += 1) suffix += FALLBACK_ALPHABET[rand(FALLBACK_ALPHABET.length)];
  return `${prefix}${suffix}`;
}

export const CONTENT_FILTER_DEFAULT_WORDS = DEFAULT_BLOCKED_WORDS;
