"""第 1 步：把四张全景图（空房间、闭嘴、闭眼、按下）配准到 pano.png。

做法
1. SIFT 特征点 + RANSAC 估一个仿射变换（能吸收整体的轻微缩放、平移、旋转），
   对空房间这种大面积不同的图也稳：变了的地方的特征点会被当成离群点丢掉。
2. 用这个结果做初值，再在"不该变"的有纹理像素上算稠密光流（DIS），迭代拟合仿射修正，让整体残余位移最小。
   "该变的地方"（差值大的整块）膨胀后挖掉，不参与拟合。（ECC 也试过：差分图整张重画过，线条处处有细小差别，ECC 相关只有 0.3，结果反而更差。）
3. 按最终变换用 Lanczos 重采样到 pano.png 的尺寸（2106 × 747），边缘复制填补。
4. 报告：变换参数、不该变区域的差值（对齐前后）、12 × 4 格子里光流测出的残余错位、该变区域的范围。

输出（都在 home-pano/ 下）
  work/aligned/<名字>.png      对齐后的 1x 图（给第 2 步放大用，不提交）
  checks/align-report.json      数字
  checks/align-diff.webp        每张图对齐后与 pano.png 的差值热图（上下排列，蓝线圈出的是"该变的地方"）

运行：python3 tools/align.py   （需要 opencv-python-headless、numpy、Pillow）
"""

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent.parent
SOURCES = json.loads((HERE / "img" / "sources.json").read_text(encoding="utf8"))
REF = "pano.png"
MOVING = ["pano-room.png", "pano-mouth.png", "pano-blink.png", "pano-press.png"]
OUT = HERE / "work" / "aligned"
CHECKS = HERE / "checks"


def load(name):
    return np.asarray(Image.open(HERE / SOURCES[name]).convert("RGB"))


def gray(img):
    g = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
    return g


def feature_affine(ref_g, mov_g):
    sift = cv2.SIFT_create(nfeatures=8000)
    a = (ref_g * 255).astype(np.uint8)
    b = (mov_g * 255).astype(np.uint8)
    ka, da = sift.detectAndCompute(a, None)
    kb, db = sift.detectAndCompute(b, None)
    matcher = cv2.BFMatcher(cv2.NORM_L2)
    pairs = matcher.knnMatch(db, da, k=2)
    good = [m for m, n in pairs if m.distance < 0.75 * n.distance]
    src = np.float32([kb[m.queryIdx].pt for m in good])
    dst = np.float32([ka[m.trainIdx].pt for m in good])
    M, inliers = cv2.estimateAffine2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=1.5, maxIters=20000, confidence=0.999)
    return M, int(inliers.sum()), len(good)


def warp(img, M, size):
    return cv2.warpAffine(img, M, size, flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)


def change_mask(ref, mov_w, grow):
    """该变的地方：差值大、成片的区域。

    先模糊 9 px 再阈值，细线的亚像素错位会被抹平，只剩真正画得不一样的整块（嘴、眼睛、手、近层）。"""
    d = np.abs(ref.astype(np.int16) - mov_w.astype(np.int16)).max(axis=2).astype(np.uint8)
    d = cv2.GaussianBlur(d, (0, 0), 4.5)
    m = (d > 22).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m, 8)
    keep = np.zeros_like(m)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= 600:
            keep[lab == i] = 1
    if grow:
        keep = cv2.dilate(keep, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (grow, grow)))
    return keep


DIS = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)


def flow(ref_g, img_g):
    """ref(p) ≈ img(p + f(p))。"""
    a = (ref_g * 255).astype(np.uint8)
    b = (img_g * 255).astype(np.uint8)
    return DIS.calc(a, b, None)


def textured(ref_g, static):
    """有纹理的"不该变"像素：平涂的墙面、纸面上光流没意义。"""
    gx = cv2.Sobel(ref_g, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(ref_g, cv2.CV_32F, 0, 1, ksize=3)
    mag = cv2.GaussianBlur(np.hypot(gx, gy), (0, 0), 3)
    return (static > 0) & (mag > 0.08)


def flow_affine(ref_g, mov, M, static, rounds=3):
    """用稠密光流在"不该变"的有纹理像素上拟合一个仿射修正，迭代几轮，让整体残余位移最小。"""
    h, w = ref_g.shape
    ys, xs = np.mgrid[0:h, 0:w]
    for _ in range(rounds):
        f = flow(ref_g, gray(warp(mov, M, (w, h))))
        sel = textured(ref_g, static) & (np.hypot(f[..., 0], f[..., 1]) < 6)
        idx = np.flatnonzero(sel.ravel())
        if len(idx) > 60000:
            idx = np.random.default_rng(0).choice(idx, 60000, replace=False)
        p = np.stack([xs.ravel()[idx], ys.ravel()[idx]], 1).astype(np.float32)
        q = p + f.reshape(-1, 2)[idx]
        A, _ = cv2.estimateAffine2D(p, q, method=cv2.LMEDS)
        A3 = np.vstack([A, [0, 0, 1]])
        M = (np.linalg.inv(A3) @ np.vstack([M, [0, 0, 1]]))[:2]
    return M


def residual_grid(ref_g, img_g, static, cols=12, rows=4):
    """对齐后剩下的局部位移：按 12 × 4 的格子取光流中位数（只看有纹理的"不该变"像素）。"""
    h, w = ref_g.shape
    f = flow(ref_g, img_g)
    sel = textured(ref_g, static) & (np.hypot(f[..., 0], f[..., 1]) < 8)
    cells = []
    for r in range(rows):
        for c in range(cols):
            y0, y1 = r * h // rows, (r + 1) * h // rows
            x0, x1 = c * w // cols, (c + 1) * w // cols
            m = sel[y0:y1, x0:x1]
            if m.sum() < 400:
                continue
            fx = float(np.median(f[y0:y1, x0:x1, 0][m]))
            fy = float(np.median(f[y0:y1, x0:x1, 1][m]))
            cells.append({"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0, "dx": round(fx, 2), "dy": round(fy, 2), "px": int(m.sum())})
    mags = np.array([np.hypot(c["dx"], c["dy"]) for c in cells]) if cells else np.zeros(1)
    allm = np.hypot(f[..., 0], f[..., 1])[sel]
    return cells, {
        "cell_median_px": round(float(np.median(mags)), 3),
        "cell_max_px": round(float(mags.max()), 3),
        "pixel_median_px": round(float(np.median(allm)), 3) if allm.size else None,
        "pixel_p95_px": round(float(np.percentile(allm, 95)), 3) if allm.size else None,
    }


def describe(M):
    a, b, tx = M[0]
    c, d, ty = M[1]
    sx = float(np.hypot(a, c))
    sy = float(np.hypot(b, d))
    rot = float(np.degrees(np.arctan2(c, a)))
    return {"scale_x": round(sx, 5), "scale_y": round(sy, 5), "rotate_deg": round(rot, 4), "shift_x": round(float(tx), 3), "shift_y": round(float(ty), 3)}


def diff_stats(ref, img, static):
    d = np.abs(ref.astype(np.int16) - img.astype(np.int16)).max(axis=2)
    s = d[static > 0]
    return {"mean": round(float(s.mean()), 3), "p99": int(np.percentile(s, 99)), "share_gt_24": round(float((s > 24).mean()), 5)}


def heat(ref, img, static):
    d = np.abs(ref.astype(np.int16) - img.astype(np.int16)).max(axis=2).astype(np.float32)
    v = np.clip(d / 60.0, 0, 1)
    base = cv2.cvtColor(ref, cv2.COLOR_RGB2GRAY)
    out = np.stack([base] * 3, axis=2).astype(np.float32) * 0.35 + 140
    out[..., 0] = out[..., 0] * (1 - v) + 230 * v
    out[..., 1] = out[..., 1] * (1 - v) + 40 * v
    out[..., 2] = out[..., 2] * (1 - v) + 30 * v
    # 挖掉的"该变区域"用蓝色描边
    edge = cv2.morphologyEx((1 - static).astype(np.uint8), cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8))
    out[edge > 0] = (40, 90, 220)
    return np.clip(out, 0, 255).astype(np.uint8)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    CHECKS.mkdir(parents=True, exist_ok=True)
    ref = load(REF)
    h, w = ref.shape[:2]
    ref_g = gray(ref)
    Image.fromarray(ref).save(OUT / REF)
    report = {"reference": {"name": REF, "size": [w, h]}, "method": "SIFT+RANSAC 仿射初值 → 稠密光流（DIS）在不该变的有纹理像素上迭代拟合仿射 → Lanczos 重采样", "images": {}}
    heats = []
    for name in MOVING:
        mov = load(name)
        mh, mw = mov.shape[:2]
        # 尺寸不一样时先补到同尺寸（右、下复制边缘），变换里会再吸收掉
        pad = cv2.copyMakeBorder(mov, 0, max(0, h - mh), 0, max(0, w - mw), cv2.BORDER_REPLICATE)[:h, :w]
        before_static = None
        M_feat, n_in, n_good = feature_affine(ref_g, gray(pad))
        first = warp(pad, M_feat, (w, h))
        grow = 61 if name == "pano-room.png" else 31
        static = 1 - change_mask(ref, first, grow)
        M_final = flow_affine(ref_g, pad, M_feat, static)
        aligned = warp(pad, M_final, (w, h))
        changed = change_mask(ref, aligned, grow)
        static = (1 - changed).astype(np.uint8)
        stats_before = diff_stats(ref, pad, static)
        stats_feat = diff_stats(ref, first, static)
        stats_after = diff_stats(ref, aligned, static)
        cells, resid = residual_grid(ref_g, gray(aligned), static)
        n, lab, st, _ = cv2.connectedComponentsWithStats(changed, 8)
        boxes = sorted(([int(v) for v in st[i, :4]] for i in range(1, n) if st[i, cv2.CC_STAT_AREA] > 400), key=lambda b: -b[2] * b[3])
        Image.fromarray(aligned).save(OUT / name)
        report["images"][name] = {
            "source": SOURCES[name],
            "source_size": [mw, mh],
            "feature_matches": {"good": n_good, "inliers": n_in},
            "transform_mov_to_ref": describe(M_final),
            "matrix": [[round(float(v), 6) for v in row] for row in M_final],
            "static_share": round(float(static.mean()), 4),
            "diff_static_unaligned": stats_before,
            "diff_static_features_only": stats_feat,
            "diff_static_aligned": stats_after,
            "residual": resid,
            "residual_cells": cells,
            "changed_boxes_xywh": boxes[:12],
        }
        heats.append(heat(ref, aligned, static))
        print(name, describe(M_final), "static diff", stats_before["mean"], "->", stats_feat["mean"], "->", stats_after["mean"], "resid", resid, "static", round(float(static.mean()), 3))
    sheet = np.concatenate(heats, axis=0)
    Image.fromarray(sheet).save(CHECKS / "align-diff.webp", quality=82, method=6)
    (CHECKS / "align-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")


if __name__ == "__main__":
    main()
