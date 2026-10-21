p=r"D:\.丛林\battle\compose_final.py"
s=open(p,encoding='utf-8-sig').read()
s=s.replace("d=(WORK/\"cutouts_half_fix\"/anim) if anim=='idle' else (WORK/\"cutouts_half\"/anim)", "d=WORK/\"cutouts_v11\"/anim")
# improve readme note for cob
s=s.replace("抠图范围：只保留主体（脚下三片玉米叶、身上两片高叶、玉米果实、眼睛）；\\n去除背景、青绿色底座/水花、飞行的玉米炮弹、场景杂物。", "抠图范围：只保留主体（脚下三片玉米叶、身上两片高叶、玉米果实及其叶间下沿、眼睛）；\\n去除背景、青绿色底座/水花、飞行的玉米炮弹、场景杂物。")
open(p,'w',encoding='utf-8').write(s)
print('patched')
