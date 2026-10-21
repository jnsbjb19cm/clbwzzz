p=r"D:\.丛林\battle/segment_v11_test.py"
s=open(p,encoding='utf-8-sig').read()
s=s.replace("gap_lower=gap&(yy>=cob_top-1)", "gap_lower=gap&(yy>=cob_top+int(bh*0.10))")
open(p,'w',encoding='utf-8').write(s)
print('patched')
