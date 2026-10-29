"""生成全部 SVG：每个候选的印章（全彩 / 单色墨 / 反白）和两种文字组合（横排 / 竖排题签）。

用法（在 logo/ 下）：
  npm install                 # 取得 lxgw-wenkai-webfont（霞鹜文楷）
  pip install fonttools brotli skia-pathops numpy
  python3 tools/build.py      # 输出到 svg/

所有文字都从霞鹜文楷字体里取字形、转成路径，SVG 里不含 <text>，没装这个字体的电脑上显示也一致。
"""
from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import geom  # noqa: E402
import glyphs  # noqa: E402
import marks  # noqa: E402

ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "svg")

# 设计系统色板
CINNABAR = "#B5382A"   # 朱砂
SHEET = "#F8F7F2"      # 素笺
INK = "#24231F"        # 松烟墨
INDIGO = "#1F3A4D"     # 函套青
PAPER = "#ECEAE1"      # 竹纸

TEXT = "咸鱼把脉了"
WEIGHT = os.environ.get("LOGO_WEIGHT", "bold")
NAME = "咸鱼把脉了"


# ---------------------------------------------------------------- 字形

def text_paths(weight: str, em: float, x0: float, y0: float, tracking: float, vertical: bool) -> geom.Path:
    """把 TEXT 排成一行（横排）或一列（竖排），返回合并后的路径（SVG 坐标）。

    每个字占一个全角 em 框：框顶对齐字体的 sTypoAscender（880），框底对齐 sTypoDescender（-120）。
    横排时 x0 是第一个字的左沿；竖排时 x0 是这一列的左沿。y0 是第一个字 em 框的顶。
    """
    info = glyphs.font_info(weight)
    s = em / info["upem"]
    asc = info["typo_ascender"]
    out = []
    for i, ch in enumerate(TEXT):
        g = glyphs.glyph(ch, weight)
        if vertical:
            gx = x0 + (em - g.advance * s) / 2
            gy = y0 + i * (em + tracking)
        else:
            gx = x0 + i * (em + tracking)
            gy = y0
        # 字体坐标 y 朝上：x' = gx + x·s，y' = gy + (asc − y)·s
        out.append(g.path.transform(s, 0, 0, -s, gx, gy + asc * s))
    return geom.union(*out)


# ---------------------------------------------------------------- SVG

def fmt(v: float) -> str:
    return geom._num(v, 2)


def svg(viewbox, body: str, label: str) -> str:
    x, y, w, h = viewbox
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{fmt(x)} {fmt(y)} {fmt(w)} {fmt(h)}" '
            f'width="{fmt(w)}" height="{fmt(h)}" role="img" aria-label="{label}">'
            f'<title>{label}</title>{body}</svg>\n')


def path(p: geom.Path, fill: str) -> str:
    return f'<path fill="{fill}" d="{geom.to_d(p)}"/>'


@dataclass
class Seal:
    key: str
    fig: geom.Path        # 印里的图形
    face: geom.Path       # 印面（圆角方块）
    knock: geom.Path      # 印面挖掉图形（单色、反白用）

    def placed(self, x: float, y: float, size: float):
        """把印章缩放、平移到 (x, y)，边长 size。"""
        k = size / marks.SEAL
        tf = lambda p: p.transform(k, 0, 0, k, x, y)  # noqa: E731
        return Seal(self.key, tf(self.fig), tf(self.face), tf(self.knock))

    def draw(self, version: str) -> str:
        if version == "color":
            return path(self.face, CINNABAR) + path(self.fig, SHEET)
        if version == "mono":
            return path(self.knock, INK)
        if version == "reverse":
            return path(self.knock, SHEET)
        raise ValueError(version)


def make_seal(key: str) -> Seal:
    fig = marks.build(key)
    face = marks.seal_shape()
    return Seal(key, fig, face, geom.difference(face, fig))


# 反白版的底色留边（占印章边长的比例）
REV_PAD = 0.125


def seal_svg(seal: Seal, version: str) -> str:
    S = marks.SEAL
    label = f"{NAME} 印章 {seal.key}"
    if version == "reverse":
        pad = S * REV_PAD
        vb = (-pad, -pad, S + 2 * pad, S + 2 * pad)
        bg = f'<rect fill="{INDIGO}" x="{fmt(-pad)}" y="{fmt(-pad)}" width="{fmt(S + 2 * pad)}" height="{fmt(S + 2 * pad)}"/>'
        return svg(vb, bg + seal.draw(version), label)
    return svg((0, 0, S, S), seal.draw(version), label)


# ---------------------------------------------------------------- 横排

H = dict(em=40.0, tracking=3.2, gap=17.0)


def lockup_h(seal: Seal, version: str, weight: str = WEIGHT) -> str:
    S = marks.SEAL
    em, tr, gap = H["em"], H["tracking"], H["gap"]
    x_text = S + gap
    y_text = (S - em) / 2
    text = text_paths(weight, em, x_text, y_text, tr, vertical=False)
    width = x_text + 5 * em + 4 * tr
    ink = {"color": INK, "mono": INK, "reverse": SHEET}[version]
    body = seal.draw(version) + path(text, ink)
    label = f"{NAME}（横排，印章 {seal.key}）"
    if version == "reverse":
        pad = S * 0.25
        vb = (-pad, -pad, width + 2 * pad, S + 2 * pad)
        bg = f'<rect fill="{INDIGO}" x="{fmt(vb[0])}" y="{fmt(vb[1])}" width="{fmt(vb[2])}" height="{fmt(vb[3])}"/>'
        return svg(vb, bg + body, label)
    return svg((0, 0, width, S), body, label)


# ---------------------------------------------------------------- 竖排题签

V = dict(em=40.0, tracking=8.8, side=15.2, inset=5.6, frame=1.6, top=18.0, gap=14.0, seal=36.0, bottom=17.0)


def lockup_v(seal: Seal, version: str, weight: str = WEIGHT) -> str:
    """题签：素笺底、细墨框，五字竖排，底部压一方印。"""
    em, tr = V["em"], V["tracking"]
    inset, fw = V["inset"], V["frame"]
    W = em + 2 * V["side"]
    y_text = inset + fw + V["top"]
    text = text_paths(weight, em, (W - em) / 2, y_text, tr, vertical=True)
    y_seal = y_text + 5 * em + 4 * tr + V["gap"]
    sz = V["seal"]
    st = seal.placed((W - sz) / 2, y_seal, sz)
    Ht = y_seal + sz + V["bottom"] + fw + inset
    frame = geom.difference(geom.rrect(inset, inset, W - 2 * inset, Ht - 2 * inset),
                            geom.rrect(inset + fw, inset + fw, W - 2 * (inset + fw), Ht - 2 * (inset + fw)))
    label = f"{NAME}（竖排题签，印章 {seal.key}）"
    if version == "color":
        body = (f'<rect fill="{SHEET}" width="{fmt(W)}" height="{fmt(Ht)}"/>' + path(frame, INK) + path(text, INK)
                + st.draw("color"))
    elif version == "mono":
        body = path(frame, INK) + path(text, INK) + st.draw("mono")
    else:
        body = (f'<rect fill="{INDIGO}" width="{fmt(W)}" height="{fmt(Ht)}"/>' + path(frame, SHEET) + path(text, SHEET)
                + st.draw("reverse"))
    return svg((0, 0, W, Ht), body, label)


# ---------------------------------------------------------------- 输出

VERSIONS = ("color", "mono", "reverse")


def main(keys=None):
    keys = keys or [c.key for c in marks.CANDIDATES]
    manifest = {"font": glyphs.font_info(WEIGHT), "weight": WEIGHT, "candidates": []}
    for key in keys:
        seal = make_seal(key)
        d = os.path.join(OUT, key)
        os.makedirs(d, exist_ok=True)
        files = {}
        for v in VERSIONS:
            for kind, fn in (("seal", seal_svg), ("h", lockup_h), ("v", lockup_v)):
                name = f"{key}-{kind}-{v}.svg"
                with open(os.path.join(d, name), "w", encoding="utf-8") as f:
                    f.write(fn(seal, v))
                files[f"{kind}-{v}"] = f"svg/{key}/{name}"
        cand = next(c for c in marks.CANDIDATES if c.key == key)
        manifest["candidates"].append({"key": key, "direction": cand.direction, "name": cand.name,
                                       "margin": round(marks.margin_of(seal.fig), 2), "files": files})
        print(key, cand.name, "margin", round(marks.margin_of(seal.fig), 2))
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main(sys.argv[1:] or None)
