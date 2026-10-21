from PIL import Image, ImageDraw
import json
k=524
recs=json.loads(open(r"W:\.gd\_video_work\cutouts_half_fix\idle\frames.json",encoding='utf-8').read())
r=[x for x in recs if x['source_frame']==k][0]; x0,y0,x1,y1=r['crop_box']
src=Image.open(rf"W:\.gd\_video_work\frames_full\frame_{k:04d}.png").convert('RGB').resize((1920,1080),Image.LANCZOS)
src=src.crop((x0-30,y0-30,x1+30,y1+30))
cut=Image.open(rf"W:\.gd\_video_work\cutouts_half_fix\idle\frame_{k:04d}.png").convert('RGBA')
# composite cut on mid gray
bg=Image.new('RGBA',cut.size,(128,128,128,255)); bg.alpha_composite(cut); cut=bg.convert('RGB')
h=max(src.height,cut.height); w=src.width+cut.width+20
out=Image.new('RGB',(w,h),(255,255,255)); out.paste(src,(0,0)); out.paste(cut,(src.width+20,0)); out.save(r"W:\.gd\_video_work\compare_0524.png")
print(src.size,cut.size,out.size)
