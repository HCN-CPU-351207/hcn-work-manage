# Logo HCN 3D: hình học sạch + mặt trên chuyển sắc + mặt bên đùn + cạnh sáng + bóng đổ mềm. Không nền.
import sys, math
from PIL import Image, ImageDraw, ImageFilter, ImageChops
import os
S=os.path.join(os.path.dirname(os.path.abspath(__file__)),'out')+os.sep
os.makedirs(S,exist_ok=True)
G,GD,M,MD='green','greenD','metal','metalD'
PIECES=[  # (vật liệu, đỉnh) – hệ tọa độ ảnh gốc 1024
 (M, [(131,482),(448,187),(476,247),(227,482)]),
 (G, [(458,177),(553,96),(553,370)]),
 (M, [(572,91),(640,154),(640,364),(572,425)]),
 (G, [(661,217),(779,344),(661,344)]),
 (MD,[(574,426),(642,365),(832,365),(891,426)]),
 (MD,[(250,486),(294,437),(915,437),(801,486)]),
 (M, [(913,442),(646,726),(618,684),(798,490)]),
 (G, [(524,568),(638,736),(524,850)]),
 (GD,[(148,492),(500,492),(430,557),(217,557)]),
 (G, [(500,496),(500,658),(217,658),(217,616),(430,616),(430,557)]),
 (M, [(143,500),(214,568),(214,652),(143,652)]),
 (G, [(146,660),(214,660),(214,766),(146,834)]),
 (GD,[(146,835),(214,766),(430,766),(500,835)]),
 (M, [(502,663),(502,831),(430,760),(430,689),(217,689),(217,676),(430,676),(430,663)]),
]
MAT={  # mặt trên (sáng, tối), mặt bên, cạnh sáng
 G: ((52,190,132),(22,128,88),(12,74,52),(150,240,200)),
 GD:((30,132,92),(18,90,62),(9,52,36),(110,200,160)),
 M: ((196,198,194),(128,130,128),(70,72,72),(245,246,244)),
 MD:((128,130,128),(84,86,86),(44,46,46),(200,202,200)),
}
def lerp(a,b,t): return tuple(int(a[i]+(b[i]-a[i])*t) for i in range(3))
def render(size, depth=11, shadow=True):
    k=4; W=size*k
    xs=[x for _,p in PIECES for x,y in p]; ys=[y for _,p in PIECES for x,y in p]
    x0,x1,y0,y1=min(xs),max(xs)+depth,min(ys),max(ys)+depth
    side=max(x1-x0,y1-y0); pad=side*0.06
    ox=x0-(side-(x1-x0))/2-pad; oy=y0-(side-(y1-y0))/2-pad; s=W/(side+2*pad)
    T=lambda p,dx=0,dy=0:[((x-ox+dx)*s,(y-oy+dy)*s) for x,y in p]
    out=Image.new('RGBA',(W,W),(0,0,0,0))
    if shadow:
        sh=Image.new('L',(W,W),0); d=ImageDraw.Draw(sh)
        for _,p in PIECES: d.polygon(T(p,depth*1.6,depth*2.0),fill=255)
        sh=sh.filter(ImageFilter.GaussianBlur(depth*s*0.9))
        out.paste(Image.new('RGBA',(W,W),(0,0,0,255)),(0,0),sh.point(lambda v:int(v*0.30)))
    # mặt bên: quét đa giác từ 0 → depth theo hướng dưới-phải
    side_layer=Image.new('RGBA',(W,W),(0,0,0,0)); d=ImageDraw.Draw(side_layer)
    steps=int(depth*k)
    for i in range(steps,0,-1):
        t=i/steps
        for m,p in PIECES:
            c=lerp(MAT[m][2],lerp(MAT[m][2],(0,0,0),0.35),t)
            d.polygon(T(p,depth*t*0.8,depth*t),fill=c+(255,))
    out.alpha_composite(side_layer)
    # mặt trên: chuyển sắc chéo trên-trái → dưới-phải trong từng khối, cạnh sáng ở mép trên/trái
    for m,p in PIECES:
        pts=T(p); bx0=min(x for x,_ in pts); bx1=max(x for x,_ in pts); by0=min(y for _,y in pts); by1=max(y for _,y in pts)
        mask=Image.new('L',(W,W),0); ImageDraw.Draw(mask).polygon(pts,fill=255)
        grad=Image.new('RGBA',(W,W),(0,0,0,0)); gd=ImageDraw.Draw(grad)
        hi,lo=MAT[m][0],MAT[m][1]; L=(bx1-bx0)+(by1-by0) or 1
        for j in range(int(L)+1):
            c=lerp(hi,lo,j/L)
            gd.line([(bx0+j,by0),(bx0,by0+j)],fill=c+(255,),width=2)
            gd.line([(bx0+j-(by1-by0),by1),(bx1,by0+j-(bx1-bx0))],fill=c+(0,),width=0)
        # tô kín phần còn lại của hộp bằng dải chéo
        for j in range(int(L)+1):
            c=lerp(hi,lo,j/L)
            x=bx0+j; gd.line([(x,by0),(x-(by1-by0),by1)],fill=c+(255,),width=2)
        out.paste(grad,(0,0),mask)
        # cạnh sáng: viền trong 1.5px phía trên-trái
        er=mask.filter(ImageFilter.MinFilter(int(2.5*k)|1))
        rim=ImageChops.subtract(mask,er)
        sh_m=Image.new('L',(W,W),0); ImageDraw.Draw(sh_m).polygon(T(p,2.5,2.5),fill=255)
        rim=ImageChops.subtract(rim,ImageChops.multiply(rim,sh_m))
        out.paste(Image.new('RGBA',(W,W),MAT[m][3]+(255,)),(0,0),rim.point(lambda v:int(v*0.55)))
    return out.resize((size,size),Image.LANCZOS)
if __name__=='__main__':
    big=render(1024); big.save(S+'logo3d.png')
    l=big.resize((640,640),Image.LANCZOS)
    bgs=[(18,22,20),(245,246,248),(34,148,104),(30,64,175)]
    c=Image.new('RGBA',(640*4,800),(0,0,0,255))
    for i,b in enumerate(bgs):
        c.paste(Image.new('RGBA',(640,800),b+(255,)),(i*640,0)); c.alpha_composite(l,(i*640,0))
        for j,sz in enumerate((64,32,16)):
            sm=render(sz,shadow=sz>=32); c.alpha_composite(sm,(i*640+40+j*110,690))
    c.convert('RGB').save(S+'logo3d_prev.png')
