p=r"D:\.丛林\battle/compose_final.py"
s=open(p,encoding='utf-8-sig').read()
s=s.replace('d=WORK/("cutouts_attack_final/attack" if anim=="attack" else "cutouts_v13/idle")','d=WORK/("cutouts_attack_68/attack" if anim=="attack" else "cutouts_v13/idle")')
s=s.replace('攻击来源：1.60-3.00s 的 84 帧完整攻击动作，包含蓄力/瞄准、玉米炮弹发射、飞过主体并离开的全过程。','攻击来源：6.00-8.00s 的 120 帧完整攻击动作，包含蓄力、蓝色玉米炮弹出现、飞过主体并离开的全过程。')
s=s.replace('- 玉米炮手_攻击_精灵图集_透明.png：84 帧，10列 x 9行，单元 640x640，60fps','- 玉米炮手_攻击_精灵图集_透明.png：120 帧，10列 x 12行，单元 640x640，60fps')
open(p,'w',encoding='utf-8').write(s)
print('patched')
