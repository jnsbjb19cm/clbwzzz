p=r"D:\.丛林\battle\build_v11.py"
s=open(p,encoding='utf-8-sig').read()
s=s.replace("core=ndi.binary_opening(core,np.ones((7,7),bool))", "core=ndi.binary_opening(core,np.ones((13,13),bool))")
open(p,'w',encoding='utf-8').write(s)
print('patched 13')
