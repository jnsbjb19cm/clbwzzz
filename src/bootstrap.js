import { installTrainingBaseThreatFix20260905 } from './battle/TrainingBaseThreatFix20260905.js';
import { installEconomyInventoryRules20260905 } from './ui/EconomyInventoryRules20260905.js';
import { installEconomyInventoryPersistence20260905 } from './ui/EconomyInventoryPersistence20260905.js';
import { installCraftBindingSafety20260905 } from './ui/CraftBindingSafety20260905.js';
import { installLobbyUiPolish20260905 } from './ui/LobbyUiPolish20260905.js';
import { installRoomChatRuntimePatch20260906 } from './ui/RoomChatRuntimePatch20260906.js';
import { installRoomChatChannelFix20260906 } from './ui/RoomChatChannelFix20260906.js';
import { installRoomInviteRuntime20260906 } from './ui/RoomInviteRuntime20260906.js';
import { installSmithyOfficialRefill20260905 } from './ui/SmithyOfficialRefill20260905.js';
import { installSmithyServerAuthority20260907 } from './ui/SmithyServerAuthority20260907.js';
import { installSmithyStrengthenLayoutFix20260908 } from './ui/SmithyStrengthenLayoutFix20260908.js';
import { installSmithyMissingCardGuard20260908 } from './ui/SmithyMissingCardGuard20260908.js';
import { installPlayerSnapshotAuthority20260908 } from './ui/PlayerSnapshotAuthority20260908.js';
import { installMainCityTrialBulletin20260905 } from './ui/MainCityTrialBulletin20260905.js';
import { installAnnouncementPlainText20260905 } from './ui/AnnouncementPlainText20260905.js';
import { installPlayerQoL20260905 } from './ui/PlayerQoL20260905.js';
import { installDiamondShopExpansion20260905 } from './ui/DiamondShopExpansion20260905.js';
import { installBaseAttackRenderStability20260906 } from './battle/BaseAttackRenderStability20260906.js';
import { installBattleUnitPresentation20260906 } from './ui/BattleUnitPresentation20260906.js';
import { installBattleUserRegressionFix20260907 } from './ui/BattleUserRegressionFix20260907.js';
import { installDeckInventoryAuthorityFix20260907 } from './ui/DeckInventoryAuthorityFix20260907.js';
import { installRoomDeckRefreshRegressionFix20260907 } from './ui/RoomDeckRefreshRegressionFix20260907.js';
import { installCardInventoryRemotePatch20260906 } from './core/CardInventoryRemotePatch20260906.js';
import { authStore } from './core/AuthStore.js';

if (typeof document !== 'undefined' && !document.querySelector('#smithy-craft-probability-offset-20260905')) {
  const style = document.createElement('style');
  style.id = 'smithy-craft-probability-offset-20260905';
  style.textContent = `
    .classic-smithy-screen[data-smithy-mode='craft'] .smithy-craft-probability[data-smithy-probability-panel],
    .classic-smithy-screen[data-smithy-mode='craft'] .smithy-craft-layout > .smithy-craft-probability {
      box-sizing: border-box !important;
      padding-top: 138px !important;
      scroll-padding-top: 138px !important;
    }

    .classic-smithy-screen[data-smithy-mode='craft'] .smithy-craft-probability > .smithy-preview {
      margin-top: 0 !important;
    }

    @media (max-height: 820px) {
      .classic-smithy-screen[data-smithy-mode='craft'] .smithy-craft-probability[data-smithy-probability-panel],
      .classic-smithy-screen[data-smithy-mode='craft'] .smithy-craft-layout > .smithy-craft-probability {
        padding-top: 118px !important;
        scroll-padding-top: 118px !important;
      }
    }
  `;
  document.head.appendChild(style);
}

installTrainingBaseThreatFix20260905();
installEconomyInventoryRules20260905();
installEconomyInventoryPersistence20260905();
installCraftBindingSafety20260905();
installLobbyUiPolish20260905();
// Must run after the lobby patch because it owns the final in-room append/replay behavior.
installRoomChatRuntimePatch20260906();
// Channel authority must run after the persistence patch so it can replace the legacy
// send listener while retaining message replay across room rerenders.
installRoomChatChannelFix20260906();
// Invite runtime shares RoomView lifecycle with room chat; install it after chat patches so
// lobby/room/battle presence and invitation UI wrap the final RoomView methods.
installRoomInviteRuntime20260906();
installSmithyOfficialRefill20260905();
installMainCityTrialBulletin20260905();
installAnnouncementPlainText20260905();
installPlayerQoL20260905();
installDiamondShopExpansion20260905();
// 登录成功后以服务器卡库为权威；旧版本仅存本地的强化/洗练实例状态会做一次兼容迁移。
installCardInventoryRemotePatch20260906({ authStore });
// 登录/刷新后金币和道具统一使用数据库快照，localStorage 只做显示缓存。
installPlayerSnapshotAuthority20260908();
// 强化界面固定为“左信息 / 中央强化台 / 右选卡”，禁止中央操作台被响应式规则挤入右侧选卡区。
installSmithyStrengthenLayoutFix20260908();
// 铁匠铺制造/强化/加工/拆解统一改为服务器事务权威；必须在 SmithyView 真正使用前安装。
installSmithyServerAuthority20260907();
// 数据库里若残留旧版本卡牌ID，强化/拆解不能因为 card.name 为空让整个界面崩溃。
installSmithyMissingCardGuard20260908();

void import('./main.js').then(() => {
  installBaseAttackRenderStability20260906();
  // 用户本轮三项回归：四套战团权威切换 + 实物掉落图标预载。
  installBattleUserRegressionFix20260907();
  // 必须位于旧战团运行时补丁之后：把 team1/2/3 接回服务器战团，并让“补全卡”走专用权威接口。
  installDeckInventoryAuthorityFix20260907();
  // 最终房间状态收口：战团分组保存，随机地图/换队/准备不再触发整页重绘。
  installRoomDeckRefreshRegressionFix20260907();
  installBattleUnitPresentation20260906();
});
