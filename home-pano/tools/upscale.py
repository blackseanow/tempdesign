"""第 2 步：用 Real-ESRGAN 的插画模型 RealESRGAN_x4plus_anime_6B 在 CPU 上分块放大 4 倍。

- 五张全景图（第 1 步对齐后的 work/aligned/*.png，2106 × 747）→ 8424 × 2988，存到 img/<原文件名>.png
- door.png（1672 × 941）→ 先 4 倍（6688 × 3764），再 Lanczos 缩到 2 倍（3344 × 1882），存到 img/door.png
- 所有图用同一个模型、同一套分块设置（TILE、TILE_PAD），分块方式照抄 Real-ESRGAN 的 RealESRGANer.tile_process
- 网络结构照抄 basicsr 的 RRDBNet（num_feat 64、num_block 6、num_grow_ch 32、scale 4），权重读 params_ema

权重：https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth
      SHA-256 f872d837d3c90ed2e05227bed711af5671a6fd1c9f7d7e91c911a61f155e99da
用法：python3 tools/upscale.py --weights <pth 路径> [--only pano.png,door.png]
需要：torch（CPU 版即可）、numpy、Pillow
"""

import argparse
import hashlib
import json
import math
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image

HERE = Path(__file__).resolve().parent.parent
SOURCES = json.loads((HERE / "img" / "sources.json").read_text(encoding="utf8"))
ALIGNED = HERE / "work" / "aligned"
OUT = HERE / "img"
PANOS = ["pano.png", "pano-room.png", "pano-mouth.png", "pano-blink.png", "pano-press.png"]
TILE = 512        # 输入像素
TILE_PAD = 32     # 每块四周多算的输入像素，拼接时丢掉，避免接缝
SCALE = 4
WEIGHTS_SHA256 = "f872d837d3c90ed2e05227bed711af5671a6fd1c9f7d7e91c911a61f155e99da"


class ResidualDenseBlock(nn.Module):
    def __init__(self, num_feat=64, num_grow_ch=32):
        super().__init__()
        self.conv1 = nn.Conv2d(num_feat, num_grow_ch, 3, 1, 1)
        self.conv2 = nn.Conv2d(num_feat + num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv3 = nn.Conv2d(num_feat + 2 * num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv4 = nn.Conv2d(num_feat + 3 * num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv5 = nn.Conv2d(num_feat + 4 * num_grow_ch, num_feat, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(negative_slope=0.2, inplace=True)

    def forward(self, x):
        x1 = self.lrelu(self.conv1(x))
        x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
        x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
        x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
        x5 = self.conv5(torch.cat((x, x1, x2, x3, x4), 1))
        return x5 * 0.2 + x


class RRDB(nn.Module):
    def __init__(self, num_feat, num_grow_ch=32):
        super().__init__()
        self.rdb1 = ResidualDenseBlock(num_feat, num_grow_ch)
        self.rdb2 = ResidualDenseBlock(num_feat, num_grow_ch)
        self.rdb3 = ResidualDenseBlock(num_feat, num_grow_ch)

    def forward(self, x):
        out = self.rdb3(self.rdb2(self.rdb1(x)))
        return out * 0.2 + x


class RRDBNet(nn.Module):
    def __init__(self, num_in_ch=3, num_out_ch=3, num_feat=64, num_block=6, num_grow_ch=32):
        super().__init__()
        self.conv_first = nn.Conv2d(num_in_ch, num_feat, 3, 1, 1)
        self.body = nn.Sequential(*[RRDB(num_feat, num_grow_ch) for _ in range(num_block)])
        self.conv_body = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_up1 = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_hr = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_last = nn.Conv2d(num_feat, num_out_ch, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(negative_slope=0.2, inplace=True)

    def forward(self, x):
        feat = self.conv_first(x)
        feat = feat + self.conv_body(self.body(feat))
        feat = self.lrelu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode="nearest")))
        feat = self.lrelu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode="nearest")))
        return self.conv_last(self.lrelu(self.conv_hr(feat)))


def load_model(path):
    digest = hashlib.sha256(Path(path).read_bytes()).hexdigest()
    if digest != WEIGHTS_SHA256:
        raise SystemExit(f"权重的 SHA-256 不对：{digest}")
    state = torch.load(path, map_location="cpu", weights_only=True)
    state = state.get("params_ema", state.get("params", state))
    model = RRDBNet()
    model.load_state_dict(state, strict=True)
    model.eval()
    return model


@torch.inference_mode()
def upscale(model, rgb, log):
    """rgb: H×W×3 uint8 → (4H)×(4W)×3 uint8。分块照抄 RealESRGANer.tile_process（pre_pad 0）。"""
    img = torch.from_numpy(rgb.astype(np.float32) / 255.0).permute(2, 0, 1).unsqueeze(0)
    _, _, h, w = img.shape
    out = torch.zeros((1, 3, h * SCALE, w * SCALE))
    tx, ty = math.ceil(w / TILE), math.ceil(h / TILE)
    t0 = time.time()
    for y in range(ty):
        for x in range(tx):
            sx, sy = x * TILE, y * TILE
            ex, ey = min(sx + TILE, w), min(sy + TILE, h)
            psx, psy = max(sx - TILE_PAD, 0), max(sy - TILE_PAD, 0)
            pex, pey = min(ex + TILE_PAD, w), min(ey + TILE_PAD, h)
            tile = model(img[:, :, psy:pey, psx:pex])
            ox, oy = (sx - psx) * SCALE, (sy - psy) * SCALE
            out[:, :, sy * SCALE:ey * SCALE, sx * SCALE:ex * SCALE] = tile[:, :, oy:oy + (ey - sy) * SCALE, ox:ox + (ex - sx) * SCALE]
            log(f"  块 {y * tx + x + 1}/{tx * ty}  {time.time() - t0:.0f}s")
    arr = (out.squeeze(0).clamp(0, 1).permute(1, 2, 0).numpy() * 255.0).round().astype(np.uint8)
    return arr


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--weights", required=True)
    ap.add_argument("--only", default="")
    ap.add_argument("--threads", type=int, default=0)
    args = ap.parse_args()
    if args.threads:
        torch.set_num_threads(args.threads)
    model = load_model(args.weights)
    names = PANOS + ["door.png"]
    if args.only:
        names = [n for n in names if n in args.only.split(",")]
    log_path = HERE / "work" / "upscale.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)

    def log(msg):
        print(msg, flush=True)
        with open(log_path, "a", encoding="utf8") as f:
            f.write(msg + "\n")

    meta_path = HERE / "checks" / "upscale.json"
    meta = json.loads(meta_path.read_text(encoding="utf8")) if meta_path.exists() else {}
    meta["model"] = {"name": "RealESRGAN_x4plus_anime_6B", "sha256": WEIGHTS_SHA256, "arch": "RRDBNet(num_feat=64, num_block=6, num_grow_ch=32, scale=4)", "device": "cpu", "torch": torch.__version__, "threads": torch.get_num_threads()}
    meta["tiles"] = {"tile": TILE, "tile_pad": TILE_PAD, "pre_pad": 0, "note": "照抄 RealESRGANer.tile_process"}
    meta.setdefault("images", {})
    for name in names:
        src = ALIGNED / name if name in PANOS else HERE / SOURCES[name]
        rgb = np.asarray(Image.open(src).convert("RGB"))
        log(f"{name}: {rgb.shape[1]}×{rgb.shape[0]} 开始")
        t0 = time.time()
        up = upscale(model, rgb, log)
        secs = time.time() - t0
        im = Image.fromarray(up)
        if name == "door.png":
            im = im.resize((rgb.shape[1] * 2, rgb.shape[0] * 2), Image.LANCZOS)
        im.save(OUT / name, optimize=False, compress_level=9)
        meta["images"][name] = {"input": str(src.relative_to(HERE)), "input_size": [rgb.shape[1], rgb.shape[0]], "output_size": list(im.size), "seconds": round(secs, 1), "bytes": (OUT / name).stat().st_size}
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf8")
        log(f"{name}: 完成 {im.size[0]}×{im.size[1]}，{secs:.0f}s")


if __name__ == "__main__":
    main()
