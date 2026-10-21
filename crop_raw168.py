from PIL import Image
im=Image.open(r"W:\.gd\_video_work\frames_full\frame_0168.png").convert('RGB')
# crop approximate top region full coords? use ROI from earlier: full image 3840x2160; character x~1150-2700,y~500-2100
im.crop((1500,300,2800,1200)).save(r"W:\.gd\_video_work\raw168_top.png")
