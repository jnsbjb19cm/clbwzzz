import { installEconomyInventoryRules20260905 } from './ui/EconomyInventoryRules20260905.js';
import { installEconomyInventoryPersistence20260905 } from './ui/EconomyInventoryPersistence20260905.js';

// 必须在 App 创建 InventoryStore / LoginView / SmithyView 实例之前安装。
installEconomyInventoryRules20260905();
installEconomyInventoryPersistence20260905();

void import('./main.js');
