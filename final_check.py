from PIL import Image
from pathlib import Path
for p in [Path(r"D:\.丛林\battle\output\玉米炮手_精灵图集_最终版\玉米炮手_攻击_精灵图集_透明.png"),Path(r"D:\.丛林\battle\output\玉米炮手_精灵图集_最终版\玉米炮手_待机_精灵图集_透明.png")]:
 im=Image.open(p); print(p.name,im.size,im.mode,im.format)
