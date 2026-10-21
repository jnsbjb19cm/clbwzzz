from PIL import Image, ImageDraw
from pathlib import Path
import json, math, shutil, zipfile, os, time
BASE=Path(r"W:\.gd")
WORK=BASE/"_video_work"
OUT=BASE/"玉米炮手_精灵图集_最终版"
if OUT.exists(): shutil.rmtree(OUT)
FR=OUT/"逐帧PNG"; PREV=OUT/"预览"
FR.mkdir(parents=True); PREV.mkdir(parents=True)
CELL=640; PAD=12; COLS=10; FPS=60; DUR=round(1000/FPS)

def checker(size, cell=32):
    im=Image.new('RGBA',size,(238,238,238,255)); d=ImageDraw.Draw(im)
    for y in range(0,size[1],cell):
        for x in range(0,size[0],cell):
            if (x//cell+y//cell)%2: d.rectangle([x,y,x+cell-1,y+cell-1],fill=(195,195,195,255))
    return im

def load_records(anim):
    d=WORK/"cutouts_final2"/anim
    recs=json.loads((d/"frames.json").read_text(encoding='utf-8'))
    return d,recs

def compose(anim, display_name):
    d,recs=load_records(anim)
    x0=min(r['crop_box'][0] for r in recs); y0=min(r['crop_box'][1] for r in recs)
    x1=max(r['crop_box'][2] for r in recs); y1=max(r['crop_box'][3] for r in recs)
    margin=6; ux0=x0-margin; uy0=y0-margin; uw=(x1-x0+1)+2*margin; uh=(y1-y0+1)+2*margin
    scale=min((CELL-2*PAD)/uw,(CELL-2*PAD)/uh)
    ow=max(1,round(uw*scale)); oh=max(1,round(uh*scale))
    ox=(CELL-ow)//2; oy=CELL-PAD-oh
    frames=[]; sheet_frames=[]; frame_recs=[]
    for i,r in enumerate(recs):
        src=d/f"frame_{r['source_frame']:04d}.png"
        im=Image.open(src).convert('RGBA')
        union=Image.new('RGBA',(uw,uh),(0,0,0,0))
        cx0,cy0,cx1,cy1=r['crop_box']; px=cx0-ux0; py=cy0-uy0
        union.alpha_composite(im,(px,py))
        small=union.resize((ow,oh),Image.LANCZOS)
        cell=Image.new('RGBA',(CELL,CELL),(0,0,0,0)); cell.alpha_composite(small,(ox,oy))
        fname=FR/f"{anim}_{i:03d}_src{r['source_frame']:04d}.png"; cell.save(fname,compress_level=6)
        frames.append(cell)
        # checker preview at 320
        ck=checker((320,320)); c=cell.resize((320,320),Image.LANCZOS)
        ck.alpha_composite(c); sheet_frames.append(ck.convert('RGB'))
        frame_recs.append({'index':i,'file':fname.name,'source_frame':r['source_frame'],'source_time_sec':round(r['source_frame']/FPS,4)})
    rows=math.ceil(len(frames)/COLS)
    sheet=Image.new('RGBA',(COLS*CELL,rows*CELL),(0,0,0,0))
    for i,cell in enumerate(frames):
        sheet.alpha_composite(cell,((i%COLS)*CELL,(i//COLS)*CELL))
    sheet_path=OUT/f"玉米炮手_{display_name}_精灵图集_透明.png"
    sheet.save(sheet_path,compress_level=6)
    # APNG true-alpha preview at 320
    apng_frames=[]
    for f in frames:
        ck=Image.new('RGBA',(320,320),(0,0,0,0)); ck.alpha_composite(f.resize((320,320),Image.LANCZOS)); apng_frames.append(ck)
    apng_path=PREV/f"玉米炮手_{display_name}_透明动态预览.apng.png"
    apng_frames[0].save(apng_path,save_all=True,append_images=apng_frames[1:],duration=DUR,loop=0,disposal=2,blend=0,compress_level=6)
    gif_path=PREV/f"玉米炮手_{display_name}_棋盘预览.gif"
    sheet_frames[0].save(gif_path,save_all=True,append_images=sheet_frames[1:],duration=DUR,loop=0,disposal=2,optimize=True)
    # checker contact sheet with labels
    cellw=240; ccref=10; crows=math.ceil(len(frames)/ccref)
    contact=checker((ccref*cellw,crows*(cellw+18)))
    dd=ImageDraw.Draw(contact)
    for i,f in enumerate(frames):
        im=f.copy(); im.thumbnail((cellw-8,cellw-8),Image.LANCZOS)
        xx=(i%ccref)*cellw+(cellw-im.width)//2; yy=(i//ccref)*(cellw+18)+(cellw-im.height)//2
        contact.alpha_composite(im,(xx,yy))
        dd.text(((i%ccref)*cellw+4,(i//ccref)*(cellw+18)+cellw+2),str(i),fill=(0,0,0,255))
    contact_path=PREV/f"玉米炮手_{display_name}_逐帧索引.png"
    contact.convert('RGB').save(contact_path,quality=92)
    meta={
      'name':display_name,
      'sheet':sheet_path.name,
      'frame_count':len(frames),
      'columns':COLS,'rows':rows,'cell_width':CELL,'cell_height':CELL,
      'cell_anchor':{'x':CELL//2,'y':CELL-PAD},
      'transparent':True,'fps':FPS,'loop':(anim=='idle'),
      'source_video_fps':60,
      'source_frame_range':[recs[0]['source_frame'],recs[-1]['source_frame']],
      'source_time_range_sec':[round(recs[0]['source_frame']/60,3),round((recs[-1]['source_frame']+1)/60,3)],
      'source_frames':[r['source_frame'] for r in recs],
      'frames':frame_recs,
      'preview_apng':str(apng_path.relative_to(OUT)),
      'preview_gif':str(gif_path.relative_to(OUT)),
      'index_preview':str(contact_path.relative_to(OUT)),
      'sheet_dimensions':list(sheet.size),
      'notes':'仅保留主体：脚下三片玉米叶、身上两片高叶、玉米果实、眼睛；去除背景、青绿色底座/水花、炮弹和场景杂物。'
    }
    return meta, sheet.size

attack_meta,asize=compose('attack','攻击')
idle_meta,isize=compose('idle','待机')
meta={
 'generated_at':time.strftime('%Y-%m-%d %H:%M:%S'),
 'source_video':r'W:\.gd\玉米炮手动画.mp4',
 'source_width':3840,'source_height':2160,'source_fps':60,'source_total_frames':874,
 'attack':attack_meta,
 'idle':idle_meta,
 'attack_extraction_note':'原片 0-1.6s 为编辑器选择框/空白/青色残影，未纳入；1.6-2.3s 与 2.7-3.0s 主体完整，2.3-2.7s 玉米炮弹遮挡主体，未纳入，避免把炮弹或破损主体带入图集。',
 'idle_extraction_note':'从 3s 后的干净段中选择一个完整左右摇摆周期（7.90-9.90s，120帧）作为待机循环。',
 'alpha':'RGBA PNG，背景完全透明；透明像素 RGB 已做边缘扩散，缩放时不易出现黑边。'
}
(OUT/"玉米炮手_精灵图集_配置.json").write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
readme=f'''玉米炮手 精灵图集（透明 PNG）
生成时间：{meta['generated_at']}

文件：
- 玉米炮手_攻击_精灵图集_透明.png：{attack_meta['frame_count']} 帧，{attack_meta['columns']}列 x {attack_meta['rows']}行，单元 {CELL}x{CELL}，60fps
- 玉米炮手_待机_精灵图集_透明.png：{idle_meta['frame_count']} 帧，{idle_meta['columns']}列 x {idle_meta['rows']}行，单元 {CELL}x{CELL}，60fps，可循环
- 逐帧PNG/：每帧单独透明 PNG（已统一放入 {CELL}x{CELL} 单元，底部中心锚点）
- 预览/：APNG、棋盘 GIF、逐帧索引图
- 玉米炮手_精灵图集_配置.json：帧序号、源帧、尺寸、行列、锚点、循环信息

抠图范围：只保留主体（脚下三片玉米叶、身上两片高叶、玉米果实及叶间下沿、眼睛）；
去除背景、青绿色底座/水花、飞行的玉米炮弹、场景杂物。

攻击来源：1.60-3.00s 中主体无遮挡的帧（原片 0-1.60s 是编辑器/空白/残影，2.30-2.70s 炮弹遮挡主体，均未纳入）。
待机来源：7.90-9.90s 的完整左右摇摆周期（120帧）。
'''
(OUT/"使用说明.txt").write_text(readme,encoding='utf-8-sig')
# zip
zip_path=BASE/"玉米炮手_精灵图集_最终版.zip"
with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for p in OUT.rglob('*'):
        if p.is_file(): z.write(p,p.relative_to(OUT.parent))
print('DONE',OUT)
print('attack sheet',asize,'idle sheet',isize,'zip',zip_path,zip_path.stat().st_size)
print(json.dumps(meta,ensure_ascii=False,indent=2)[:3000])
