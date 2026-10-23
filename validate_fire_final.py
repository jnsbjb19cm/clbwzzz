from PIL import Image
from pathlib import Path
import json
out=Path(r"W:\.gd\玉米炮手_精灵图集_最终版")
for p in [out/"玉米炮手_攻击_精灵图集_透明.png",out/"玉米炮手_待机_精灵图集_透明.png"]:
 im=Image.open(p); print(p.name,im.size,im.mode,im.format)
for p in [out/"预览"/"玉米炮手_攻击_透明动态预览.apng.png",out/"预览"/"玉米炮手_待机_透明动态预览.apng.png"]:
 im=Image.open(p); print(p.name,im.size,im.mode,'frames',getattr(im,'n_frames',1))
print('png frames',len(list((out/'逐帧PNG').glob('*.png'))))
d=json.loads((out/'玉米炮手_精灵图集_配置.json').read_text(encoding='utf-8'))
print('attack',d['attack']['frame_count'],d['attack']['source_time_range_sec'],d['attack']['includes_projectile'])
print('idle',d['idle']['frame_count'])
