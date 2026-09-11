// 临时验证（用完即删）：内容过滤 / 改名卡 / 违规昵称强制改名 / 聊天布局
import { chromium } from 'playwright';

const rows = [];
const check = (n, ok, d) => rows.push({ n, ok: Boolean(ok), d });
const b = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch({ channel: 'msedge' }));
const p = await b.newPage({ viewport: { width: 1600, height: 950 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
await p.goto('http://127.0.0.1:4174/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(4500);

const out = await p.evaluate(async () => {
  const pick = (re, fb) => performance.getEntriesByType('resource')
    .map((e) => e.name)
    .filter((n) => re.test(n))
    .sort((a, c) => c.length - a.length)[0] ?? fb;

  const result = {};
  const filter = await import(pick(/\/src\/core\/ContentFilter\.js(\?|$)/, '/src/core/ContentFilter.js'));
  result.filterBlocked = filter.containsBlockedWord('傻 逼') === true
    && filter.containsBlockedWord('傻-逼') === true
    && filter.containsBlockedWord('勇者阿强') === false;
  result.filterMask = filter.maskBlockedWords('你这傻逼玩意').includes('＊＊');

  const { RoomView } = await import(pick(/\/src\/ui\/RoomView\.js(\?|$)/, '/src/ui/RoomView.js'));
  await import(pick(/\/src\/ui\/RoomChatMerge20260910\.js(\?|$)/, '/src/ui/RoomChatMerge20260910.js'));
  await import(pick(/\/src\/ui\/LobbyChatPatch20260905\.js(\?|$)/, '/src/ui/LobbyChatPatch20260905.js'));

  // 房间聊天：违规词收到后打码
  document.body.innerHTML = `<div class="game-room room-exact"><section class="exact-room-chat"><div class="exact-room-chat-head"><b class="exact-room-chat-title">聊天</b><div class="exact-room-chat-tabs"><button class="active" data-merge-channel="current">当前</button></div></div><div class="exact-room-chat-private hidden"></div><div class="exact-room-chat-log"></div><form class="exact-room-chat-form"><span class="exact-room-chat-current">当前</span><input><button>发送</button></form></section></div>`;
  const roomView = Object.create(RoomView.prototype);
  roomView.root = document; roomView.room = { chat: [] }; roomView.socket = {};
  roomView.bindRoomChat();
  roomView.appendChat({ channel: 'current', nickname: '甲', text: '这是傻逼内容' });
  const roomText = document.querySelector('.exact-room-chat-log').textContent;
  result.roomMasked = !roomText.includes('傻逼') && roomText.includes('＊＊');

  // 大厅聊天：违规词收到后打码
  document.body.innerHTML = `<div class="classic-game-hall"><div class="lobby-stage"><div class="lobby-chat"></div></div></div>`;
  const lobbyView = Object.create(RoomView.prototype);
  lobbyView.root = document; lobbyView.room = null;
  window.__mountLobbyChat20260911(lobbyView);
  lobbyView.appendChat({ channel: 'world', nickname: '乙', text: '加微信一起玩' });
  const lobbyText = document.querySelector('#lobby-chat-list').textContent;
  result.lobbyMasked = !lobbyText.includes('加微信') && lobbyText.includes('＊');

  // 聊天布局：输入行贴底且完整
  document.body.innerHTML = `<div class="game-room room-exact"><section class="exact-room-chat" style="position:absolute;left:40px;top:40px;width:520px;height:220px;"><div class="exact-room-chat-head"><b class="exact-room-chat-title">聊天</b><div class="exact-room-chat-tabs"><button class="active" data-merge-channel="current">当前</button></div></div><div class="exact-room-chat-private hidden"></div><div class="exact-room-chat-log">${'<div class="exact-room-chat-message"><b>甲：</b><span>消息</span></div>'.repeat(20)}</div><form class="exact-room-chat-form"><span class="exact-room-chat-current">当前</span><input><button>发送</button></form></section></div>`;
  const chat = document.querySelector('.exact-room-chat');
  const log = chat.querySelector('.exact-room-chat-log');
  const form = chat.querySelector('.exact-room-chat-form');
  const chatBox = chat.getBoundingClientRect();
  const formBox = form.getBoundingClientRect();
  const logBox = log.getBoundingClientRect();
  result.chatFormPinned = formBox.bottom <= chatBox.bottom + 1 && formBox.height >= 30;
  result.chatLogScrolls = log.scrollHeight > log.clientHeight + 1;
  result.chatLogTopDown = logBox.top >= chat.querySelector('.exact-room-chat-head').getBoundingClientRect().bottom - 1;

  // 改名卡：道具库 + 商店价 1 + 可使用标记
  const { ItemDatabase } = await import(pick(/\/src\/core\/ItemDatabase\.js(\?|$)/, '/src/core/ItemDatabase.js'));
  const itemDb = new ItemDatabase();
  const renameItem = itemDb.getById(98);
  result.renameCardInDatabase = renameItem?.name === '改名卡';
  const { ItemUseSystem } = await import(pick(/\/src\/systems\/ItemUseSystem\.js(\?|$)/, '/src/systems/ItemUseSystem.js'));
  const useSystem = new ItemUseSystem({}, itemDb);
  result.renameCardUsable = useSystem.isUsable(renameItem) === true;
  result.renameCardNoDirectConsume = useSystem.use(renameItem, 0, { getSlots: () => [{ itemId: 98, count: 1 }] }, {}, {})?.requiresRename === true;

  // 商店条目（源码里必须存在 1 金币 realId 98）
  const shopSrc = await (await fetch(pick(/\/src\/ui\/ShopView\.js(\?|$)/, '/src/ui/ShopView.js'))).text();
  result.shopHasRenameCard = /name:'改名卡'[\s\S]{0,80}realId:98,count:1/.test(shopSrc);

  // 违规昵称强制改名弹窗
  const { authStore } = await import(pick(/\/src\/core\/AuthStore\.js(\?|$)/, '/src/core/AuthStore.js'));
  const forced = await import(pick(/\/src\/ui\/ForcedRename20260911\.js(\?|$)/, '/src/ui/ForcedRename20260911.js'));
  const prevSnapshot = authStore.snapshot;
  authStore.snapshot = { profile: { nickname: '傻逼玩家' } };
  const shown = forced.enforceNicknameCompliance20260911();
  await new Promise((r) => setTimeout(r, 30));
  result.forcedOverlayShown = shown === true && Boolean(document.getElementById('forced-rename-overlay'));
  result.forcedOverlayBlocks = Boolean(document.querySelector('#forced-rename-skip'));
  document.getElementById('forced-rename-overlay')?.remove();
  authStore.snapshot = { profile: { nickname: '勇者阿强' } };
  result.forcedOverlaySkippedForClean = forced.enforceNicknameCompliance20260911() === false;
  authStore.snapshot = prevSnapshot;
  return result;
});

check('过滤：傻 逼 / 傻-逼 命中，正常名不误伤', out.filterBlocked, JSON.stringify(out.filterBlocked));
check('过滤：显示打码', out.filterMask === true, String(out.filterMask));
check('房间聊天：违规词收到即打码', out.roomMasked === true, String(out.roomMasked));
check('大厅聊天：违规词收到即打码', out.lobbyMasked === true, String(out.lobbyMasked));
check('聊天布局：输入栏贴底且完整', out.chatFormPinned === true, String(out.chatFormPinned));
check('聊天布局：日志可滚动', out.chatLogScrolls === true, String(out.chatLogScrolls));
check('聊天布局：日志在标题下方（从上往下）', out.chatLogTopDown === true, String(out.chatLogTopDown));
check('改名卡：已在道具库（ID 98）', out.renameCardInDatabase === true, String(out.renameCardInDatabase));
check('改名卡：标记为可使用且不直接消耗', out.renameCardUsable === true && out.renameCardNoDirectConsume === true, JSON.stringify(out));
check('改名卡：商城 1 金币上架', out.shopHasRenameCard === true, String(out.shopHasRenameCard));
check('违规昵称：上线弹出强制改名', out.forcedOverlayShown === true && out.forcedOverlayBlocks === true, JSON.stringify(out));
check('违规昵称：正常昵称不弹窗', out.forcedOverlaySkippedForClean === true, String(out.forcedOverlaySkippedForClean));
check('无 JS 报错', errs.length === 0, errs.slice(0, 2).join(' | '));

await b.close();
const bad = rows.filter((r) => !r.ok);
for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}  ${r.ok ? '' : `<< ${r.d}`}`);
console.log(`\n${rows.length - bad.length}/${rows.length} passed`);
process.exit(bad.length ? 1 : 0);
