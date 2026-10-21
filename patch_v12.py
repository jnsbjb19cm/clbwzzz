p=r"D:\.丛林\battle\build_v11.py"
s=open(p,encoding='utf-8-sig').read()
s=s.replace("core=ndi.binary_opening(core,np.ones((13,13),bool))", "core=ndi.binary_opening(core,np.ones((7,7),bool))")
s=s.replace('OUT=Path(r"W:\\.gd\\_video_work\\cutouts_v11")','OUT=Path(r"W:\\.gd\\_video_work\\cutouts_v12")')
open(p,'w',encoding='utf-8').write(s)
print('patched 7/write v12')
