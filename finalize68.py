from pathlib import Path
import json, zipfile
out=Path(r"W:\.gd\玉米炮手_精灵图集_最终版")
readme='''玉米炮手 精灵图集（透明 PNG）
生成时间：2026-10-22

文件：
- 玉米炮手_攻击_精灵图集_透明.png：120 帧，10列 x 12行，单元 640x640，60fps
- 玉米炮手_待机_精灵图集_透明.png：120 帧，10列 x 12行，单元 640x640，60fps，可循环
- 逐帧PNG/：每帧单独透明 PNG，统一 640x640 画布，底部中心锚点
- 预览/：透明 APNG、棋盘 GIF、逐帧索引图
- 玉米炮手_精灵图集_配置.json：帧序号、源帧、尺寸、行列、锚点、循环信息

攻击图集：
来源 6.00-8.00s，完整 120 帧。保留玉米炮手主体和蓝色玉米炮弹从出现、飞过主体到离开的全过程；去除背景、底座/水花、其他单位的弹道和场景杂物。

待机图集：
来源 7.90-9.90s，120 帧循环；只保留玉米炮手主体。
'''
(out/"使用说明.txt").write_text(readme,encoding='utf-8-sig')
p=out/"玉米炮手_精灵图集_配置.json"; d=json.loads(p.read_text(encoding='utf-8'))
d['attack']['includes_projectile']=True
d['attack']['projectile_description']='蓝色玉米炮弹'
d['attack']['notes']='来源6.00-8.00s，120帧完整攻击；保留主体及其蓝色玉米炮弹，去除其他单位弹道和场景杂物。'
d['idle']['notes']='只保留玉米炮手主体：脚下三片玉米叶、身上两片高叶、完整玉米棒、眼睛。'
p.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
z=Path(r"W:\.gd\玉米炮手_精灵图集_最终版.zip")
with zipfile.ZipFile(z,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as zz:
    for f in out.rglob('*'):
        if f.is_file(): zz.write(f,f.relative_to(out.parent))
print('zip',z.stat().st_size)
