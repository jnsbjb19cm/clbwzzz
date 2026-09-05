import { installEconomyInventoryRules20260905 } from './ui/EconomyInventoryRules20260905.js';
import { installEconomyInventoryPersistence20260905 } from './ui/EconomyInventoryPersistence20260905.js';
import { installCraftBindingSafety20260905 } from './ui/CraftBindingSafety20260905.js';
import { installLobbyUiPolish20260905 } from './ui/LobbyUiPolish20260905.js';

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

// 必须在 App 创建 InventoryStore / LoginView / SmithyView / RoomView 实例之前安装。
installEconomyInventoryRules20260905();
installEconomyInventoryPersistence20260905();
installCraftBindingSafety20260905();
installLobbyUiPolish20260905();

void import('./main.js');
