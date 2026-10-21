import csv
rows=list(csv.DictReader(open(r"W:\.gd\_video_work\motion_stats.csv")))
for r in rows:
    r['frame']=int(r['frame']); r['cx']=float(r['cx']); r['area']=float(r['area']); r['y0']=float(r['y0'])
for a,b in [(180,360),(480,600),(600,720),(750,870)]:
    print('\nRANGE',a,b)
    for r in rows[a:b:2]:
        print(f"{r['frame']:4d} cx={r['cx']:6.2f} area={int(r['area']):5d} y0={int(r['y0']):4d} holes={int(float(r['maxhole'])):5d} blue={int(float(r['blue'])):5d} white={int(float(r['white'])):4d}")
