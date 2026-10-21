import csv, numpy as np
rows=list(csv.DictReader(open(r"W:\.gd\_video_work\motion_stats.csv")))
for r in rows:
    for k in ['frame','area','x0','y0','x1','y1','cx','cy','maxhole','blue','white']: r[k]=float(r[k])

def analyze(a,b,label):
    rr=[r for r in rows if a<=r['frame']<b]
    x=np.array([r['cx'] for r in rr]); y=np.array([r['area'] for r in rr]); t=np.array([r['frame'] for r in rr])
    ok=(x>0)
    # detrend with smooth moving avg
    if ok.sum()<20: return
    xs=x[ok]; xs=xs-np.convolve(xs,np.ones(31)/31,mode='same')
    xs=xs[30:-30]
    ac=np.correlate(xs,xs,'full')[len(xs)-1:]; ac/=ac[0]
    peaks=[]
    for lag in range(20,min(400,len(ac)-1)):
        if ac[lag]>ac[lag-1] and ac[lag]>=ac[lag+1] and ac[lag]>0.2:
            peaks.append((lag,float(ac[lag])))
    peaks=sorted(peaks,key=lambda p:p[1],reverse=True)[:10]
    print(label,'n',len(rr),'cx range',round(np.nanmin(x[x>0]),1),round(np.nanmax(x),1),'area med',int(np.median(y)),'peaks',[(p,round(v,2)) for p,v in peaks])
for a,b in [(180,874),(180,360),(300,450),(474,594),(600,720),(750,870),(180,600),(300,600)]:
    analyze(a,b,f'{a}-{b}')
