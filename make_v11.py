s=open(r"D:\.丛林\battle\segment_v11_test.py",encoding='utf-8-sig').read()
# extract from imports through end of segment function, then add process loop
idx=s.index("for k,out in")
head=s[:idx]
head=head.replace('def segment(p,out):','def segment_and_save(p,out):')
# make segment return crop and bbox by appending? easier adapt function body to save; we'll define wrapper later is hard.
# Instead append a new segment function based on v11 that returns arrays, by using file text transforms is complex.
# Reuse segment_and_save for individual files to a temp dir in process loop, then read saved cropped images? It only saves checker. So instead we will write process that calls a new segment function copied from test manually via alias not possible.
# We'll write a full new module string from test by replacing final save block with return.
old='''    # save checker crop
    ys,xs=np.where(alpha); bx0,bx1,by0,by1=xs.min(),xs.max(),ys.min(),ys.max(); rgba=np.dstack([rgb_clean,alpha_u])[by0:by1+1,bx0:bx1+1]
    imout=Image.fromarray(rgba,'RGBA'); chk=Image.new('RGBA',imout.size,(255,255,255,255)); d=ImageDraw.Draw(chk)
    for y in range(0,imout.height,32):
        for x in range(0,imout.width,32):
            if (x//32+y//32)%2: d.rectangle([x,y,x+31,y+31],fill=(200,200,200,255))
    compo=chk.copy(); compo.alpha_composite(imout); compo.convert('RGB').save(out)
    print(Path(p).name,'out',imout.size,'cob_top',cob_top,'gap',int(gap_lower.sum()))'''
new='''    ys,xs=np.where(alpha); bx0,bx1,by0,by1=xs.min(),xs.max(),ys.min(),ys.max(); rgba=np.dstack([rgb_clean,alpha_u])[by0:by1+1,bx0:bx1+1]
    return rgba,(int(bx0),int(by0),int(bx1),int(by1)),int(gap_lower.sum()),cob_top'''
assert old in head
head=head.replace('    # save checker crop\n'+old,new)
# Note old includes comment; replace properly
process='''
from pathlib import Path
import json,time
SRC=Path(r"W:\\.gd\\_video_work\\frames_full")
OUT=Path(r"W:\\.gd\\_video_work\\cutouts_v11")
OUT.mkdir(exist_ok=True)
ATTACK=list(range(96,138))+list(range(162,180))
IDLE=list(range(474,594))

def process(name,frames):
    d=OUT/name; d.mkdir(exist_ok=True); recs=[]; t0=time.time()
    for i,k in enumerate(frames):
        res=segment_and_save(SRC/f"frame_{k:04d}.png",None)
        rgba,bbox,gap,cobtop=res
        im=Image.fromarray(rgba,'RGBA'); im.save(d/f"frame_{k:04d}.png",compress_level=3)
        recs.append({'source_frame':k,'source_time':round(k/60,4),'crop_box':list(bbox),'width':rgba.shape[1],'height':rgba.shape[0],'alpha_pixels':int((rgba[...,3]>127).sum())})
        if i%10==0: print(name,i,'/',len(frames),'frame',k,'elapsed',round(time.time()-t0,1),'gap',gap,'cobtop',cobtop,flush=True)
    (d/'frames.json').write_text(json.dumps(recs,ensure_ascii=False,indent=2),encoding='utf-8')
    print('DONE',name,len(recs),round(time.time()-t0,1),flush=True)
process('attack',ATTACK)
process('idle',IDLE)
print('ALL DONE')
'''
# fix function signature (out unused)
head=head.replace('def segment_and_save(p,out):','def segment_and_save(p,out=None):')
open(r"D:\.丛林\battle\build_v11.py",'w',encoding='utf-8').write(head+process)
print('written')
