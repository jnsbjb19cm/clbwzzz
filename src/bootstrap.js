import { installTrainingBaseThreatFix20260905 } from './battle/TrainingBaseThreatFix20260905.js';
import { installEconomyInventoryRules20260905 } from './ui/EconomyInventoryRules20260905.js';
import { installEconomyInventoryPersistence20260905 } from './ui/EconomyInventoryPersistence20260905.js';
import { installCraftBindingSafety20260905 } from './ui/CraftBindingSafety20260905.js';
import { installLobbyUiPolish20260905 } from './ui/LobbyUiPolish20260905.js';
import { installSmithyOfficialRefill20260905 } from './ui/SmithyOfficialRefill20260905.js';
import { installMainCityTrialBulletin20260905 } from './ui/MainCityTrialBulletin20260905.js';
import { installAnnouncementPlainText20260905 } from './ui/AnnouncementPlainText20260905.js';
import { installPlayerQoL20260905 } from './ui/PlayerQoL20260905.js';
import { installDiamondShopExpansion20260905 } from './ui/DiamondShopExpansion20260905.js';

// 铁匠铺造卡：木牌会覆盖左侧概率信息，直接给整个概率面板内容预留顶部空间。
// 放在 bootstrap 里以高优先级注入，避免后续 ClassicCityChrome 的旧布局把它顶回去。
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

// 战斗规则修复要在创建 BattleEngine 实例前安装。
installTrainingBaseThreatFix20260905();
// 必须在 App 创建 InventoryStore / LoginView / SmithyView / RoomView 实例之前安装。
installEconomyInventoryRules20260905();
installEconomyInventoryPersistence20260905();
installCraftBindingSafety20260905();
installLobbyUiPolish20260905();
// 正式补发入口统一为“铁匠铺 → 强化 → 补发道具”，账号每天最多500次。
installSmithyOfficialRefill20260905();
// 必须排在大厅微调之后，这样可在其横向公告栏上追加试玩公告。
installMainCityTrialBulletin20260905();
// 公告采用纯文字样式，不使用表情符号装饰。
installAnnouncementPlainText20260905();
// 背包批量使用 + 好友搜索入口提示。
installPlayerQoL20260905();
// 商城增加钻石购买的金币箱子、功能道具和高阶材料。
installDiamondShopExpansion20260905();

void import('./main.js');
