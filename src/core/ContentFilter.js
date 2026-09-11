/**
 * 2026-09-11：低俗 / 色情 / 涉政 词汇过滤。
 *
 * 设计原则：
 *  - 词表来自 **src/data/blockedWords.js**（一行一个词，可加 # 注释，直接改那个文件即可）。
 *    该文件由老 AIR 版 assets/xml/block.txt 迁入（2629 条）：原 .txt 命中 .gitignore 的
 *    `*.txt` 规则无法入库，所以换成模板字符串模块，客户端与服务端都能同步 import。
 *  - 这里仍保留一份「最小可用」内联词表做兜底，运营也可运行时追加（addBlockedWords）。
 *  - 客户端与服务端共用同一份实现（server 直接 import 本文件），保证判据只有一处。
 *  - 匹配前先做归一化：全角转半角、去空白/标点/零宽字符、英文小写、常见形近数字还原，
 *    这样「傻 逼」「傻-逼」「傻B」这类绕过写法也能命中。
 *
 * 匹配规则（重要：大词表必须区分强弱，否则日常用词会被误伤）：
 *  - 「包含匹配」：中文 ≥2 字、英文 ≥4 字母，以及少数语义明确的英文短词（见
 *    SHORT_ASCII_ALWAYS_MATCH）。字之间允许插入分隔符，所以「傻 逼」也能命中。
 *  - 「整条完全相同」：中文单字、其余英文 ≤3 字母。老词表里有 241 个中文单字
 *    （日/干/滚/插/操…）和一堆英文短词（SM/bt/com/cn/NPC…），
 *    按包含匹配会把「日记」「干活」「滚动」「SMS」「CaoCao」「com」全部误判成违规，
 *    进而把正常玩家强制改名 —— 所以这类只在该条文本就是它本身时才算命中
 *    （玩家昵称只填一个「日」、消息只发一个「SB」仍会被拦下）。
 *
 * 注意：本文件只做「包含匹配 + 屏蔽/拒绝」，不改变任何账号或存档数据；违规昵称的改名策略
 * 由登录流程 / player 路由各自实现。
 */
import { BLOCKED_WORDS_TEXT } from '../data/blockedWords.js';

/** 默认屏蔽词（最小可用兜底；大词表在 src/data/blockedWords.js）。 */
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

/**
 * 英文短词（≤3 字母）里语义明确、需要按「包含」匹配的。
 * 其余英文短词（com / cn / ur / ml / npc / t / d / u / r …）只做整条相同匹配，
 * 否则正常聊天里的 SMS、CaoCao、NPC、com 都会被拦。
 */
const SHORT_ASCII_ALWAYS_MATCH = new Set([
  'sb', 'tmd', 'nmd', 'nnd', 'jb', 'j8', 'sex', '3p',
]);

/** 解析行式词表：忽略空行与 # 注释行。 */
function parseWordListText(text) {
  return String(text ?? '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

/** src/data/blockedWords.js 里的词（解析一次）。 */
const FILE_BLOCKED_WORDS = Object.freeze(parseWordListText(BLOCKED_WORDS_TEXT));

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
    const raw = String(word ?? '').trim();
    if (raw) EXTRA_BLOCKED_WORDS.add(raw);
  }
  buildMatchers();
  return EXTRA_BLOCKED_WORDS.size;
}

/** 全部生效的词（未归一化的原始写法，便于日志/后台展示）。 */
export function getBlockedWords() {
  const all = new Set();
  for (const word of [...DEFAULT_BLOCKED_WORDS, ...FILE_BLOCKED_WORDS, ...EXTRA_BLOCKED_WORDS]) {
    const raw = String(word ?? '').trim();
    if (raw) all.add(raw);
  }
  return [...all];
}

const CJK_CHAR_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const isAsciiWord = (word) => /^[\x21-\x7e]+$/.test(word);

/**
 * 把词表分成三档（见文件头说明）：
 *  - substring: 归一化后做包含匹配（允许字间分隔符）
 *  - exact:     整条文本完全相同才算命中
 * extraWords 参与同样的分档，但每次调用单独构建（运营临时加词用）。
 */
function classifyWords(words) {
  const substring = [];
  const exact = [];
  const seen = new Set();
  const exactSeen = new Set();
  for (const rawWord of words) {
    const raw = String(rawWord ?? '').trim();
    if (!raw) continue;
    const normalized = normalizeForFilter(raw);
    if (!normalized) continue;
    // 老词表里混进了 T / D / U / R 这类单字母噪声：任何消息只要正好是这一个字母就会被拦，
    // 没有实际过滤价值，直接丢弃。
    if (/^[a-z]$/.test(normalized)) continue;
    const cjk = CJK_CHAR_RE.test(normalized);
    const ascii = isAsciiWord(normalized);
    const strong = (cjk && normalized.length >= 2)
      || (ascii && normalized.length >= 4)
      || (ascii && SHORT_ASCII_ALWAYS_MATCH.has(normalized));
    if (strong) {
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      substring.push({ raw, normalized });
    } else {
      if (exactSeen.has(normalized)) continue;
      exactSeen.add(normalized);
      exact.push({ raw, normalized });
    }
  }
  return { substring, exact };
}

let substringMatchers = [];
let exactMatchers = [];
let matchByNormalized = new Map();

/** 构建/重建匹配表（词表变化时调用）。 */
function buildMatchers() {
  const { substring, exact } = classifyWords(getBlockedWords());
  substringMatchers = substring;
  exactMatchers = exact;
  matchByNormalized = new Map([
    ...substring.map((item) => [item.normalized, item]),
    ...exact.map((item) => [item.normalized, item]),
  ]);
}

buildMatchers();

/**
 * 返回命中的屏蔽词（原始写法），没有返回 null。
 *
 * extraWords 只对本次调用生效（用于调用方按场景临时加词）。
 */
export function findBlockedWord(text, extraWords = null) {
  const original = String(text ?? '');
  if (!original) return null;
  const haystack = normalizeForFilter(original);
  if (!haystack) return null;

  const extra = extraWords?.length ? classifyWords(extraWords) : null;
  const substringList = extra ? [...extra.substring, ...substringMatchers] : substringMatchers;
  const exactList = extra ? [...extra.exact, ...exactMatchers] : exactMatchers;

  for (const { raw, normalized } of substringList) {
    if (haystack.includes(normalized)) return raw;
  }
  // 短词只在「整条就是它」时命中：避免 日→日记、干→干活、SB→SMS、com→comment 之类误伤。
  for (const { raw, normalized } of exactList) {
    if (haystack === normalized) return raw;
  }
  return null;
}

export function containsBlockedWord(text, extraWords = null) {
  return Boolean(findBlockedWord(text, extraWords));
}

/** 词 → 「字之间允许插入分隔符」的正则，缓存复用（大词表不能每条消息重建）。 */
const maskPatternCache = new Map();

function maskPatternFor(word) {
  let pattern = maskPatternCache.get(word);
  if (pattern !== undefined) return pattern;
  const chars = [...word].map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  pattern = chars.length ? chars.join('[\\s\\u200b\\-_.·,，。!！?？]*') : null;
  maskPatternCache.set(word, pattern);
  return pattern;
}

/**
 * 把文本里的屏蔽词替换成掩码字符，用于「接收到的消息」显示兜底。
 * 用「字符之间允许插入分隔符」的正则，兼容 傻 逼 / 傻-逼 这类写法。
 *
 * 性能：先用归一化包含匹配找出「确实出现了的词」，只为这些词跑正则，
 * 大词表（2600+）下每条消息只编译/执行极少数正则。
 */
export function maskBlockedWords(text, { mask = '＊', extraWords = null } = {}) {
  let out = String(text ?? '');
  if (!out) return out;
  const haystack = normalizeForFilter(out);
  if (!haystack) return out;

  const extra = extraWords?.length ? classifyWords(extraWords) : null;
  const substringList = extra ? [...extra.substring, ...substringMatchers] : substringMatchers;
  const exactList = extra ? [...extra.exact, ...exactMatchers] : exactMatchers;

  const hits = [];
  for (const item of substringList) {
    if (haystack.includes(item.normalized)) hits.push(item.raw);
  }
  for (const item of exactList) {
    if (haystack === item.normalized) hits.push(item.raw);
  }
  if (!hits.length) return out;

  // 长词优先，避免「傻逼逼」这类先被短词切开。
  hits.sort((a, b) => b.length - a.length);
  for (const word of hits) {
    const pattern = maskPatternFor(word);
    if (!pattern) continue;
    try {
      out = out.replace(new RegExp(pattern, 'gi'), mask.repeat([...word].length));
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
