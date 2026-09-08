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

const bootstrapSource = fs.readFileSync(new URL('../src/bootstrap.js', import.meta.url), 'utf8');
assert.match(bootstrapSource, /installSmithyCharmAndChatPolish20260908\(\)/);

console.log('level-4 protection charm artwork and collapsible classic chat: PASS');
