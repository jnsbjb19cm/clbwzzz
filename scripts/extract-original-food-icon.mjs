// 原素材复用：按图集元数据提取 coin-power，保留原像素，不重绘。
import sharp from 'sharp';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const atlas = JSON.parse(fs.readFileSync('src/data/atlas/preload_items.json'));
const sprite = atlas.sprites.find(s => s.name === 'coin-power');
assert.ok(sprite);
await sharp('resources/img/items.png')
  .extract({left:sprite.x, top:sprite.y, width:sprite.width, height:sprite.height})
  .extend({left:2, right:2, top:3, bottom:3, background:{r:0,g:0,b:0,alpha:0}})
  .png().toFile('assets/battle/jungle/res_food_original.png');
const original = await sharp('resources/img/items.png').extract({left:sprite.x,top:sprite.y,width:32,height:30}).ensureAlpha().raw().toBuffer();
const extracted = await sharp('assets/battle/jungle/res_food_original.png').extract({left:2,top:3,width:32,height:30}).ensureAlpha().raw().toBuffer();
assert.deepEqual(extracted, original, '食物图标必须逐像素使用用户原素材');
console.log('PASS original coin-power pixels preserved');
