"""第一步（矢量化前处理）：把 source.png 归并成设计系统色板的标签图，交给 vtracer 描边。

直接对原图跑 vtracer，调大斑点过滤后声波、虚线、红点和人物轮廓线都会被吞掉，
调小又满是渐变色块和锐化白边。所以先在 3 倍分辨率上做一遍归色和清理：
  1. 墨线层：black-hat 形态学找出细暗线（轮廓、声波、虚线、纸笺字行），按半高宽取线宽；
  2. 填色层：每个像素找最近的色板锚点（锚点取自原图实测颜色，部分颜色限定区域），
     只把把握大的像素当种子，其余按颜色梯度做分水岭，边界落在原图边缘上，不产生第三色细边；
  3. 清理：去锐化白边、细缝、小斑点，高斯投票平滑边界；
  4. 特殊处理：盆栽整体剪影、字幅墨迹、录音笔机身、红点和虚线按原位重画成规整形状。
输出：labels.png（只含 9 种色板颜色）和 labels.npy（标签索引）。

用法：python3 quantize.py <source.png> <out_dir> [key=value ...]
"""
import sys
import time
import warnings
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from skimage import color, filters, morphology, segmentation

warnings.filterwarnings('ignore', category=FutureWarning)

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / 'source.png')
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else 'build')
OUT.mkdir(parents=True, exist_ok=True)

P = dict(
    scale=3,            # 放大倍数（细线在 3 倍下才有足够像素做样条拟合）
    line_t=14,          # 墨线：black-hat 响应阈值（L* 单位）
    line_t_prot=9,      # 声波附近放宽的阈值
    line_r=1.8,         # 墨线：闭运算半径（原图像素），比它细的暗线都算线
    in_t=7,             # 深色衣物/椅子内部的褶线阈值
    in_r=1.2,
    conf_d=9,           # 种子像素：到最近锚点的色差上限 ΔE
    conf_m=2.5,         # 种子像素：最近与次近锚点的色差余量
    conf_g=3.0,         # 种子像素：颜色梯度上限
    sheet_open=2.0,     # 去锐化白边：素笺色开运算半径（原图像素）
    fill_open=0.7,      # 去其他颜色细缝
    min_fill=6.0,       # 填色小斑点面积下限（原图像素²）
    min_ink=3.5,        # 墨线碎点面积下限（脸、手等细节区）
    min_ink_coarse=16,  # 墨线碎点面积下限（衣服、椅子、桌子）
    min_ink_prot=0.8,   # 声波附近的墨线面积下限
    line_min_r=0.4,     # 细线保底半宽（原图像素）
    cal_t=62,           # 字幅墨迹阈值（L*）
    min_sheet=40,       # 合成后素笺色小块下限
    min_fill2=10,       # 合成后其他颜色小块下限
    fill_sigma=0.8,     # 填色边界平滑（高斯投票 σ，原图像素）
    line_sigma=0.45,    # 墨线边界平滑
    red_r=2.2,          # 红点半径（原图约 2×3 像素，略放大，桌面上约 3px 才看得出呼吸）
    dash_len=5.2,       # 虚线每段长度
    dash_w=1.9,         # 虚线线宽
)
for kv in sys.argv[3:]:
    k, v = kv.split('=')
    P[k] = float(v)
S = int(P['scale'])

NAMES = ['paper', 'sheet', 'indigo', 'ink', 'red', 'skin', 'hair', 'gray', 'mount']
I = {n: i for i, n in enumerate(NAMES)}
PALETTE = {  # 写进标签图的设计色
    'paper': '#ECEAE1', 'sheet': '#F8F7F2', 'indigo': '#1F3A4D', 'ink': '#24231F', 'red': '#B5382A',
    'skin': '#EDCAB1', 'hair': '#3B3A37', 'gray': '#5B5A55', 'mount': '#DACCB8'}
ANCHORS = {  # 原图实测颜色 → 归入哪种设计色
    'paper': ['#E9E6DC', '#ECE8DE', '#EDE7DC', '#E7E0D1', '#E5DBCC'],
    'sheet': ['#F3EFE6', '#F0ECE3', '#F5F2EA', '#F3EEE5', '#F8F7F2'],
    'indigo': ['#2E4256', '#31485D', '#333E49', '#32495E', '#333F4C', '#324351', '#1F2C38'],
    'ink': ['#1B1D1E', '#24231F'],
    'red': ['#DA3F30', '#CD342C', '#A12F27'],
    'skin': ['#EFCBB3', '#EDC9B1', '#EFCCB4', '#E6BBA2'],
    'hair': ['#4A4A4A', '#393939', '#4C4C4C', '#646563'],
    'gray': ['#4B4C4D', '#545453', '#3D3D3C', '#515050', '#646563'],
    'mount': ['#DACCB8', '#DED0BF', '#DBCEBC'],
}

t0 = time.time()
def log(*a):
    print(f'[{time.time() - t0:5.1f}s]', *a, flush=True)

src = Image.open(SRC).convert('RGB')
W0, H0 = src.size
up = np.asarray(src.resize((W0 * S, H0 * S), Image.BICUBIC)).astype(np.float32) / 255.0
H, W = up.shape[:2]
lab = color.rgb2lab(np.clip(up, 0, 1)).astype(np.float32)
Lc = lab[..., 0]


def hex2lab(h):
    rgb = np.array([[[int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]]], dtype=np.float32)
    return color.rgb2lab(rgb)[0, 0]


def poly_mask(polys, width=0):
    m = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(m)
    for p in polys:
        pts = [(x * S, y * S) for x, y in p]
        if width:
            d.line(pts, fill=1, width=int(width * S), joint='curve')
        else:
            d.polygon(pts, fill=1)
    return np.asarray(m).astype(bool)


def box(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


# ---------- 区域（原图坐标）：发色、肤色、中性灰、浅褐、朱砂只允许出现在各自的位置 ----------
HAIR = poly_mask([
    [(448, 335), (450, 285), (468, 252), (500, 236), (548, 234), (572, 248), (580, 268), (566, 288),
     (548, 292), (530, 300), (524, 330), (500, 330), (480, 340)],
    [(1266, 320), (1282, 282), (1305, 258), (1332, 246), (1362, 246), (1388, 262), (1396, 295), (1394, 338),
     (1376, 334), (1356, 318), (1338, 312), (1318, 322), (1300, 340), (1282, 340)]])
SKIN_OK = poly_mask([box(430, 230, 712, 505), box(1218, 238, 1502, 505)])
GRAY_OK = poly_mask([box(268, 505, 612, 752), box(1222, 512, 1592, 752)])      # 裤子、椅架、鞋袜
SCROLL = poly_mask([box(1496, 148, 1586, 392)])
SCROLL_PAPER = poly_mask([box(1513, 196, 1568, 367)])
PLANT = poly_mask([[(1592, 315), (1792, 315), (1792, 540), (1728, 540), (1728, 598), (1655, 598),
                    (1655, 540), (1592, 540)]])
REC_BOX = poly_mask([box(916, 434, 958, 503)])
RED_OK = poly_mask([box(930, 438, 944, 452)])
WAVES = poly_mask([box(896, 420, 980, 466)])
NOTES = poly_mask([box(798, 318, 870, 362), box(972, 352, 1052, 398), box(1124, 424, 1204, 472)])
# 虚线三段：原图实测每段的点位（加权质心），用于重画
DASH_SEGS = [
    [(875.0, 343.2), (882.9, 343.8), (891.1, 344.5), (898.3, 345.3), (905.6, 346.2), (914.1, 347.4),
     (922.7, 348.8), (932.7, 350.7), (942.0, 352.8), (952.3, 355.5), (961.2, 358.1), (968.8, 360.3),
     (977.2, 362.8)],
    [(1054.5, 392.8), (1064.2, 396.4), (1074.0, 400.6), (1081.6, 404.0), (1089.2, 407.7), (1097.7, 412.2),
     (1105.7, 416.7), (1114.0, 421.6), (1121.7, 426.7), (1128.2, 431.0)],
    [(1188.0, 468.7), (1193.1, 474.5), (1199.3, 481.6)],
]
DASHES = poly_mask([s for s in DASH_SEGS], width=10) & ~NOTES
# 需要保留小笔触的细节区：脸、手、笔、工牌、水杯、纸笺、录音笔、立轴（头发除外）
DETAIL = (poly_mask([box(445, 232, 585, 345), box(595, 350, 705, 425), box(600, 452, 665, 492),
                     box(1262, 240, 1400, 375), box(1225, 435, 1370, 500), box(1355, 375, 1400, 480),
                     box(688, 425, 730, 505)]) & ~HAIR) | WAVES | NOTES | SCROLL

allowed = {n: np.ones((H, W), bool) for n in NAMES}
allowed['skin'] = SKIN_OK
allowed['hair'] = HAIR
allowed['gray'] = GRAY_OK & ~HAIR
allowed['mount'] = SCROLL
allowed['red'] = RED_OK

# 录音笔机身：原图暗色剪影，闭运算补齐按钮和高光
Lb0 = ndi.gaussian_filter(Lc, 0.5 * S)
REC_BODY = REC_BOX & (Lb0 < 62)
REC_BODY = morphology.binary_opening(morphology.binary_closing(REC_BODY, morphology.disk(2 * S)), morphology.disk(S))
REC_BODY = ndi.binary_fill_holes(REC_BODY)


# ---------- 1. 墨线层 ----------
def blackhat(Lim, r):
    se = morphology.disk(int(round(r * S)))
    bh = ndi.grey_closing(Lim, footprint=se) - Lim
    bh = ndi.gaussian_filter(bh, 0.35 * S)
    return bh, ndi.maximum_filter(bh, size=2 * int(round(r * S)) + 1)


bh, bhm = blackhat(Lc, P['line_r'])
thr = np.where(WAVES, P['line_t_prot'], P['line_t'])
line = (bh > thr) & (bh > 0.5 * bhm) & ~PLANT & ~SCROLL_PAPER & ~REC_BODY & ~DASHES
log('ink lines', round(float(line.mean()), 4))

# ---------- 2. 填色层：最近锚点 + 分水岭 ----------
dist = np.full((len(NAMES), H, W), np.inf, np.float32)
for i, n in enumerate(NAMES):
    for h in ANCHORS[n]:
        dist[i] = np.minimum(dist[i], np.sqrt(((lab - hex2lab(h)) ** 2).sum(-1)))
    dist[i][~allowed[n]] = np.inf
part = np.argpartition(dist, 1, axis=0)
a, b = part[0], part[1]
da = np.take_along_axis(dist, a[None], 0)[0]
db = np.take_along_axis(dist, b[None], 0)[0]
best = np.where(db < da, b, a)
d1, d2 = np.minimum(da, db), np.maximum(da, db)
del dist, part
sm = np.stack([ndi.gaussian_filter(lab[..., c], 0.5 * S) for c in range(3)], -1)
grad = np.sqrt(sum(filters.sobel(sm[..., c]) ** 2 for c in range(3)))
conf = (d1 < P['conf_d']) & ((d2 - d1) > P['conf_m']) & (grad < P['conf_g']) & ~line
ws = segmentation.watershed(grad, np.where(conf, best + 1, 0).astype(np.int32), mask=~line)
fill = np.where(ws > 0, ws - 1, best).astype(np.uint8)
log('watershed')


def refill(lm, holes, avoid=None):
    """holes 里的像素取最近的、不在 holes/avoid 里的像素的标签"""
    if not holes.any():
        return lm
    bad = holes if avoid is None else (holes | avoid)
    _, (iy, ix) = ndi.distance_transform_edt(bad, return_indices=True)
    out = lm.copy()
    out[holes] = lm[iy[holes], ix[holes]]
    return out


fill = refill(fill, line)  # 墨线下面补上相邻的填色

# ---------- 3. 深色衣物、椅子内部的褶线（否则西装和椅背连成一片） ----------
bh2, bh2m = blackhat(Lc, P['in_r'])
inner = np.isin(fill, [I['indigo'], I['gray']]) & (bh2 > P['in_t']) & (bh2 > 0.5 * bh2m) & ~PLANT & ~REC_BOX
line |= inner

# ---------- 4. 特殊区域 ----------
Lb = ndi.gaussian_filter(Lc, 0.6 * S)
pl = PLANT & (Lb < 72)                                   # 盆栽：一整块函套青剪影
pl = morphology.binary_closing(pl, morphology.disk(int(round(0.8 * S))))
pl = morphology.remove_small_objects(pl, int(3 * S * S))
fill[PLANT] = I['paper']
fill[pl & PLANT] = I['indigo']
cal = SCROLL_PAPER & (ndi.gaussian_filter(Lc, 0.9 * S) < P['cal_t'])   # 字幅：墨迹块，丢掉飞白灰
cal = morphology.binary_opening(morphology.binary_closing(cal, morphology.disk(S)), morphology.disk(int(round(0.6 * S))))
fill[SCROLL_PAPER] = I['sheet']
fill[cal] = I['ink']
fill[REC_BODY] = I['ink']
fill[HAIR & (fill == I['gray'])] = I['hair']
fill[DASHES & np.isin(fill, [I['ink'], I['sheet'], I['indigo']])] = I['paper']

# ---------- 5. 填色清理 ----------
sheet = fill == I['sheet']
fill = refill(fill, sheet & ~morphology.binary_opening(sheet, morphology.disk(int(round(P['sheet_open'] * S)))))
for n in ['skin', 'gray', 'hair', 'mount', 'paper', 'indigo', 'ink']:
    m = fill == I[n]
    fill = refill(fill, m & ~morphology.binary_opening(m, morphology.disk(max(1, int(round(P['fill_open'] * S))))))
holes = np.zeros(fill.shape, bool)
for i, n in enumerate(NAMES):
    cc, k = ndi.label(fill == i)
    if k:
        ar = np.bincount(cc.ravel())
        small = ar < P['min_fill'] * S * S
        small[0] = False
        holes |= small[cc]
fill = refill(fill, holes)
# 衬衫褶皱、纸页阴影：被素笺色包住的竹纸色小岛并回素笺
cc, k = ndi.label(fill == I['paper'])
main = np.bincount(cc.ravel())[1:].argmax() + 1
ring_src = refill(fill, line)
for j, sl in enumerate(ndi.find_objects(cc), start=1):
    if j == main or sl is None:
        continue
    y0, y1 = max(sl[0].start - 6, 0), min(sl[0].stop + 6, H)
    x0, x1 = max(sl[1].start - 6, 0), min(sl[1].stop + 6, W)
    isl = cc[y0:y1, x0:x1] == j
    ring = ndi.binary_dilation(isl, iterations=4) & ~isl
    labs = ring_src[y0:y1, x0:x1][ring]
    labs = labs[labs != I['paper']]
    if labs.size and (labs == I['sheet']).mean() > 0.6:
        fill[y0:y1, x0:x1][isl] = I['sheet']
votes = np.stack([ndi.gaussian_filter((fill == i).astype(np.float32), P['fill_sigma'] * S) for i in range(len(NAMES))])
fill = votes.argmax(0).astype(np.uint8)
del votes
log('fill cleanup')

# ---------- 6. 墨线清理与平滑 ----------
line = morphology.binary_closing(line, morphology.disk(max(1, int(round(0.5 * S)))))
# 细线保底宽度：骨架外扩一圈，免得下面平滑时把细线断成一串虚点
line |= ndi.binary_dilation(morphology.skeletonize(line), morphology.disk(int(round(P['line_min_r'] * S))))
cc, k = ndi.label(line)
ar = np.bincount(cc.ravel())
prot = np.bincount(cc.ravel(), weights=WAVES.ravel()) > 0
detail = np.bincount(cc.ravel(), weights=DETAIL.ravel()) > 0
# 脸、手、纸笺等细节区保留小笔触；衣服、椅子、桌子上的短碎线去掉
lim = np.where(prot, P['min_ink_prot'], np.where(detail, P['min_ink'], P['min_ink_coarse'])) * S * S
small = ar < lim
small[0] = False
line &= ~small[cc]
line = ndi.gaussian_filter(line.astype(np.float32), P['line_sigma'] * S) > 0.5

lm = fill.copy()
lm[line] = I['ink']
lm[WAVES & ~REC_BODY & (lm != I['ink'])] = I['paper']   # 声波之间的锐化白边

# ---------- 7. 合成后的小块清理 ----------
holes = np.zeros(lm.shape, bool)
for i, n in enumerate(NAMES):
    if n in ('ink', 'red'):
        continue
    cc, k = ndi.label(lm == i)
    if not k:
        continue
    ar = np.bincount(cc.ravel())
    small = ar < (P['min_sheet'] if n == 'sheet' else P['min_fill2']) * S * S
    small[0] = False
    holes |= small[cc]
lm = refill(lm, holes, avoid=lm == I['ink'])

# ---------- 8. 虚线：按原位重画成等距圆头短线 ----------
canvas = Image.new('L', (W, H), 0)
d = ImageDraw.Draw(canvas)
for seg in DASH_SEGS:
    pts = np.array(seg)
    t = np.r_[0, np.cumsum(np.hypot(*np.diff(pts, axis=0).T))]
    fx, fy = np.polyfit(t, pts[:, 0], 2), np.polyfit(t, pts[:, 1], 2)
    for tt in np.linspace(0, t[-1], len(seg)):
        cx, cy = np.polyval(fx, tt), np.polyval(fy, tt)
        tx, ty = np.polyval(np.polyder(fx), tt), np.polyval(np.polyder(fy), tt)
        nrm = np.hypot(tx, ty)
        half = (P['dash_len'] - P['dash_w']) / 2
        x0_, y0_ = (cx - tx / nrm * half) * S, (cy - ty / nrm * half) * S
        x1_, y1_ = (cx + tx / nrm * half) * S, (cy + ty / nrm * half) * S
        r = P['dash_w'] / 2 * S
        d.line([(x0_, y0_), (x1_, y1_)], fill=1, width=int(round(2 * r)))
        for ex, ey in ((x0_, y0_), (x1_, y1_)):
            d.ellipse([ex - r, ey - r, ex + r, ey + r], fill=1)
lm[np.asarray(canvas).astype(bool)] = I['ink']

# ---------- 9. 红点：原图饱和红像素的质心处画一个圆 ----------
src_a = np.asarray(src).astype(int)
rm = (src_a[..., 0] - src_a[..., 1] > 50) & (src_a[..., 0] - src_a[..., 2] > 50) & (src_a[..., 1] < 140)
ys, xs = np.nonzero(rm)
cy, cx = (ys.mean() + 0.5) * S, (xs.mean() + 0.5) * S
yy, xx = np.ogrid[0:H, 0:W]
lm[lm == I['red']] = I['ink']
lm[(yy - cy) ** 2 + (xx - cx) ** 2 <= (P['red_r'] * S) ** 2] = I['red']
log('red dot at', (round(xs.mean() + 0.5, 1), round(ys.mean() + 0.5, 1)))

rgb = np.array([[int(PALETTE[n][i:i + 2], 16) for i in (1, 3, 5)] for n in NAMES], np.uint8)
Image.fromarray(rgb[lm]).save(OUT / 'labels.png')
np.save(OUT / 'labels.npy', lm)
log('saved', OUT / 'labels.png', {n: round(float((lm == i).mean()), 4) for i, n in enumerate(NAMES)})
