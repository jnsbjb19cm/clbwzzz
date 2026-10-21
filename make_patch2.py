s=open(r"D:\.丛林\battle/patch_final_cutouts.py",encoding='utf-8-sig').read()
s=s.replace('SRC=WORK/"cutouts_v11"; DST=WORK/"cutouts_final"','SRC=WORK/"cutouts_v12"; DST=WORK/"cutouts_final2"')
open(r"D:\.丛林\battle/patch_final_cutouts2.py",'w',encoding='utf-8').write(s)
print('written')
