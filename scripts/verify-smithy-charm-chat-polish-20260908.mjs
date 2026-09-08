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
assert.match(polishSource, /smithy-stone-btn/);
assert.match(polishSource, /width:\s*44px/);
assert.match(polishSource, /height:\s*36px/);

// 低高度视口下，保护符区域必须留出底部安全空间并可滚到四级保护符，不能被底部导航/聊天遮住。
assert.match(polishSource, /100dvh\s*-\s*350px/);
assert.match(polishSource, /scroll-padding-bottom:\s*84px/);
assert.match(polishSource, /star-charm-list::after/);
assert.match(polishSource, /data-charm-id="50024"/);

const bootstrapSource = fs.readFileSync(new URL('../src/bootstrap.js', import.meta.url), 'utf8');
assert.match(bootstrapSource, /installSmithyCharmAndChatPolish20260908\(\)/);

console.log('level-4 protection charm artwork, footer-safe scroll and collapsible classic chat: PASS');
