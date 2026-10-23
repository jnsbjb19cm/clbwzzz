import json
p=r"W:\.gd\玉米炮手_精灵图集_最终版\玉米炮手_精灵图集_配置.json"
d=json.load(open(p,encoding='utf-8'))
print(d.get('attack',{}).get('reconstruction_note'))
print(d.get('attack',{}).get('completeness'))
print(d.get('idle',{}).get('completeness'))
