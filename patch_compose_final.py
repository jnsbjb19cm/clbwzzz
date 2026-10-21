p=r"D:\.丛林\battle/compose_final.py"
s=open(p,encoding='utf-8-sig').read()
s=s.replace('d=WORK/"cutouts_v11"/anim','d=WORK/"cutouts_final"/anim')
s=s.replace('抠图范围：只保留主体（脚下三片玉米叶、身上两片高叶、玉米果实、眼睛）；','抠图范围：只保留主体（脚下三片玉米叶、身上两片高叶、玉米果实及叶间下沿、眼睛）；')
open(p,'w',encoding='utf-8').write(s)
print('patched')
