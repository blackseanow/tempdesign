"""第 3 步：用 pano.png 和 pano-room.png 做差值，抠出近层（领导、椅子、诊桌、桌上物件、两只手）。

做法（遮罩在 1x 上求，形状干净；再放到 4x 上平滑、羽化）
1. 1x "双向容错差值"：pano 每个像素和房间图 ±2 px 范围内最像的像素比，房间图每个像素也和 pano ±2 px 范围内最像的比，
   两个方向取大（三通道取最大，再 σ=1 模糊）。两张图的线条有 1～2 px 的细小错位，普通差值会把房间里的柜子竖线、
   护墙板横线当成近层（残边）；容错以后这些都抹掉了。反方向那一路专门抓"房间里的线被挡住了"：
   领导的脸、白衬衫和白抽屉颜色几乎一样，但抽屉的格线、拉手在脸上不见了，这就是近层的证据。
   > 30 的是"肯定是近层"；开运算去掉零星噪点。
2. 闭运算（7 px）把衬衫、脸、袖子这些和白墙颜色接近、差值断断续续的地方连起来，只留最大的一块（近层是连成一片的）。
3. 补洞：画面底边在近层的左右两端之间算作封口（两只袖子是白的，和白地面差值小，只抠得出轮廓，要靠封口补满）。
   近层里面被围住的背景小区域，如果房间在那里是平涂（没有线条），补进近层（看不出区别，补上边缘更顺）；
   如果房间在那里有线条、而且 pano 和 pano-room 的线条对得上（比如领导右臂下面露出来的抽屉），那是真正露出来的房间，留成洞。
4. 去零星噪点：面积太小、又不和主体相连的块丢掉。
5. 边界带清理：遮罩边缘内外 2 px 的带子里，只留双向容错差值 > 16 的像素（近层的墨线描边差值都很大），
   和房间一样的退回远层。这样抽屉拉手、标签框这种贴着近层边缘的房间碎块不会被带走（转头错位时会跟着近层动）。
   再去掉边缘上比 5 px 还细的凸起（开运算），但其中的墨色像素（发丝、描边，亮度 < 90）保留：
   最后清一遍柜子的五金件：桌面以上（y < 415，1x），离近层边缘 10 px 以内、颜色是抽屉标签框和拉手那种橙红色
   （色相 0–45°、饱和度 > 0.3、明度 > 0.45）的像素退回远层。领导、椅子、盖碗在这一带都没有这种颜色；
   头发左边、右臂上边那几块半截拉手（pano 里露出来的部分，房间图重画后位置略有不同）就是这样去掉的。
6. 放到 4x：双三次放大后取 0.5 阈值（边缘不再有台阶），再用 σ=0.8 的高斯羽化，边缘过渡 1～2 px（4x 像素）。
7. 近层 RGBA = pano.png（4x）的颜色 + 上面的 alpha，存 img/pano-near.png。

检查（checks/matte-report.json、checks/matte-*.webp）
- 缺块：pano 和 pano-room 差得多（真是近层）但 alpha < 0.5 的像素，按连通块列出来（面积 > 20 px 的都算）。
- 残边：alpha > 0.5、但 pano 和 pano-room 一样、离主体边缘又远的像素（多带进来的房间）。
- 合成回去：近层叠回 pano-room，和 pano 比；再叠在纯色底上、左右各错开 16 px 叠在房间上，看有没有残边。

运行：python3 tools/matte.py   （需要 opencv-python-headless、numpy、Pillow；先跑完第 1、2 步）
"""

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
HERE = Path(__file__).resolve().parent.parent
WORK = HERE / "work"
CHECKS = HERE / "checks"
IMG = HERE / "img"


def rgb(path):
    return np.asarray(Image.open(path).convert("RGB"))


def diff(a, b, blur):
    d = np.abs(a.astype(np.int16) - b.astype(np.int16)).max(axis=2).astype(np.float32)
    return cv2.GaussianBlur(d, (0, 0), blur) if blur else d


def edges(img):
    g = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY).astype(np.float32)
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
    return np.hypot(gx, gy)


def largest(mask):
    n, lab, st, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    if n <= 1:
        return mask
    i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    return (lab == i).astype(np.uint8)


def tolerant_diff(pano, room, r=2):
    """pano 每个像素和房间图 ±r px 范围内最接近的像素之差（三通道取最大）。"""
    a = pano.astype(np.int16)
    h, w = a.shape[:2]
    pad = cv2.copyMakeBorder(room, r, r, r, r, cv2.BORDER_REPLICATE).astype(np.int16)
    best = np.full((h, w), 255, np.int16)
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            b = pad[r + dy:r + dy + h, r + dx:r + dx + w]
            best = np.minimum(best, np.abs(a - b).max(axis=2))
    return best.astype(np.float32)


def mask_1x(pano, room, report):
    d = cv2.GaussianBlur(np.maximum(tolerant_diff(pano, room), tolerant_diff(room, pano)), (0, 0), 1.0)
    sure = (d > 30).astype(np.uint8)
    sure = cv2.morphologyEx(sure, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    blob = cv2.morphologyEx(sure, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    blob = largest(blob)
    # 底边封口：近层在最后一行的最左到最右之间，补一行，袖子这种只抠出轮廓的区域就被围住了
    h, w = blob.shape
    xs = np.flatnonzero(blob[-1])
    closed = blob.copy()
    if xs.size:
        closed[-1, xs.min():xs.max() + 1] = 1
    blob = closed
    # 洞：主体外面的背景是一整块连到画面边缘的；剩下的背景连通块都是被围住的洞
    inv = (1 - blob).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(inv, 4)
    e_room = edges(room)
    e_pano = edges(pano)
    holes_kept, holes_filled = [], []
    for i in range(1, n):
        x, y, bw, bh, area = st[i]
        touches = x == 0 or y == 0 or x + bw == w or y + bh >= h
        if touches:
            continue
        region = lab == i
        textured = float((e_room[region] > 60).mean())
        match = float(np.abs(e_room[region] - e_pano[region]).mean())
        dmean = float(d[region].mean())
        # 有线条、而且 pano 与房间的线条一致 → 真露出来的房间，保留成洞
        genuine = area >= 60 and textured > 0.04 and dmean < 10 and match < 25
        item = {"box": [int(x), int(y), int(bw), int(bh)], "area": int(area), "room_textured": round(textured, 3), "diff_mean": round(dmean, 1)}
        if genuine:
            holes_kept.append(item)
        else:
            blob[region] = 1
            holes_filled.append(item)
    # 边界带清理：边缘内外 2 px 的带子里，和房间一样（差值 ≤ 16）的像素退回远层
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    inner = cv2.erode(blob, k)
    band = cv2.dilate(blob, k) & (1 - inner)
    blob = (inner | (band & (d > 16).astype(np.uint8))).astype(np.uint8)
    opened = cv2.morphologyEx(blob, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    luma = cv2.cvtColor(pano, cv2.COLOR_RGB2GRAY)
    keep_ink = (blob & (1 - opened)) & (luma < 90).astype(np.uint8)
    report["thin_protrusions_removed_px"] = int((blob & (1 - opened) & (1 - keep_ink)).sum())
    blob = (opened | keep_ink).astype(np.uint8)
    # 柜子五金件（橙红色标签框、拉手）贴在领导边缘的碎块
    hsv = cv2.cvtColor(pano, cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
    hue, sat, val = hsv[..., 0] * 360 / 256, hsv[..., 1] / 255, hsv[..., 2] / 255
    hardware = ((hue <= 45) & (sat > 0.3) & (val > 0.45)).astype(np.uint8)
    dist = cv2.distanceTransform(blob, cv2.DIST_L2, 3)
    near_edge = (dist > 0) & (dist <= 10)
    rows = np.zeros_like(blob)
    rows[:415] = 1
    drop = cv2.dilate(hardware & near_edge.astype(np.uint8) & rows, np.ones((3, 3), np.uint8)) & blob
    report["cabinet_hardware_removed_px"] = int(drop.sum())
    blob = (blob & (1 - drop)).astype(np.uint8)
    # 零星噪点：主体以外的小块
    blob = largest(blob)
    report["boundary_band_px"] = int(band.sum())
    report["holes_kept"] = holes_kept
    report["holes_filled"] = {"count": len(holes_filled), "area": int(sum(i["area"] for i in holes_filled))}
    return blob, d


def alpha_4x(blob, size):
    w4, h4 = size
    up = cv2.resize(blob.astype(np.float32), (w4, h4), interpolation=cv2.INTER_CUBIC)
    hard = (up > 0.5).astype(np.float32)
    soft = cv2.GaussianBlur(hard, (0, 0), 0.8)
    return np.clip(soft, 0, 1)


def components(mask, min_area):
    n, lab, st, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    out = [[int(v) for v in st[i, :5]] for i in range(1, n) if st[i, cv2.CC_STAT_AREA] >= min_area]
    return sorted(out, key=lambda r: -r[4])


def main():
    CHECKS.mkdir(parents=True, exist_ok=True)
    report = {}
    pano1 = rgb(WORK / "aligned" / "pano.png")
    room1 = rgb(WORK / "aligned" / "pano-room.png")
    blob, d1 = mask_1x(pano1, room1, report)
    Image.fromarray(blob * 255).save(WORK / "near-mask-1x.png")
    report["mask_1x_share"] = round(float(blob.mean()), 4)

    pano4 = rgb(IMG / "pano.png")
    room4 = rgb(IMG / "pano-room.png")
    h4, w4 = pano4.shape[:2]
    a = alpha_4x(blob, (w4, h4))
    rgba = np.dstack([pano4, (a * 255).round().astype(np.uint8)])
    Image.fromarray(rgba, "RGBA").save(IMG / "pano-near.png", compress_level=9)

    # —— 检查 ——
    d4 = diff(pano4, room4, 2.0)
    # 缺块：1x 双向容错差值大（真有东西不一样）却没抠进来的连通块。房间里本来就重画过的地方（月洞窗竹子、书架）也会出现在这里，
    # 所以按位置分两类：在近层包围盒附近的（可能是漏抠）和远处的（房间图自己重画的）。
    dsym = cv2.GaussianBlur(np.maximum(tolerant_diff(pano1, room1), tolerant_diff(room1, pano1)), (0, 0), 1.0)
    missing = ((dsym > 40) & (blob == 0)).astype(np.uint8)
    missing = cv2.morphologyEx(missing, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    near_zone = cv2.dilate(blob, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41)))
    miss = components(missing, 30)
    miss_near = [m for m in miss if near_zone[m[1] + m[3] // 2, m[0] + m[2] // 2]]
    miss_far = [m for m in miss if not near_zone[m[1] + m[3] // 2, m[0] + m[2] // 2]]
    report["missing_chunks_1x"] = {"near_layer_zone": miss_near[:20], "elsewhere_count": len(miss_far), "elsewhere": miss_far[:12]}
    # 残边：抠进来了、但和房间一样、离主体边缘超过 6 px（1x）的地方
    core = cv2.erode((a > 0.5).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (49, 49)))
    same = (d4 < 6) & (a > 0.5)
    inner_same = same & (core > 0)
    edge_band = same & (core == 0)
    report["included_room_far_from_edge_4x"] = int(inner_same.sum())
    report["included_room_near_edge_4x"] = int(edge_band.sum())

    comp = (rgba[..., :3].astype(np.float32) * a[..., None] + room4.astype(np.float32) * (1 - a[..., None])).round().astype(np.uint8)
    cd = diff(comp, pano4, 0)
    report["recomposite_vs_pano"] = {"mean": round(float(cd.mean()), 3), "p99": int(np.percentile(cd, 99)), "max": int(cd.max())}

    def save_small(arr, name, scale=0.25):
        im = Image.fromarray(arr)
        im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
        im.save(CHECKS / name, quality=84, method=6)

    # 纯色底（函套青）上的近层：看残边
    bg = np.zeros_like(pano4)
    bg[:] = (31, 58, 77)
    on_bg = (pano4.astype(np.float32) * a[..., None] + bg.astype(np.float32) * (1 - a[..., None])).round().astype(np.uint8)
    save_small(on_bg, "matte-on-indigo.webp")
    # 左右错开 16 px（4x）叠在房间上：模拟转头时的景深错位
    for dx, tag in [(-16, "left"), (16, "right")]:
        M = np.float32([[1, 0, dx], [0, 1, 0]])
        sh_rgb = cv2.warpAffine(pano4, M, (w4, h4), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        sh_a = cv2.warpAffine(a, M, (w4, h4), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        out = (sh_rgb.astype(np.float32) * sh_a[..., None] + room4.astype(np.float32) * (1 - sh_a[..., None])).round().astype(np.uint8)
        save_small(out, f"matte-shift-{tag}.webp")
    # 1x 的遮罩和保留的洞
    vis = np.dstack([blob * 200, blob * 200, blob * 200]).astype(np.uint8)
    for hole in report["holes_kept"]:
        x, y, bw, bh = hole["box"]
        cv2.rectangle(vis, (x, y), (x + bw, y + bh), (230, 60, 40), 2)
    for x, y, bw, bh, area in miss_near[:20]:
        cv2.rectangle(vis, (x - 2, y - 2), (x + bw + 2, y + bh + 2), (40, 90, 230), 2)
    Image.fromarray(vis).save(CHECKS / "matte-mask.webp", quality=90)
    (CHECKS / "matte-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")
    print(json.dumps({k: v for k, v in report.items() if k != "holes_kept"}, ensure_ascii=False))
    print("holes kept:", len(report["holes_kept"]), [h["box"] for h in report["holes_kept"]])


if __name__ == "__main__":
    main()
