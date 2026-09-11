import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch({ channel: 'msedge' }));
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
await p.goto('http://127.0.0.1:4174/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(4500);
console.log(JSON.stringify(await p.evaluate(() => {
  document.body.innerHTML = `<div class="game-room room-exact" style="position:relative;width:900px;height:600px">
    <section class="exact-room-chat" style="position:absolute;left:40px;top:40px;width:526.688px;height:221.687px;">
      <div class="exact-room-chat-head"><b class="exact-room-chat-title">聊天</b><div class="exact-room-chat-tabs"><button>当前</button><button>队伍</button><button>系统</button><button>世界</button><button>公会</button><button>私聊</button></div></div>
      <div class="exact-room-chat-private hidden"><span>私聊对象</span><select></select></div>
      <div class="exact-room-chat-log"><div class="exact-room-chat-message"><b>111：</b><span>x</span></div></div>
      <form class="exact-room-chat-form"><span class="exact-room-chat-current">当前</span><input><button>发送</button></form>
    </section></div>`;
  const q = (s) => document.querySelector(s);
  const bx = (s) => { const r = q(s).getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height), Math.round(r.bottom)]; };
  const cs = (s) => { const c = getComputedStyle(q(s)); return { pos: c.position, top: c.top, bottom: c.bottom, h: c.height, minH: c.minHeight, disp: c.display, mt: c.marginTop, mb: c.marginBottom, pt: c.paddingTop, pb: c.paddingBottom, box: c.boxSizing }; };
  return {
    chat: bx('.exact-room-chat'), head: bx('.exact-room-chat-head'), log: bx('.exact-room-chat-log'), form: bx('.exact-room-chat-form'),
    chatCS: cs('.exact-room-chat'), formCS: cs('.exact-room-chat-form'), logCS: cs('.exact-room-chat-log'),
    chatRows: getComputedStyle(q('.exact-room-chat')).gridTemplateRows,
  };
}), null, 1));
await b.close();
