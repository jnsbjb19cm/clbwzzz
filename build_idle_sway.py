from PIL import Image, ImageDraw
from pathlib import Path
import math, json, shutil
BASE=Path(r"W:\.gd"); WORK=BASE/"_video_work"; GEN=WORK/"idle_sway_generated"; GEN.mkdir(parents=True,exist_ok=True)
# load standard reference cutout and crop transparent bounds
ref=Image.open(WORK/"reference_cutout.png").convert('RGBA')
ra=ref.getchannel('A'); bb=ra.getbbox(); refc=ref.crop(bb)
CELL=640; ANCHOR=(320,628); H=560
w=round(refc.width*H/refc.height); h=H
base=refc.resize((w,h),Image.LANCZOS)
N=120; A=24.0; TH=4.5
frames=[]
for i in range(N):
    t=i/N
    x_off=-A*math.sin(2*math.pi*t)
    angle=-TH*math.sin(2*math.pi*t)
    cell=Image.new('RGBA',(CELL,CELL),(0,0,0,0))
    left=ANCHOR[0]-w//2; top=ANCHOR[1]-h
    cell.alpha_composite(base,(left,top))
    rot=cell.rotate(angle,resample=Image.BICUBIC,center=ANCHOR)
    out=Image.new('RGBA',(CELL,CELL),(0,0,0,0)); out.alpha_composite(rot,(round(x_off),0))
    # trim? keep fixed canvas
    frames.append(out)
# save generated cells
for i,f in enumerate(frames): f.save(GEN/f"idle_{i:03d}.png",compress_level=6)
# sheet
COLS=10; rows=math.ceil(N/COLS); sheet=Image.new('RGBA',(COLS*CELL,rows*CELL),(0,0,0,0))
for i,f in enumerate(frames): sheet.alpha_composite(f,((i%COLS)*CELL,(i//COLS)*CELL))
sheet.save(WORK/"idle_sway_sheet.png",compress_level=6)
# APNG 320
ap=[]
for f in frames:
    c=Image.new('RGBA',(320,320),(0,0,0,0)); c.alpha_composite(f.resize((320,320),Image.LANCZOS)); ap.append(c)
ap[0].save(WORK/"idle_sway_preview.apng.png",save_all=True,append_images=ap[1:],duration=17,loop=0,disposal=2,blend=0,compress_level=6)
# contact checker
def checker(size,cell=32):
    im=Image.new('RGBA',size,(238,238,238,255)); d=ImageDraw.Draw(im)
    for y in range(0,size[1],cell):
        for x in range(0,size[0],cell):
            if (x//cell+y//cell)%2: d.rectangle([x,y,x+cell-1,y+cell-1],fill=(195,195,195,255))
    return im
cw=240; cc=10; cr=math.ceil(N/cc); contact=checker((cc*cw,cr*(cw+18))); dd=ImageDraw.Draw(contact)
for i,f in enumerate(frames):
    im=f.copy(); im.thumbnail((cw-8,cw-8),Image.LANCZOS)
    x=(i%cc)*cw+(cw-im.width)//2; y=(i//cc)*(cw+18)+(cw-im.height)//2
    contact.alpha_composite(im,(x,y)); dd.text(((i%cc)*cw+4,(i//cc)*(cw+18)+cw+2),str(i),fill=(0,0,0,255))
contact.convert('RGB').save(WORK/"idle_sway_contact.jpg",quality=92)
print('generated',N,'base',base.size,'sheet',sheet.size)
