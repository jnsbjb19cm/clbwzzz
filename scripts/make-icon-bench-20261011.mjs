/**
 * 生成"功能图标对照看板"（无需重新 build 即可打开）：
 *   node scripts/make-icon-bench-20261011.mjs   →  写 dist/icon-bench.html
 * 打开：http://localhost:3001/icon-bench.html
 * 用途：我这边读不了图片（ReadImage 报 spawn EINVAL），只能靠肉眼对号，
 *       由用户看着看板告诉我「鼓 / 刀 / 盾 / 月亮 / 弓箭」分别是哪一号。
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const cards = JSON.parse(fs.readFileSync(path.join(root, 'src/data/card.json'), 'utf8'));

// 与 src/data/cardFunctionIcon.js 同步的"当前实现"
const CURRENT = {
  1: '远程攻击（弓箭）', 2: '近战攻击（刀）', 3: '防御（盾）', 4: '辅助（鼓）',
  5: '未改动·突击', 6: '未使用', 7: '特殊效果（月亮？）',
};
const NAMED = {
  19: '稻草人', 32: '嗜血稻草人', 22: '蒲公英医生', 36: '蒲公英精灵', 26: '部落巫婆', 51: '太古巫婆',
  88: '魔法冰盾', 90: '火图腾', 11: '松果战士', 1: '花生射手', 56: '火龙', 58: '蘑菇仙人',
  7: '西瓜太郎', 30: '真·西瓜太郎', 3: '跑鞋怪',
};

const cell = (n) => `
  <figure>
    <img src="/sprites/parts/cardType_${n}.png" alt="cardType_${n}" width="96" height="96" />
    <figcaption>
      <b>cardType_${n}</b>
      <span class="num">编号 ${n}</span>
      <span class="cur">现在被我指为：${CURRENT[n]}</span>
    </figcaption>
  </figure>`;

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8" />
<title>功能图标对照看板 · cardType_1~7</title>
<style>
  body { background:#14161a; color:#eee; font:16px/1.6 "Microsoft YaHei",sans-serif; margin:0; padding:24px; }
  h1 { font-size:22px; margin:0 0 6px; }
  p.hint { color:#9fb3c8; margin:0 0 20px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:16px; }
  figure { margin:0; background:#1d2128; border:1px solid #2c333d; border-radius:12px; padding:14px; text-align:center; }
  figcaption { display:flex; flex-direction:column; gap:4px; margin-top:10px; font-size:14px; }
  .num { color:#ffd479; font-weight:700; }
  .cur { color:#8fa6bb; }
  .named { margin-top:28px; background:#1a1e24; border-radius:12px; padding:14px 18px; }
  .named b { color:#ffd479; }
  li { margin:2px 0; }
</style></head>
<body>
  <h1>功能图标对照看板（cardType_1 ~ cardType_7）</h1>
  <p class="hint">
    请照着下面的编号告诉我：<b>弓箭</b> / <b>刀</b> / <b>鼓</b> / <b>盾</b> / <b>月亮</b> 分别是哪一号。<br />
    （右侧"现在被我指为"是当前代码里的对应关系，可能是我猜错的 —— 以你看到的图为准。）
  </p>
  <div class="grid">${[1, 2, 3, 4, 5, 6, 7].map(cell).join('')}</div>
  <div class="named">
    <b>对照用：这些卡现在分别显示哪张图</b>
    <ul>
      ${Object.entries(NAMED).map(([id, name]) => {
        const c = cards.find((x) => Number(x.card_id) === Number(id));
        const legacy = (() => {
          if (!c) return '?';
          const s = Number(c.atk_style), t = Number(c.card_type), cat = Number(c.card_category);
          if (cat === 2) return 7;
          if (s === 1) return 2;
          if (t === 2) return 3;
          if (t === 3) return 4;
          if (Number(c.move_speed) > 0) return 5;
          return 1;
        })();
        return `<li>${name}(${id})　旧逻辑→ cardType_${legacy}　｜　新规则→ ${CURRENT[legacy] ?? '—'}</li>`;
      }).join('')}
    </ul>
  </div>
</body></html>`;

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/icon-bench.html'), html);
console.log('已生成 dist/icon-bench.html → 打开 http://localhost:3001/icon-bench.html');
