from PIL import Image
import numpy as np
from scipy import ndimage
SRC='/workspace/pool-forge-hero-gifs'
def frames(n):
    im=Image.open(f'{SRC}/hero-{n:02d}.gif'); out=[]
    for i in range(im.n_frames):
        im.seek(i); out.append(np.array(im.convert('RGB')).astype(int))
    return out
def interior(f0):
    # outline = dark pixels (or bright for dark bg); flood fill from seed
    lum=f0.sum(2)
    bg=f0[5,300]
    outline = lum<150 if bg.sum()>300 else lum>700
    lab,_=ndimage.label(~outline)
    return lab==lab[150,250]
if __name__=='__main__':
    F1=frames(1); M1=interior(F1[0])
    ys,xs=np.where(M1); print('M1',M1.sum(),xs.min(),xs.max(),ys.min(),ys.max())
    for n in range(2,11):
        F=frames(n); M=interior(F[0]); print(n,M.sum(),(M^M1).sum(), F[61][160,250], F1[61][160,250])
