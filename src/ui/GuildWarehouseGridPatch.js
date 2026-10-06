import { GuildView } from './GuildView.js';
import { ItemDatabase } from '../core/ItemDatabase.js';
import { itemIconMarkup as iconMarkup } from './ItemIcon.js';
import './EconomyGridUi.css';

const PATCH_FLAG = Symbol.for('clbwzzz.guildWarehouseGrid20260905');
const BAG_SLOT_COUNT = 60;
const itemDb = new ItemDatabase();

function esc(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function itemName(id) {
  return itemDb.getById(Number(id))?.name ?? `道具#${id}`;
}



function backpackSlots(items, source) {
  const rows = Array.isArray(items) ? items : [];
  const size = Math.max(BAG_SLOT_COUNT, rows.length);
  return Array.from({ length: size }, (_, index) => {
    const it = rows[index];
    if (!it) return '<span class="economy-item-slot bag-slot empty economy-empty-slot" aria-hidden="true"></span>';
    return `
      <button type="button" class="economy-item-slot bag-slot" data-economy-source="${source}" data-item-id="${Number(it.itemId)}" data-count="${Number(it.count) || 0}" title="${esc(itemName(it.itemId))}">
        ${iconMarkup(it.itemId)}
        <span class="name">${esc(itemName(it.itemId))}</span>
        <span class="count">${Number(it.count) || 0}</span>
      </button>`;
  }).join('');
}

export function installGuildWarehouseGridPatch() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  GuildView.prototype.showWarehouse = async function showWarehouseGrid(guildId, { notice = '', afterTransfer = false } = {}) {
    if (this._warehouseSubmitting && !afterTransfer) return;
    const request = this._panelRequest = (this._panelRequest || 0) + 1;
    const el = this.root.querySelector('#guild-detail');
    if (!el) return;
    const title = this.root.querySelector('.reference-guild-title h2');
    if (title) title.textContent = '公会仓库';
    el.innerHTML = '<section class="guild-warehouse-grid-shell warehouse-loading" aria-busy="true"><p>正在读取公会仓库与可存入物品…</p></section>';
    let warehouse, mine;
    try {
      [warehouse, mine] = await Promise.all([
        this.api.get(`/guild/${guildId}/warehouse`),
        this.api.get(`/guild/${guildId}/warehouse/my-items`),
      ]);
      if (!Array.isArray(warehouse?.items) || !Array.isArray(mine?.items)) throw new Error('仓库数据不完整');
    } catch (error) {
      if (this._destroyed || request !== this._panelRequest || !el.isConnected) return;
      el.innerHTML = `<section class="guild-warehouse-grid-shell warehouse-load-error"><p role="alert">${notice ? esc(notice) + '。' : ''}加载失败：${esc(error.message || '暂时无法连接仓库')}。库存未能确认，不显示为空仓库。</p><button type="button" data-warehouse-retry>重新读取</button></section>`;
      el.querySelector('[data-warehouse-retry]').addEventListener('click', () => this.showWarehouse(guildId));
      return;
    }
    if (this._destroyed || request !== this._panelRequest || !el.isConnected) return;
    let selected = null;
    const myItems = Array.isArray(mine.items) ? mine.items : [];
    const warehouseItems = Array.isArray(warehouse.items) ? warehouse.items : [];

    el.innerHTML = `
      <section class="economy-grid-shell guild-warehouse-grid-shell backpack-economy-ui">
        <h2 class="economy-grid-title">公会仓库</h2>
        <div class="economy-grid-workbench">
          <div class="economy-grid-panel">
            <h3>我的背包 <span class="muted">${myItems.length} 种 · 仅显示可存入的非绑定物品</span></h3>
            <div class="economy-item-grid bag-item-grid" id="guild-my-item-grid">${backpackSlots(myItems, 'bag')}</div>
          </div>
          <div class="economy-grid-panel">
            <h3>公会仓库 <span class="muted">${warehouseItems.length} 种 · 点击格子选择取出</span></h3>
            <div class="economy-item-grid bag-item-grid" id="guild-storage-grid">${backpackSlots(warehouseItems, 'warehouse')}</div>
          </div>
        </div>
        <div class="economy-grid-panel economy-transfer-panel">
          <h3 id="guild-transfer-title">物品操作 <span class="muted">单次最多 10000 个</span></h3>
          <p class="warehouse-transfer-status" role="status" aria-live="polite">${esc(notice)}</p>
          <div class="economy-transfer-card" id="guild-transfer-card">
            <div class="empty">左侧是公会仓库，右侧是我的背包。点击物品后选择存入或取出数量。</div>
          </div>
        </div>
      </section>`;

    const renderSelection = () => {
      const card = el.querySelector('#guild-transfer-card');
      if (!card) return;
      el.querySelectorAll('.economy-item-slot[data-item-id]').forEach((slot) => {
        slot.classList.toggle(
          'selected',
          selected
            && slot.dataset.economySource === selected.source
            && Number(slot.dataset.itemId) === selected.itemId,
        );
      });
      if (!selected) {
        card.innerHTML = '<div class="empty">左侧是公会仓库，右侧是我的背包。点击物品后选择存入或取出数量。</div>';
        return;
      }
      const action = selected.source === 'bag' ? '存入公会仓库' : '取回我的背包';
      card.innerHTML = `
        ${iconMarkup(selected.itemId, 72)}
        <strong>${esc(itemName(selected.itemId))}</strong>
        <span class="muted">当前数量 ×${selected.maxCount}</span>
        <div class="economy-transfer-form">
          <label style="grid-column:1/-1">数量
            <input id="guild-transfer-count" type="number" min="1" max="${Math.min(selected.maxCount, 10000)}" step="1" value="1">
          </label>
        </div>
        <div class="economy-transfer-actions">
          <button type="button" id="guild-transfer-confirm">${action}</button>
          <button type="button" class="alt" id="guild-transfer-max">全部</button>
        </div>`;

      card.querySelector('#guild-transfer-max')?.addEventListener('click', () => {
        const input = card.querySelector('#guild-transfer-count');
        if (input) input.value = String(Math.min(selected.maxCount, 10000));
      });
      card.querySelector('#guild-transfer-confirm')?.addEventListener('click', async () => {
        if (this._warehouseSubmitting || !selected) return;
        const transfer = { ...selected };
        const count = Number(card.querySelector('#guild-transfer-count')?.value);
        const status = el.querySelector('.warehouse-transfer-status');
        if (!Number.isSafeInteger(count) || count < 1 || count > Math.min(transfer.maxCount, 10000)) {
          status.textContent = `请输入 1～${Math.min(transfer.maxCount, 10000)} 的整数数量`;
          return;
        }
        this._warehouseSubmitting = true;
        el.querySelectorAll('button,input').forEach(control => { control.disabled = true; });
        status.textContent = '正在提交，请勿重复操作…';
        try {
          const action = transfer.source === 'bag' ? 'deposit' : 'withdraw';
          await this.api.post(`/guild/${guildId}/warehouse/${action}`, { itemId: transfer.itemId, count });
          if (this._destroyed || request !== this._panelRequest || !el.isConnected) return;
          await this.showWarehouse(guildId, {afterTransfer:true, notice:`已${action === 'deposit' ? '存入' : '取出'} ${itemName(transfer.itemId)} ×${count}`});
        } catch (error) {
          if (this._destroyed || request !== this._panelRequest || !el.isConnected) return;
          status.textContent = error.status === 0
            ? '连接中断，存取结果尚未确认，请重新读取库存后再操作，不要重复提交。'
            : error.message || '存取失败，请重新读取库存';
          const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '重新读取库存';
          retry.addEventListener('click', () => this.showWarehouse(guildId)); status.append(retry);
          // A lost response may follow a committed transaction. Keep the old
          // confirmation disabled until the authoritative inventory is reloaded.
        } finally {
          this._warehouseSubmitting = false;
        }
      });
    };

    el.querySelectorAll('.economy-item-slot[data-item-id]').forEach((slot) => {
      slot.addEventListener('click', () => {
        if (this._warehouseSubmitting) return;
        selected = {
          source: slot.dataset.economySource,
          itemId: Number(slot.dataset.itemId),
          maxCount: Math.max(1, Number(slot.dataset.count) || 1),
        };
        renderSelection();
      });
    });
  };
}
