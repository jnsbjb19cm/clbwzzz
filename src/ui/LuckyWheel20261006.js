/**
 * 大厅 · 幸运大转盘 + 更新公告（2026-10-06）
 *
 * 规则（按需求）：
 *   · 位置：大厅左上角一个悬浮按钮，点开转盘。
 *   · 每天免费 1 次；做"转盘任务"还能加次数（在线时长、完成战斗、强化、材料加工）。
 *   · 顶奖合计 0.2%：完美 2~4 星卡 + 其他稀有道具，在这 0.2% 里按权重分。
 *   · 其余 99.8% 是常规奖励（金币、粉、材料、卡蛋、钻石、荣誉）。
 *
 * 抽奖用真实权重随机；中奖后按类型发放（卡 → 卡牌背包；道具 → 道具背包；货币 → 玩家）。
 */
import './LuckyWheel20261006.css';
import { MainCityView } from './MainCityView.js';
import { QuestView } from './QuestView.js';
import { authStore } from '../core/AuthStore.js';
import { itemIconMarkup } from './ItemIcon.js';
import { openUpdateLogPanel } from './UpdateLogPanel20261006.js';
import {
  DAILY_FREE_SPINS, RARE_TIER_TOTAL, WHEEL_PRIZES, WEIGHT_TOTAL, WHEEL_TASKS,
  pickWheelPrize, resolveWheelPrize, wheelAngleFor, wheelSectors,
} from '../data/LuckyWheelPrizes.js';

const PATCH_FLAG = Symbol.for('clbwz.luckyWheel20261006');
// 备用：resources/img/大转盘.png（1448x1086 整幅插画）。用户说先不用，留个开关。
// const WHEEL_ART_URL = new URL('../../resources/img/大转盘.png', import.meta.url).href;
const STORAGE_KEY = 'clbwz_lucky_wheel_v1';

function todayKey(now = new Date()) {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function emptyState(now) {
  return { date: todayKey(now), usedToday: 0, extraSpins: 0, claimedTasks: [], eventCounts: {}, onlineSeconds: 0 };
}

function loadState(now = new Date()) {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return emptyState(now);
    if (parsed.date !== todayKey(now)) return emptyState(now); // 跨天重置
    return { ...emptyState(now), ...parsed };
  } catch {
    return emptyState(now);
  }
}

function saveState(state) {
  try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* 存不下就算了，不影响本次抽奖 */ }
}

function onlineMinutes(state) {
  const seconds = Math.max(0, Number(state.onlineSeconds) || 0) + (Date.now() - sessionStartAt) / 1000;
  return Math.floor(seconds / 60);
}

let sessionStartAt = Date.now();
let state = null;

let serverSpins = null;   // 服务端返回的剩余次数，优先于本地推算
let claimsGeneration = 0; // 每领一次任务就 +1；期间取回的旧状态必须丢弃
let lastPanel = null;     // 最近一次渲染的面板，用于服务端状态回来后再刷一次

/** 从服务端同步次数与任务状态（拿不到就继续用本地的） */
async function syncServerState() {
  const generation = claimsGeneration;
  try {
    const data = await authStore.api.get('/player/lucky-wheel/state');
    // 请求期间领过任务：这次 GET 的结果已经比已知的旧，丢掉，
    // 否则会把刚领到的次数又压回领取之前的值（用户报的"任务不计入次数"）。
    if (generation === claimsGeneration && data && Number.isFinite(Number(data.spinsLeft))) {
      serverSpins = Number(data.spinsLeft);
    }
  } catch { /* 离线时忽略 */ }
  return serverSpins;
}

/** 把"完成任务"同步给服务端换真实次数；离线时忽略（本地照记） */
async function pushTaskClaims(taskIds) {
  claimsGeneration += 1;
  let changed = false;
  for (const taskId of taskIds) {
    try {
      const data = await authStore.api.post('/player/lucky-wheel/claim-task', { taskId });
      if (data && Number.isFinite(Number(data.spinsLeft))) { serverSpins = Number(data.spinsLeft); changed = true; }
    } catch { /* 离线/服务端不认：本地已经记了次数，忽略 */ }
  }
  if (changed) refresh(lastPanel);
}

function spinsLeft() {
  if (serverSpins != null) return Math.max(0, Number(serverSpins));
  const st = state ?? (state = loadState());
  return Math.max(0, DAILY_FREE_SPINS + Number(st.extraSpins || 0) - Number(st.usedToday || 0));
}

function describeGranted(granted, data = {}) {
  if (!granted) return data.label ? `获得 ${data.label}` : '已发放';
  if (granted.type === 'item') {
    const name = app()?.itemDb?.getById?.(Number(granted.itemId))?.name ?? data.label ?? '道具';
    return `获得 ${name} ×${granted.count}`;
  }
  if (granted.type === 'currency') {
    const unit = granted.currency === 'gem' ? '钻石' : granted.currency === 'honor' ? '荣誉' : '金币';
    return `获得 ${unit} ×${granted.amount}`;
  }
  if (granted.type === 'card') {
    const name = app()?.db?.getById?.(Number(granted.cardId))?.name ?? `卡牌 ${granted.cardId}`;
    return `获得 ${name}（完美 ${granted.star} 星）`;
  }
  return '已发放';
}

function taskDone(task) {
  const st = state ?? (state = loadState());
  if (task.kind === 'online') return onlineMinutes(st) >= Number(task.minutes || 0);
  const got = Number(st.eventCounts?.[task.event] || 0);
  return got >= Number(task.count || 1);
}

/** 结算"转盘任务"，把完成的换成额外次数；返回本次新领取的任务 id */
function settleTasks() {
  const st = state ?? (state = loadState());
  const newly = [];
  for (const task of WHEEL_TASKS) {
    if ((st.claimedTasks || []).includes(task.id)) continue;
    if (!taskDone(task)) continue;
    st.claimedTasks = [...(st.claimedTasks || []), task.id];
    st.extraSpins = Number(st.extraSpins || 0) + Number(task.spins || 0);
    newly.push(task.id);
  }
  if (newly.length) {
    saveState(st);
    // 2026-10-07：只记在本地不够 —— 在线时 spinsLeft() 优先用服务端的次数，
    // 不同步过去任务就等于白做（用户报的"转盘任务不计入计数"）。
    void pushTaskClaims(newly);
  }
  return newly;
}

function app() {
  return globalThis.__clbwzAppInstance ?? null;
}

function randomCardOfQuality(quality, random = Math.random) {
  const db = app()?.db ?? null;
  const list = (db?.cards ?? db?.allCards ?? []).filter((card) => Number(card.quality ?? card.card_quality) === Number(quality));
  if (!list.length) return null;
  return list[Math.floor(random() * list.length)];
}

/** 发奖：卡 → 卡牌背包；道具 → 道具背包；货币 → 玩家 */
function grantPrize(prize, random = Math.random) {
  const instance = app();
  if (!instance) return '（当前拿不到角色数据，奖励未发放）';
  if (prize.kind === 'card') {
    const card = randomCardOfQuality(prize.cardQuality, random);
    if (!card) return '卡池为空，未发放';
    const result = instance.cardInventory?.addCard?.(card.id, 0, { craftQuality: 5, strengthLv: prize.star ?? 0 });
    if (result && result.ok === false) return `卡牌背包已满，${prize.label} 未发放`;
    instance.updatePlayerDisplay?.();
    return `获得 ${card.name}（完美 ${prize.star} 星）`;
  }
  if (prize.kind === 'item') {
    const ok = instance.inventory?.addItem?.(prize.itemId, prize.count);
    if (ok === false) return '道具背包已满，奖励未发放';
    instance.updatePlayerDisplay?.();
    return `获得 ${prize.label}`;
  }
  const player = instance.player ?? {};
  if (prize.currency === 'gold') player.gold = Number(player.gold || 0) + prize.amount;
  else if (prize.currency === 'gem') player.gem = Number(player.gem || 0) + prize.amount;
  else if (prize.currency === 'honor') player.honor = Number(player.honor || 0) + prize.amount;
  instance.persistPlayer?.();
  instance.updatePlayerDisplay?.();
  return `获得 ${prize.label}`;
}

// ────────────────────────── 界面 ──────────────────────────

function wheelGradient() {
  const stops = wheelSectors().map(({ prize, from, to }, index) => {
    const color = prize.tier === 'rare' ? (index % 2 ? '#c9a227' : '#e0bf4a') : (index % 2 ? '#7d9a4a' : '#94b25b');
    return `${color} ${from.toFixed(3)}% ${to.toFixed(3)}%`;
  });
  return `conic-gradient(${stops.join(',')})`;
}

function prizeListMarkup() {
  const rare = WHEEL_PRIZES.filter((p) => p.tier === 'rare');
  const common = WHEEL_PRIZES.filter((p) => p.tier === 'common');
  const line = (p) => `<li><b>${p.label}</b><span>${((Number(p.weight) / WEIGHT_TOTAL) * 100).toFixed(p.tier === 'rare' ? 3 : 1)}%</span><em>${p.desc}</em></li>`;
  return `
    <div class="lucky-wheel-prizes">
      <h4>顶奖 · 合计 ${RARE_TIER_TOTAL}%</h4>
      <ul class="lucky-wheel-rare">${rare.map(line).join('')}</ul>
      <h4>常规奖励 · 合计 ${(100 - RARE_TIER_TOTAL).toFixed(1)}%</h4>
      <ul>${common.map(line).join('')}</ul>
    </div>`;
}

function tasksMarkup() {
  const st = state ?? (state = loadState());
  return `
    <div class="lucky-wheel-tasks">
      <h4>转盘任务 · 每个 +1 次</h4>
      <ul>${WHEEL_TASKS.map((task) => {
        const done = (st.claimedTasks || []).includes(task.id) || taskDone(task);
        const progress = task.kind === 'online'
          ? `${Math.min(onlineMinutes(st), task.minutes)}/${task.minutes} 分钟`
          : `${Math.min(Number(st.eventCounts?.[task.event] || 0), task.count)}/${task.count}`;
        return `<li class="${done ? 'is-done' : ''}"><b>${task.label}</b><span>${done ? '已领取' : progress}</span></li>`;
      }).join('')}</ul>
    </div>`;
}

function sectorIconMarkup(prize) {
  if (prize.kind === 'item' && Number(prize.itemId) > 0) {
    try { return itemIconMarkup(Number(prize.itemId), 24); } catch { /* 拿不到图就退回 emoji */ }
  }
  return `<span class="lucky-wheel-sector-emoji">${prize.icon ?? '★'}</span>`;
}

function sectorLabelsMarkup() {
  return wheelSectors().map(({ prize, centerPct }) => {
    const deg = (centerPct / 100) * 360;
    const short = String(prize.label).replace(/（.*?）/, '').replace(/ ×\d+$/, '').trim();
    return `<span class="lucky-wheel-sector" style="transform:translate(-50%,-50%) rotate(${deg.toFixed(3)}deg) translateY(-88px) rotate(${(-deg).toFixed(3)}deg)">${sectorIconMarkup(prize)}<b>${short}</b></span>`;
  }).join('');
}

function wheelMarkup() {
  return `
    <div class="lucky-wheel-mask" data-lucky-mask hidden>
      <section class="lucky-wheel-panel" role="dialog" aria-label="幸运大转盘">
        <header class="lucky-wheel-head">
          <strong>幸运大转盘</strong>
          <div class="lucky-wheel-head-actions">
            <button type="button" class="lucky-wheel-log-btn" data-lucky-log>更新公告</button>
            <button type="button" class="lucky-wheel-close" data-lucky-close aria-label="关闭">×</button>
          </div>
        </header>
        <div class="lucky-wheel-body" data-lucky-body>
          <div class="lucky-wheel-stage">
            <div class="lucky-wheel-wheel">
              <div class="lucky-wheel-disc" data-lucky-disc style="background:${wheelGradient()}">
                ${sectorLabelsMarkup()}
              </div>
              <i class="lucky-wheel-pointer" aria-hidden="true"></i>
              <span class="lucky-wheel-hub" data-lucky-hub>转</span>
            </div>
            <p class="lucky-wheel-count" data-lucky-count></p>
            <button type="button" class="lucky-wheel-spin" data-lucky-spin>开始抽奖</button>
            <p class="lucky-wheel-result" data-lucky-result></p>
          </div>
          <aside class="lucky-wheel-side">
            ${tasksMarkup()}
            ${prizeListMarkup()}
          </aside>
        </div>
      </section>
    </div>`;
}

function refresh(panel) {
  if (!panel) return;
  lastPanel = panel;
  settleTasks();
  const count = panel.querySelector('[data-lucky-count]');
  if (count) count.textContent = `今天还剩 ${spinsLeft()} 次（每日免费 ${DAILY_FREE_SPINS} 次 + 任务获得的次数）`;
  const spin = panel.querySelector('[data-lucky-spin]');
  if (spin) spin.disabled = spinsLeft() <= 0;
  const tasks = panel.querySelector('.lucky-wheel-tasks');
  if (tasks) tasks.outerHTML = tasksMarkup();
}

// 2026-10-09：抽奖进行中锁 —— 一次点击只允许发一次 /spin（服务端每次请求就 +1 次机会）
let spinning = false;

async function spin(panel, random = Math.random) {
  if (!panel) return null;
  if (spinning) return null;
  if (spinsLeft() <= 0) { refresh(panel); return null; }
  spinning = true;
  const spinButton = panel.querySelector('[data-lucky-spin]');
  if (spinButton) spinButton.disabled = true;

  let sector = null;
  let label = '';
  let tier = 'common';
  let message = '';

  // 优先问服务端要结果（奖池和随机都在服务端，客户端改不动概率）
  try {
    const data = await authStore.api.post('/player/lucky-wheel/spin', {});
    sector = WHEEL_PRIZES.find((entry) => entry.id === data?.sectorId) ?? null;
    label = String(data?.label ?? '');
    tier = String(data?.tier ?? 'common');
    message = describeGranted(data?.granted, data);
    if (Number.isFinite(Number(data?.spinsLeft))) serverSpins = Number(data.spinsLeft);
  } catch (error) {
    // 2026-10-07：只有"真的连不上服务端"（ApiError.status === 0）才允许本地兜底。
    // 服务端明确拒绝（今天没次数 / 卡牌背包满 / 卡池为空）必须如实报错，
    // 绝不能谎报"离线模式"再在客户端自己发一次奖 —— 那等于白送
    // （用户报的"转盘不太像正常的、还显示离线模式"）。
    if (Number(error?.status || 0) !== 0) {
      const failed = panel.querySelector('[data-lucky-result]');
      if (failed) failed.textContent = `抽奖失败：${error?.message || '服务端拒绝了这次抽奖'}`;
      refresh(panel);
      spinning = false;
      return null;
    }
    // 断网：退回本地抽，并如实说明，不假装成功
    sector = pickWheelPrize(random);
    const prize = resolveWheelPrize(sector, random);
    label = prize.label;
    tier = prize.tier;
    message = `${grantPrize(prize, random)}（离线模式）`;
    const st = state ?? (state = loadState());
    st.usedToday = Number(st.usedToday || 0) + 1;
    saveState(st);
    serverSpins = null;
  }

  const disc = panel.querySelector('[data-lucky-disc]');
  const angle = wheelAngleFor(sector ?? WHEEL_PRIZES[0], 5);   // 按权重扇区中心停，指针才指得准
  if (disc) {
    // 2026-10-06：转盘转、指针不动；动画时间拉长到 6 秒，看着更像抽奖
    disc.style.transition = 'transform 6s cubic-bezier(.08,.72,.12,1)';
    disc.style.transform = `rotate(${angle}deg)`;
  }
  const result = panel.querySelector('[data-lucky-result]');
  if (result) result.textContent = `${tier === 'rare' ? '★ 顶奖 ★ ' : ''}${label} —— ${message}`;
  // 动画（6s）结束后才解锁并刷新 —— 期间按钮保持禁用，避免连点重复扣次数
  if (typeof setTimeout === 'function') setTimeout(() => { spinning = false; refresh(panel); }, 6200);
  else spinning = false;
  return sector;
}

function openUpdateLog() {
  // 更新公告已经解耦成独立面板：这里只负责把它打开，不再借用转盘弹窗的标题。
  return openUpdateLogPanel();
}

function mountNoticeLogEntry(root) {
  // 2026-10-06：更新公告挂在**试玩公告**面板里（主城那块"试玩公告 / 功能总览"）。
  // 注意：点击逻辑必须绑在按钮自己身上 —— 它长在试玩公告里，不在转盘弹窗里，
  // 之前在弹窗里 querySelector('[data-lucky-log-entry]') 是查不到的，于是点了没反应。
  const doc = typeof document !== 'undefined' ? document : null;
  const scope = root?.querySelector?.('.main-city-trial-bulletin') ?? doc?.querySelector('.main-city-trial-bulletin');
  if (!scope) return;
  const existing = scope.querySelector('[data-lucky-log-entry]');
  if (existing) {
    if (existing.dataset.luckyLogBound !== '1') {
      existing.dataset.luckyLogBound = '1';
      existing.addEventListener('click', (event) => { event.preventDefault(); openUpdateLog(); });
    }
    return;
  }
  const host = scope.querySelector('.trial-bulletin-head') ?? scope;
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = 'lucky-wheel-log-entry';
  btn.dataset.luckyLogEntry = '1';
  btn.dataset.luckyLogBound = '1';
  btn.textContent = '更新公告';
  btn.addEventListener('click', (event) => { event.preventDefault(); openUpdateLog(); });
  host.append(btn);
}

function injectLuckyWheel(view, root) {
  // 2026-10-06：幸运大转盘只属于主城。禁止向房间大厅/准备房/战斗界面注入。
  const city = root?.querySelector?.('.main-city.classic-city-screen');
  const stage = city?.querySelector?.('.classic-city-stage');
  if (!stage) return;
  const hall = stage;
  if (hall.querySelector('[data-lucky-entry]')) { mountNoticeLogEntry(root); return; }

  const entry = document.createElement('button');
  entry.type = 'button';
  entry.className = 'lucky-wheel-entry';
  entry.dataset.luckyEntry = '1';
  entry.innerHTML = '<span>🎡</span>幸运大转盘';
  // 2026-10-06：位置=主大厅内、"游戏大厅"文字左侧再往上一些（游戏大厅在 46.3% / 17.9%）
  entry.style.left = '33%';
  entry.style.top = '9.5%';
  hall.append(entry);
  // 面板挂到 body：主界面/大厅来回切也不会被重渲染冲掉
  const host = (typeof document !== 'undefined' ? document.body : hall);
  if (!host.querySelector('.lucky-wheel-mask')) host.insertAdjacentHTML('beforeend', wheelMarkup());
  mountNoticeLogEntry(root);

  const panel = host.querySelector('.lucky-wheel-mask');
  entry.addEventListener('click', () => {
    state = loadState();
    settleTasks();
    syncServerState().then(() => refresh(panel));
    panel.hidden = false;
    refresh(panel);
  });
  // 2026-10-09（用户报"一次抽奖消耗多次抽奖机会"）：
  // 面板挂在 body 上只建一次，而主城每次重渲染都会重新走到这里 —— 原来会给**同一个抽奖按钮**
  // 反复 addEventListener('click')，点一次就发 N 次 /spin，服务端每次 +1 → 一次点击扣 N 次机会。
  // 这里改成只绑一次（面板上的监听器生命周期跟随面板本身）。
  if (panel.dataset.bound !== '1') {
    panel.dataset.bound = '1';
    panel.querySelector('[data-lucky-close]')?.addEventListener('click', () => { panel.hidden = true; });
    panel.querySelector('[data-lucky-mask]')?.addEventListener('click', () => { panel.hidden = true; });
    panel.addEventListener('click', (event) => { if (event.target === panel) panel.hidden = true; });
    panel.querySelector('[data-lucky-spin]')?.addEventListener('click', () => spin(panel));
    panel.querySelector('[data-lucky-log]')?.addEventListener('click', () => { openUpdateLog(); });
  }
  refresh(panel);
}

export function installLuckyWheel20261006() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  state = loadState();
  sessionStartAt = Date.now();

  // 在线时长：每秒累加，切走页面不累计
  if (typeof document !== 'undefined') {
    setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      state = state ?? loadState();
      state.onlineSeconds = Number(state.onlineSeconds || 0) + 1;
      saveState(state);
    }, 1000);
  }

  // 转盘任务用的行为计数：挂在任务事件分发上（同一份事件，quests 也在用）
  const originalDispatch = QuestView.dispatch;
  QuestView.dispatch = function dispatchWithWheelTasks20261006(event, data = {}) {
    const result = originalDispatch.call(this, event, data);
    try {
      if (WHEEL_TASKS.some((task) => task.kind === 'event' && task.event === event)) {
        state = state ?? loadState();
        const key = String(event);
        state.eventCounts = state.eventCounts || {};
        state.eventCounts[key] = Number(state.eventCounts[key] || 0) + Math.max(1, Number(data?.count || 1));
        saveState(state);
      }
    } catch { /* 计数失败不影响任务本身 */ }
    return result;
  };

  // 主界面：转盘入口
  const previousMainRender = MainCityView.prototype.render;
  MainCityView.prototype.render = function renderWithLuckyWheel20261006(root, ...args) {
    const result = previousMainRender.call(this, root, ...args);
    try { injectLuckyWheel(this, root); } catch { /* 注入失败不影响主界面 */ }
    return result;
  };


  if (typeof window !== 'undefined') {
    window.__verifyLuckyWheel20261006 = () => ({
      prizes: WHEEL_PRIZES.length,
      weightTotal: WEIGHT_TOTAL,
      rareTotal: WHEEL_PRIZES.filter((p) => p.tier === 'rare').reduce((s, p) => s + p.weight, 0) / WEIGHT_TOTAL * 100,
      spinsLeft: spinsLeft(),
      tasks: WHEEL_TASKS.length,
      pick: (roll) => pickWheelPrize(typeof roll === 'number' ? () => roll : Math.random),
      simulate: (times = 100000, random = Math.random) => {
        const counts = {};
        for (let i = 0; i < times; i += 1) { const p = pickWheelPrize(random); counts[p.id] = (counts[p.id] || 0) + 1; }
        return counts;
      },
    });
  }
}
