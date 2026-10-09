/**
 * 2026-10-09：储藏室（背包左侧竖排页签「储藏室 / 背包 / 卡牌」的第一项）。
 *
 * 形态按需求：背包 ↔ 储藏室 互转，容量 2000（服务端权威，见 server/routes/storageAuthority20261009.js）。
 * 这里只负责展示与发起请求；每次操作后服务端回传整份背包快照，直接覆盖本地背包缓存。
 */
import { authStore } from '../core/AuthStore.js';
import { audio } from '../core/AudioManager.js';
import { itemIconMarkup } from './ItemIcon.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** 服务端 items 快照 → 本地背包 state（和 SmithyServerAuthority 同一套落法）。 */
function applyBagSnapshot(inventory, items) {
  if (!inventory?.state || !Array.isArray(items)) return;
  const slotCount = Math.max(Number(inventory.state.slotCount) || 120, items.length, 120);
  const slots = Array.from({ length: slotCount }, () => null);
  let cursor = 0;
  for (const raw of items) {
    const itemId = Number(raw?.itemId);
    const count = Math.max(0, Math.floor(Number(raw?.count) || 0));
    if (!Number.isInteger(itemId) || itemId <= 0 || count <= 0 || cursor >= slots.length) continue;
    slots[cursor++] = { itemId, count, bound: Boolean(raw?.bound) };
  }
  inventory.state = { ...inventory.state, slotCount, slots };
  inventory.save?.();
}

export class StorageView20261009 {
  constructor({ inventory, itemDb, onInventorySync, onCapacity } = {}) {
    this.inventory = inventory;
    this.itemDb = itemDb;
    this.onInventorySync = onInventorySync;
    this.onCapacity = onCapacity;
    this.container = null;
    this.storage = [];
    this.capacity = 2000;
    this.used = 0;
    this.busy = false;
    this.toastText = '';
    this.loaded = false;
  }

  nameOf(itemId) {
    return this.itemDb?.getById?.(Number(itemId))?.name ?? `道具 ${itemId}`;
  }

  bagRows() {
    const slots = this.inventory?.state?.slots ?? [];
    const map = new Map();
    for (const slot of slots) {
      if (!slot) continue;
      const id = Number(slot.itemId);
      const bound = Boolean(slot.bound);
      const key = `${id}:${bound ? 1 : 0}`;
      const prev = map.get(key);
      if (prev) prev.count += Math.max(0, Number(slot.count) || 0);
      else map.set(key, { itemId: id, count: Math.max(0, Number(slot.count) || 0), bound });
    }
    return [...map.values()].filter((row) => row.count > 0).sort((a, b) => a.itemId - b.itemId);
  }

  /** 挂进背包主区域（container 一般是 #bag-grid）。 */
  mount(container, root) {
    this.container = container;
    this.render();
    if (!this.loaded) void this.load(root);
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML = `
      <div class="storage-inline">
        <header class="storage-inline-head">
          <h3>储藏室</h3>
          <p>已用 <b>${this.used}</b> / <b>${this.capacity}</b> 格</p>
        </header>
        <p class="storage-hint">储藏室与背包互转，容量按格子算（不同道具各占一格）。</p>
        <div class="storage-columns">
          <section class="storage-col">
            <h4>背包</h4>
            <div class="storage-list">${this.renderRows(this.bagRows(), 'deposit') || '<p class="storage-empty">背包里没有道具</p>'}</div>
          </section>
          <section class="storage-col">
            <h4>储藏室</h4>
            <div class="storage-list">${this.renderRows(this.storage, 'withdraw') || '<p class="storage-empty">储藏室是空的</p>'}</div>
          </section>
        </div>
        <p class="storage-toast">${escapeHtml(this.toastText)}</p>
      </div>`;
    this.container.querySelectorAll('[data-storage-move]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [itemId, bound, count] = String(btn.dataset.storageMove).split(':');
        this.move(btn.dataset.storageDirection, Number(itemId), Number(count), bound === '1');
      });
    });
  }

  renderRows(rows, direction) {
    if (!rows.length) return '';
    return rows
      .map((row) => {
        const label = direction === 'deposit' ? '全部存入' : '全部取出';
        const boundTag = row.bound ? '<em class="storage-bound">绑定</em>' : '';
        return `<div class="storage-row">
          <span class="storage-icon">${itemIconMarkup(row.itemId, 36)}</span>
          <span class="storage-name">${escapeHtml(this.nameOf(row.itemId))}${boundTag}</span>
          <span class="storage-count">×${row.count}</span>
          <button type="button" class="storage-btn" data-storage-direction="${direction}" data-storage-move="${row.itemId}:${row.bound ? 1 : 0}:${row.count}">${label}</button>
        </div>`;
      })
      .join('');
  }

  async load(root) {
    try {
      const data = await authStore.api.get('/player/storage');
      this.apply(data);
    } catch (error) {
      this.toastText = error?.message || '读取储藏室失败';
    } finally {
      this.loaded = true;
      this.render();
      void root;
    }
  }

  apply(data) {
    if (!data) return;
    if (Array.isArray(data.storage)) {
      this.storage = data.storage
        .map((row) => ({ itemId: Number(row.itemId), count: Math.max(0, Math.floor(Number(row.count) || 0)), bound: Boolean(row.bound) }))
        .filter((row) => row.count > 0)
        .sort((a, b) => a.itemId - b.itemId);
    }
    if (Number.isFinite(Number(data.capacity))) this.capacity = Number(data.capacity);
    if (Number.isFinite(Number(data.used))) this.used = Number(data.used);
    this.onCapacity?.(this.used, this.capacity);
    if (Array.isArray(data.items)) {
      applyBagSnapshot(this.inventory, data.items);
      this.onInventorySync?.();
    }
  }

  async move(direction, itemId, count, bound) {
    if (this.busy || !Number.isInteger(itemId) || itemId <= 0 || count <= 0) return;
    this.busy = true;
    audio.playSfx('click');
    try {
      const data = await authStore.api.post(`/player/storage/${direction}`, { itemId, count, bound });
      this.apply(data);
      this.toastText = direction === 'deposit' ? `已存入 ${this.nameOf(itemId)} ×${data?.moved ?? count}` : `已取出 ${this.nameOf(itemId)} ×${data?.moved ?? count}`;
    } catch (error) {
      this.toastText = error?.message || '操作失败';
    } finally {
      this.busy = false;
      this.render();
    }
  }
}
