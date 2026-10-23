p=r"D:\.丛林\battle/compose_final.py"
s=open(p,encoding='utf-8-sig').read()
s=s.replace('d=WORK/("cutouts_fire3/attack" if anim=="attack" else "cutouts_v13/idle")','d=WORK/("cutouts_attack_complete/attack" if anim=="attack" else "cutouts_v13/idle")')
s=s.replace('攻击来源：2.00-3.00s 的 60 帧完整发射动作，包含玉米炮弹（蓝色炮弹）从出现、飞过主体到离开的完整过程。','攻击来源：1.00-3.00s 的 120 帧完整动作，包含角色完整出现、蓄力/瞄准、玉米炮弹发射、飞过主体并离开的全过程。')
s=s.replace('- 玉米炮手_攻击_精灵图集_透明.png：60 帧，10列 x 6行，单元 640x640，60fps，包含发射出的玉米炮弹','- 玉米炮手_攻击_精灵图集_透明.png：120 帧，10列 x 12行，单元 640x640，60fps，包含完整发射动作与玉米炮弹')
open(p,'w',encoding='utf-8').write(s)
print('patched')
