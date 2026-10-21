from PIL import Image
from pathlib import Path
out=Path(r"W:\.gd\玉米炮手_精灵图集_最终版")
for name in ['attack_000_src0096.png','attack_041_src0137.png','attack_042_src0162.png','idle_000_src0474.png','idle_066_src0540.png','idle_119_src0593.png']:
    im=Image.open(out/'逐帧PNG'/name).convert('RGBA')
    bg=Image.new('RGBA',im.size,(24,16,20,255))
    bg.alpha_composite(im)
    bg.convert('RGB').save(rf"W:\.gd\_video_work\dark_{name}")
print('done')
