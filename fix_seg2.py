p=r"D:\.丛林\battle\segment_v8.py"
s=open(p,encoding='utf-8').read()
s=s.replace("def hull_mask(points,shape):\n    hull=ConvexHull(points); hp=points[hull.vertices]\n    m=Image.new('L',(shape[1],shape[0]),0); ImageDraw.Draw(m).polygon([tuple(map(int,p)) for p in hp],fill=255)\n    return np.array(m)>0", "def hull_mask(points,shape):\n    # points are (y,x); polygon needs (x,y)\n    hull=ConvexHull(points); hp=points[hull.vertices]\n    m=Image.new('L',(shape[1],shape[0]),0); ImageDraw.Draw(m).polygon([(int(p[1]),int(p[0])) for p in hp],fill=255)\n    return np.array(m)>0")
s=s.replace("if not (2000<=ar<=35000): continue", "if not (5000<=ar<=26000): continue")
s=s.replace("if 0.2<ncx<0.8 and 0.40<ncy<0.82 and 25<ew<300 and 25<eh<300:", "if 0.18<ncx<0.82 and 0.42<ncy<0.78 and 50<ew<260 and 50<eh<260:")
open(p,'w',encoding='utf-8').write(s)
print('patched')
