// 临时验证（用完即删）：野外冒险(PVE)联机 —— 修「开始后误进单机」
import { chromium } from 'playwright';

const rows = [];
const check = (n, ok, d) => rows.push({ n, ok: Boolean(ok), d });
const b = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch({ channel: 'msedge' }));
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
await p.goto('http://127.0.0.1:4174/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3500);

const out = await p.evaluate(async () => {
  const pick = (re, fb) => performance.getEntriesByType('resource')
    .map((e) => e.name)
    .filter((n) => re.test(n))
    .sort((a, c) => c.length - a.length)[0] ?? fb;

  const { RoomView } = await import(pick(/\/src\/ui\/RoomView\.js(\?|$)/, '/src/ui/RoomView.js'));
  const { BattleView } = await import(pick(/\/src\/ui\/BattleView\.js(\?|$)/, '/src/ui/BattleView.js'));
  const bridge = await import(pick(/\/src\/ui\/AdventureCoopBridge20260911\.js(\?|$)/, '/src/ui/AdventureCoopBridge20260911.js'));
  bridge.installAdventureCoopBridge20260911();

  const result = {};
  // 不真的渲染战斗（避免连 socket/canvas），只验证路由：pve 房间必须进联机战斗，而不是 onNavigate('battle')
  const originalRender = BattleView.prototype.render;
  BattleView.prototype.render = function stubRender() { this.viewRoot = this.viewRoot || document.body; };

  const buildRoom = (mode) => {
    document.body.innerHTML = '<div class="room-shell"><div id="lobby-room-inside"></div><div id="lobby-battle" class="hidden"></div></div>';
    const navigations = [];
    const view = Object.create(RoomView.prototype);
    view.root = document.body;
    view.db = { getById: () => null, stages: [] };
    view.cardInventory = { getSlots: () => [] };
    // 任意 socket 方法都返回 Promise 的桩，避免连真实服务器
    view.socket = new Proxy({}, { get: (_t, prop) => (prop === 'then' ? undefined : () => Promise.resolve({})) });
    view.inventory = { getSlots: () => [] };
    view.onNavigate = (...args) => navigations.push(args);
    view.room = mode === 'boss'
      ? { id: 7, mode: 'boss', bossId: 'boss_forest', difficulty: '简单', mapId: '4', name: '森林BOSS[简单]' }
      : { id: 9, mode: 'pve', stageId: 3, mapId: 1, name: '密林边缘3' };
    view.enterBattle();
    return { view, navigations };
  };

  // PVE 房间
  const pve = buildRoom('pve');
  result.pveDidNotGoSinglePlayer = !pve.navigations.some((args) => args[0] === 'battle');
  result.pveEnteredCoopBattle = pve.view.roomBattleView?.pvp?.mode === 'pve';
  result.pveUsedRoomStage = Number(pve.view.roomBattleView?.pvp?.stageId) === 3;
  result.pveBattleImmersion = document.body.classList.contains('battle-immersive');
  result.pveOverlayExit = Boolean(document.getElementById('pvp-exit-ov'));
  result.pveOverlaySettings = Boolean(document.getElementById('pvp-settings-ov'));

  // BOSS 房间回归：仍进 BOSS 联机
  const boss = buildRoom('boss');
  result.bossStillCoop = boss.view.roomBattleView?.pvp?.mode === 'boss';
  result.bossDidNotGoSinglePlayer = !boss.navigations.some((args) => args[0] === 'battle');

  BattleView.prototype.render = originalRender;
  document.getElementById('coop-pve-overlay-controls')?.remove();
  return result;
});

check('PVE 房间：不再被丢进单机战斗', out.pveDidNotGoSinglePlayer === true, JSON.stringify(out));
check('PVE 房间：进入联机合作战斗(mode=pve)', out.pveEnteredCoopBattle === true, String(out.pveEnteredCoopBattle));
check('PVE 房间：使用房间真实关卡(3)', out.pveUsedRoomStage === true, String(out.pveUsedRoomStage));
check('PVE 房间：进入战斗沉浸态', out.pveBattleImmersion === true, String(out.pveBattleImmersion));
check('PVE 房间：有退出/设置按钮', out.pveOverlayExit === true && out.pveOverlaySettings === true, JSON.stringify(out));
check('BOSS 房间：回归仍进 BOSS 联机', out.bossStillCoop === true && out.bossDidNotGoSinglePlayer === true, JSON.stringify(out));
check('无 JS 报错', errs.length === 0, errs.slice(0, 2).join(' | '));

await b.close();
const bad = rows.filter((r) => !r.ok);
for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}${r.ok ? '' : `  << ${r.d}`}`);
console.log(`\n${rows.length - bad.length}/${rows.length} passed`);
process.exit(bad.length ? 1 : 0);
