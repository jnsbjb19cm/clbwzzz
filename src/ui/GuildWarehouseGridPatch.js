import { GuildView } from './GuildView.js';
import { ItemDatabase } from '../core/ItemDatabase.js';
import { getCraftMaterialImage } from './SmithyMaterialArtwork.js';
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

function iconMarkup(id, size = 48) {
  const src = getCraftMaterialImage(Number(id));
  if (src) return `<img class="bag-item-image" src="${src}" alt="" style="width:${size}px;height:${size}px" draggable="false">`;
  return `<span class="fallback-icon" style="width:${size}px;height:${size}px">${Number(id) || '?'}</span>`;
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

  GuildView.prototype.showWarehouse = async function showWarehouseGrid(guildId) {
    const [warehouse, mine] = await Promise.all([
      this.api.get(`/guild/${guildId}/warehouse`).catch(() => ({ items: [] })),
      this.api.get(`/guild/${guildId}/warehouse/my-items`).catch(() => ({ items: [] })),
    ]);

    const el = this.root.querySelector('#guild-detail');
    if (!el) return;
    let selected = null;
    const myItems = Array.isArray(mine.items) ? mine.items : [];
    const warehouseItems = Array.isArray(warehouse.items) ? warehouse.items : [];

    el.innerHTML = `
      <section class="economy-grid-shell guild-warehouse-grid-shell backpack-economy-ui">
        <h2 class="economy-grid-title">公会仓库</h2>
        <div class="economy-grid-workbench">
          <div class="economy-grid-panel">
            <h3>我的背包 <span class="muted">${myItems.length}/${BAG_SLOT_COUNT} · 仅可存入非绑定物品</span></h3>
            <div class="economy-item-grid bag-item-grid" id="guild-my-item-grid">${backpackSlots(myItems, 'bag')}</div>
          </div>
          <div class="economy-grid-panel economy-transfer-panel">
            <h3 id="guild-transfer-title">物品操作</h3>
            <div class="economy-transfer-card" id="guild-transfer-card">
              <div class="empty">从左侧背包选择要存入的物品，或从下方公会仓库选择要取出的物品。</div>
            </div>
          </div>
        </div>
        <div class="economy-grid-panel">
          <h3>公会仓库 <span class="muted">${warehouseItems.length}/${BAG_SLOT_COUNT} · 点击格子选择取出</span></h3>
          <div class="economy-item-grid bag-item-grid" id="guild-storage-grid">${backpackSlots(warehouseItems, 'warehouse')}</div>
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
        card.innerHTML = '<div class="empty">从左侧背包选择要存入的物品，或从下方公会仓库选择要取出的物品。</div>';
        return;
      }
      const action = selected.source === 'bag' ? '存入公会仓库' : '取回我的背包';
      card.innerHTML = `
        ${iconMarkup(selected.itemId, 72)}
        <strong>${esc(itemName(selected.itemId))}</strong>
        <span class="muted">当前数量 ×${selected.maxCount}</span>
        <div class="economy-transfer-form">
          <label style="grid-column:1/-1">数量
            <input id="guild-transfer-count" type="number" min="1" max="${selected.maxCount}" value="1">
          </label>
        </div>
        <div class="economy-transfer-actions">
          <button type="button" id="guild-transfer-confirm">${action}</button>
          <button type="button" class="alt" id="guild-transfer-max">全部</button>
        </div>`;

      card.querySelector('#guild-transfer-max')?.addEventListener('click', () => {
        const input = card.querySelector('#guild-transfer-count');
        if (input) input.value = String(selected.maxCount);
      });
      card.querySelector('#guild-transfer-confirm')?.addEventListener('click', async () => {
        const count = Math.max(1, Math.min(selected.maxCount, Number(card.querySelector('#guild-transfer-count')?.value) || 1));
        try {
          if (selected.source === 'bag') {
            await this.api.post(`/guild/${guildId}/warehouse/deposit`, { itemId: selected.itemId, count });
          } else {
            await this.api.post(`/guild/${guildId}/warehouse/withdraw`, { itemId: selected.itemId, count });
          }
          await this.showWarehouse(guildId);
        } catch (error) {
          alert(error.message || '操作失败');
        }
      });
    };

    el.querySelectorAll('.economy-item-slot[data-item-id]').forEach((slot) => {
      slot.addEventListener('click', () => {
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
