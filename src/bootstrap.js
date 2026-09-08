import { installTrainingBaseThreatFix20260905 } from './battle/TrainingBaseThreatFix20260905.js';
import { installBattleLootVariety20260908 } from './battle/BattleLootVariety20260908.js';
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
import { installPlayerSnapshotAuthority20260908 } from './ui/PlayerSnapshotAuthority20260908.js';
import { installDatabasePersistenceAuthority20260908 } from './ui/DatabasePersistenceAuthority20260908.js';
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
import { installDeckInventoryAuthorityFix20260907 } from './ui/DeckInventoryAuthorityFix20260907.js';
import { installRoomDeckRefreshRegressionFix20260907 } from './ui/RoomDeckRefreshRegressionFix20260907.js';
import { installRoomBattleDeckRuntimeFix20260908 } from './ui/RoomBattleDeckRuntimeFix20260908.js';
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
installRoomChatRuntimePatch20260906();
installRoomChatChannelFix20260906();
installRoomInviteRuntime20260906();
installSmithyOfficialRefill20260905();
installMainCityTrialBulletin20260905();
installAnnouncementPlainText20260905();
installPlayerQoL20260905();
installDiamondShopExpansion20260905();
installCardInventoryRemotePatch20260906({ authStore });
// 登录/刷新后服务器快照覆盖本地缓存。
installPlayerSnapshotAuthority20260908();
// 背包、金币/钻石/荣誉、商城购买、功能道具、卡牌移除等持久化操作必须先提交数据库。
installDatabasePersistenceAuthority20260908();
installQuestPinPersistence20260908();
installSmithyStrengthenLayoutFix20260908();
installSmithyServerAuthority20260907();
installSmithyMissingCardGuard20260908();
installSmithyCardKindFilter20260908();

void import('./main.js').then(() => {
  installBaseAttackRenderStability20260906();
  installBattleUserRegressionFix20260907();
  installDeckInventoryAuthorityFix20260907();
  installRoomDeckRefreshRegressionFix20260907();
  installRoomBattleDeckRuntimeFix20260908();
  installBattleUnitPresentation20260906();
  installBattleLootVariety20260908();
  installBattleQualityHaloFix20260908();
  installBattleLootMaterialIconFix20260908();
});