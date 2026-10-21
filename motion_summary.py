import csv, numpy as np
from pathlib import Path
rows=list(csv.DictReader(open(r"W:\.gd\_video_work\motion_stats.csv")))
for r in rows:
    for k in ['frame','area','x0','y0','x1','y1','cx','cy','maxhole','blue','white']: r[k]=float(r[k])
print('n',len(rows))
for start in range(0,874,30):
    rr=[r for r in rows if start<=r['frame']<start+30]
    if not rr: continue
    med=lambda k: np.median([r[k] for r in rr])
    print(f"{start:3d}-{start+29:3d} area={med('area'):8.0f} cx={med('cx'):6.1f} y0={med('y0'):6.1f} x1-x0={med('x1')-med('x0'):5.1f} maxhole={med('maxhole'):6.0f} blue={med('blue'):5.0f} white={med('white'):5.0f}")
# suspicious frames: big holes / blue / white / missing body
print('\nsuspicious')
for r in rows:
    if r['area']<3000 or r['maxhole']>1000 or r['blue']>300 or r['white']>500:
        print(int(r['frame']),int(r['area']),int(r['maxhole']),int(r['blue']),int(r['white']))
