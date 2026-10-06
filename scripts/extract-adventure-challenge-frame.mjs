// 复用原地图图集中的圆形金属框，不重绘地图。
import sharp from 'sharp';
import fs from 'node:fs';
const atlas=JSON.parse(fs.readFileSync('src/data/atlas/preload_worldMap.json'));
const frame=atlas.sprites.find(s=>s.name==='map_node-bg');
if(!frame) throw new Error('Missing map_node-bg');
await sharp('resources/img/worldMap.png').extract({left:frame.x,top:frame.y,width:frame.width,height:frame.height}).png().toFile('assets/adventure-reset/challenge-frame.png');
