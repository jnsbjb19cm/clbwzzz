import csv, numpy as np
rows=list(csv.DictReader(open(r"W:\.gd\_video_work\motion_stats.csv")))
for r in rows:
    for k in ['frame','area','x0','y0','x1','y1','cx','cy','maxhole','blue','white']: r[k]=float(r[k])
for L in [120,60,240]:
    scores=[]
    for s in range(180,874-L+1):
        rr=rows[s:s+L]
        blue=sum(r['blue'] for r in rr); white=sum(r['white'] for r in rr)
        holes=sum(max(0,r['maxhole']-5000) for r in rr)
        # area variance
        areas=np.array([r['area'] for r in rr]); av=areas.std()/max(areas.mean(),1)
        score=blue*0.5+white*0.5+holes*0.3+av*100000
        scores.append((score,s,blue,white,holes,av*100))
    scores.sort()
    print('\nL',L)
    for x in scores[:15]: print(f"start={int(x[1])} end={int(x[1]+L-1)} score={x[0]:.0f} blue={int(x[2])} white={int(x[3])} holes={int(x[4])} areaCV={x[5]:.1f}")
