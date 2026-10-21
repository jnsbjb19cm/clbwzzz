import struct, json, sys
p=r"W:\.gd\玉米炮手动画.mp4"
data=open(p,'rb').read()

def parse(data, start=0, end=None, depth=0):
    if end is None: end=len(data)
    pos=start; out=[]
    while pos+8<=end:
        size=struct.unpack('>I',data[pos:pos+4])[0]
        typ=data[pos+4:pos+8].decode('latin1')
        hdr=8
        if size==1:
            size=struct.unpack('>Q',data[pos+8:pos+16])[0]; hdr=16
        elif size==0:
            size=end-pos
        if size<hdr or pos+size>end: break
        payload=data[pos+hdr:pos+size]
        node={'type':typ,'size':size,'start':pos,'children':[]}
        if typ in {'moov','trak','mdia','minf','stbl','edts','udta','meta','ilst'}:
            child_start=hdr+(4 if typ=='meta' else 0)
            node['children']=parse(data,pos+child_start,pos+size,depth+1)
        out.append(node)
        pos += size
    return out
atoms=parse(data)
# flatten by path
def walk(nodes,path=()):
    for n in nodes:
        yield path+(n['type'],), n
        yield from walk(n['children'],path+(n['type'],))
for path,n in walk(atoms):
    if n['type'] in ('ftyp','mvhd','tkhd','mdhd','hdlr','stts','stsz','stco','co64','stsc'):
        print('/'.join(path), 'payloadlen', n['size']-8)
# extract moov/trak data
traks=[]
for n in atoms:
    if n['type']=='moov':
        traks=[c for c in n['children'] if c['type']=='trak']
print('tracks',len(traks))
for ti,tr in enumerate(traks):
    info={'track':ti}
    def find(nodes,typ):
        for c in nodes:
            if c['type']==typ: yield c
            yield from find(c['children'],typ)
    mdhd=list(find(tr['children'],'mdhd'))[0]
    off=mdhd['start']+8
    ver=data[off]
    if ver==0:
        timescale,dur=struct.unpack('>II',data[off+12:off+20])
    else:
        timescale,dur=struct.unpack('>IQ',data[off+20:off+32])
    hdlr=list(find(tr['children'],'hdlr'))[0]
    hoff=hdlr['start']+8+8
    handler=data[hoff:hoff+4].decode('latin1')
    stts_nodes=list(find(tr['children'],'stts'))
    stsz_nodes=list(find(tr['children'],'stsz'))
    info.update(timescale=timescale,duration=dur,handler=handler)
    if stts_nodes:
        st=stts_nodes[0]; so=st['start']+8
        version=data[so]; count=struct.unpack('>I',data[so+4:so+8])[0]
        entries=[]
        for i in range(count):
            sc,sd=struct.unpack('>II',data[so+8+i*8:so+16+i*8]); entries.append((sc,sd))
        total_samples=sum(x[0] for x in entries); total_delta=sum(x[0]*x[1] for x in entries)
        info['stts_entries']=entries[:20]; info['stts_entry_count']=count
        info['total_samples']=total_samples; info['total_delta']=total_delta
        info['fps']=total_samples/(total_delta/timescale) if total_delta else None
    if stsz_nodes:
        so=stsz_nodes[0]['start']+8
        sample_size,count=struct.unpack('>II',data[so+4:so+12]); info['stsz_sample_size']=sample_size; info['stsz_count']=count
    print(json.dumps(info,ensure_ascii=False,indent=2))
