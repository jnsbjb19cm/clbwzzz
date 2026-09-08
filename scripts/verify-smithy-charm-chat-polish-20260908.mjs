import assert from 'node:assert/strict';
import fs from 'node:fs';

const artSource = fs.readFileSync(new URL('../src/ui/SmithyMaterialArtwork.js', import.meta.url), 'utf8');
assert.match(artSource, /PTL4\.png/);
assert.match(artSource, /50024/);

const polishSource = fs.readFileSync(new URL('../src/ui/SmithyCharmAndChatPolish20260908.js', import.meta.url), 'utf8');
assert.match(polishSource, /\[data-charm-id="50024"\]/);
assert.match(polishSource, /SMITHY_MATERIAL_ART\.charm\?\.\[3\]/);
assert.match(polishSource, /classic-chat-collapse/);
assert.match(polishSource, /is-minimized/);
assert.match(polishSource, /MutationObserver/);
assert.match(polishSource, /aria-expanded/);

// 铁匠铺不再保留单独的“钻石储值”大按钮；聊天缩放按钮必须足够大，便于点击。
assert.match(polishSource, /removeSmithyRecharge/);
assert.match(polishSource, /smithy-stone-btn/);
assert.match(polishSource, /button\.remove\(\)/);
assert.match(polishSource, /width:\s*44px/);
assert.match(polishSource, /height:\s*36px/);

// 低高度视口下，保护符区域必须留出底部安全空间并可滚到四级保护符，不能被底部导航/聊天遮住。
assert.match(polishSource, /100dvh\s*-\s*350px/);
assert.match(polishSource, /scroll-padding-bottom:\s*84px/);
assert.match(polishSource, /star-charm-list::after/);
assert.match(polishSource, /data-charm-id="50024"/);

// 用户截图的宽屏低高度场景下改为 2×2 保护符布局，四个等级在 100% 浏览器缩放也能同时出现。
assert.match(polishSource, /max-height:\s*920px/);
assert.match(polishSource, /min-width:\s*1050px/);
assert.match(polishSource, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);

const bootstrapSource = fs.readFileSync(new URL('../src/bootstrap.js', import.meta.url), 'utf8');
assert.match(bootstrapSource, /installSmithyCharmAndChatPolish20260908\(\)/);

console.log('level-4 protection charm artwork, normal-zoom layout and collapsible classic chat: PASS');
