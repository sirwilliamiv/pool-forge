# Clip the hero water fill to the pool interior. hero-01 is the correctly-clipped
# reference (identical pool geometry in all 10); its per-frame water mask drives 02-10.
from PIL import Image
import numpy as np, os, sys
from analyze import frames, interior, SRC
OUT=sys.argv[1]
os.makedirs(OUT,exist_ok=True)
F1=frames(1); M1=interior(F1[0])
Y0,Y1,X0,X1=118,300,185,415
zone=np.zeros(M1.shape,bool); zone[Y0:Y1,X0:X1]=True
def waterish(a):
    r,g,b=a[...,0],a[...,1],a[...,2]
    return ((b>200)&(r<120)) | ((b>225)&(r<205)&(g>195)&(b-r>30))
src=Image.open(f'{SRC}/hero-01.gif'); durs=[]
for i in range(src.n_frames): src.seek(i); durs.append(src.info['duration'])
for n in range(1,11):
    F=frames(n); f0=F[0]; out=[]
    for i,f in enumerate(F):
        g=f.copy()
        if n!=1:
            W=M1 & (np.abs(F1[i]-F1[0]).sum(2)>18)
            # interior: water where reference has water, else empty pool
            g[M1]=f0[M1]; g[W]=F1[i][W]
            # outside interior: erase any stray water rectangle, restore outline/background
            # (this band is static in the reference apart from a few edge pixels)
            ext=zone & ~M1
            g[ext]=f0[ext]
            rc=ext & (np.abs(F1[i]-F1[0]).sum(2)>18)
            g[rc]=F1[i][rc]
        out.append(Image.fromarray(g.astype(np.uint8)))
    if n==1:
        import shutil; shutil.copy(f'{SRC}/hero-01.gif',f'{OUT}/hero-01.gif'); print(1,'unchanged'); continue
    w,h=out[0].size; strip=Image.new('RGB',(w,h*4))
    for k,idx in enumerate([0,20,40,61]): strip.paste(out[idx],(0,h*k))
    ref=strip.quantize(colors=255,method=Image.MEDIANCUT,dither=Image.Dither.NONE)
    pal=[o.quantize(palette=ref,dither=Image.Dither.NONE) for o in out]
    pal[0].save(f'{OUT}/hero-{n:02d}.gif',save_all=True,append_images=pal[1:],duration=durs,loop=0,disposal=1,optimize=True)
    print(n, os.path.getsize(f'{OUT}/hero-{n:02d}.gif'), os.path.getsize(f'{SRC}/hero-{n:02d}.gif'))
