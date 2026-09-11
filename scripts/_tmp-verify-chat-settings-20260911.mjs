// 临时验证（用完即删）：聊天框合并日志/切换不刷新/清屏 + 设置页画质不跳顶 + 战斗设置面板透明
import { chromium } from 'playwright';

const rows = [];
const check = (n, ok, d) => rows.push({ n, ok: Boolean(ok), d });
const b = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch({ channel: 'msedge' }));
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
await p.goto('http://127.0.0.1:4174/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(4500);

const out = await p.evaluate(async () => {
  // 复用页面已加载的模块实例（Vite dev 会给 URL 加 ?t= 查询，直接 import 路径会拿到第二份模块）。
  const pick = (re, fb) => performance.getEntriesByType('resource')
    .map((e) => e.name)
    .filter((n) => re.test(n))
    .sort((a, c) => c.length - a.length)[0] ?? fb;
  const { RoomView } = await import(pick(/\/src\/ui\/RoomView\.js(\?|$)/, '/src/ui/RoomView.js'));
  await import(pick(/\/src\/ui\/RoomChatMerge20260910\.js(\?|$)/, '/src/ui/RoomChatMerge20260910.js'));
  await import(pick(/\/src\/ui\/LobbyChatPatch20260905\.js(\?|$)/, '/src/ui/LobbyChatPatch20260905.js'));
  const { SettingsView } = await import(pick(/\/src\/ui\/SettingsView\.js(\?|$)/, '/src/ui/SettingsView.js'));
  const { BattleEngine } = await import(pick(/\/src\/battle\/BattleEngine\.js(\?|$)/, '/src/battle/BattleEngine.js'));
  const { unitAnimPlayer } = await import(pick(/\/src\/battle\/UnitAnimPlayer\.js(\?|$)/, '/src/battle/UnitAnimPlayer.js'));

  const result = {};

  // ---------- 房间聊天 ----------
  document.body.innerHTML = `
    <div class="game-room room-exact" style="position:relative;width:900px;height:600px;background:#112233;">
      <section class="exact-room-chat" aria-label="房间聊天" style="position:absolute;left:40px;top:40px;width:526px;height:222px;">
        <div class="exact-room-chat-head">
          <b class="exact-room-chat-title">聊天</b>
          <div class="exact-room-chat-tabs" role="tablist">
            <button type="button" class="active" data-channel="当前" data-merge-channel="current">当前</button>
            <button type="button" data-channel="队伍" data-merge-channel="team">队伍</button>
            <button type="button" data-channel="系统" data-merge-channel="system">系统</button>
            <button type="button" data-channel="世界" data-merge-channel="world">世界</button>
            <button type="button" data-channel="公会" data-merge-channel="guild">公会</button>
            <button type="button" data-channel="私聊" data-merge-channel="private">私聊</button>
          </div>
        </div>
        <div class="exact-room-chat-private hidden"><span>私聊对象</span><select class="exact-room-chat-private-select"><option value="">选择好友…</option></select></div>
        <div class="exact-room-chat-log" aria-live="polite"></div>
        <form class="exact-room-chat-form"><span class="exact-room-chat-current">当前</span><input maxlength="120" placeholder="发送到当前频道"><button type="submit">发送</button></form>
      </section>
    </div>`;

  const roomView = Object.create(RoomView.prototype);
  roomView.root = document;
  roomView.room = { chat: [] };
  roomView.socket = { sendLobbyChat: () => Promise.resolve(), sendChat: () => Promise.resolve() };
  // 走真实入口：bindRoomChat 会注册 clbwz:room-exact-ready 监听并装配 UI。
  roomView.bindRoomChat();

  const rlog = () => document.querySelector('.exact-room-chat-log');
  const rrows = () => [...rlog().querySelectorAll('.exact-room-chat-message')].map((r) => r.textContent);
  roomView.appendChat({ channel: 'current', nickname: '甲', text: '当前消息' });
  roomView.appendChat({ channel: 'team', nickname: '乙', text: '队伍消息' });
  roomView.appendChat({ system: true, nickname: '系统', text: '系统消息' });
  roomView.appendChat({ channel: 'world', nickname: '丙', text: '世界消息' });
  roomView.appendChat({ channel: 'guild', nickname: '丁', text: '公会消息' });
  roomView.appendChat({ channel: 'private', nickname: '戊', text: '私聊消息' });
  const afterAppend = rrows();
  result.roomAllChannelsInOneLog = ['当前消息', '队伍消息', '系统消息', '世界消息', '公会消息', '私聊消息']
    .every((t) => afterAppend.some((row) => row.includes(t)));
  result.roomRowCountAfterAppend = afterAppend.length;
  result.roomHasClear = Boolean(document.querySelector('.exact-room-chat-clear'));

  // 切换到「队伍」：日志内容必须一条不少
  document.querySelector('.exact-room-chat-tabs button[data-merge-channel="team"]').click();
  await new Promise((r) => setTimeout(r, 60));
  const afterSwitch = rrows();
  result.roomSwitchKeepsRows = afterSwitch.length === afterAppend.length
    && afterAppend.every((t, i) => afterSwitch[i] === t);
  result.roomSwitchActive = document.querySelector('.exact-room-chat-tabs button.active')?.dataset?.mergeChannel;
  result.roomSwitchComposer = document.querySelector('.exact-room-chat-current')?.textContent;

  // 清屏
  document.querySelector('.exact-room-chat-clear').click();
  await new Promise((r) => setTimeout(r, 30));
  result.roomClearRows = rrows().length;
  // 清屏后新消息照常显示
  roomView.appendChat({ channel: 'current', nickname: '己', text: '清屏后的新消息' });
  result.roomRowsAfterClearThenSend = rrows().length;

  // 模拟房间快照：DeckSelectView 整块重建 .game-room（聊天 DOM 被换掉），
  // BattleRoomExact 随后广播 clbwz:room-exact-ready —— 记录必须自动补回。
  roomView.appendChat({ channel: 'team', nickname: '庚', text: '重建前的队伍消息' });
  roomView.appendChat({ channel: 'world', nickname: '辛', text: '重建前的世界消息' });
  const rowsBeforeRebuild = rrows().length;
  document.body.innerHTML = `
    <div class="game-room room-exact" style="position:relative;width:900px;height:600px;background:#112233;">
      <section class="exact-room-chat" aria-label="房间聊天" style="position:absolute;left:40px;top:40px;width:526px;height:222px;">
        <div class="exact-room-chat-head"><b class="exact-room-chat-title">聊天</b>
          <div class="exact-room-chat-tabs" role="tablist">
            <button type="button" class="active" data-channel="当前" data-merge-channel="current">当前</button>
            <button type="button" data-channel="队伍" data-merge-channel="team">队伍</button>
            <button type="button" data-channel="系统" data-merge-channel="system">系统</button>
            <button type="button" data-channel="世界" data-merge-channel="world">世界</button>
            <button type="button" data-channel="公会" data-merge-channel="guild">公会</button>
            <button type="button" data-channel="私聊" data-merge-channel="private">私聊</button>
          </div>
        </div>
        <div class="exact-room-chat-private hidden"><span>私聊对象</span><select class="exact-room-chat-private-select"><option value="">选择好友…</option></select></div>
        <div class="exact-room-chat-log" aria-live="polite"></div>
        <form class="exact-room-chat-form"><span class="exact-room-chat-current">当前</span><input maxlength="120" placeholder="发送到当前频道"><button type="submit">发送</button></form>
      </section>
    </div>`;
  document.querySelector('.game-room').dispatchEvent(new CustomEvent('clbwz:room-exact-ready', { bubbles: true }));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise((r) => setTimeout(r, 60));
  result.roomRowsAfterRebuild = rrows().length;
  result.roomRowsBeforeRebuild = rowsBeforeRebuild;
  result.roomClearRestoredAfterRebuild = Boolean(document.querySelector('.exact-room-chat-clear'));
  result.roomActiveRestoredAfterRebuild = document.querySelector('.exact-room-chat-tabs button.active')?.dataset?.mergeChannel;

  // ---------- 大厅聊天 ----------
  document.body.innerHTML = `
    <div class="classic-game-hall"><div class="lobby-stage">
      <div class="lobby-chat"></div>
    </div></div>`;
  const lobbyView = Object.create(RoomView.prototype);
  lobbyView.root = document;
  lobbyView.room = null;
  window.__mountLobbyChat20260911(lobbyView);
  lobbyView.appendChat({ channel: 'world', nickname: '甲', text: '世界频道消息' });
  lobbyView.appendChat({ channel: 'guild', nickname: '乙', text: '公会频道消息' });
  lobbyView.appendChat({ channel: 'private', nickname: '丙', text: '私聊频道消息' });
  lobbyView.appendChat({ channel: 'current', nickname: '丁', text: '当前频道消息' });
  const lrows = () => [...document.querySelectorAll('#lobby-chat-list .lobby-chat-item')].map((r) => r.textContent);
  const lobbyAfterAppend = lrows();
  result.lobbyAllChannelsInOneLog = ['世界频道消息', '公会频道消息', '私聊频道消息', '当前频道消息']
    .every((t) => lobbyAfterAppend.some((row) => row.includes(t)));
  result.lobbyHasClear = Boolean(document.querySelector('.lobby-chat-clear'));
  document.querySelector('.lobby-chat-channel[data-lobby-chat-channel="guild"]').click();
  await new Promise((r) => setTimeout(r, 40));
  const lobbyAfterSwitch = lrows();
  result.lobbySwitchKeepsRows = lobbyAfterSwitch.length === lobbyAfterAppend.length
    && lobbyAfterAppend.every((t, i) => lobbyAfterSwitch[i] === t);
  result.lobbySwitchActive = document.querySelector('.lobby-chat-channel.active')?.dataset?.lobbyChatChannel;
  document.querySelector('.lobby-chat-clear').click();
  await new Promise((r) => setTimeout(r, 30));
  result.lobbyClearRows = lrows().filter((t) => !t.includes('暂无消息')).length;

  // ---------- 设置页画质不跳顶 ----------
  document.body.innerHTML = '<div id="gset-host"></div>';
  const host = document.querySelector('#gset-host');
  new SettingsView().render(host);
  const panelBefore = host.querySelector('.gset-panel');
  const lowBtn = host.querySelector('#setting-quality [data-quality="low"]');
  lowBtn.click();
  await new Promise((r) => setTimeout(r, 40));
  result.settingsPanelSameNode = host.querySelector('.gset-panel') === panelBefore;
  result.settingsLowActive = lowBtn.classList.contains('active');
  result.settingsDamageUncheckedAfterLow = host.querySelector('#setting-damage-numbers').checked === false;
  const highBtn = host.querySelector('#setting-quality [data-quality="high"]');
  highBtn.click();
  await new Promise((r) => setTimeout(r, 40));
  result.settingsHighActiveNoRerender = highBtn.classList.contains('active') && host.querySelector('.gset-panel') === panelBefore;

  // ---------- 战斗设置面板透明 ----------
  document.body.innerHTML = '<div class="game-container"><div id="settings-panel" class="settings-panel"><button id="settings-fps">📈 帧率：关</button></div></div>';
  document.body.classList.add('battle-immersive');
  const panel = document.querySelector('#settings-panel');
  const cs = getComputedStyle(panel);
  result.battlePanelBg = cs.backgroundColor;
  result.battlePanelTranslucent = /rgba\([^)]*0?\.\d+\)/.test(cs.backgroundColor);
  result.battleHasFpsButton = Boolean(document.querySelector('#settings-fps'));
  document.body.classList.remove('battle-immersive');

  // ---------- 冰冻：地道单位也必须停住（移动循环里冻结检查要在钻地分支之前） ----------
  const makeUnit = (frozen) => ({
    alive: true,
    col: 2,
    lane: 1,
    renderX: 9,
    renderY: 9,
    burrowMoved: false,
    isMovable: () => true,
    isFlying: () => false,
    isStunned: () => false,
    isFrozen: () => frozen,
    isTunnelUnit: () => true,
  });
  const runMovement = (unit) => {
    const engine = {
      time: 10,
      units: [unit],
      landCollidingAerialUnits: () => false,
      finishAerialLanding: () => false,
      updateBurrowMovement: () => { unit.burrowMoved = true; unit.col += 1; },
    };
    BattleEngine.prototype.updateUnitMovement.call(engine, 0.5);
  };
  const frozen = makeUnit(true);
  runMovement(frozen);
  result.frozenTunnelStays = frozen.col === 2 && frozen.renderX === 2 && frozen.burrowMoved === false;
  const alive = makeUnit(false);
  runMovement(alive);
  result.unfrozenTunnelMoves = alive.burrowMoved === true && alive.col === 3;

  // ---------- 冰冻：精灵动画状态锁定（冻结瞬间的状态不再切换） ----------
  const frames = [{ x: 0, y: 0, w: 16, h: 16, bounds: { left: 0, top: 0, right: 15, bottom: 15 } }];
  const pack = {
    meta: {
      frameW: 16,
      frameH: 16,
      animations: {
        default: { frames, frameRate: 10, loop: true },
        moving: { frames, frameRate: 10, loop: true },
      },
    },
  };
  const animUnit = {
    uid: 987654, res: 'verify-only', alive: true, viewType: 2,
    hp: 10, maxHp: 10, col: 2, _prevRenderX: 1,
    isMovable: () => true, frozenUntil: 0,
  };
  const livePick = unitAnimPlayer.pickDrawState(pack, animUnit, { time: 100 });
  // 冻结并让「实时判定」本应切回 default（位置不变）
  animUnit.frozenUntil = 105;
  animUnit.col = 2;
  animUnit._prevRenderX = 2;
  const frozenPick = unitAnimPlayer.pickDrawState(pack, animUnit, { time: 101 });
  result.frozenStateLocked = livePick?.state === 'moving' && frozenPick?.state === 'moving';
  // 解冻后恢复实时判定（此时位置不变 → default）
  animUnit.frozenUntil = 99;
  const resumedPick = unitAnimPlayer.pickDrawState(pack, animUnit, { time: 101 });
  result.unfrozenStateResumes = resumedPick?.state === 'default';

  // 帧时钟冻结：两条绘制路径都必须有冰冻判断
  const animSrc = await (await fetch('/src/battle/UnitAnimPlayer.js')).text();
  const viewportSrc = await (await fetch('/src/ui/UnitAnimationViewportFinal.js')).text();
  result.spriteClockFreezePatched = /frozenUntil && now < unit\.frozenUntil\) frameDelta = 0/.test(animSrc)
    && /frozenUntil && now < unit\.frozenUntil\) delta = 0/.test(viewportSrc);
  return result;
});

check('房间：六个频道消息都在同一日志里', out.roomAllChannelsInOneLog, JSON.stringify(out));
check('房间：有清屏按钮', out.roomHasClear, String(out.roomHasClear));
check('房间：切换频道不刷新（行数/内容不变）', out.roomSwitchKeepsRows, JSON.stringify(out));
check('房间：切换后高亮与输入目标正确', out.roomSwitchActive === 'team' && out.roomSwitchComposer === '队伍', `${out.roomSwitchActive}/${out.roomSwitchComposer}`);
check('房间：清屏后日志为空', out.roomClearRows === 0, String(out.roomClearRows));
check('房间：清屏后仍能收新消息', out.roomRowsAfterClearThenSend === 1, String(out.roomRowsAfterClearThenSend));
check('房间：快照重建 DOM 后记录自动补回', out.roomRowsAfterRebuild === out.roomRowsBeforeRebuild && out.roomRowsBeforeRebuild === 3, `${out.roomRowsAfterRebuild}/${out.roomRowsBeforeRebuild}`);
check('房间：重建后清屏按钮补回', out.roomClearRestoredAfterRebuild === true, String(out.roomClearRestoredAfterRebuild));
check('房间：重建后恢复上次频道', out.roomActiveRestoredAfterRebuild === 'team', String(out.roomActiveRestoredAfterRebuild));
check('大厅：四个频道消息都在同一日志里', out.lobbyAllChannelsInOneLog, JSON.stringify(out));
check('大厅：有清屏按钮', out.lobbyHasClear, String(out.lobbyHasClear));
check('大厅：切换频道不刷新（行数/内容不变）', out.lobbySwitchKeepsRows, JSON.stringify(out));
check('大厅：切换后高亮正确', out.lobbySwitchActive === 'guild', String(out.lobbySwitchActive));
check('大厅：清屏后日志为空', out.lobbyClearRows === 0, String(out.lobbyClearRows));
check('设置：点画质后不整页重绘（面板节点不变）', out.settingsPanelSameNode === true, JSON.stringify(out));
check('设置：低画质选中且伤害数字自动关', out.settingsLowActive === true && out.settingsDamageUncheckedAfterLow === true, JSON.stringify(out));
check('设置：高画质选中且不重绘', out.settingsHighActiveNoRerender === true, JSON.stringify(out));
check('战斗设置面板：背景半透明', out.battlePanelTranslucent === true, String(out.battlePanelBg));
check('战斗设置面板：有帧率开关', out.battleHasFpsButton === true, String(out.battleHasFpsButton));
check('冰冻：被冻住的地道单位不再移动', out.frozenTunnelStays === true, JSON.stringify(out));
check('冰冻：未冻住的地道单位照常移动（没有误伤）', out.unfrozenTunnelMoves === true, String(out.unfrozenTunnelMoves));
check('冰冻：精灵动画状态锁定（不会自行切换）', out.frozenStateLocked === true, JSON.stringify(out));
check('冰冻：解冻后动画状态恢复实时判定', out.unfrozenStateResumes === true, String(out.unfrozenStateResumes));
check('冰冻：两条绘制路径都冻结了帧时钟', out.spriteClockFreezePatched === true, String(out.spriteClockFreezePatched));
check('无 JS 报错', errs.length === 0, errs.slice(0, 2).join(' | '));

await b.close();
const bad = rows.filter((r) => !r.ok);
for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}  ${r.ok ? '' : `<< ${r.d}`}`);
console.log(`\n${rows.length - bad.length}/${rows.length} passed`);
process.exit(bad.length ? 1 : 0);
