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

// 铁匠铺/大厅不再保留钻石储值按钮；聊天缩放按钮增大，便于点击。
assert.match(polishSource, /removeRechargeButtons/);
assert.match(polishSource, /smithy-stone-btn/);
assert.match(polishSource, /#lobby-recharge/);
assert.match(polishSource, /button\.remove\(\)/);
assert.match(polishSource, /width:\s*56px/);
assert.match(polishSource, /height:\s*44px/);

// 100% 缩放首次进入时必须直接启用真实 grid，而不是只声明 grid-template-columns。
assert.match(polishSource, /star-charm-list[\s\S]*display:\s*grid\s*!important/);
assert.match(polishSource, /overflow-y:\s*auto\s*!important/);
assert.match(polishSource, /max-height:\s*920px/);
assert.match(polishSource, /min-width:\s*1050px/);
assert.match(polishSource, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
assert.match(polishSource, /getBoundingClientRect\(\)/);
assert.match(polishSource, /ResizeObserver/);
assert.match(polishSource, /addEventListener\('resize',\s*queueLayoutSync/);

// 房间聊天必须挂到房间 DOM 内，不能继续作为页面级 fixed 浮层。
assert.match(polishSource, /#lobby-room-inside\s*>\s*\.classic-chat/);
assert.match(polishSource, /data-room-docked='true'/);
assert.match(polishSource, /room\.appendChild\(chat\)/);
assert.match(polishSource, /position:\s*absolute\s*!important/);

const bootstrapSource = fs.readFileSync(new URL('../src/bootstrap.js', import.meta.url), 'utf8');
assert.match(bootstrapSource, /installSmithyCharmAndChatPolish20260908\(\)/);

console.log('smithy 100% zoom, recharge removal and room-docked chat guards: PASS');
