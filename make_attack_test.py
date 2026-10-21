# reuse segment_v8 by importing would run loop; just run a subprocess? create small runner importing function from source not easy.
# Instead generate quick checker images by executing segment_v8 with patched loop via text substitution in a temp copy.
s=open(r"D:\.丛林\battle\segment_v8.py",encoding='utf-8').read()
old="for name in ['f0060','f0120','f0480','f0540','f0593']:\n    segment(rf\"W:\\.gd\\_video_work\\frames_full\\frame_{int(name[1:]):04d}.png\",rf\"W:\\.gd\\_video_work\\segv8_{name}_checker.png\")"
# simpler find last for line by splitting
idx=s.rfind("for name in [")
head=s[:idx]
tail="for name in ['f0096','f0128','f0138','f0148','f0158','f0168','f0178']:\n    segment(rf\"W:\\.gd\\_video_work\\frames_full\\frame_{int(name[1:]):04d}.png\",rf\"W:\\.gd\\_video_work\\segv8_{name}_checker.png\")\n"
open(r"D:\.丛林\battle\segment_attack_test.py",'w',encoding='utf-8').write(head+tail)
print('written')
