from PIL import Image
im=Image.open(r"W:\.gd\_video_work\samples2\f0180.png").convert('RGB')
im.crop((1000,1350,2900,2160)).save(r"W:\.gd\_video_work\feet_raw.png")
