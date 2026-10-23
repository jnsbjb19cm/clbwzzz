import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  await page.route('**/api/**', r => r.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
  await page.goto(process.env.WEB_BASE || 'http://127.0.0.1:5173/');
  await page.waitForFunction(() => globalThis.__clbwzAppInstance?.db);
  const results = await page.evaluate(async () => {
    const mod = p => import(performance.getEntriesByType('resource').filter(e => new URL(e.name).pathname === p).at(-1)?.name || p);
    const { RoomView } = await mod('/src/ui/RoomView.js');
    const { BattleView } = await mod('/src/ui/BattleView.js');
    const { BattleEngine } = await mod('/src/battle/BattleEngine.js');
    const { QUEST_GROUPS } = await mod('/src/data/QuestCatalog.js');
    const { syncCumulativeProgress } = await mod('/src/battle/QuestProgressRules.js');
    const { recordCardUseForQuest } = await import('/src/battle/QuestBattleSettlement20261023.js');
    const { setPlayerStorageUser } = await import('/src/core/PlayerStorage20261010.js');
    const { authStore } = await import('/src/core/AuthStore.js');
    authStore.user = { id: 'pvp-quest-test', nickname: '测试' };
    setPlayerStorageUser('pvp-quest-test');
    const app = globalThis.__clbwzAppInstance;
    const quest = QUEST_GROUPS.main.find(q => q.event === 'battle_pvp');
    const prerequisites = QUEST_GROUPS.main.slice(0, QUEST_GROUPS.main.indexOf(quest)).map(q => q.id);
    const root = document.createElement('main');
    root.innerHTML = '<section id="lobby-room-inside"></section><section id="lobby-battle"></section>';
    document.body.replaceChildren(root);
    const room = Object.create(RoomView.prototype);
    Object.assign(room, { root, db: app.db, cardInventory: app.cardInventory, myTeam: 'blue', room: { id: 123, mode: 'pvp', mapId: '1', members: [] }, socket: {}, onNavigate() {} });
    const originalRender = BattleView.prototype.render;
    // Exercise the installed room entry and real result reporting, without opening a network match.
    BattleView.prototype.render = function(panel) { this.viewRoot = panel; };
    try { room.enterBattle(); } finally { BattleView.prototype.render = originalRender; }
    const view = room.roomBattleView;
    view.onBattleResult = result => app.handleBattleResult(result);
    const handlers = new Map();
    room.socket.on = (event, handler) => { handlers.set(event, handler); return () => {}; };
    room.socket.setLobbyPresence = async () => {};
    room.bindRoomChat = () => {};
    room.notice = () => {};
    room.bindEvents();
    const panel = view.viewRoot;
    panel.innerHTML = '<section id="result-overlay"><div id="result-desc"></div></section>';
    view.syncResultAudio = () => {};
    const read = () => JSON.parse(localStorage.getItem('clbwz_quest_v12') || '{}');
    const reset = (claimed = prerequisites) => {
      localStorage.setItem('clbwz_quest_v12', JSON.stringify({ mainClaimed: claimed, _extra: { questBackfillV13: true } }));
      view._resultReported = false;
      view.engine = new BattleEngine(app.db, 10001, [], null, { pvp: true });
    };
    const outcomes = [];
    for (const status of ['win', 'lose']) {
      reset();
      recordCardUseForQuest(view, 82);
      view.engine.status = status;
      view.updateResultOverlay(panel);
      view.updateResultOverlay(panel);
      handlers.get('pvp:end')({ winner: status === 'win' ? 'blue' : 'red' });
      const state = read();
      outcomes.push({ status, progress: state.mainProgress?.[quest.id] || 0, battles: state._extra?.totalPvpBattles || 0, wins: state._extra?.totalPvpWins || 0, cardUses: state._extra?.cardUsesById?.['82'] || 0 });
    }
    reset([]);
    view.engine.status = 'lose';
    view.updateResultOverlay(panel);
    const history = read();
    history.mainClaimed = prerequisites;
    syncCumulativeProgress(history);
    const recovered = history.mainProgress?.[quest.id] || 0;
    const excluded = [];
    for (const kind of ['spectator', 'training', 'pve', 'boss']) {
      reset();
      view.pvp = { mode: kind === 'pve' || kind === 'boss' ? kind : 'pvp', spectator: kind === 'spectator' };
      view.trainingMode = kind === 'training';
      view.engine.status = 'win';
      view.updateResultOverlay(panel);
      excluded.push({ kind, battles: read()._extra?.totalPvpBattles || 0 });
    }
    return { outcomes, recovered, excluded, callbackConnected: typeof view.onQuestEvent === 'function' };
  });
  console.log(JSON.stringify(results, null, 2));
  for (const outcome of results.outcomes) {
    assert.equal(outcome.progress, 1, `${outcome.status}: 打完一场 PVP 应完成主线任务`);
    assert.equal(outcome.battles, 1, '结算重复渲染不能重复累计');
    assert.equal(outcome.wins, outcome.status === 'win' ? 1 : 0);
    assert.equal(outcome.cardUses, 1, `${outcome.status}: 出牌次数应在战斗结算时入账且只记一次`);
  }
  assert.equal(results.recovered, 1, '任务解锁后应恢复已记录的 PVP 场次');
  for (const entry of results.excluded) assert.equal(entry.battles, 0, `${entry.kind} 不应算 PVP`);
  console.log('PASS PVP main quest: win/loss, repeated result, history and excluded modes');
} finally {
  await browser.close();
}


