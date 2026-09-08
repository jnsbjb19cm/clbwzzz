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

// 100% 缩放首次进入时必须直接启用真实 grid，并保留重排监听。
assert.match(polishSource, /star-charm-list[\s\S]*display:\s*grid\s*!important/);
assert.match(polishSource, /overflow-y:\s*auto\s*!important/);
assert.match(polishSource, /getBoundingClientRect\(\)/);
assert.match(polishSource, /ResizeObserver/);
assert.match(polishSource, /addEventListener\('resize',\s*queueLayoutSync/);

// 保护符必须固定为两行两列，名称完整显示；旧的横向滚动轨道不能回来。
assert.match(polishSource, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*!important/);
assert.match(polishSource, /grid-template-rows:\s*repeat\(2,\s*minmax\(0,\s*auto\)\)\s*!important/);
assert.match(polishSource, /grid-auto-flow:\s*row\s*!important/);
assert.match(polishSource, /text-overflow:\s*clip\s*!important/);
assert.match(polishSource, /white-space:\s*nowrap\s*!important/);
assert.doesNotMatch(polishSource, /grid-auto-flow:\s*column\s*!important/);
assert.doesNotMatch(polishSource, /scroll-snap-type:\s*x/);
assert.doesNotMatch(polishSource, /text-overflow:\s*ellipsis/);

// 强化粉图标必须跟实际 powderNeed 对应的粉末名称/等级走，不能再随升星目标变化图标。
assert.match(polishSource, /POWDER_TIER_BY_LABEL/);
assert.match(polishSource, /'一级强化粉':\s*1/);
assert.match(polishSource, /'二级强化粉':\s*2/);
assert.match(polishSource, /'三级强化粉':\s*3/);
assert.match(polishSource, /'四级强化粉':\s*4/);
assert.match(polishSource, /fixPowderArtwork/);
assert.match(polishSource, /data-smithy-art="powder"/);
assert.match(polishSource, /backgroundPosition\s*=\s*`50% \$\{offset\}%`/);

// starup-info 只向左吃掉闲置区域：右边缘不动，中心工作台和卡牌区不被挤走。
const layoutSource = fs.readFileSync(new URL('../src/ui/SmithyStrengthenLayoutFix20260908.js', import.meta.url), 'utf8');
assert.match(layoutSource, /--smithy-info-left-expand:\s*120px/);
assert.match(layoutSource, /width:\s*calc\(100% \+ var\(--smithy-info-left-expand\)\)\s*!important/);
assert.match(layoutSource, /margin-left:\s*calc\(-1 \* var\(--smithy-info-left-expand\)\)\s*!important/);
assert.match(layoutSource, /@media \(max-width:\s*1250px\)/);
assert.match(layoutSource, /--smithy-info-left-expand:\s*0px/);

// 房间聊天必须挂到房间 DOM 内，不能继续作为页面级 fixed 浮层。
assert.match(polishSource, /#lobby-room-inside\s*>\s*\.classic-chat/);
assert.match(polishSource, /data-room-docked='true'/);
assert.match(polishSource, /room\.appendChild\(chat\)/);
assert.match(polishSource, /position:\s*absolute\s*!important/);

const bootstrapSource = fs.readFileSync(new URL('../src/bootstrap.js', import.meta.url), 'utf8');
assert.match(bootstrapSource, /installSmithyStrengthenLayoutFix20260908\(\)/);
assert.match(bootstrapSource, /installSmithyCharmAndChatPolish20260908\(\)/);

console.log('smithy widened info panel, 2x2 charm labels, powder-tier artwork and room chat guards: PASS');
