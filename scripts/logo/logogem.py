# Logo HCN kiểu khối kim cương: mỗi khối vát đều từ mọi cạnh lên sống giữa, tô sáng theo hướng đèn. Không nền.
import os, sys, numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from logo3d import PIECES
import os
S=os.path.join(os.path.dirname(os.path.abspath(__file__)),'out')+os.sep
os.makedirs(S,exist_ok=True)
BASE={'green':(34,160,110),'greenD':(24,120,82),'metal':(170,172,170),'metalD':(118,120,120)}
SIDE={'green':(2,48,26),'greenD':(1,36,20),'metal':(46,50,56),'metalD':(30,33,38)}
RNG=np.random.default_rng(7)
GL={}

def ramp(stops,t):
    t=np.clip(t,0,1); xs=np.linspace(0,1,len(stops)); st=np.array(stops,float)
    return np.dstack([np.interp(t,xs,st[:,c]) for c in range(3)])

def shade(m,lam,spec,best,face,normals,flat,gx_,gy_,P,s,cap,n=None):
    H,W_=lam.shape
    fl=flat.astype(float)[...,None]
    # vị trí tương đối trong khối (0..1) theo đường chéo, và độ sâu tính từ mép
    span=max(1,(gx_.max()-gx_.min()+gy_.max()-gy_.min()))
    u=((gx_-gx_.min())+(gy_-gy_.min()))/span
    depth=np.clip(best/(best.max()+1e-6),0,1)
    if m.startswith('green'):
        deep=0.88 if m=='greenD' else 1.0
        NZ=GL['noise'][gy_,gx_]; CR=GL['crack'][gy_,gx_]
        core=np.clip(depth*1.3,0,1)**1.2
        # bảng màu lấy từ ngọc lục bảo thật
        EM=[(1,26,14),(3,50,29),(6,88,52),(8,132,78),(18,178,108),(58,218,152),(160,248,215)]
        # lòng đá: sâu không đều (nhiễu thể tích), lõi phát sáng, mép sẫm
        vol=0.10+0.62*core*(0.55+0.9*NZ)-0.10*u
        vol=np.clip(vol,0,1)**1.15
        # mặt vát: đón sáng → phản quang trắng xanh; khuất sáng → ánh xuyên sẫm
        bev=0.04+0.55*lam**1.4+0.22*NZ+0.12*(1-lam)*u
        t=np.where(flat,vol,bev)*deep
        c=ramp(EM,t)
        # phản quang bề mặt kiểu kính trên các mặt vát hướng về đèn
        refl=np.clip((lam-0.55)/0.45,0,1)**1.3*(1-fl[...,0])
        c=c*(1-0.8*refl[...,None])+refl[...,None]*np.array([175,225,218])*0.85
        # vân nứt / bao thể bên trong: vệt sáng mờ + vệt tối mảnh
        c=c+(CR>0)[...,None]*0+CR[...,None]*np.array([90,170,140])*0.35*core[...,None]
        c=c*(1-0.35*GL['vein'][gy_,gx_][...,None]*core[...,None])
        # ánh khúc xạ đi xuyên ở phía dưới-phải lòng đá
        caus=np.exp(-((u-0.72)/0.11)**2)*core*0.6*fl[...,0]*(0.5+NZ)
        c=c+caus[...,None]*np.array([60,230,170])
        c=c+spec[...,None]*np.array([215,245,240])*1.0
        alpha=1-0.12*fl[...,0]*core
        return np.clip(c,0,255),alpha
    # kim loại: phản chiếu môi trường kiểu crôm, không sọc
    dk=0.82 if m=='metalD' else 1.0
    nx,ny,nz=n[...,0],n[...,1],n[...,2]
    ry=2*nz*ny            # hướng phản chiếu (lên/xuống)
    rx=2*nz*nx
    # môi trường: trời sáng ở trên, dải chân trời tối sắc, mặt đất ấm vừa
    v=0.5-ry*0.9-rx*0.25+(u-0.42)*0.95
    sky=ramp([(196,200,206),(168,174,182),(132,140,150)],np.clip((0.5-v)*2.2,0,1))
    ground=ramp([(52,55,60),(92,95,100),(128,126,122)],np.clip((v-0.5)*2.2,0,1))
    env=np.where((v<0.5)[...,None],sky,ground)
    horizon=np.exp(-((v-0.5)/0.035)**2)
    env=env*(1-0.35*horizon[...,None])
    c=env*dk*(0.82+0.25*lam[...,None])
    c=c+spec[...,None]*np.array([255,255,255])*0.45
    return np.clip(c,0,255),np.ones(lam.shape)

LIGHT=np.array([-0.55,-0.75,0.95]); LIGHT/=np.linalg.norm(LIGHT)
def render(size, depth=6.0, steep=1.0, shadow=True, cap=12):
    k=4; W=size*k
    xs=[x for _,p in PIECES for x,y in p]; ys=[y for _,p in PIECES for x,y in p]
    x0,x1,y0,y1=min(xs),max(xs)+depth,min(ys),max(ys)+depth
    side=max(x1-x0,y1-y0); pad=side*0.06
    ox=x0-(side-(x1-x0))/2-pad; oy=y0-(side-(y1-y0))/2-pad; s=W/(side+2*pad)
    T=lambda p,dx=0,dy=0:[((x-ox+dx)*s,(y-oy+dy)*s) for x,y in p]
    out=Image.new('RGBA',(W,W),(0,0,0,0))
    rng=np.random.default_rng(11)
    nz=sum(ndimage.gaussian_filter(rng.normal(0,1,(W,W)),W*f)*w_ for f,w_ in ((0.06,1.0),(0.025,0.6),(0.01,0.35)))
    nz=(nz-nz.min())/(nz.max()-nz.min()+1e-9)
    crack=Image.new('L',(W,W),0); cd=ImageDraw.Draw(crack); vein=Image.new('L',(W,W),0); vd=ImageDraw.Draw(vein)
    for _ in range(26):
        x,y=rng.uniform(0,W,2); ang=rng.uniform(0,np.pi); pts=[(x,y)]
        for _ in range(5):
            ang+=rng.normal(0,0.5); L=rng.uniform(0.02,0.06)*W; x+=np.cos(ang)*L; y+=np.sin(ang)*L; pts.append((x,y))
        cd.line(pts,fill=255,width=max(1,int(W*0.0025)))
        if rng.random()<0.5: vd.line([(p[0]+W*0.003,p[1]+W*0.003) for p in pts],fill=255,width=max(1,int(W*0.0015)))
    GL['noise']=nz
    GL['crack']=np.array(crack.filter(ImageFilter.GaussianBlur(W*0.002))).astype(float)/255
    GL['vein']=np.array(vein.filter(ImageFilter.GaussianBlur(W*0.001))).astype(float)/255
    if shadow:
        sh=Image.new('L',(W,W),0); d=ImageDraw.Draw(sh)
        for _,p in PIECES: d.polygon(T(p,depth*1.8,depth*2.4),fill=255)
        sh=sh.filter(ImageFilter.GaussianBlur(depth*s*1.4))
        out.paste(Image.new('RGBA',(W,W),(0,0,0,255)),(0,0),sh.point(lambda v:int(v*0.32)))
    # đế dày (mặt bên) để khối nổi khỏi nền
    base=Image.new('RGBA',(W,W),(0,0,0,0)); d=ImageDraw.Draw(base)
    steps=max(1,int(depth*s))
    for i in range(steps,0,-1):
        t=i/steps
        for m,p in PIECES: d.polygon(T(p,depth*t*0.75,depth*t),fill=SIDE[m]+(255,))
    out.alpha_composite(base)
    rgb=np.zeros((W,W,3)); A=np.zeros((W,W))
    for m,p in PIECES:
        mk=Image.new('L',(W,W),0); ImageDraw.Draw(mk).polygon(T(p),fill=255)
        mask=np.array(mk)>127
        ys_,xs_=np.where(mask); y0_,y1_,x0_,x1_=ys_.min()-2,ys_.max()+3,xs_.min()-2,xs_.max()+3
        sub=mask[y0_:y1_,x0_:x1_]
        # mỗi điểm thuộc mặt vát của cạnh gần nhất → mặt phẳng, sống sắc
        P=np.array(T(p)); n_=len(P)
        gy_,gx_=np.mgrid[y0_:y1_,x0_:x1_]; X=gx_+0.5; Y=gy_+0.5
        best=np.full(sub.shape,1e9); face=np.zeros(sub.shape,int)
        area=sum(P[i,0]*P[(i+1)%n_,1]-P[(i+1)%n_,0]*P[i,1] for i in range(n_))
        normals=[]
        for i in range(n_):
            A_,B_=P[i],P[(i+1)%n_]; e=B_-A_; L=np.hypot(*e)
            t=np.clip(((X-A_[0])*e[0]+(Y-A_[1])*e[1])/(L*L),0,1)
            dd=np.hypot(X-(A_[0]+t*e[0]),Y-(A_[1]+t*e[1]))
            sel=dd<best; best[sel]=dd[sel]; face[sel]=i
            on=np.array([e[1],-e[0]])/L*(1 if area>0 else -1)   # pháp tuyến hướng ra ngoài
            normals.append(on)
        nx=np.zeros(sub.shape); ny=np.zeros(sub.shape)
        for i,on in enumerate(normals): nx[face==i]=on[0]; ny[face==i]=on[1]
        # mặt bàn phẳng ở giữa: xa mép hơn bề rộng vát thì phẳng
        if cap:
            flat=best>cap*s; nx[flat]=0; ny[flat]=0
        n=np.dstack([nx*steep,ny*steep,np.ones_like(nx)]); n/=np.linalg.norm(n,axis=-1,keepdims=True)
        lam=np.clip(n@LIGHT,0,1)
        refl=2*(n@LIGHT)[...,None]*n-LIGHT; spec=np.clip(refl[...,2],0,1)**24
        # chuyển sắc nhẹ theo độ cao (sát mép tối hơn, gần sống sáng hơn)
        hh=np.clip(best/(best[sub].max()+1e-6),0,1)
        lam=lam*(0.85+0.15*hh)
        if cap:
            # mặt bàn: chuyển sắc chéo nhẹ trên-trái sáng hơn
            g=1.06-0.16*((gx_-x0_)/(x1_-x0_)+(gy_-y0_)/(y1_-y0_))/2
            lam=np.where(flat,lam*g,lam)
        col,al=shade(m,lam,spec,best,face,normals,flat if cap else np.zeros_like(sub),gx_,gy_,P,s,cap,n)
        tgt=rgb[y0_:y1_,x0_:x1_]; tgt[sub]=col[sub]; A[y0_:y1_,x0_:x1_][sub]=255*al[sub]
    top=Image.fromarray(np.dstack([rgb,A]).astype(np.uint8),'RGBA')
    out.alpha_composite(top)
    return out.resize((size,size),Image.LANCZOS)
if __name__=='__main__':
    big=render(1024); big.save(S+'logogem.png')
    l=big.resize((640,640),Image.LANCZOS)
    bgs=[(18,22,20),(245,246,248),(34,148,104),(30,64,175)]
    c=Image.new('RGBA',(640*4,800),(0,0,0,255))
    for i,b in enumerate(bgs):
        c.paste(Image.new('RGBA',(640,800),b+(255,)),(i*640,0)); c.alpha_composite(l,(i*640,0))
        for j,sz in enumerate((64,32,16)):
            c.alpha_composite(render(sz,shadow=sz>=32),(i*640+40+j*110,690))
    c.convert('RGB').save(S+'logogem_prev.png')
