from PIL import Image, ImageDraw
from pathlib import Path
import json, math, zipfile, shutil
BASE=Path(r"W:\.gd"); WORK=BASE/"_video_work"; OUT=BASE/"玉米炮手_精灵图集_最终版"; FR=OUT/"逐帧PNG"; PREV=OUT/"预览"
frames=[Image.open(WORK/"idle_sway_generated"/f"idle_{i:03d}.png").convert('RGBA') for i in range(120)]
CELL=640; COLS=10; rows=12
sheet=Image.new('RGBA',(COLS*CELL,rows*CELL),(0,0,0,0))
for i,f in enumerate(frames): sheet.alpha_composite(f,((i%COLS)*CELL,(i//COLS)*CELL))
sheet.save(OUT/"玉米炮手_待机_精灵图集_透明.png",compress_level=6)
# remove old idle individual pngs
for p in FR.glob("idle_*.png"): p.unlink()
for i,f in enumerate(frames): f.save(FR/f"idle_{i:03d}.png",compress_level=6)
# remove old idle previews
for p in PREV.glob("*待机*"): p.unlink()
# APNG
ap=[]
for f in frames:
    c=Image.new('RGBA',(320,320),(0,0,0,0)); c.alpha_composite(f.resize((320,320),Image.LANCZOS)); ap.append(c)
apng=PREV/"玉米炮手_待机_透明动态预览.apng.png"; ap[0].save(apng,save_all=True,append_images=ap[1:],duration=17,loop=0,disposal=2,blend=0,compress_level=6)
# checker frames + gif
def checker(size,cell=32):
    im=Image.new('RGBA',size,(238,238,238,255)); d=ImageDraw.Draw(im)
    for y in range(0,size[1],cell):
        for x in range(0,size[0],cell):
            if (x//cell+y//cell)%2: d.rectangle([x,y,x+cell-1,y+cell-1],fill=(195,195,195,255))
    return im
chk=[]
for f in frames:
    c=checker((320,320)); c.alpha_composite(f.resize((320,320),Image.LANCZOS)); chk.append(c.convert('RGB'))
gif=PREV/"玉米炮手_待机_棋盘预览.gif"; chk[0].save(gif,save_all=True,append_images=chk[1:],duration=17,loop=0,disposal=2,optimize=True)
# contact
cw=240; cc=10; cr=12; contact=checker((cc*cw,cr*(cw+18))); dd=ImageDraw.Draw(contact)
for i,f in enumerate(frames):
    im=f.copy(); im.thumbnail((cw-8,cw-8),Image.LANCZOS)
    x=(i%cc)*cw+(cw-im.width)//2; y=(i//cc)*(cw+18)+(cw-im.height)//2
    contact.alpha_composite(im,(x,y)); dd.text(((i%cc)*cw+4,(i//cc)*(cw+18)+cw+2),str(i),fill=(0,0,0,255))
contact_path=PREV/"玉米炮手_待机_逐帧索引.png"; contact.convert('RGB').save(contact_path,quality=92)
# config
p=OUT/"玉米炮手_精灵图集_配置.json"; meta=json.loads(p.read_text(encoding='utf-8'))
meta['idle']={
 'name':'待机','sheet':'玉米炮手_待机_精灵图集_透明.png','frame_count':120,'columns':10,'rows':12,
 'cell_width':640,'cell_height':640,'cell_anchor':{'x':320,'y':628},'transparent':True,'fps':60,'loop':True,
 'motion':'中间→左倾斜→中间→右倾斜→中间，2秒循环','generated_from':'reference_cutout.png',
 'motion_amplitude_px':24,'motion_angle_deg':4.5,
 'frames':[{'index':i,'file':f'idle_{i:03d}.png'} for i in range(120)],
 'preview_apng':str(apng.relative_to(OUT)),'preview_gif':str(gif.relative_to(OUT)),'index_preview':str(contact_path.relative_to(OUT)),
 'sheet_dimensions':[6400,7680],
 'notes':'以提供的完整标准图作为主体基准，按四段摆动生成120帧循环；保留完整玉米棒和上方两片高叶。'
}
p.write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
readme='''玉米炮手 精灵图集（透明 PNG）
生成时间：2026-10-22

文件：
- 玉米炮手_攻击_精灵图集_透明.png：120 帧，10列 x 12行，单元 640x640，60fps
- 玉米炮手_待机_精灵图集_透明.png：120 帧，10列 x 12行，单元 640x640，60fps，可循环
- 逐帧PNG/：每帧单独透明 PNG，统一 640x640 画布，底部中心锚点
- 预览/：透明 APNG、棋盘 GIF、逐帧索引图
- 玉米炮手_精灵图集_配置.json：帧序号、尺寸、行列、锚点、循环信息

攻击图集：
来源 6.00-8.00s，完整 120 帧。保留玉米炮手主体和蓝色玉米炮弹从出现、飞过主体到离开的全过程；去除背景、底座/水花、其他单位弹道和场景杂物。

待机图集：
120 帧、2 秒循环。动作：中间 → 向左移动并倾斜 → 回到中间 → 向右移动并倾斜 → 回到中间。
以提供的完整标准图作为主体基准生成，完整保留玉米棒、上方两片高叶、脚下三片叶和眼睛。
'''
(OUT/"使用说明.txt").write_text(readme,encoding='utf-8-sig')
# zip
z=BASE/"玉米炮手_精灵图集_最终版.zip"
with zipfile.ZipFile(z,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as zz:
    for f in OUT.rglob('*'):
        if f.is_file(): zz.write(f,f.relative_to(OUT.parent))
print('done',sheet.size,z.stat().st_size,'idle png',len(list(FR.glob('idle_*.png'))),'total',len(list(FR.glob('*.png'))))
