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
import { installBattleRuntimePerformance20260905 } from '../src/battle/BattleRuntimePerformance20260905.js';
import { config } from './config.js';
import './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { authRouter } from './routes/auth.js';
import { playerRouter } from './routes/player.js';
import { playerSnapshotAuthorityRouter20260908 } from './routes/playerSnapshotAuthority20260908.js';
import { stageResultAuthorityRouter20260908 } from './routes/stageResultAuthority20260908.js';
import { playerEconomyAuthorityRouter20260908 } from './routes/playerEconomyAuthority20260908.js';
import { functionalItemAuthorityRouter20260908 } from './routes/functionalItemAuthority20260908.js';
import { playerStateDocumentRouter20260908 } from './routes/playerStateDocument20260908.js';
import { questPinPersistenceRouter20260908 } from './routes/questPinPersistence20260908.js';
import { materialRefillRouter } from './routes/materialRefill.js';
import { smithyAuthorityRouter20260907 } from './routes/smithyAuthority20260907.js';
import { socialSearchFixRouter } from './routes/socialSearchFix20260905.js';
import { socialFriendFixRouter } from './routes/socialFriendFix20260905.js';
import { socialRouter } from './routes/social.js';
import { guildUpgradeAuthorityRouter20260907 } from './routes/guildUpgradeAuthority20260907.js';
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
import { installAuthorityPerformance20260905 } from './battle/AuthorityPerformance20260905.js';
import { installRoomBossRound2Fix } from './rooms/RoomBossRound2Fix.js';
import { installRoomDeckSelection20260907 } from './rooms/RoomDeckSelection20260907.js';
import { startRoomLifetimeService } from './rooms/RoomLifetimeService.js';
import { startRandomMatchBotService } from './rooms/RandomMatchBotService.js';
import { registerSocketHandlers } from './socket/registerSocketHandlers.js';
import { installBattleChatService } from './socket/BattleChatService.js';
import { installRoomInviteService20260906 } from './socket/RoomInviteService20260906.js';
import { installSystemAnnouncementService } from './socket/SystemAnnouncementService.js';
import { installAuthoritySnapshotBackpressure20260905 } from './socket/AuthoritySnapshotBackpressure20260905.js';
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
installRoomDeckSelection20260907();
installBattleRuleConvergence20260830();
installAuthorityRuleConvergence20260830();
installBattleUserRules20260903();
installPvpNeutralDamageOwnership20260903();
installPvpBotAi20260905();
installBattleRuntimePerformance20260905();
installAuthorityPerformance20260905();

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
app.use('/api/player', playerSnapshotAuthorityRouter20260908);
app.use('/api/player', stageResultAuthorityRouter20260908);
app.use('/api/player', playerEconomyAuthorityRouter20260908);
app.use('/api/player', functionalItemAuthorityRouter20260908);
app.use('/api/player', playerStateDocumentRouter20260908);
app.use('/api/player', questPinPersistenceRouter20260908);
app.use('/api/player/smithy', smithyAuthorityRouter20260907);
app.use('/api/player', playerRouter);
app.use('/api/player', materialRefillRouter);
app.use('/api/social', socialFriendFixRouter);
app.use('/api/social', socialSearchFixRouter);
app.use('/api/social', socialRouter);
app.use('/api/guild', guildUpgradeAuthorityRouter20260907);
app.use('/api/guild', guildWarehouseGridRouter);
app.use('/api/guild', guildRouter);
app.use('/api/auction', auctionRouter);

const distDir = path.resolve(__dirname, '../dist');
const indexHtml = path.join(distDir, 'index.html');
if (fs.existsSync(indexHtml)) {
  app.use(express.static(distDir, {
    maxAge: '1d',
    setHeaders(res, filePath) {
      if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
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
installAuthoritySnapshotBackpressure20260905(io);
registerSocketHandlers(io);
registerPvpAuthorityHandlers(io, { cardDb: getPvpCardDb() });
installBattleChatService(io);
installRoomInviteService20260906(io);
installSystemAnnouncementService(io);

const stopRandomMatchBotService = startRandomMatchBotService(io);
const stopRoomLifetimeService = startRoomLifetimeService(io, { stopBattle: stopAuthorityBattleByRoom });

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
