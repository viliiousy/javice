# 두 칸(시작·끝 자세) 그림 → 정렬된 정사각 두 프레임 스프라이트
import sys, glob, os, numpy as np, cv2
from PIL import Image
SRC, DST, S = sys.argv[1], sys.argv[2], 360
os.makedirs(DST, exist_ok=True)
def mask(a, bg):
    d = np.abs(a.astype(int) - bg).sum(2)
    return (d > 40).astype(np.uint8)
for f in sorted(glob.glob(SRC + '/*.webp')):
    im = np.array(Image.open(f).convert('RGB')); h, w, _ = im.shape
    bg = np.median(np.concatenate([im[:8].reshape(-1,3), im[-8:].reshape(-1,3), im[:, :8].reshape(-1,3), im[:, -8:].reshape(-1,3)]), 0)
    m = mask(im, bg)
    # 칸 사이 세로 구분선(위아래로 거의 꽉 찬 줄)은 그림이 아니다
    cc = m.sum(0) > h*0.95; cc[:int(w*.45)] = False; cc[int(w*.55):] = False; m[:, cc] = 0
    # 가운데 경계: 가운데 20% 구간에서 그림이 가장 적은 세로줄
    c0, c1 = int(w*.4), int(w*.6)
    col = m[:, c0:c1].sum(0); cut = c0 + int(np.argmin(col))
    L, R = im[:, :cut-6], im[:, cut+6:]
    mL, mR = m[:, :cut-6], m[:, cut+6:]
    # 두 칸을 같은 크기 캔버스에 놓고, 그림 무게중심으로 대략 맞춘 뒤 위상상관으로 미세 정렬
    W = max(L.shape[1], R.shape[1])
    def pad(a, fill): 
        out = np.full((h, W) + a.shape[2:], fill, a.dtype); out[:, :a.shape[1]] = a; return out
    bgu = bg.astype(np.uint8); Lp, Rp = pad(L, bgu), pad(R, bgu); mLp, mRp = pad(mL, 0), pad(mR, 0)
    # 정렬 규칙: 바닥(그림 맨 아래 줄)은 항상 같은 높이에 둔다 — 서 있는 발·벤치 다리가 움직이지 않게.
    # 그 위에서 가로 위치와 크기(0.9~1.1배)만, 똑같이 생긴 픽셀이 가장 많이 겹치도록 찾는다.
    def bottom(mm):
        rows = np.where(mm.sum(1) > mm.shape[1]*0.01)[0]; return rows.max()
    bL, bR = bottom(mLp), bottom(mRp)
    k = 4
    sm = lambda a: cv2.resize(a, (W//k, h//k), interpolation=cv2.INTER_AREA)
    gL = sm(cv2.cvtColor(Lp, cv2.COLOR_RGB2GRAY)).astype(np.int16); mL2 = sm(mLp*255) > 127
    best = (-1, 1.0, 0)
    for sc_ in (0.9, 0.95, 1.0, 1.05, 1.1):
        for dxs in range(-W//3, W//3+1, k):
            M = np.float32([[sc_,0,-dxs + (1-sc_)*W/2],[0,sc_, bL - sc_*bR]])
            Rw = cv2.warpAffine(Rp, M, (W, h), borderValue=tuple(int(v) for v in bg))
            mw = cv2.warpAffine(mRp, M, (W, h))
            gR = sm(cv2.cvtColor(Rw, cv2.COLOR_RGB2GRAY)).astype(np.int16); mR2 = sm(mw*255) > 127
            sc = int(((np.abs(gL-gR) < 10) & mL2 & mR2).sum())
            if sc > best[0]: best = (sc, sc_, dxs)
    resp, s_, dx = best; dy = 0
    M = np.float32([[s_,0,-dx + (1-s_)*W/2],[0,s_, bL - s_*bR]])
    Ra = cv2.warpAffine(Rp, M, (W, h), borderValue=tuple(int(v) for v in bg))
    mRa = cv2.warpAffine(mRp, M, (W, h))
    La = np.full((h, W, 3), bg, np.uint8); La[:, :L.shape[1]] = L
    u = (mLp | mRa).astype(bool)
    ys, xs = np.where(u)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    side = int(max(y1-y0, x1-x0) * 1.12); cx, cy = (x0+x1)//2, (y0+y1)//2
    def crop(a):
        c = Image.new('RGB', (side, side), tuple(int(v) for v in bg))
        c.paste(Image.fromarray(a), (side//2 - cx, side//2 - cy))
        return c.resize((S, S), Image.LANCZOS)
    sp = Image.new('RGB', (S*2, S)); sp.paste(crop(La), (0,0)); sp.paste(crop(Ra), (S,0))
    sp.save(os.path.join(DST, os.path.basename(f)), 'WEBP', quality=80)
    print(os.path.basename(f), resp, s_, dx)

# 프레임이 있는 id 목록을 앱이 읽는 파일로 남긴다 (js/ex-have.js)
import json as _j
_ids = sorted(f[:-5] for f in os.listdir(DST) if f.endswith('.webp'))
_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
open(os.path.join(_root, 'img', 'exf', 'have.json'), 'w').write(_j.dumps(_ids))   # 앱이 새 빌드 없이 새 그림을 알아채게(서버에서 읽음)
open(os.path.join(_root, 'js', 'ex-have.js'), 'w').write('// 자동 생성: scripts/ex-frames.py 를 돌린 뒤 갱신 — 정렬 프레임(img/exf)이 있는 운동 id\nconst EX_HAVE = new Set(' + _j.dumps(_ids) + ');\n')
