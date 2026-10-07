/**
 * 主城后台资源预热（2026-10-07）
 *
 * 用户现象：挂到远程服务器后，**每次进战斗都像重新加载一遍**资源。
 * 原因：战斗资源是"进战斗时才按需请求"的 —— `BattleRenderer.preloadForEngine` 是 `void` 调用
 *      （不挡开打），本地开发（dev 同机）看不出来，走网络就很明显。
 * 做法：玩家待在主城时，用空闲时间把"进战斗一定会用到"的资源先下好。
 *
 * 为什么预热真的有用（不是白下载）：
 *   · `src/core/SpriteAtlas.js` 的缓存是**模块级 Map** → 跨 renderer 实例共享；
 *   · `unitAnimPlayer` / `skillAnimPlayer` 都是**单例**；
 *   → 主城预热过的包，进战斗直接命中内存缓存，一个请求都不发。
 *   · 图集那类实例级缓存（`effectAtlasImage` 等）至少也能命中浏览器 HTTP 缓存。
 *
 * 预热内容：
 *   A. 战斗图集(parts / effect / item) + 4 个全局状态特效包(freeze/vertigo/bump/qualityLightCircle)
 *   B. 全部 28 个子弹动画包（≈6MB，敌人开火也用这些包）
 *   C. 玩家**当前出战卡组**：单位动画 + 子弹 + 卡面 + 英雄技能动画
 *   D. 关键音频（BGM / 常用音效）
 * 不预热：全部单位动画（158 张 ≈156MB）、全部背景（≈67MB）—— 太大，按需加载即可。
 *   （要放开的话改下面的 `ASSET_WARMUP_20261007.extraRes`。）
 */
import { BattleRenderer } from '../battle/BattleRenderer.js';
import { unitAnimPlayer } from '../battle/UnitAnimPlayer.js';
import { skillAnimPlayer } from '../battle/SkillAnimPlayer.js';
import { preloadPresentationAtlas } from '../battle/UnitFramePresentation.js';
import { loadBattleDeckSlots20260911 } from './DeckGroupPreference20260911.js';

const PATCH_FLAG = Symbol.for('clbwz.assetWarmup20261007');
const RUN_FLAG = Symbol.for('clbwz.assetWarmup20261007.running');

export const ASSET_WARMUP_20261007 = Object.freeze({
  /** assets/sprites/bullets/anim/*.json —— 目前共 28 个包，新增包时补进来即可 */
  bulletAnimRes: Object.freeze([
    '1', '4', '9', '10', '14', '17', '18', '20', '25', '46', '47', '48', '50', '54',
    '58', '63', '70', '72', '76', '82', '83', '84', '91', '92', '98', '104', '115', '118',
  ]),
  globalFx: Object.freeze(['freeze', 'vertigo', 'bump', 'qualityLightCircle']),
  audio: Object.freeze([
    '/assets/sound/music/scene.mp3',
    '/assets/sound/music/battle.mp3',
    '/sound/effect/global/clickCard.mp3',
    '/sound/effect/global/win.mp3',
    '/sound/effect/global/lose.mp3',
    '/sound/button/sure.mp3',
    '/sound/button/normalButton.mp3',
  ]),
  /** 想额外预热的卡（比如"这一关的敌人"），填 card_id 或 spriteRes 都行 */
  extraRes: Object.freeze([]),
  concurrency: 3,
  /** 进主城后等这么久再开始，别和首屏抢带宽 */
  startDelayMs: 1500,
});

const report = {
  started: false, done: false, skipped: null,
  files: 0, failed: 0, ms: 0, steps: [],
};

function app() { return globalThis.__clbwzAppInstance ?? null; }

/** 简单并发池：一次最多 limit 个任务 */
async function pool(items, limit, worker) {
  const queue = [...items];
  const runners = Array.from({ length: Math.max(1, Math.min(limit, queue.length)) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      try { await worker(item); } catch { report.failed += 1; }
    }
  });
  await Promise.all(runners);
}

/** 子步骤失败不影响其它步骤（预热是"锦上添花"，绝不能把主界面搞崩） */
async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    report.steps.push({ name, ok: true, ms: Date.now() - t0 });
  } catch (error) {
    report.failed += 1;
    report.steps.push({ name, ok: false, ms: Date.now() - t0, error: String(error?.message || error) });
  }
}

/** 音频不走 <audio>（会真播），只把字节预取进 HTTP 缓存 */
async function warmAudio(urls) {
  await pool(urls, 2, async (url) => {
    const res = await fetch(url, { cache: 'force-cache' });
    if (res.ok) report.files += 1;
  });
}

function cardOf(instance, slot) {
  if (slot == null) return null;
  if (typeof slot === 'object') {
    const id = Number(slot.cardId ?? slot.card_id ?? slot.id);
    return Number.isFinite(id) ? instance.db?.getById?.(id) ?? null : null;
  }
  const bagSlot = instance.cardInventory?.getSlots?.()?.[Number(slot)];
  const id = Number(bagSlot?.cardId ?? bagSlot?.card_id);
  return Number.isFinite(id) ? instance.db?.getById?.(id) ?? null : null;
}

export async function runAssetWarmup20261007({ force = false } = {}) {
  if (typeof document === 'undefined') return report;
  if (globalThis[RUN_FLAG] && !force) return report;
  const instance = app();
  if (!instance?.db) return report;

  // 省流模式 / 2G 网络就别预热了（force 可强制跑，验证脚本用）
  const connection = globalThis.navigator?.connection;
  if (!force && (connection?.saveData === true || /(^|-)2g$/i.test(String(connection?.effectiveType ?? '')))) {
    report.skipped = 'saveData/2g';
    return report;
  }

  globalThis[RUN_FLAG] = true;
  report.started = true;
  const t0 = Date.now();
  const cfg = ASSET_WARMUP_20261007;

  const renderer = new BattleRenderer(document.createElement('canvas'));

  // A. 图集 + 全局特效
  await step('atlas:parts', () => renderer.preloadParts());
  await step('atlas:effect', () => renderer.requestEffectAtlas());
  await step('atlas:item', () => renderer.requestItemAtlas());
  await step('atlas:presentation', () => preloadPresentationAtlas());
  await step('fx:global', () => Promise.all(cfg.globalFx.map((name) => renderer.requestGlobalFx(name))));

  // B. 全部子弹动画包
  await step('bullets:all', () => pool(cfg.bulletAnimRes, cfg.concurrency, (res) => renderer.requestBulletAnim(res)));

  // C. 出战卡组 + 英雄技能
  await step('deck:units', async () => {
    const deckSlots = loadBattleDeckSlots20260911(instance.cardInventory, instance.db) ?? [];
    const resSet = new Set();
    for (const slot of deckSlots) {
      const card = cardOf(instance, slot);
      if (card?.spriteRes != null) resSet.add(String(card.spriteRes));
    }
    for (const extra of cfg.extraRes) {
      const card = instance.db.getById?.(extra);
      resSet.add(String(card?.spriteRes ?? extra));
    }
    if (!resSet.size) return;
    await unitAnimPlayer.preload(resSet);
    await pool([...resSet], cfg.concurrency, async (res) => {
      await renderer.requestSprite(res);
      await renderer.requestBullet(res);
    });
  });
  await step('deck:skills', async () => {
    // heroSkills 是 HeroSkillStore（App.js:84），技能 id 得从 getLoadout() 取；
    // globalThis.__clbwzHeroSkills 挂的也是同一个 store 实例（PvpAuthoritySyncFinal），不是数组。
    const store = instance.heroSkills ?? globalThis.__clbwzHeroSkills ?? null;
    const raw = typeof store?.getLoadout === 'function' ? store.getLoadout() : store?.loadout;
    const skills = (Array.isArray(raw) ? raw : []).filter(Boolean);
    if (skills.length) await skillAnimPlayer.preload(skills);
  });

  // D. 关键音频
  await step('audio', () => warmAudio(cfg.audio));

  report.done = true;
  report.ms = Date.now() - t0;
  return report;
}

export function installAssetWarmup20261007() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  // 进主城后延迟开跑：先让首屏（主城立绘/BGM）抢到带宽
  const schedule = () => {
    const kick = () => { void runAssetWarmup20261007(); };
    if (typeof globalThis.requestIdleCallback === 'function') {
      globalThis.requestIdleCallback(() => setTimeout(kick, 200), { timeout: 4000 });
    } else {
      setTimeout(kick, ASSET_WARMUP_20261007.startDelayMs);
    }
  };

  let scheduled = false;
  const trigger = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(schedule, 0);
  };

  void import('./MainCityView.js').then(({ MainCityView }) => {
    const previousRender = MainCityView.prototype.render;
    MainCityView.prototype.render = function renderWithAssetWarmup20261007(root, ...args) {
      const result = previousRender.call(this, root, ...args);
      try { trigger(); } catch { /* 预热调度失败不影响主城 */ }
      return result;
    };
    // 已经在主城了（补丁装得比首次 render 晚）也要跑一次
    if (document.querySelector('.main-city.classic-city-screen')) trigger();
  }).catch(() => { /* 主城模块拿不到就算了 */ });

  if (typeof window !== 'undefined') {
    window.__assetWarmup20261007 = Object.freeze({
      report: () => ({ ...report, steps: [...report.steps] }),
      run: () => runAssetWarmup20261007({ force: true }),
      config: ASSET_WARMUP_20261007,
    });
  }
}
