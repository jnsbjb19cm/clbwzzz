p=r"D:\.丛林\battle/compose_final.py"
s=open(p,encoding='utf-8-sig').read()
s=s.replace('d=WORK/"cutouts_final"/anim','d=WORK/"cutouts_final2"/anim')
open(p,'w',encoding='utf-8').write(s)
print('compose patched')
