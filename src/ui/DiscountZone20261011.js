import discountZoneData from '../data/discountZone.json';

/**
 * 打折专区（2026-10-11 用户要求）：出一个打折的位置，但限购，每天最多买 N 个；
 * 低等级打折力度低、高等级打折力度高。配置在 src/data/discountZone.json。
 *
 * 设计：
 *   · 每天按日期做种，从 pool 里**确定性**挑 slots 件（当天所有人看到的是同一批，公平、可复现）；
 *   · 折扣/每日上限由材料等级决定（1级95折限5个 … 5级7折限1个）；
 *   · 已购数量记在 localStorage（按账号隔离：键名在 PlayerStorage20261010 的 PLAYER_SCOPED_BASES 里）；
 *   · 售罄后在**捕获阶段**拦掉点击，不让下单。
 *
 * 注意：额度目前只在前端校验。服务端核对额度是下一步（现有金币价本来就是客户端提交的）。
 */
export const DISCOUNT_QUOTA_KEY = 'clbwz_discount_quota_v1';

/** 2026-10-11：商品池按 **7 日**轮换（rotateDays 可配），所以抽样的种子用周期键而不是当天日期 */
export function discountPeriodKey(now = new Date()) {
  const days = Math.max(1, Number(discountZoneData?.rotateDays) || 7);
  const start = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now - start) / 86400000);
  return `P${Math.floor(dayOfYear / days)}`;
}

/** 每日限购额度按天重置 */
export function discountDateKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function readQuota() {
  try {
    const raw = globalThis.localStorage?.getItem(DISCOUNT_QUOTA_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && parsed.date === discountDateKey() && parsed.used && typeof parsed.used === 'object') return parsed;
  } catch { /* 解析失败按"今日未购"处理 */ }
  return { date: discountDateKey(), used: {} };
}

function writeQuota(quota) {
  try { globalThis.localStorage?.setItem(DISCOUNT_QUOTA_KEY, JSON.stringify(quota)); } catch { /* 忽略 */ }
}

export function discountUsedToday(quotaKey) {
  const quota = readQuota();
  return Math.max(0, Number(quota.used?.[quotaKey]) || 0);
}

function tierForLevel(level) {
  const tiers = Array.isArray(discountZoneData?.tiers) ? discountZoneData.tiers : [];
  return tiers.find((tier) => Number(tier.level) === Number(level)) ?? tiers[0] ?? { discount: 1, dailyLimit: 1, label: '无折扣' };
}

/** 今日打折商品（确定性抽取 + 折扣 + 剩余额度） */
export function buildDiscountSlots(shopItems) {
  const pool = Array.isArray(discountZoneData?.pool) ? discountZoneData.pool : [];
  const slots = Math.max(1, Number(discountZoneData?.slots) || 6);
  const seedStr = discountPeriodKey();
  let seed = 2166136261;
  for (let i = 0; i < seedStr.length; i += 1) { seed ^= seedStr.charCodeAt(i); seed = Math.imul(seed, 16777619); }
  seed >>>= 0;

  const picked = [];
  const usedIds = new Set();
  for (let step = 0; step < pool.length * 2 && picked.length < slots; step += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const entry = pool[seed % pool.length];
    if (!entry || usedIds.has(Number(entry.realId))) continue;
    const base = (shopItems ?? []).find((item) => Number(item?.effect?.realId) === Number(entry.realId));
    if (!base) continue;
    usedIds.add(Number(entry.realId));
    const tier = tierForLevel(entry.level);
    const discount = Math.min(1, Math.max(0.5, Number(tier.discount) || 1));
    const basePrice = Math.max(1, Number(base.price) || 1);
    const quotaKey = `${discountDateKey()}:${entry.realId}`;
    const limit = Math.max(1, Number(tier.dailyLimit) || 1);
    picked.push({
      base,
      tier,
      level: Number(entry.level) || 1,
      basePrice,
      price: Math.max(1, Math.ceil(basePrice * discount)),
      quotaKey,
      limit,
      used: discountUsedToday(quotaKey),
    });
  }
  return picked;
}

/** 把打折条目转成商城商品对象（字段与 SHOP_ITEMS 商品保持一致） */
export function discountProductFor(slot, index, spriteLookup) {
  const remaining = Math.max(0, slot.limit - slot.used);
  return {
    key: `discount:${slot.quotaKey}`,
    kind: 'item',
    name: `${slot.base.name}（${slot.tier.label ?? '折扣'}）`,
    desc: `原价 ${slot.basePrice} 金 → 现价 ${slot.price} 金 · 今日剩余 ${remaining}/${slot.limit}`,
    icon: slot.base.icon,
    realId: slot.base.effect?.realId,
    materialSprite: typeof spriteLookup === 'function' ? spriteLookup(slot.base.effect?.realId) : undefined,
    shopIndex: -1 - index,
    category: 'item',
    subcategory: '打折',
    // 顶层 price 也要给：商城卡片模板读的是 it.price（不是 data.price）
    price: slot.price,
    discountQuotaKey: slot.quotaKey,
    discountLimit: slot.limit,
    data: { price: slot.price, effect: slot.base.effect },
  };
}

let guardInstalled = false;
/** 售罄拦截：文档级捕获监听（DOM 会被反复重渲染，所以只装一次） */
export function installDiscountGuard() {
  if (guardInstalled || typeof document === 'undefined') return;
  guardInstalled = true;
  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('[data-discount-quota-key]');
    if (!button) return;
    const key = String(button.dataset.discountQuotaKey ?? '');
    const limit = Math.max(1, Number(button.dataset.discountLimit) || 1);
    const used = discountUsedToday(key);
    if (used >= limit) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showTip('今日该折扣商品已售罄，明天再来');
      return;
    }
    const quota = readQuota();
    quota.used = quota.used ?? {};
    quota.used[key] = used + 1;
    writeQuota(quota);
  }, true);
}

function showTip(text) {
  try {
    const tip = document.createElement('div');
    tip.textContent = text;
    tip.style.cssText = 'position:fixed;left:50%;top:20%;transform:translateX(-50%);z-index:99999;'
      + 'background:rgba(0,0,0,.86);color:#fff;padding:10px 18px;border-radius:10px;'
      + 'font:700 16px/1.4 "Microsoft YaHei",sans-serif;pointer-events:none;';
    document.body.appendChild(tip);
    setTimeout(() => tip.remove(), 1600);
  } catch { /* 忽略 */ }
}

/**
 * 左栏「打折专区」面板的 HTML（2026-10-11 用户：别占分类页签的位置，放左边）。
 * 左栏是商城的 aside.classic-shop-profile —— 放这里不会挤掉原来的分类页签。
 */
export function discountPanelHtml(shopItems) {
  const slots = buildDiscountSlots(shopItems);
  if (!slots.length) return '';
  const rows = slots.map((slot) => {
    const remaining = Math.max(0, slot.limit - slot.used);
    const soldOut = remaining <= 0;
    return `<li class="shop-discount-row${soldOut ? ' is-sold-out' : ''}">
        <b>${slot.base.name}</b>
        <span class="shop-discount-tag">${slot.tier.label ?? '折扣'}</span>
        <span class="shop-discount-price"><s>${slot.basePrice}</s> 💰${slot.price}</span>
        <span class="shop-discount-left">剩余 ${remaining}/${slot.limit}</span>
        <button type="button" class="shop-discount-buy" data-discount-buy
          data-discount-quota-key="${slot.quotaKey}" data-discount-limit="${slot.limit}"
          data-discount-item-id="${Number(slot.base.effect?.realId) || 0}"
          data-discount-count="${Number(slot.base.effect?.count) || 1}"
          data-discount-price="${slot.price}"${soldOut ? ' disabled' : ''}>${soldOut ? '售罄' : '购买'}</button>
      </li>`;
  }).join('');
  return `<section class="shop-discount-panel" aria-label="打折专区">
      <h3>打折专区 <small>每日限购 · 等级越高折扣越大</small></h3>
      <ul class="shop-discount-list">${rows}</ul>
    </section>`;
}

/** 面板购买流程：校验额度 → /player/shop/buy-item（带折后价）→ 刷新面板 */
export async function buyDiscountItem(button, { onDone } = {}) {
  const itemId = Number(button?.dataset?.discountItemId) || 0;
  const count = Math.max(1, Number(button?.dataset?.discountCount) || 1);
  const goldCost = Math.max(0, Number(button?.dataset?.discountPrice) || 0);
  const quotaKey = String(button?.dataset?.discountQuotaKey ?? '');
  const limit = Math.max(1, Number(button?.dataset?.discountLimit) || 1);
  if (!itemId) return { ok: false, message: '商品配置缺失' };
  if (discountUsedToday(quotaKey) >= limit) {
    showTip('今日该折扣商品已售罄，明天再来');
    return { ok: false, message: '今日已售罄' };
  }
  button.disabled = true;
  try {
    const { authStore } = await import('../core/AuthStore.js');
    // 2026-10-11：额度交给服务端校验（player_daily_deals），本地只做 UI 显示
    const result = await authStore.api.post('/player/shop/buy-item', { itemId, count, goldCost, gemCost: 0, dealQuotaKey: quotaKey, dealLimit: limit });
    const quota = readQuota();
    quota.used = quota.used ?? {};
    quota.used[quotaKey] = discountUsedToday(quotaKey) + 1;
    writeQuota(quota);
    showTip(`已购买 ${count} 个（折后 ${goldCost} 金）`);
    if (typeof onDone === 'function') onDone();
    return { ok: true, result };
  } catch (error) {
    showTip(error?.message ?? '购买失败');
    return { ok: false, message: error?.message ?? '购买失败' };
  } finally {
    button.disabled = false;
  }
}
