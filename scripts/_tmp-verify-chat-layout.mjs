// 临时验证（用完即删）：房间聊天布局 —— 顶栏单行 / 输入行贴底完整 / 新消息自下往上
import { chromium } from 'playwright';

const rows = [];
const check = (n, ok, d) => rows.push({ n, ok: Boolean(ok), d });
const b = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch({ channel: 'msedge' }));
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
await p.goto('http://127.0.0.1:4174/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(5000);

const out = await p.evaluate(async () => {
  const url = (re, fb) => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => re.test(n)).sort((a, c) => c.length - a.length)[0] ?? fb;
  await import(url(/\/src\/ui\/RoomChatMerge20260910\.js(\?|$)/, '/src/ui/RoomChatMerge20260910.js'));

  // 与用户房间一致：6 个频道 + 参考层给的 526.7x221.7 尺寸
  document.body.innerHTML = `
    <div class="game-room room-exact" data-mode="pve" style="position:relative;width:900px;height:600px;background:#112233;">
      <section class="exact-room-chat" aria-label="房间聊天" style="position:absolute;left:40px;top:40px;width:526.688px;height:221.687px;">
        <div class="exact-room-chat-head">
          <b class="exact-room-chat-title">聊天</b>
          <div class="exact-room-chat-tabs" role="tablist" aria-label="聊天频道">
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
        <form class="exact-room-chat-form"><span class="exact-room-chat-current">当前</span><input maxlength="120" placeholder="发送到当前频道" aria-label="聊天内容"><button type="submit" title="发送到当前频道">发送</button></form>
      </section>
    </div>`;
  const room = document.querySelector('.game-room.room-exact');
  const chat = room.querySelector('.exact-room-chat');
  const log = room.querySelector('.exact-room-chat-log');

  window.__installRoomChatMergeUi20260910({ root: document, room: null, lobbyChatChannel: null });

  const add = (i) => {
    const row = document.createElement('div');
    row.className = 'exact-room-chat-message';
    row.innerHTML = `<b>111：</b><span>第${i}条消息 ABC 123</span>`;
    log.append(row);
  };
  // 复现「面板还隐藏着就把消息发出去」
  chat.style.display = 'none';
  for (let i = 1; i <= 20; i += 1) add(i);
  await new Promise((r) => requestAnimationFrame(r));
  chat.style.display = '';
  await new Promise((r) => setTimeout(r, 300));

  const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) }; };
  const chatBox = box(chat);
  const headBox = box(room.querySelector('.exact-room-chat-head'));
  const logBox = box(log);
  const formBox = box(room.querySelector('.exact-room-chat-form'));
  const tabs = [...room.querySelectorAll('.exact-room-chat-tabs button')].map(box);
  const lastName = log.lastElementChild ? box(log.lastElementChild) : null;
  const cs = (el) => getComputedStyle(el);

  return {
    boxes: { chat: chatBox, head: headBox, log: logBox, form: formBox },
    tabs: { count: tabs.length, yValues: [...new Set(tabs.map((t) => t.y))], sameRow: new Set(tabs.map((t) => t.y)).size === 1, rightEdgesInside: tabs.every((t) => t.right <= chatBox.right + 1) },
    log: {
      clientHeight: log.clientHeight,
      scrollHeight: log.scrollHeight,
      scrollTop: log.scrollTop,
      canScroll: log.scrollHeight > log.clientHeight,
      atBottom: Math.abs(log.scrollTop + log.clientHeight - log.scrollHeight) <= 2,
      lastVisible: Boolean(lastName) && lastName.bottom <= logBox.bottom + 1,
      gapToInput: formBox.y - logBox.bottom,
    },
    layout: {
      headInside: headBox.bottom <= chatBox.bottom && headBox.y >= chatBox.y,
      formInside: formBox.bottom <= chatBox.bottom + 1,
      logBelowHead: logBox.y >= headBox.bottom - 1,
      formBelowLog: formBox.y >= logBox.bottom - 2,
      headHeight: headBox.h,
    },
    colors: {
      panelBg: cs(chat).backgroundColor, panelImage: cs(chat).backgroundImage,
      headBg: cs(room.querySelector('.exact-room-chat-head')).backgroundColor,
      logBg: cs(log).backgroundColor, logText: cs(log).color,
      formBg: cs(room.querySelector('.exact-room-chat-form')).backgroundColor,
    },
    watching: typeof window.__roomChatScrollWatching20260911 === 'function' ? window.__roomChatScrollWatching20260911() : null,
  };
});

check('顶栏 6 个频道在同一行（不再竖排）', out.tabs.count === 6 && out.tabs.sameRow === true, JSON.stringify(out.tabs));
check('频道按钮都在面板内（横向也不溢出）', out.tabs.rightEdgesInside === true, JSON.stringify(out.tabs.yValues));
check('顶栏高度压到 ≤30px（不再吃掉半块）', out.layout.headHeight <= 30, String(out.layout.headHeight));
check('顺序：顶栏 → 日志 → 输入行', out.layout.logBelowHead === true && out.layout.formBelowLog === true, JSON.stringify(out.layout));
check('输入行完整落在面板内（不再被切掉）', out.layout.formInside === true && out.layout.headInside === true, JSON.stringify(out.layout));
check('日志可滚动', out.log.canScroll === true, JSON.stringify(out.log));
check('新消息自下往上：显示后自动置底', out.log.atBottom === true, JSON.stringify(out.log));
check('最新一条紧贴输入行上方可见', out.log.lastVisible === true && out.log.gapToInput <= 2, JSON.stringify({ lastVisible: out.log.lastVisible, gap: out.log.gapToInput }));
check('面板仍是白底无渐变', /^rgb\(255, 255, 255\)$/.test(out.colors.panelBg) && out.colors.panelImage === 'none', JSON.stringify([out.colors.panelBg, out.colors.panelImage]));
check('顶栏/日志/输入行同白底 + 日志黑字', /^rgb\(255, 255, 255\)$/.test(out.colors.headBg) && /^rgb\(255, 255, 255\)$/.test(out.colors.logBg) && /^rgb\(255, 255, 255\)$/.test(out.colors.formBg) && out.colors.logText === 'rgb(0, 0, 0)', JSON.stringify(out.colors));
check('自动置底观察器已挂上', out.watching === true, String(out.watching));
check('无 JS 报错', errs.length === 0, errs.slice(0, 2).join(' | '));

await p.screenshot({ path: 'scripts/output/room-chat-20260911.png' });
await b.close();
const bad = rows.filter((r) => !r.ok);
for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}  ${r.ok ? '' : `<< ${r.d}`}`);
console.log(`\n${rows.length - bad.length}/${rows.length} passed`);
console.log('截图: scripts/output/room-chat-20260911.png');
process.exit(bad.length ? 1 : 0);
