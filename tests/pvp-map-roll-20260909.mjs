import assert from 'node:assert/strict';
import { RoomManager, PVP_MAP_IDS } from '../server/rooms/RoomManager.js';

// 只验证地图：创建自动抽取、首局保留预览、再战重抽、快照一致、拒绝无效地图。
const originalRandom = Math.random;
try {
  for (const [index, roll] of [0, 0.4, 0.99].entries()) {
    Math.random = () => roll;
    const manager = new RoomManager();
    const created = manager.createRoom({ user: { id: 1, nickname: '地图验证' }, mode: 'pvp', mapId: '7', size: '1v1' });
    assert.equal(created.mapId, PVP_MAP_IDS[index]);
    manager.setRandomMatch(1, true);
    const started = manager.markStarted(1);
    assert.equal(started.mapId, created.mapId);
    assert.equal(manager.getTeams(created.id).room.mapId, started.mapId);
    assert.equal(manager.snapshot(created.id).mapId, started.mapId);
    assert.throws(() => manager.changeMap(1, '2'), /开始后/);
    manager.getRoom(created.id).status = 'waiting';
    assert.throws(() => manager.changeMap(1, '999'), /不存在/);
    const rematch = manager.markStarted(1);
    assert(PVP_MAP_IDS.includes(rematch.mapId));
    assert.notEqual(rematch.mapId, started.mapId);
    assert.equal(manager.getTeams(created.id).room.mapId, rematch.mapId);
  }
  console.log('PASS: PVP 自动 roll 地图（创建、再战及房间/战斗地图一致）');
} finally { Math.random = originalRandom; }
