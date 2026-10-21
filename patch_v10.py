p=r"D:\.丛林\battle\segment_v10.py"
s=open(p,encoding='utf-8').read()
s=s.replace("core=ndi.binary_opening(core,np.ones((9,9),bool))", "core=ndi.binary_opening(core,np.ones((25,25),bool))")
s=s.replace("    core=ndi.binary_closing(core,np.ones((5,5),bool))\n    lab,n=ndi.label(core,np.ones((3,3),bool)); sizes=ndi.sum(core,lab,range(1,n+1)); core=(lab==(int(np.argmax(sizes))+1))\n    yy,xx", "    core=ndi.binary_closing(core,np.ones((7,7),bool))\n    # restore a little edge thickness after opening\n    core=ndi.binary_dilation(core,np.ones((5,5),bool))\n    lab,n=ndi.label(core,np.ones((3,3),bool)); sizes=ndi.sum(core,lab,range(1,n+1)); core=(lab==(int(np.argmax(sizes))+1))\n    yy,xx")
s=s.replace("for name in ['f0148','f0158','f0168','f0480','f0540','f0593']:", "for name in ['f0148','f0158','f0168','f0480','f0540','f0593']:")
open(p,'w',encoding='utf-8').write(s)
print('patched')
