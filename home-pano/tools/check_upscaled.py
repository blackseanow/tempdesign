"""第 2 步之后：确认放大后的五张全景图仍然和 pano.png 对得齐。

和第 1 步同一套量法：在"不该变"的有纹理像素上算稠密光流（DIS），按 12 × 4 的格子取中位数。
放大图是 8424 × 2988，为了快，两张图都先缩到一半（4212 × 1494）再算，结果换算回 4x 像素和 1x 像素。
"不该变区域"用第 1 步的判定（1x 上算，放大 4 倍）。

输出 checks/upscale-align.json；运行：python3 tools/check_upscaled.py
"""

import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE / "tools"))
import align  # noqa: E402  第 1 步的函数

NAMES = ["pano-room.png", "pano-mouth.png", "pano-blink.png", "pano-press.png"]


def main():
    ref1 = np.asarray(Image.open(HERE / "work" / "aligned" / "pano.png").convert("RGB"))
    big_ref = np.asarray(Image.open(HERE / "img" / "pano.png").convert("RGB"))
    h4, w4 = big_ref.shape[:2]
    half = (w4 // 2, h4 // 2)
    ref_h = cv2.resize(big_ref, half, interpolation=cv2.INTER_AREA)
    ref_g = align.gray(ref_h)
    out = {"scale_note": "位移单位：4x 像素（8424 宽）；括号里换算成 1x 像素", "images": {}}
    for name in NAMES:
        mov1 = np.asarray(Image.open(HERE / "work" / "aligned" / name).convert("RGB"))
        grow = 61 if name == "pano-room.png" else 31
        static1 = (1 - align.change_mask(ref1, mov1, grow)).astype(np.uint8)
        static_h = cv2.resize(static1, half, interpolation=cv2.INTER_NEAREST)
        big = np.asarray(Image.open(HERE / "img" / name).convert("RGB"))
        mov_h = cv2.resize(big, half, interpolation=cv2.INTER_AREA)
        cells, resid = align.residual_grid(ref_g, align.gray(mov_h), static_h)
        to4 = lambda v: None if v is None else round(v * 2, 3)
        r4 = {k: to4(v) for k, v in resid.items()}
        out["images"][name] = {
            "size": [big.shape[1], big.shape[0]],
            "residual_4x_px": r4,
            "residual_1x_px": {k: None if v is None else round(v / 4, 3) for k, v in r4.items()},
            "worst_cells_4x": sorted(({"x": c["x"] * 2, "y": c["y"] * 2, "dx": round(c["dx"] * 2, 2), "dy": round(c["dy"] * 2, 2)} for c in cells), key=lambda c: -np.hypot(c["dx"], c["dy"]))[:5],
        }
        print(name, "4x:", r4, "→ 1x:", out["images"][name]["residual_1x_px"])
    (HERE / "checks" / "upscale-align.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf8")


if __name__ == "__main__":
    main()
