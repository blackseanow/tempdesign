"""第 4 步：所有大图切成不超过 2048 像素的小块，压成 webp。先加载一套小图，进屋后再换高清。

几何（和 scene.json 的 pano 一节一致，改了要两边一起改）
- 全景图横向铺满 180°（yaw −90°…+90°），竖直方向按圆柱面展开：第 HORIZON_ROW 行（1x）是视平线。
- 底边往下补 PAD_BOTTOM 行（1x）：复制最后一行。往下看 5° 时不至于看到画外；手机竖屏视野高，也靠这一截。
- 左右 ±90° 以外是"身后"：用画面最外边的几列颜色往外拉，渐暗到松烟墨（shoulder-l / shoulder-r）。

输出（img/tiles/，清单 img/tiles/manifest.json）
  far/<级别>/c<列>r<行>.webp     远层：pano-room（空房间）
  near/<级别>/c<列>r<行>.webp    近层：pano-near（RGBA），整块透明的不出文件
  far/shoulder-l.webp、shoulder-r.webp
  flat/<级别>/c<列>.webp         平面版用的整图（pano.png，不补边）
  ../door/wall-*.webp、leaf*.webp 门外：墙和门框（门扇处挖空）、门扇单独一张
  级别 1 = 1x（2106 宽，小图，先加载）；2 = 2x（4212 宽，手机的高清）；4 = 4x（8424 宽，电脑的高清）
  每块不超过 1404 × 1590。

运行：python3 tools/tiles.py   （需要 Pillow、numpy；先跑完第 2、3 步）
"""

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
HERE = Path(__file__).resolve().parent.parent
IMG = HERE / "img"
OUT = IMG / "tiles"
ANCHORS = json.loads((HERE / "anchors.json").read_text(encoding="utf8"))

W1, H1 = 2106, 747
HORIZON_ROW = 300   # 1x 像素
PAD_BOTTOM = 48     # 1x 像素
YAW_SPAN = 180.0
LEVELS = {1: (2, 1), 2: (3, 1), 4: (6, 2)}   # 级别 → (列, 行)
QUALITY = {"far": 86, "near": 88, "flat": 84, "door": 86}
INK = np.array([36, 35, 31], np.float32)


def pad_bottom(arr, rows):
    last = arr[-1:, ...]
    return np.concatenate([arr, np.repeat(last, rows, axis=0)], axis=0)


def save_webp(im, path, quality):
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "WEBP", quality=quality, method=6)
    return path.stat().st_size


def cut(im, cols, rows, layer, level, manifest_layer, skip_empty):
    w, h = im.size
    tw, th = math.ceil(w / cols), math.ceil(h / rows)
    assert tw <= 2048 and th <= 2048, (tw, th)
    tiles, total = [], 0
    for r in range(rows):
        row = []
        for c in range(cols):
            box = (c * tw, r * th, min(w, (c + 1) * tw), min(h, (r + 1) * th))
            t = im.crop(box)
            if skip_empty and t.mode == "RGBA" and t.getchannel("A").getextrema()[1] == 0:
                row.append(None)
                continue
            rel = f"{layer}/{level}/c{c}r{r}.webp"
            total += save_webp(t, OUT / rel, QUALITY[layer])
            row.append({"file": rel, "box": list(box)})
        tiles.append(row)
    manifest_layer[str(level)] = {"size": [w, h], "grid": [cols, rows], "tile": [tw, th], "tiles": tiles, "bytes": total}
    return total


def shoulder(farp, side):
    """±90° 以外：最外边 12 列的颜色往外拉，渐暗到松烟墨。宽 256（拉伸着用），高同 2x。
    farp 必须是补过底边的那张（和远层小块同一个高度），否则贴到圆柱上会被拉长，墙上的横线在接缝处对不上。"""
    cols = farp[:, :12] if side == "l" else farp[:, -12:]
    edge = cols.astype(np.float32).mean(axis=1)            # (H, 3)
    h = edge.shape[0] // 2
    edge = np.asarray(Image.fromarray(edge.round().astype(np.uint8)[:, None, :].repeat(4, 1)).resize((4, h), Image.LANCZOS)).astype(np.float32)[:, 0]
    width = 256
    t = np.linspace(0, 1, width, dtype=np.float32)
    t = t * t * (3 - 2 * t)                                  # smoothstep
    if side == "l":
        t = t[::-1]                                          # 左边：最左是墨，靠近画面那头是画面颜色
    mix = edge[:, None, :] * (1 - t[None, :, None] * 0.88) + INK[None, None, :] * (t[None, :, None] * 0.88)
    return Image.fromarray(mix.round().astype(np.uint8))


def door_assets(manifest):
    door = Image.open(IMG / "door.png").convert("RGBA")       # 2x：3344 × 1882
    W, H = door.size
    leaf = ANCHORS["door"]["leaf"]
    box = (round(leaf["x"] / 100 * W), round(leaf["y"] / 100 * H), round((leaf["x"] + leaf["w"]) / 100 * W), round((leaf["y"] + leaf["h"]) / 100 * H))
    leaf_im = door.crop(box).convert("RGB")
    wall = np.asarray(door).copy()
    wall[box[1]:box[3], box[0]:box[2], 3] = 0                 # 门扇处挖空，推开后露出后面的半全景
    wall_im = Image.fromarray(wall, "RGBA")
    d = {"size": [W, H], "leaf_box": list(box), "files": {}}
    half = W // 2
    for i in range(2):
        rel = f"../door/wall-c{i}.webp"
        size = save_webp(wall_im.crop((i * half, 0, (i + 1) * half if i == 0 else W, H)), OUT / rel, QUALITY["door"])
        d["files"][f"wall-c{i}"] = {"file": "door/" + f"wall-c{i}.webp", "box": [i * half, 0, (i + 1) * half if i == 0 else W, H], "bytes": size}
    lq = wall_im.resize((W // 4, H // 4), Image.LANCZOS)
    d["files"]["wall-lq"] = {"file": "door/wall-lq.webp", "size": list(lq.size), "bytes": save_webp(lq, IMG / "door" / "wall-lq.webp", 80)}
    d["files"]["leaf"] = {"file": "door/leaf.webp", "size": list(leaf_im.size), "bytes": save_webp(leaf_im, IMG / "door" / "leaf.webp", QUALITY["door"])}
    llq = leaf_im.resize((leaf_im.width // 4, leaf_im.height // 4), Image.LANCZOS)
    d["files"]["leaf-lq"] = {"file": "door/leaf-lq.webp", "size": list(llq.size), "bytes": save_webp(llq, IMG / "door" / "leaf-lq.webp", 80)}
    manifest["door"] = d


def main():
    manifest = {
        "pano": {"width1x": W1, "height1x": H1, "horizonRow1x": HORIZON_ROW, "padBottom1x": PAD_BOTTOM, "yawSpanDeg": YAW_SPAN},
        "far": {}, "near": {}, "flat": {},
    }
    far4 = np.asarray(Image.open(IMG / "pano-room.png").convert("RGB"))
    near4 = np.asarray(Image.open(IMG / "pano-near.png").convert("RGBA"))
    assert far4.shape[1] == W1 * 4 and near4.shape[1] == W1 * 4
    farp = Image.fromarray(pad_bottom(far4, PAD_BOTTOM * 4))
    nearp = Image.fromarray(pad_bottom(near4, PAD_BOTTOM * 4), "RGBA")
    for level, (cols, rows) in LEVELS.items():
        s = level / 4
        size = (round(farp.width * s), round(farp.height * s))
        f = farp if level == 4 else farp.resize(size, Image.LANCZOS)
        n = nearp if level == 4 else nearp.resize(size, Image.LANCZOS)
        bf = cut(f, cols, rows, "far", level, manifest["far"], False)
        bn = cut(n, cols, rows, "near", level, manifest["near"], True)
        print(f"级别 {level}: {size[0]}×{size[1]}，远层 {bf / 1e6:.2f} MB，近层 {bn / 1e6:.2f} MB")
    for side in ("l", "r"):
        rel = f"far/shoulder-{side}.webp"
        manifest["far"][f"shoulder-{side}"] = {"file": rel, "bytes": save_webp(shoulder(np.asarray(farp), side), OUT / rel, 86)}
    top = far4[:24].reshape(-1, 3).astype(np.float32)
    manifest["far"]["ceilingColor"] = "#%02x%02x%02x" % tuple(int(v) for v in np.median(top, axis=0))
    flat4 = Image.open(IMG / "pano.png").convert("RGB")
    for level, cols in ((1, 2), (2, 3)):
        im = flat4.resize((W1 * level, H1 * level), Image.LANCZOS)
        cut(im, cols, 1, "flat", level, manifest["flat"], False)
    door_assets(manifest)
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf8")
    print("ceiling", manifest["far"]["ceilingColor"], "door", manifest["door"]["leaf_box"])


if __name__ == "__main__":
    main()
