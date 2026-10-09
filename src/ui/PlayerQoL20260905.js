import { BagView } from './BagView.js';
import { FriendView } from './FriendView.js';

const PATCH_FLAG = Symbol.for('clbwz.playerQoL20260905');
// 2026-10-09：这里原本是「批量使用 + 一键使用全部」的第二套数量面板（CARD_TARGET_ITEMS / enhanceBatchUse 等）。
// 现在数量控件统一由 BagView 提供（滑块默认、可切填数字），入库权威使用由 BatchInventoryDatabaseFix20260908 接管，
// 两套面板并存会互相覆盖（用户报「使用按钮被劫持/数量框有两个」），所以整块删除。下面只保留好友搜索增强。

function installFriendSearchGuidance() {
  const previousRender = FriendView.prototype.render;
  FriendView.prototype.render = async function renderWithSearchGuidance20260905(root, ...args) {
    const result = await previousRender.call(this, root, ...args);
    const input = root?.querySelector?.('#friend-search');
    if (input) {
      input.placeholder = '输入玩家ID / 游戏昵称 / 登录账号';
      input.title = '支持玩家ID、游戏昵称、登录账号；昵称和账号支持模糊搜索';
    }
    return result;
  };
}

export function installPlayerQoL20260905() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;
  installFriendSearchGuidance();
}
