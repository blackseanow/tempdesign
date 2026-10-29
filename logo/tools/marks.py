"""印章图形：三个方向、每个方向两个变体。

坐标：印面 64 × 64（viewBox 0 0 64 64）。16 px 时 1 px = 4 单位，64 px 时 1 px = 1 单位。
每个候选返回印面里的图形（一个已合并的 Path）。全彩版里这部分填素笺色，单色版和反白版里它是挖空的部分。

三个方向共用一条脉搏线的画法：
- 中心线是余弦波，波峰正好在三个手指（指腹）下方，两端放平；没有尖角，避开心电图式的尖波。
- 线宽按“起笔略收、行笔饱满、收笔渐细”变化，带一点毛笔意思。
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Callable

import numpy as np

import geom
from geom import Path

SEAL = 64.0
SEAL_R = 2.0          # 印面圆角：16 px 时约半个像素，只让四角不那么锋利
MARGIN = 6.0          # 图形离印边的最小距离（留红），16 px 时 1.5 px


def seal_shape() -> Path:
    return geom.rrect(0, 0, SEAL, SEAL, SEAL_R)


# ---------------------------------------------------------------- 通用部件

def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def brush_profile(s, start=0.75, end=0.45, rise=0.1, fall=0.25):
    """线宽的相对变化（s 为归一化弧长）：起笔略收（圆头），行笔饱满，收笔渐细（出锋）。"""
    a = start + (1 - start) * smoothstep(0.0, rise, s)
    b = 1 - (1 - end) * smoothstep(1 - fall, 1.0, s)
    return a * b


def pulse_curve(x0, x1, base, crests, amp, n=900):
    """脉搏线中心线：只在三个手指之间起伏（余弦波，波峰在指下），两端放平。"""
    crests = sorted(crests)
    lam = (crests[-1] - crests[0]) / (len(crests) - 1)
    x = np.linspace(x0, x1, n)
    a, b = crests[0] - lam / 2, crests[-1] + lam / 2
    bump = np.where((x >= a) & (x <= b), (1 + np.cos(2 * np.pi * (x - crests[0]) / lam)) / 2, 0.0)
    return np.c_[x, base - amp * bump]


def pulse_line(c: np.ndarray, lw: float):
    """按中心线画脉搏线，并返回“线上沿高度”函数 top(x)，用来让手指刚好落在线上。"""
    wfun = lambda s: lw * brush_profile(s)  # noqa: E731
    line = geom.brush(c, wfun)
    x0, x1 = c[0, 0], c[-1, 0]

    def top(x):
        s = (x - x0) / (x1 - x0)
        y = float(np.interp(x, c[:, 0], c[:, 1]))
        return y - float(wfun(np.array([s]))[0]) / 2
    return line, top


def pulse_points(x_start, x_end, xs, base, amp, n=18):
    """同一条脉搏线的少量采样点（给一笔画用的样条做控制点）。"""
    xs = sorted(xs)
    lam = xs[1] - xs[0]
    out = []
    for x in np.linspace(x_start, x_end, n):
        inside = xs[0] - lam / 2 <= x <= xs[-1] + lam / 2
        bump = (1 + math.cos(2 * math.pi * (x - xs[0]) / lam)) / 2 if inside else 0.0
        out.append((x, base - amp * bump))
    return out


def lowest(p: Path) -> np.ndarray:
    pts = np.vstack(geom.flatten(p, 0.02))
    return pts[int(np.argmax(pts[:, 1]))]


def drop_onto(shape: Path, x: float, y: float) -> Path:
    """平移图形，让它的最低点落在 (x, y)。"""
    lo = lowest(shape)
    return geom.translate(shape, x - lo[0], y - lo[1])


def offset_band(p: Path, g: float) -> Path:
    """向外扩 g：沿轮廓描一圈宽 2g 的带子再和原图形求并。用来在交叠处留一道红。"""
    rings = geom.flatten(p, 0.1)
    bands = [geom.brush(np.vstack([c, c[:1]]), lambda s: np.full_like(s, 2 * g), step=0.15) for c in rings]
    return geom.union(p, *bands)


def rounded_poly(points, radii) -> Path:
    """多边形，每个顶点可单独设圆角半径（0 为尖角）。"""
    pts = [np.asarray(p, float) for p in points]
    n = len(pts)
    out = Path()
    first = True
    for i in range(n):
        p0, p1, p2 = pts[i - 1], pts[i], pts[(i + 1) % n]
        r = radii[i]
        if r <= 0:
            (out.moveTo if first else out.lineTo)(*p1)
            first = False
            continue
        v1 = geom._unit(p0 - p1)
        v2 = geom._unit(p2 - p1)
        ang = math.acos(max(-1.0, min(1.0, float(np.dot(v1, v2)))))
        t = r / math.tan(ang / 2)
        a = p1 + v1 * t
        b = p1 + v2 * t
        k = 4 / 3 * math.tan((math.pi - ang) / 4) * r
        (out.moveTo if first else out.lineTo)(*a)
        first = False
        out.cubicTo(*(a - v1 * k), *(b - v2 * k), *b)
    out.close()
    return out


def center_in_seal(p: Path, dx: float = 0.0, dy: float = 0.0) -> Path:
    x0, y0, x1, y1 = p.bounds
    return geom.translate(p, SEAL / 2 - (x0 + x1) / 2 + dx, SEAL / 2 - (y0 + y1) / 2 + dy)


def margin_of(p: Path) -> float:
    x0, y0, x1, y1 = p.bounds
    return min(x0, y0, SEAL - x1, SEAL - y1)


# ---------------------------------------------------------------- A 三指按脉

def superellipse_half(r, ry, p=2.5, n=48):
    """下半个超椭圆（从左端经最下端到右端）。p=2 是椭圆，p 越大越方。"""
    t = np.linspace(math.pi, 0.0, n)
    c, s = np.cos(t), np.sin(t)
    return np.c_[r * np.sign(c) * np.abs(c) ** (2 / p), ry * np.abs(s) ** (2 / p)]


def digit(r, length, theta, p=2.5, taper=0.3, top_r=None) -> Path:
    """一节手指（指尖到第一指节）。

    局部坐标里指尖“圆心”在原点、指尖朝下；指尖用超椭圆（比半圆略方，像真的指肚，不像药丸）；
    指身往指节方向略放宽；指节一端截平、两角倒圆。最后整体顺时针转 theta 度，指节偏向右上。
    """
    tip = superellipse_half(r, r, p)
    w = r + taper
    tr = top_r if top_r is not None else 0.42 * w
    body = rounded_poly([(-r, 0.0), (-w, -length), (w, -length), (r, 0.0)], [0, tr, tr, 0])
    tip_poly = geom.refit(geom.polygon(np.vstack([tip, [(r, -0.5), (-r, -0.5)]])), tol=0.005, corner_deg=60)
    return geom.rotate(geom.union(tip_poly, body), theta, 0, 0)


def mark_A(thetas, rs, lengths, xs, base=47.0, amp=2.2, lw=5.2, x0=8.0, x1=56.0, press=0.4, taper=0.3,
           layered=False, sep=1.4, top_r=None, tip_p=2.5, cluster_sep=None, crease=None):
    """三指按脉：三节手指（中指最长）从右上方伸进来，指尖落在脉搏线的波峰上（压进线里 press）。

    layered=True：指尖压在线前面，交叠处留一道细红线（宽 sep），线在指下微微凹进去，像被按住。
    cluster_sep、crease 只给过程稿用（并拢的三指、指节纹），最终候选不用。
    """
    c = pulse_curve(x0, x1, base, xs, amp)
    line, top = pulse_line(c, lw)
    fingers = []
    for x, L, th, r in zip(xs, lengths, thetas, rs):
        f = digit(r, L, th, p=tip_p, taper=taper, top_r=top_r)
        if crease is not None:
            half = r + 0.6
            pts = np.array([(u, -crease - 0.2 * (1 - (u / half) ** 2)) for u in np.linspace(-half * 0.6, half * 0.6, 25)])
            f = geom.difference(f, geom.rotate(geom.brush(pts, lambda s: np.full_like(s, 1.4), step=0.1), th, 0, 0))
        fingers.append(drop_onto(f, x, top(x) + press))
    if cluster_sep is not None:
        fingers[0] = geom.difference(fingers[0], offset_band(fingers[1], cluster_sep))
        fingers[2] = geom.difference(fingers[2], offset_band(fingers[1], cluster_sep))
    if layered:
        line = geom.difference(line, *[offset_band(f, sep) for f in fingers])
    return geom.union(line, *fingers)


# ---------------------------------------------------------------- B 寸关尺

def mark_B(rx=4.6, ry=5.8, rot=22.0, mid=1.08, xs=(17.0, 32.0, 47.0), base=42.0, amp=2.2, lw=5.2,
           x0=8.0, x1=56.0, press=2.4, layered=False, sep=1.3):
    """寸关尺：三个椭圆指腹点依次落在脉搏线的波峰上，中间（关）略大。

    layered=False：指腹压进线里，与线连成一体。
    layered=True ：指腹坐在波峰上，线从指腹后面穿过，交叠处留一道细红线（印章“留红”的刻法）。
    """
    c = pulse_curve(x0, x1, base, xs, amp)
    line, top = pulse_line(c, lw)
    pads = []
    for i, x in enumerate(xs):
        k = mid if i == 1 else 1.0
        pads.append(drop_onto(geom.ellipse(0, 0, rx * k, ry * k, rot), x, top(x) + press))
    if layered:
        line = geom.difference(line, *[offset_band(p, sep) for p in pads])
    return geom.union(line, *pads)


# ---------------------------------------------------------------- C 一笔搭脉

def stroke_by_points(points, widths, n=30) -> Path:
    """一笔：过控制点的样条为中心线，线宽在控制点之间按弧长线性插值。"""
    P = np.asarray(points, float)
    W = np.asarray(widths, float)
    dense = geom.catmull_rom(P, n=n)
    cum = np.r_[0, np.cumsum(np.linalg.norm(np.diff(dense, axis=0), axis=1))]
    idx = np.minimum(np.arange(len(P)) * (n - 1), len(dense) - 1)
    s_ctrl = cum[idx] / cum[-1]
    return geom.brush(dense, lambda s: np.interp(s, s_ctrl, W))


def mark_C(theta=22.0, xs=(18.0, 32.0, 46.0), base=47.0, amp=2.0, wd=(9.2, 9.8, 9.2), L=(7.0, 8.5, 7.0),
           hair=0.9, w_line=5.0, x0=7.5, x_end=56.5, touch=0.6, fall=2.4) -> Path:
    """一笔搭脉：一笔写成。

    笔序：自右向左按出三个指尖。每一笔从右上落笔（圆头），向左下按满到指尖（落在脉搏线波峰上），
    收笔后以极细的牵丝挑到左边一笔的起笔处；最左一指收笔后向左下顺势落下，回转成脉搏线，
    自左向右在三指下各隆起一次，向右出锋。
    theta 是手指的倾斜角（C1 22°，C2 34°），wd 是指尖处的笔宽，L 是指尖到起笔的距离。
    """
    t = math.radians(theta)
    ax = np.array([math.sin(t), -math.cos(t)])     # 指尖 → 指根
    nr = np.array([math.cos(t), math.sin(t)])      # 垂直手指、朝右下
    crest_top = base - amp - w_line / 2
    P, W = [], []

    def add(p, w):
        P.append(np.asarray(p, float))
        W.append(w)
    centers = [np.array([x, crest_top + touch - w / 2]) for x, w in zip(xs, wd)]
    for i in (2, 1, 0):
        C, w, Li = centers[i], wd[i], L[i]
        add(C + ax * (Li + w * 0.42), w * 0.55)          # 落笔：圆头，略细
        add(C + ax * Li, w * 0.92)
        add(C + ax * Li * 0.5, w)
        add(C, w)                                         # 按到指尖
        add(C - nr * w * 0.3 - ax * w * 0.05, w * 0.55)  # 收笔
        if i > 0:
            n = centers[i - 1]
            start_next = n + ax * (L[i - 1] + wd[i - 1] * 0.42)
            add(C - nr * w * 0.5 + ax * w * 0.2, hair * 1.6)                      # 提笔
            add((C - nr * w * 0.5 + start_next) / 2 + ax * 1.5 - nr * 1.0, hair)   # 牵丝
            add(start_next + ax * 1.2 + nr * 0.6, hair * 1.3)
    C = centers[0]
    add(C - nr * wd[0] * 0.55 - ax * 1.0, hair * fall)     # 顺势落下（fall 小时这一段是细牵丝，16 px 下不显出来）
    add(np.array([x0 + 1.0, base - 0.6]), w_line * (0.8 if fall > 2 else 0.55))
    for k, (x, y) in enumerate(pulse_points(x0 + 4.0, x_end, xs, base, amp, n=16)):
        f = k / 15
        add((x, y), w_line * (1 - 0.55 * smoothstep(0.8, 1.0, f)))  # 脉搏线，向右出锋
    return stroke_by_points(P, W)


# ---------------------------------------------------------------- 候选

@dataclass
class Candidate:
    key: str
    direction: str
    name: str
    build: Callable[[], Path]


CANDIDATES = [
    Candidate("A1", "A 三指按脉", "略斜三指",
              lambda: mark_A(thetas=(33, 25, 17), rs=(5.1, 5.35, 5.1), lengths=(9.0, 11.5, 9.5), xs=(16.5, 32.0, 47.5),
                             layered=True, press=1.3, sep=1.6, top_r=2.0, tip_p=2.2)),
    Candidate("A2", "A 三指按脉", "斜入三指",
              lambda: mark_A(thetas=(37, 34, 31), rs=(4.9, 5.15, 4.9), lengths=(12.0, 15.0, 12.5), xs=(15.5, 30.5, 45.5),
                             layered=True, press=1.3, sep=1.5, top_r=2.0, tip_p=2.2)),
    Candidate("B1", "B 寸关尺", "指腹压线",
              lambda: mark_B(rx=4.9, ry=6.0, press=3.6)),
    Candidate("B2", "B 寸关尺", "指腹留红",
              lambda: mark_B(rx=4.4, ry=5.6, rot=20.0, press=1.2, layered=True, lw=5.0, amp=2.4)),
    Candidate("C1", "C 一笔搭脉", "点按指尖",
              lambda: mark_C(L=(5.5, 7.0, 5.5), wd=(9.6, 10.2, 9.6), fall=1.3)),
    Candidate("C2", "C 一笔搭脉", "斜按指尖",
              lambda: mark_C(theta=34.0, xs=(17.0, 31.0, 45.0), L=(6.0, 7.5, 6.0), wd=(9.6, 10.2, 9.6), fall=1.3)),
]


def build(key: str) -> Path:
    cand = next(c for c in CANDIDATES if c.key == key)
    fig = center_in_seal(cand.build())
    return geom.intersection(fig, seal_shape())
