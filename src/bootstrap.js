import { installTrainingBaseThreatFix20260905 } from './battle/TrainingBaseThreatFix20260905.js';
import { installBattleLootVariety20260908 } from './battle/BattleLootVariety20260908.js';
import { installPlayerStorageScope } from './core/PlayerStorage20261010.js';
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
import { installSmithyCardKindFilter20260908 } from './ui/SmithyCardKindFilter20260908.js';
import { installSmithyCharmAndChatPolish20260908 } from './ui/SmithyCharmAndChatPolish20260908.js';
import { installPlayerSnapshotAuthority20260908 } from './ui/PlayerSnapshotAuthority20260908.js';
import { installDatabasePersistenceAuthority20260908 } from './ui/DatabasePersistenceAuthority20260908.js';
import { installGiftBoxOpening20261009 } from './ui/GiftBoxOpening20261009.js';
import { installBatchInventoryDatabaseFix20260908 } from './ui/BatchInventoryDatabaseFix20260908.js';
import { installPlayerStateDatabaseBridge20260908 } from './ui/PlayerStateDatabaseBridge20260908.js';
import { installQuestRewardDatabaseAuthority20260908 } from './ui/QuestRewardDatabaseAuthority20260908.js';
import { installQuestPinPersistence20260908 } from './ui/QuestPinPersistence20260908.js';
import { installMainCityTrialBulletin20260905 } from './ui/MainCityTrialBulletin20260905.js';
import { installAnnouncementPlainText20260905 } from './ui/AnnouncementPlainText20260905.js';
import { installPlayerQoL20260905 } from './ui/PlayerQoL20260905.js';
import { installDiamondShopExpansion20260905 } from './ui/DiamondShopExpansion20260905.js';
import { installBaseAttackRenderStability20260906 } from './battle/BaseAttackRenderStability20260906.js';
import { installBattleUnitPresentation20260906 } from './ui/BattleUnitPresentation20260906.js';
import { installBattleQualityHaloFix20260908 } from './ui/BattleQualityHaloFix20260908.js';
import { installBattleLootMaterialIconFix20260908 } from './ui/BattleLootMaterialIconFix20260908.js';
import { installBattleUserRegressionFix20260907 } from './ui/BattleUserRegressionFix20260907.js';
import { installPlaytimeTracker20261009 } from './core/PlaytimeTracker20261009.js';
import {
  installAccountDeckMirror20260911,
  installDeckGroupStartGuard20260911,
} from './ui/DeckGroupPreference20260911.js';
import { installDeckInventoryAuthorityFix20260907 } from './ui/DeckInventoryAuthorityFix20260907.js';
import { installRoomDeckRefreshRegressionFix20260907 } from './ui/RoomDeckRefreshRegressionFix20260907.js';
import { installRoomBattleDeckRuntimeFix20260908 } from './ui/RoomBattleDeckRuntimeFix20260908.js';
import { installRoomChatMerge20260910 } from './ui/RoomChatMerge20260910.js';
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

/**
 * 2026-10-09：单个补丁安装失败，不允许连带其它补丁一起装不上。
 * 背景：GiftBoxOpening20261009 少了一行 PATCH_FLAG 声明 → 加载即 ReferenceError，
 * 结果它后面的 10+ 个补丁（铁匠铺 / 任务奖励 / 玩家状态 / 入库权威使用…）
 * 以及最后的 import(main.js) 全都没执行，整个游戏起不来。
 * 现在每个补丁单独 try/catch：坏的只坏它自己，并在控制台留下带名字的报错。
 */
function installSafely(label, install) {
  try {
    install();
    return true;
  } catch (error) {
    console.error(`[bootstrap] ${label} 安装失败（已跳过，其它补丁继续）`, error);
    return false;
  }
}

// 2026-10-10：玩家数据按账号隔离（修玩家反馈的「换号串数据」）。
// 必须最早装 —— 它包的是 Storage.prototype，要在任何模块读玩家存档之前生效；
// 具体切到哪个账号由 AuthStore 在登录/登出时决定。
installSafely('installPlayerStorageScope', () => installPlayerStorageScope());

installSafely('installTrainingBaseThreatFix20260905', () => installTrainingBaseThreatFix20260905());
installSafely('installEconomyInventoryRules20260905', () => installEconomyInventoryRules20260905());
installSafely('installEconomyInventoryPersistence20260905', () => installEconomyInventoryPersistence20260905());
installSafely('installCraftBindingSafety20260905', () => installCraftBindingSafety20260905());
installSafely('installLobbyUiPolish20260905', () => installLobbyUiPolish20260905());
installSafely('installRoomChatRuntimePatch20260906', () => installRoomChatRuntimePatch20260906());
installSafely('installRoomChatChannelFix20260906', () => installRoomChatChannelFix20260906());
installSafely('installRoomInviteRuntime20260906', () => installRoomInviteRuntime20260906());
installSafely('installSmithyOfficialRefill20260905', () => installSmithyOfficialRefill20260905());
installSafely('installMainCityTrialBulletin20260905', () => installMainCityTrialBulletin20260905());
installSafely('installAnnouncementPlainText20260905', () => installAnnouncementPlainText20260905());
installSafely('installPlayerQoL20260905', () => installPlayerQoL20260905());
installSafely('installDiamondShopExpansion20260905', () => installDiamondShopExpansion20260905());
installSafely('installCardInventoryRemotePatch20260906', () => installCardInventoryRemotePatch20260906({ authStore }));
// 钱包/卡牌/道具等强一致数据使用专用服务器事务；本地仅做显示缓存。
installSafely('installPlayerSnapshotAuthority20260908', () => installPlayerSnapshotAuthority20260908());
installSafely('installDatabasePersistenceAuthority20260908', () => installDatabasePersistenceAuthority20260908());
installSafely('installGiftBoxOpening20261009', () => installGiftBoxOpening20261009());
// PlayerQoL 的批量面板早于数据库权威层安装；这里最后重绑数量控件和一键使用，避免退回本地循环。
installSafely('installBatchInventoryDatabaseFix20260908', () => installBatchInventoryDatabaseFix20260908());
// 任务进度、天赋配置、BOSS/世界地图进度、非货币玩家元数据也写数据库状态文档。
installSafely('installPlayerStateDatabaseBridge20260908', () => installPlayerStateDatabaseBridge20260908());
// 任务奖励必须先在数据库唯一领取并发放，再更新本地任务UI。
installSafely('installQuestRewardDatabaseAuthority20260908', () => installQuestRewardDatabaseAuthority20260908());
installSafely('installQuestPinPersistence20260908', () => installQuestPinPersistence20260908());
installSafely('installSmithyStrengthenLayoutFix20260908', () => installSmithyStrengthenLayoutFix20260908());
installSafely('installSmithyServerAuthority20260907', () => installSmithyServerAuthority20260907());
installSafely('installSmithyMissingCardGuard20260908', () => installSmithyMissingCardGuard20260908());
installSafely('installSmithyCardKindFilter20260908', () => installSmithyCardKindFilter20260908());
installSafely('installSmithyCharmAndChatPolish20260908', () => installSmithyCharmAndChatPolish20260908());

import { installPerfOverlay20260911 } from './ui/PerfOverlay20260911.js';
import { installBattleDisplayRuntime20260911 } from './ui/BattleDisplayRuntime20260911.js';
import { installRoomInviteGlobalRuntime20260911 } from './ui/RoomInviteGlobalRuntime20260911.js';
installSafely('installBattleDisplayRuntime20260911', () => installBattleDisplayRuntime20260911());
installSafely('installPerfOverlay20260911', () => installPerfOverlay20260911());
// 2026-09-11：邀请弹窗全局化——原来只有"房间"界面能收到邀请，
// 在主城/背包等界面的玩家看不到（好友那边"发了没反应"）。
installSafely('installRoomInviteGlobalRuntime20260911', () => installRoomInviteGlobalRuntime20260911());

void import('./main.js').then(() => {
  installSafely('installBaseAttackRenderStability20260906', () => installBaseAttackRenderStability20260906());
  installSafely('installBattleUserRegressionFix20260907', () => installBattleUserRegressionFix20260907());
  installSafely('installDeckInventoryAuthorityFix20260907', () => installDeckInventoryAuthorityFix20260907());
  installSafely('installRoomDeckRefreshRegressionFix20260907', () => installRoomDeckRefreshRegressionFix20260907());
  installSafely('installRoomBattleDeckRuntimeFix20260908', () => installRoomBattleDeckRuntimeFix20260908());
  installSafely('installBattleUnitPresentation20260906', () => installBattleUnitPresentation20260906());
  installSafely('installBattleLootVariety20260908', () => installBattleLootVariety20260908());
  installSafely('installBattleQualityHaloFix20260908', () => installBattleQualityHaloFix20260908());
  installSafely('installBattleLootMaterialIconFix20260908', () => installBattleLootMaterialIconFix20260908());
  // 房间聊天合并必须最后装：它要包住 LobbyChatPatch / RoomChatChannelFix 的
  // appendChat、bindRoomChat、enterRoom/exitRoom。
  installSafely('installRoomChatMerge20260910', () => installRoomChatMerge20260910());
  // 2026-09-11：空战团不允许开打（挂在最后，保证拦得住所有开始入口）。
  installSafely('installDeckGroupStartGuard20260911', () => installDeckGroupStartGuard20260911());
  // 2026-09-11：界面渲染前先用账号里的卡组纠正本地缓存（修掉历史串组的本地数据）。
  installSafely('installAccountDeckMirror20260911', () => installAccountDeckMirror20260911());
  // 2026-10-09：在线时长每 60 秒上报一次（主线26「等待10分钟」）。
  installSafely('installPlaytimeTracker20261009', () => installPlaytimeTracker20261009());
});