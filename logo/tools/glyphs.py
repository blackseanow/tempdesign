"""从霞鹜文楷 webfont（npm 包 lxgw-wenkai-webfont）提取字形轮廓。

webfont 按 unicode-range 拆成了几百个 woff2 子集，这里逐个打开子集文件、查 cmap，
找到每个字所在的文件，再用 fontTools 的 pen 把 TrueType 轮廓转成 skia-pathops 的 Path。
坐标保持字体单位（unitsPerEm = 1000，y 轴朝上），排版时再变换。
"""
from __future__ import annotations

import glob
import os
from dataclasses import dataclass
from functools import lru_cache

import pathops
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_PKG = os.path.join(HERE, "..", "node_modules", "lxgw-wenkai-webfont")
PKG = os.environ.get("LXGW_DIR", DEFAULT_PKG)


@dataclass
class Glyph:
    char: str
    name: str
    path: pathops.Path        # 字体单位，y 轴朝上
    advance: int              # 横排步进（hmtx）
    vadvance: int             # 竖排步进（vmtx）
    tsb: int                  # 竖排上边距（vmtx）
    source: str               # 来自哪个子集文件


@lru_cache(maxsize=None)
def _subset_files(weight: str) -> tuple[str, ...]:
    files = sorted(glob.glob(os.path.join(PKG, "files", f"lxgwwenkai-{weight}-subset-*.woff2")))
    if not files:
        raise FileNotFoundError(f"找不到 {weight} 字重的子集文件，先在 logo/ 下运行 npm install（或设 LXGW_DIR）")
    return tuple(files)


@lru_cache(maxsize=None)
def _open(path: str) -> TTFont:
    return TTFont(path)


def font_info(weight: str = "regular") -> dict:
    t = _open(_subset_files(weight)[0])
    name = t["name"]
    return {
        "family": str(name.getName(1, 3, 1, 0x409)),
        "style": str(name.getName(2, 3, 1, 0x409)),
        "version": str(name.getName(5, 3, 1, 0x409)),
        "upem": t["head"].unitsPerEm,
        "typo_ascender": t["OS/2"].sTypoAscender,
        "typo_descender": t["OS/2"].sTypoDescender,
    }


def glyph(char: str, weight: str = "regular") -> Glyph:
    for f in _subset_files(weight):
        t = _open(f)
        cmap = t.getBestCmap()
        if ord(char) not in cmap:
            continue
        gname = cmap[ord(char)]
        gs = t.getGlyphSet()
        p = pathops.Path()
        gs[gname].draw(p.getPen())
        # TrueType 轮廓可能有重叠的笔画，合并成干净的单一轮廓，便于后续布尔运算
        p = pathops.simplify(p, fix_winding=True, keep_starting_points=False)
        adv = t["hmtx"][gname][0]
        vadv, tsb = t["vmtx"][gname] if "vmtx" in t else (t["head"].unitsPerEm, 0)
        return Glyph(char, gname, p, adv, vadv, tsb, os.path.basename(f))
    raise KeyError(f"{char!r} 不在 {weight} 字重的任何子集里")


if __name__ == "__main__":
    for w in ("light", "regular", "bold"):
        info = font_info(w)
        print(w, info)
        for c in "咸鱼把脉了":
            g = glyph(c, w)
            print("  ", c, g.name, g.source, "adv", g.advance, "vadv", g.vadvance, "tsb", g.tsb, "bounds", tuple(round(v) for v in g.path.bounds))
