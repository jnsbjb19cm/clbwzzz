from PIL import Image
import json
for k in [162,168,524,100]:
    cutdir = r"W:\.gd\玉米炮手_精灵图集_最终版\逐帧PNG"
    import glob
    f=glob.glob(cutdir+rf"\*src{k:04d}.png")[0]
    a=Image.open(f).convert('RGBA')
    # crop source same ROI roughly with margin, scale to 640 for comparison
    src=Image.open(rf"W:\.gd\_video_work\frames_full\frame_{k:04d}.png").convert('RGB')
    # get final alpha bbox to crop source? just center crop 2300x2100 and resize 640
    src=src.crop((900,250,3000,2150)).resize((640,640),Image.LANCZOS)
    bg=Image.new('RGBA',(640,640),(128,128,128,255)); bg.alpha_composite(a); cut=bg.convert('RGB')
    out=Image.new('RGB',(1300,640),(255,255,255)); out.paste(src,(0,0)); out.paste(cut,(660,0)); out.save(rf"W:\.gd\_video_work\final_compare_{k}.png")
print('done')
