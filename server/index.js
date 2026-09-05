import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import '../src/battle/BattleEngineBaseEdgeCompat.js';
import { installBattleMeleeContactFinal } from '../src/battle/BattleMeleeContactFinal.js';
import { installBattleMushroomProjectileFinal } from '../src/battle/BattleMushroomProjectileFinal.js';
import { installBattleRuleConvergence20260830 } from '../src/battle/BattleRuleConvergence20260830.js';
import { installBattleUserRules20260903 } from '../src/battle/BattleUserRules20260903.js';
import { config } from './config.js';
import './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { authRouter } from './routes/auth.js';
import { playerRouter } from './routes/player.js';
import { materialRefillRouter } from './routes/materialRefill.js';
import { socialRouter } from './routes/social.js';
import { guildRouter } from './routes/guild.js';
import { guildWarehouseGridRouter } from './routes/guildWarehouseGrid.js';
import { auctionRouter } from './routes/auction.js';
import { getPvpCardDb } from './battle/PvpCardDb.js';
import { installPvpGameplayFinal } from './battle/PvpGameplayInstall.js';
import { installPvpCombatPolishFinal } from './battle/PvpCombatPolishFinal.js';
import { installPvpSpecialSymmetryFinal } from './battle/PvpSpecialSymmetryFinal.js';
import { installPvpBaseDamageSymmetryFinal } from './battle/PvpBaseDamageSymmetryFinal.js';
import { installPvpRound2Gameplay } from './battle/PvpRound2Gameplay.js';
import { installPvpNeutralDamageOwnership20260903 } from './battle/PvpNeutralDamageOwnership20260903.js';
import { installCoopBossOwnerResourceFinal } from './battle/CoopBossOwnerResourceFinal.js';
import { installAuthorityRuleConvergence20260830 } from './battle/AuthorityRuleConvergence20260830.js';
import { installPvpBotAi20260905 } from './battle/PvpBotAi20260905.js';
import { installRoomBossRound2Fix } from './rooms/RoomBossRound2Fix.js';
import { startRoomLifetimeService } from './rooms/RoomLifetimeService.js';
import { startRandomMatchBotService } from './rooms/RandomMatchBotService.js';
import { registerSocketHandlers } from './socket/registerSocketHandlers.js';
import { installBattleChatService } from './socket/BattleChatService.js';
import { installSystemAnnouncementService } from './socket/SystemAnnouncementService.js';
import {
  registerPvpAuthorityHandlers,
  stopAllPvpAuthorityBattles,
  stopAuthorityBattleByRoom,
} from './socket/registerPvpAuthorityHandlers.js';

installPvpGameplayFinal();
installPvpCombatPolishFinal();
installPvpSpecialSymmetryFinal();
installPvpBaseDamageSymmetryFinal();
installPvpRound2Gameplay();
installBattleMeleeContactFinal();
installBattleMushroomProjectileFinal();
installCoopBossOwnerResourceFinal();
installRoomBossRound2Fix();
// 业务权威收口必须最后安装：只覆盖仍冲突的语义，不回退 Round2/Round3 已修好的规则。
installBattleRuleConvergence20260830();
installAuthorityRuleConvergence20260830();
// 2026-09-03 用户规则最终权威：服务端与客户端使用同一套飞行/死亡规则；
// 中立障碍的精灵归属只认真正造成扣血并完成击杀的一方。
installBattleUserRules20260903();
installPvpNeutralDamageOwnership20260903();
// 人机只改 PVP 行为：遵循真实资源与软 CD，同时提高可移动卡/前线判断权重。
installPvpBotAi20260905();

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', config.trustProxy);
if (config.corsAllowAll) {
  app.use(cors({ origin: true, credentials: true }));
} else {
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('该来源不允许跨域访问'));
    },
    credentials: true,
  }));
}
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'clbwzzz-server', time: new Date().toISOString() });
});
app.use('/api/auth', authRouter);
app.use('/api/player', playerRouter);
app.use('/api/player', materialRefillRouter);
app.use('/api/social', socialRouter);
// 新仓库接口放在旧 guildRouter 前面，相同 deposit/withdraw 路径由新版非绑定物品规则优先处理。
app.use('/api/guild', guildWarehouseGridRouter);
app.use('/api/guild', guildRouter);
app.use('/api/auction', auctionRouter);

const distDir = path.resolve(__dirname, '../dist');
const indexHtml = path.join(distDir, 'index.html');
if (fs.existsSync(indexHtml)) {
  app.use(express.static(distDir, {
    maxAge: '1d',
    setHeaders(res, filePath) {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    },
  }));
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    return res.sendFile(indexHtml);
  });
  console.log(`[clbwzzz] serving client from ${distDir}`);
} else {
  console.warn(`[clbwzzz] dist 不存在，远程访问请先执行: npm run build`);
}

app.use('/api', (_req, res) => res.status(404).json({ message: '接口不存在' }));
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: '服务器内部错误' });
});

const server = http.createServer(app);
const socketCorsOrigin = config.corsAllowAll ? true : (origin, callback) => {
  if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
  return callback(new Error('该来源不允许跨域访问'));
};
const io = new Server(server, {
  cors: { origin: socketCorsOrigin, credentials: true },
  transports: ['websocket', 'polling'],
});
registerSocketHandlers(io);
registerPvpAuthorityHandlers(io, { cardDb: getPvpCardDb() });
installBattleChatService(io);
installSystemAnnouncementService(io);

// 随机匹配：先给真人 10 秒匹配窗口，超时仍有空位再补人机。
const stopRandomMatchBotService = startRandomMatchBotService(io);

// 房间从创建起最多存在 2 小时；同时回收随机匹配后只剩人机的死房间。
const stopRoomLifetimeService = startRoomLifetimeService(io, {
  stopBattle: stopAuthorityBattleByRoom,
});

server.listen(config.port, () => {
  console.log(`[clbwzzz] server listening on http://localhost:${config.port}`);
});

function shutdown(signal) {
  console.log(`[clbwzzz] ${signal} received, shutting down...`);
  stopRandomMatchBotService?.();
  stopRoomLifetimeService?.();
  stopAllPvpAuthorityBattles();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
