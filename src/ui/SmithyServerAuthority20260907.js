import { authStore } from '../core/AuthStore.js';
import { formatCraftCardName, resolveCraftQuality } from '../core/constants.js';
import { SmithyView } from './SmithyView.js';
import { audio } from '../core/AudioManager.js';

const PATCH_FLAG = Symbol.for('clbwz.smithyServerAuthority20260907');

function applyItemSnapshot(view, items) {
  if (!view?.inventory?.state || !Array.isArray(items)) return;
  const slotCount = Math.max(Number(view.inventory.state.slotCount) || 120, items.length, 120);
  const slots = Array.from({ length: slotCount }, () => null);
  let cursor = 0;
  for (const raw of items) {
    const itemId = Number(raw?.itemId);
    const count = Math.max(0, Math.floor(Number(raw?.count) || 0));
    if (!Number.isInteger(itemId) || itemId <= 0 || count <= 0 || cursor >= slots.length) continue;
    slots[cursor++] = { itemId, count, bound: Boolean(raw?.bound) };
  }
  view.inventory.state = { ...view.inventory.state, slotCount, slots };
  view.inventory.save?.();
}

function applySmithyState(view, smithyState) {
  if (!smithyState || typeof smithyState !== 'object') return;
  if (view?.craftState) {
    view.craftState.state = { ...(view.craftState.state ?? {}), pity: { ...(smithyState.craftPity ?? {}) } };
    view.craftState.save?.();
  }
  if (view?.starUpgradeSys && smithyState.star) {
    view.starUpgradeSys.state = {
      failures: { ...(smithyState.star.failures ?? {}) },
      pity: { ...(smithyState.star.pity ?? {}) },
      protections: { ...(smithyState.star.protections ?? {}) },
      escrow: Array.isArray(smithyState.star.escrow)
        ? smithyState.star.escrow.map((entry) => ({ ...entry, slot: { ...(entry?.slot ?? {}) } }))
        : [],
    };
    view.starUpgradeSys.save?.();
  }
}

function applyAuthoritySnapshot(view, data) {
  if (data?.cardInventory && typeof view?.cardInventory?.applyServerSnapshot === 'function') {
    view.cardInventory.applyServerSnapshot(data.cardInventory);
    if (authStore.snapshot) authStore.snapshot.cardInventory = data.cardInventory;
  }
  if (Array.isArray(data?.items)) {
    applyItemSnapshot(view, data.items);
    if (authStore.snapshot) authStore.snapshot.items = data.items;
  }
  if (data?.profile && authStore.snapshot) {
    authStore.snapshot.profile = { ...(authStore.snapshot.profile ?? {}), ...data.profile };
    if (view?.player) {
      view.player.gold = Number(data.profile.gold ?? view.player.gold) || 0;
      view.player.gem = Number(data.profile.diamond ?? data.profile.gem ?? view.player.gem) || 0;
    }
  }
  applySmithyState(view, data?.smithyState);
}

async function callAuthority(view, path, payload) {
  try {
    const data = await authStore.api.post(`/player/smithy${path}`, payload);
    applyAuthoritySnapshot(view, data);
    return data;
  } catch (error) {
    return { ok: false, error: error?.message ?? String(error) };
  }
}

function replaceAction(root, selector, handler) {
  const old = root?.querySelector?.(selector);
  if (!old || old.dataset.smithyAuthority === 'true') return old;
  const button = old.cloneNode(true);
  button.dataset.smithyAuthority = 'true';
  old.replaceWith(button);
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (button.disabled) return;
    button.disabled = true;
    try { await handler(button); } finally { if (button.isConnected) button.disabled = false; }
  });
  return button;
}

function bindServerActions(view, root) {
  replaceAction(root, '#do-craft', async () => {
    const data = await callAuthority(view, '/craft', {
      targetCardId: view.targetCardId,
      useCharm: Boolean(view.useCharm),
      useDna: Boolean(view.useDna),
      highTier: Boolean(view.highTier),
    });
    const failed = data?.result === 'fail' || data?.result === 'fail_protected';
    audio.playSmithResult(Boolean(data?.ok && !failed));
    if (data?.ok && data.cardId) {
      const card = view.db?.getById?.(data.cardId);
      view.lastCraftResult = {
        ...data,
        cardName: data.cardName ?? card?.name ?? String(data.cardId),
        displayName: card ? formatCraftCardName(data.craftQuality, card.name) : data.cardName,
        craftQualityInfo: resolveCraftQuality(data.craftQuality),
      };
      if (!failed) view.onQuestEvent?.('card_craft', { count: 1 });
    }
    view.toast(root, data?.message ?? data?.error ?? '制造完成');
    view.renderBody(root);
  });

  replaceAction(root, '#do-star-upgrade', async () => {
    const route = view.__smithyUpgradeRoute20260907 === 'duplicate' ? 'duplicate' : 'powder';
    const data = await callAuthority(view, '/star-upgrade', {
      route,
      mainIndex: view._starMainIdx,
      subIndices: route === 'duplicate' ? [...(view._starSubIdxs ?? [])] : [],
      charmId: view._starCharmId,
    });
    audio.playSmithResult(Boolean(data?.ok && data?.success));
    if (data?.ok && data?.success) view.onQuestEvent?.('card_strengthen', { count: 1 });
    view._starSubIdxs = [];
    view.toast(root, data?.message ?? data?.error ?? '升星完成');
    view.renderBody(root);
  });

  replaceAction(root, '#do-decompose', async () => {
    // 一键分解开关默认关闭：没开启时不提交任何分解请求。
    if (!view.decomposeEnabled) {
      view.toast(root, '\u8bf7\u5148\u5f00\u542f\u300c\u4e00\u952e\u5206\u89e3\u300d\u5f00\u5173');
      view.renderBody(root);
      return;
    }
    const slots = view.cardInventory?.getSlots?.() ?? [];
    const indices = [...(view.decomposeIndices instanceof Set ? view.decomposeIndices : [])]
      .map(Number)
      .filter((index) => Number.isInteger(index) && index >= 0 && slots[index]);
    if (!indices.length && view.cardIndex >= 0 && slots[view.cardIndex]) indices.push(Number(view.cardIndex));
    if (!indices.length) {
      view.toast(root, '未选择卡牌');
      view.renderBody(root);
      return;
    }
    const names = indices
      .map((index) => {
        const slot = slots[index];
        const card = slot ? view.db?.getById?.(slot.cardId) : null;
        return card ? formatCraftCardName(slot.craftQuality, card.name) : String(slot?.cardId ?? '');
      })
      .filter(Boolean);
    const confirmText = indices.length === 1
      ? `确定分解「${names[0]}」？`
      : `确定分解选中的 ${indices.length} 张卡牌？`;
    // 游戏内确认弹窗（SmithyView.confirmDialog），不要跳出浏览器网页弹框。
    const confirmed = typeof view.confirmDialog === 'function'
      ? await view.confirmDialog(root, `${confirmText}\n分解后无法撤销。`, { title: '确认分解', confirmText: '分解' })
      : Boolean(globalThis.confirm?.(confirmText));
    if (!confirmed) {
      view.renderBody(root);
      return;
    }
    const data = await callAuthority(view, '/decompose', { slotIndices: indices });
    if (data?.ok) {
      view.decomposeIndices?.clear?.();
      view.cardIndex = -1;
    }
    view.toast(root, data?.message ?? data?.error ?? '分解完成');
    view.renderBody(root);
  });

  replaceAction(root, '#do-combine', async () => {
    const data = await callAuthority(view, '/material-combine', {
      type: view.matType,
      fromLevel: view.matFromLevel,
    });
    view.toast(root, data?.message ?? data?.error ?? '加工完成');
    view.renderBody(root);
  });

  root?.querySelectorAll?.('[data-escrow-id]')?.forEach?.((button) => {
    if (button.dataset.smithyAuthorityContext === 'true') return;
    button.dataset.smithyAuthorityContext = 'true';
    button.addEventListener('contextmenu', () => {
      view.__smithyRestoreEntryId20260907 = button.dataset.escrowId;
    }, true);
  });

  replaceAction(root, '#star-restore-confirm', async () => {
    const data = await callAuthority(view, '/restore-escrow', { entryId: view.__smithyRestoreEntryId20260907 });
    view.__smithyRestoreEntryId20260907 = null;
    view.toast(root, data?.message ?? data?.error ?? '还原完成');
    view.renderBody(root);
  });

  replaceAction(root, '#star-grant-test', async () => {
    try {
      const refill = await authStore.api.post('/player/material-refill', {});
      const data = await authStore.api.get('/player/smithy/state');
      applyAuthoritySnapshot(view, data);
      view.toast(root, `服务器已补发制作/强化材料，每种×${refill?.perItem ?? 100}`);
    } catch (error) {
      view.toast(root, error?.message ?? '材料补发失败');
    }
    view.renderBody(root);
  });
}

async function hydrate(view, root) {
  if (!authStore?.isLoggedIn?.() || view.__smithyHydrating20260907) return;
  view.__smithyHydrating20260907 = true;
  try {
    const data = await authStore.api.get('/player/smithy/state');
    applyAuthoritySnapshot(view, data);
    view.renderBody(root);
  } catch (error) {
    console.warn('[smithy-authority] 初始同步失败', error);
  } finally {
    view.__smithyHydrating20260907 = false;
  }
}

export function installSmithyServerAuthority20260907() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const originalUpgradeRoute = SmithyView.prototype.renderUpgradeRoute;
  SmithyView.prototype.renderUpgradeRoute = function renderUpgradeRouteWithAuthority(root, body, route) {
    this.__smithyUpgradeRoute20260907 = route;
    return originalUpgradeRoute.call(this, root, body, route);
  };

  const originalRenderBody = SmithyView.prototype.renderBody;
  SmithyView.prototype.renderBody = function renderBodyWithAuthority(root) {
    const result = originalRenderBody.call(this, root);
    if (authStore?.isLoggedIn?.()) bindServerActions(this, root);
    return result;
  };

  const originalRender = SmithyView.prototype.render;
  SmithyView.prototype.render = function renderSmithyWithAuthority(root, ...args) {
    const result = originalRender.call(this, root, ...args);
    if (authStore?.isLoggedIn?.()) void hydrate(this, root);
    return result;
  };
}
