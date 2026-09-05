import { authStore } from '../core/AuthStore.js';
import { BagView } from './BagView.js';
import { SmithyView } from './SmithyView.js';

const PATCH_FLAG = Symbol.for('clbwz.smithyOfficialRefill20260905');

function installSmithyRefillButton() {
  const previousRenderUpgradeRoute = SmithyView.prototype.renderUpgradeRoute;
  SmithyView.prototype.renderUpgradeRoute = function renderUpgradeRouteWithOfficialRefill20260905(root, body, route) {
    const result = previousRenderUpgradeRoute.call(this, root, body, route);
    if (route !== 'powder') return result;

    const oldButton = body?.querySelector?.('#star-grant-test');
    if (!oldButton) return result;

    // 原按钮是本地“测试补发”，会绕过账号每日次数限制。
    // 直接克隆替换，移除旧事件，再接入正式服务器补发接口。
    const button = oldButton.cloneNode(true);
    button.textContent = '补发道具';
    button.title = '每个账号每天最多50次；每次强化粉、羊皮纸、宝石、保护符、DNA等各100个，全部绑定';
    oldButton.replaceWith(button);

    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      const originalText = button.textContent;
      button.textContent = '补发中…';
      try {
        const data = await authStore.api.post('/player/material-refill', {});
        const local = this.inventory.grantBoundRefill?.(data.items ?? []);
        if (local && !local.ok) {
          this.toast(root, `服务器已补发，但本地背包空间不足：${local.failed.map((entry) => entry.name).join('、')}`);
        } else {
          this.toast(root, `已补发道具：强化粉及制作材料各100个，全部绑定；今日 ${data.claimCount}/${data.dailyLimit} 次，剩余 ${data.remaining} 次`);
        }
        this.renderBody(root);
      } catch (error) {
        this.toast(root, error?.message || '道具补发失败');
      } finally {
        if (button.isConnected) {
          button.disabled = false;
          button.textContent = originalText;
        }
      }
    });

    return result;
  };
}

function removeBagRefillEntry() {
  const previousRenderToolbar = BagView.prototype.renderToolbar;
  BagView.prototype.renderToolbar = function renderToolbarWithoutMaterialRefill20260905(root) {
    const result = previousRenderToolbar.call(this, root);
    // 正式补发入口统一放到“铁匠铺 → 强化”，避免同一福利出现两个入口。
    root?.querySelector?.('#bag-grant-mat')?.remove();
    root?.querySelector?.('#bag-grant-powder')?.remove();
    return result;
  };
}

export function installSmithyOfficialRefill20260905() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;
  installSmithyRefillButton();
  removeBagRefillEntry();
}
