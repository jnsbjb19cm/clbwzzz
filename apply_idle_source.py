from PIL import Image, ImageDraw
from pathlib import Path
import json, math, zipfile
BASE=Path(r"W:\.gd"); WORK=BASE/"_video_work"; OUT=BASE/"玉米炮手_精灵图集_最终版"; FR=OUT/"逐帧PNG"; PREV=OUT/"预览"
SRC=WORK/"cutouts_v13/idle"; recs=json.loads((SRC/"frames.json").read_text(encoding='utf-8'))
CELL=640; PAD=12; COLS=10; N=len(recs); rows=math.ceil(N/COLS)
x0=min(r['crop_box'][0] for r in recs); y0=min(r['crop_box'][1] for r in recs); x1=max(r['crop_box'][2] for r in recs); y1=max(r['crop_box'][3] for r in recs)
margin=6; ux0=x0-margin; uy0=y0-margin; uw=x1-x0+1+2*margin; uh=y1-y0+1+2*margin
scale=min((CELL-2*PAD)/uw,(CELL-2*PAD)/uh); ow=round(uw*scale); oh=round(uh*scale); ox=(CELL-ow)//2; oy=CELL-PAD-oh
frames=[]
for r in recs:
    im=Image.open(SRC/f"frame_{r['source_frame']:04d}.png").convert('RGBA')
    cx0,cy0,cx1,cy1=r['crop_box']; union=Image.new('RGBA',(uw,uh),(0,0,0,0)); union.alpha_composite(im,(cx0-ux0,cy0-uy0))
    cell=Image.new('RGBA',(CELL,CELL),(0,0,0,0)); cell.alpha_composite(union.resize((ow,oh),Image.LANCZOS),(ox,oy)); frames.append(cell)
sheet=Image.new('RGBA',(COLS*CELL,rows*CELL),(0,0,0,0))
for i,f in enumerate(frames): sheet.alpha_composite(f,((i%COLS)*CELL,(i//COLS)*CELL))
sheet.save(OUT/"玉米炮手_待机_精灵图集_透明.png",compress_level=6)
for p in FR.glob("idle_*.png"): p.unlink()
for i,f in enumerate(frames): f.save(FR/f"idle_{i:03d}.png",compress_level=6)
for p in PREV.glob("*待机*"): p.unlink()
# previews
ap=[]
for f in frames:
    c=Image.new('RGBA',(320,320),(0,0,0,0)); c.alpha_composite(f.resize((320,320),Image.LANCZOS)); ap.append(c)
apng=PREV/"玉米炮手_待机_透明动态预览.apng.png"; ap[0].save(apng,save_all=True,append_images=ap[1:],duration=17,loop=0,disposal=2,blend=0,compress_level=6)
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
cw=240; cc=10; cr=math.ceil(N/cc); contact=checker((cc*cw,cr*(cw+18))); dd=ImageDraw.Draw(contact)
for i,f in enumerate(frames):
    im=f.copy(); im.thumbnail((cw-8,cw-8),Image.LANCZOS)
    x=(i%cc)*cw+(cw-im.width)//2; y=(i//cc)*(cw+18)+(cw-im.height)//2
    contact.alpha_composite(im,(x,y)); dd.text(((i%cc)*cw+4,(i//cc)*(cw+18)+cw+2),str(i),fill=(0,0,0,255))
contact_path=PREV/"玉米炮手_待机_逐帧索引.png"; contact.convert('RGB').save(contact_path,quality=92)
# config
p=OUT/"玉米炮手_精灵图集_配置.json"; meta=json.loads(p.read_text(encoding='utf-8'))
meta['idle']={
 'name':'待机','sheet':'玉米炮手_待机_精灵图集_透明.png','frame_count':N,'columns':COLS,'rows':rows,
 'cell_width':640,'cell_height':640,'cell_anchor':{'x':320,'y':628},'transparent':True,'fps':60,'loop':True,
 'source_video_fps':60,'source_frame_range':[recs[0]['source_frame'],recs[-1]['source_frame']],
 'source_time_range_sec':[round(recs[0]['source_frame']/60,3),round((recs[-1]['source_frame']+1)/60,3)],
 'source_frames':[r['source_frame'] for r in recs],
 'motion':'原视频自然左右摇摆并轻微倾斜，保留原版叶片的弹性与细微晃动',
 'frames':[{'index':i,'file':f'idle_{i:03d}.png','source_frame':r['source_frame']} for i,r in enumerate(recs)],
 'preview_apng':str(apng.relative_to(OUT)),'preview_gif':str(gif.relative_to(OUT)),'index_preview':str(contact_path.relative_to(OUT)),
 'sheet_dimensions':[6400,7680],
 'notes':'取自原视频7.90-9.90s的真实待机摆动，不做程序化旋转；保留完整玉米棒、两片高叶、脚下三片叶和眼睛。'
}
p.write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
readme='''玉米炮手 精灵图集（透明 PNG）
生成时间：2026-10-22

文件：
- 玉米炮手_攻击_精灵图集_透明.png：120 帧，10列 x 12行，单元 640x640，60fps
- 玉米炮手_待机_精灵图集_透明.png：120 帧，10列 x 12行，单元 640x640，60fps，可循环
- 逐帧PNG/：每帧单独透明 PNG，统一 640x640 画布，底部中心锚点
- 预览/：透明 APNG、棋盘 GIF、逐帧索引图
- 玉米炮手_精灵图集_配置.json：帧序号、源帧、尺寸、行列、锚点、循环信息

攻击图集：
来源 6.00-8.00s，完整 120 帧。保留玉米炮手主体和蓝色玉米炮弹从出现、飞过主体到离开的全过程。

待机图集：
来源 7.90-9.90s 原视频真实待机动作，120 帧循环；保留原版自然左右摇摆、叶片弹性与细微晃动，不再使用程序化旋转。
完整保留玉米棒、上方两片高叶、脚下三片叶和眼睛。
'''
(OUT/"使用说明.txt").write_text(readme,encoding='utf-8-sig')
z=BASE/"玉米炮手_精灵图集_最终版.zip"
with zipfile.ZipFile(z,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as zz:
    for f in OUT.rglob('*'):
        if f.is_file(): zz.write(f,f.relative_to(OUT.parent))
print('done',N,sheet.size,z.stat().st_size)
