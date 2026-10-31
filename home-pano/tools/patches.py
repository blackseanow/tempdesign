"""第 12 步：从三张差分图里只取变化的区域，做成小贴片，叠在近层上。

- mouth-closed：闭嘴（pano.png 本身是张嘴的；说话时在张、闭之间切换，不说话时闭嘴）
- eyes-closed：闭眼（每隔几秒眨一次）
- press：食指按在录音笔上（用户按录音笔时切换）

每块贴片的做法（都在 4x 图上）
1. 在 anchors.json 的 fx.mouthPatch / fx.eyes / fx.pressHand 区域外扩一圈，从 pano.png 和差分图里各裁一块。
2. 局部再配准：整图配准（第 1 步）以后，差分图在这一小块里还可能差零点几到两三个像素。
   用 ECC（先平移、再仿射）只看"不该变"的像素，把差分图这一块对齐到 pano.png，Lanczos 重采样。
3. 贴片的范围是一整块实心的区域，不是"逐像素哪里变了"：
   - 嘴、眼睛：亮度差大的地方合起来、填满、取凸包，再外扩一圈；
   - 按下的手：两张图里"不是桌面木头"的部分（手、袖子、录音笔）取并集——旧手和新手都盖住，旧手不会留下残影。
4. 泊松融合（OpenCV seamlessClone）：贴片里面用差分图的笔画，边界上和 pano.png 完全一致。
   差分图是整张重画过的，肤色、线条深浅和 pano.png 有细小差别，直接贴边缘会有一圈亮边或暗边；融合以后看不出接缝。
   两张图都是墨线的地方（比如眼镜框：差分图里偏蓝），先换成 pano.png 的像素。
5. alpha = 区域往里收 3 px 后羽化 1.5 px（融合结果在边界上本来就等于底图，这一点羽化只为抗锯齿）。
6. 检查：贴片叠回 pano.png 后，羽化带里和 pano.png 的差（应接近 0）；区域里和差分图的梯度一致。
输出：img/patches/<名字>.webp（RGBA）、img/patches/patches.json（位置，百分比）、checks/patches-*.webp、checks/patches.json
另外输出 img/patches/desk-mask.webp：桌面木头的遮罩，开讲时那道阳光只照在桌面上。
运行：python3 tools/patches.py   （需要 opencv-python-headless、numpy、Pillow）
"""

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
HERE = Path(__file__).resolve().parent.parent
IMG = HERE / "img"
OUT = IMG / "patches"
CHECKS = HERE / "checks"
ANCHORS = json.loads((HERE / "anchors.json").read_text(encoding="utf8"))
W1, H1 = 2106, 747
S = 4
# 名字、差分图、锚点、区域的求法、亮度差阈值
SPECS = [
    ("mouth-closed", "pano-mouth.png", "mouthPatch", "region", 18),
    ("eyes-closed", "pano-blink.png", "eyes", "region", 16),
    ("press", "pano-press.png", "pressHand", "hands", 0),
]


def rect_px(r, margin=0):
    x0 = r["x"] / 100 * W1 * S - margin
    y0 = r["y"] / 100 * H1 * S - margin
    x1 = (r["x"] + r["w"]) / 100 * W1 * S + margin
    y1 = (r["y"] + r["h"]) / 100 * H1 * S + margin
    return [int(round(v)) for v in (x0, y0, x1, y1)]


def luma(a):
    return cv2.cvtColor(a, cv2.COLOR_RGB2GRAY).astype(np.float32)


def local_align(ref, mov, static):
    """ECC 对齐（先平移，再仿射），只看 static 里的像素。"""
    a = cv2.GaussianBlur(luma(ref) / 255, (0, 0), 1.2)
    b = cv2.GaussianBlur(luma(mov) / 255, (0, 0), 1.2)
    M = np.eye(2, 3, dtype=np.float32)
    crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-7)
    try:
        _, M = cv2.findTransformECC(a, b, M, cv2.MOTION_TRANSLATION, crit, static.astype(np.uint8), 5)
        _, M = cv2.findTransformECC(a, b, M, cv2.MOTION_AFFINE, crit, static.astype(np.uint8), 5)
    except cv2.error:
        pass
    h, w = ref.shape[:2]
    out = cv2.warpAffine(mov, M, (w, h), flags=cv2.INTER_LANCZOS4 | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
    return out, M


def wood_mask(img):
    c = img.astype(np.int16)
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    return ((r > 160) & (r < 248) & (g > 120) & (g < 218) & (b > 60) & (b < 175) & (r - b > 40) & (r - g > 10)).astype(np.uint8)


def fill_holes(m):
    ff = np.pad(m, 1).copy()
    h, w = ff.shape
    flood = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(ff, flood, (0, 0), 1)
    return (m | (1 - ff[1:-1, 1:-1])).astype(np.uint8)


def region_mask(ref, mov, core, thr):
    d = cv2.GaussianBlur(np.abs(luma(ref) - luma(mov)), (0, 0), 1.5)
    m = ((d > thr) & (core > 0)).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31)))
    m = fill_holes(m)
    pts = cv2.findNonZero(m)
    hull = np.zeros_like(m)
    if pts is not None:
        cv2.fillConvexPoly(hull, cv2.convexHull(pts), 1)
    return cv2.dilate(hull, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25)))


def hands_mask(ref, mov, core):
    """两张图里不是桌面木头、又和核心区域连着的部分，取并集。"""
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    out = np.zeros(ref.shape[:2], np.uint8)
    for img in (ref, mov):
        nw = (1 - wood_mask(img)) & core
        nw = cv2.morphologyEx(nw, cv2.MORPH_OPEN, k)
        n, lab, st, _ = cv2.connectedComponentsWithStats(nw, 8)
        if n > 1:
            # 留面积最大的一块（手 + 袖子 + 录音笔连成一片）
            i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
            out |= (lab == i).astype(np.uint8)
    out = cv2.morphologyEx(out, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21)))
    out = fill_holes(out)
    return cv2.dilate(out, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21)))


def poisson(src, dst, mask):
    """泊松融合，结果和 dst 同尺寸、不平移。四周先补 16 px，免得区域贴边。"""
    p = 16
    srcp = cv2.copyMakeBorder(src, p, p, p, p, cv2.BORDER_REPLICATE)
    dstp = cv2.copyMakeBorder(dst, p, p, p, p, cv2.BORDER_REPLICATE)
    m = cv2.copyMakeBorder(mask * 255, p, p, p, p, cv2.BORDER_CONSTANT, value=0)
    m[:p + 2, :] = 0; m[-p - 2:, :] = 0; m[:, :p + 2] = 0; m[:, -p - 2:] = 0
    x, y, w, h = cv2.boundingRect(m)
    # OpenCV 把 src 的 mask 包围盒摆在 center 处；按它的取整方式算 center，保证不平移
    center = (x + w // 2, y + h // 2)
    out = cv2.seamlessClone(cv2.cvtColor(srcp, cv2.COLOR_RGB2BGR), cv2.cvtColor(dstp, cv2.COLOR_RGB2BGR), m, center, cv2.NORMAL_CLONE)
    out = cv2.cvtColor(out, cv2.COLOR_BGR2RGB)[p:-p, p:-p]
    return out


def shift_check(a, b, mask):
    """融合结果和差分图之间有没有平移（相位相关，只看区域里）。"""
    if mask.sum() < 100:
        return [0.0, 0.0]
    wa = luma(a) * mask
    wb = luma(b) * mask
    (dx, dy), _ = cv2.phaseCorrelate(wa, wb)
    return [round(float(dx), 2), round(float(dy), 2)]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    pano = np.asarray(Image.open(IMG / "pano.png").convert("RGB"))
    near_alpha = np.asarray(Image.open(IMG / "pano-near.png").getchannel("A"))
    H4 = pano.shape[0]
    manifest, report = {}, {}
    for name, src, key, mode, thr in SPECS:
        core_r = rect_px(ANCHORS["fx"][key]["rect"])
        x0, y0, x1, y1 = rect_px(ANCHORS["fx"][key]["rect"], margin=24 * S)
        y1 = min(y1, H4)
        ref = pano[y0:y1, x0:x1].copy()
        mov = np.asarray(Image.open(IMG / src).convert("RGB"))[y0:y1, x0:x1].copy()
        h, w = ref.shape[:2]
        core = np.zeros((h, w), np.uint8)
        core[max(0, core_r[1] - y0):core_r[3] - y0, max(0, core_r[0] - x0):core_r[2] - x0] = 1
        # 局部配准：先粗估变化区域，挖掉以后对齐
        rough = (cv2.GaussianBlur(np.abs(luma(ref) - luma(mov)), (0, 0), 1.5) > 18).astype(np.uint8) & cv2.dilate(core, np.ones((31, 31), np.uint8))
        static = (1 - cv2.dilate(rough, np.ones((41, 41), np.uint8))).astype(np.uint8)
        aligned, M = local_align(ref, mov, static)
        # 区域
        mask = region_mask(ref, aligned, core, thr) if mode == "region" else hands_mask(ref, aligned, core)
        mask &= cv2.erode(np.ones_like(mask), np.ones((9, 9), np.uint8))          # 离裁切边至少 4 px
        if y1 >= H4:
            mask[-8:, :] = 0                                                       # 画面最底下几行不动（下面是补边）
        # 两边都是墨线的地方用 pano 的像素（差分图里眼镜框偏蓝）
        la, lb = luma(ref), luma(aligned)
        both_ink = (la < 90) & (lb < 110)
        src_px = np.where(both_ink[..., None], ref, aligned)
        blended = poisson(src_px, ref, mask)
        inner = cv2.erode(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
        alpha = np.clip(cv2.GaussianBlur(inner.astype(np.float32), (0, 0), 1.5), 0, 1)
        na = near_alpha[y0:y1, x0:x1].astype(np.float32) / 255
        alpha *= np.clip(na * 1.5, 0, 1)                                           # 不画到近层外面
        ys, xs = np.nonzero(alpha > 0.004)
        bx0, by0, bx1, by1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
        rgba = np.dstack([blended, (alpha * 255).round().astype(np.uint8)])[by0:by1, bx0:bx1]
        Image.fromarray(rgba, "RGBA").save(OUT / f"{name}.webp", "WEBP", quality=94, method=6, exact=True)
        gx0, gy0, gx1, gy1 = x0 + bx0, y0 + by0, x0 + bx1, y0 + by1
        manifest[name] = {
            "file": f"img/patches/{name}.webp",
            "rect": {"x": round(gx0 / (W1 * S) * 100, 4), "y": round(gy0 / (H1 * S) * 100, 4), "w": round((gx1 - gx0) / (W1 * S) * 100, 4), "h": round((gy1 - gy0) / (H1 * S) * 100, 4)},
            "px4x": [int(gx0), int(gy0), int(gx1 - gx0), int(gy1 - gy0)],
        }
        # —— 检查 ——
        comp = blended.astype(np.float32) * alpha[..., None] + ref.astype(np.float32) * (1 - alpha[..., None])
        band = (alpha > 0.02) & (alpha < 0.98)
        dpano = np.abs(comp - ref.astype(np.float32)).max(axis=2)
        gx = lambda im: cv2.Sobel(luma(im), cv2.CV_32F, 1, 0, ksize=3)
        inside = inner > 0
        grad_err = float(np.abs(gx(blended.astype(np.uint8)) - gx(src_px))[inside].mean()) if inside.any() else 0.0
        report[name] = {
            "source": src,
            "mask_mode": mode,
            "local_align": {"matrix": [[round(float(v), 4) for v in row] for row in M]},
            "patch_px_4x": manifest[name]["px4x"],
            "feather_band_vs_pano": {"mean": round(float(dpano[band].mean()), 2), "p95": round(float(np.percentile(dpano[band], 95)), 1)},
            "inside_gradient_error_vs_diff_image": round(grad_err, 2),
            "blend_shift_px": shift_check(blended, src_px, inside.astype(np.uint8)),
            "alpha_clear_at_crop_edges": bool(alpha[0].max() < 0.01 and alpha[:, 0].max() < 0.01 and alpha[:, -1].max() < 0.01),
        }
        def show(a):
            return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).resize((w // 2, h // 2), Image.LANCZOS)
        sheet = Image.new("RGB", (w // 2 * 4 + 30, h // 2), "white")
        for i, im in enumerate([ref, aligned, comp, np.dstack([alpha * 255] * 3)]):
            sheet.paste(show(im), (i * (w // 2 + 10), 0))
        sheet.save(CHECKS / f"patches-{name}.webp", quality=88)
        print(name, report[name])

    # 桌面木头的遮罩：开讲时那道阳光只照在桌面上（不照到手、书、录音笔上）
    d = ANCHORS["fx"]["desk"]["rect"]
    x0, y0, x1, y1 = rect_px(d)
    crop = pano[y0:y1, x0:x1]
    wood = wood_mask(crop) & (near_alpha[y0:y1, x0:x1] > 128).astype(np.uint8)
    wood = cv2.morphologyEx(wood, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    wood = cv2.morphologyEx(wood, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    small = cv2.resize(wood.astype(np.float32), ((x1 - x0) // 2, (y1 - y0) // 2), interpolation=cv2.INTER_AREA)
    a = (np.clip(small, 0, 1) * 255).round().astype(np.uint8)
    Image.fromarray(np.dstack([np.full_like(a, 255)] * 3 + [a]), "RGBA").save(OUT / "desk-mask.webp", "WEBP", lossless=True)
    manifest["desk-mask"] = {"file": "img/patches/desk-mask.webp", "rect": d, "note": "2x 分辨率；alpha = 桌面木头"}
    report["desk-mask"] = {"wood_share": round(float(wood.mean()), 3)}
    (OUT / "patches.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf8")
    (CHECKS / "patches.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")


if __name__ == "__main__":
    main()
