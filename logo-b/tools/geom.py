"""几何工具：基本图形、变宽毛笔线、布尔运算、SVG 路径输出。

坐标系与 SVG 相同：x 向右，y 向下，角度顺时针为正。
所有图形最终都是 skia-pathops 的 Path，用布尔运算合并 / 挖空，再输出成 SVG path data。
"""
from __future__ import annotations

import math
from typing import Callable, Iterable, Sequence

import numpy as np
import pathops
from fontTools.pens.basePen import BasePen
from pathops import Path, PathOp

KAPPA = 0.5522847498307936  # 四段三次贝塞尔逼近圆的控制点系数


# ---------------------------------------------------------------- 基本图形

def ellipse(cx: float, cy: float, rx: float, ry: float, rot: float = 0.0) -> Path:
    """椭圆，rot 为绕中心顺时针旋转的角度（度）。"""
    k = KAPPA
    p = Path()
    p.moveTo(cx + rx, cy)
    p.cubicTo(cx + rx, cy + k * ry, cx + k * rx, cy + ry, cx, cy + ry)
    p.cubicTo(cx - k * rx, cy + ry, cx - rx, cy + k * ry, cx - rx, cy)
    p.cubicTo(cx - rx, cy - k * ry, cx - k * rx, cy - ry, cx, cy - ry)
    p.cubicTo(cx + k * rx, cy - ry, cx + rx, cy - k * ry, cx + rx, cy)
    p.close()
    return rotate(p, rot, cx, cy) if rot else p


def circle(cx: float, cy: float, r: float) -> Path:
    return ellipse(cx, cy, r, r)


def rrect(x: float, y: float, w: float, h: float, r: float = 0.0) -> Path:
    """圆角矩形。"""
    p = Path()
    if r <= 0:
        p.moveTo(x, y)
        p.lineTo(x + w, y)
        p.lineTo(x + w, y + h)
        p.lineTo(x, y + h)
        p.close()
        return p
    r = min(r, w / 2, h / 2)
    k = KAPPA * r
    p.moveTo(x + r, y)
    p.lineTo(x + w - r, y)
    p.cubicTo(x + w - r + k, y, x + w, y + r - k, x + w, y + r)
    p.lineTo(x + w, y + h - r)
    p.cubicTo(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h)
    p.lineTo(x + r, y + h)
    p.cubicTo(x + r - k, y + h, x, y + h - r + k, x, y + h - r)
    p.lineTo(x, y + r)
    p.cubicTo(x, y + r - k, x + r - k, y, x + r, y)
    p.close()
    return p


def polygon(points: Sequence[Sequence[float]]) -> Path:
    p = Path()
    p.moveTo(*points[0])
    for pt in points[1:]:
        p.lineTo(*pt)
    p.close()
    return p


# ---------------------------------------------------------------- 变换


def rotate(p: Path, deg: float, cx: float = 0.0, cy: float = 0.0) -> Path:
    t = math.radians(deg)
    cs, sn = math.cos(t), math.sin(t)
    return p.transform(cs, sn, -sn, cs, cx - cs * cx + sn * cy, cy - sn * cx - cs * cy)


def translate(p: Path, dx: float, dy: float) -> Path:
    return p.transform(1, 0, 0, 1, dx, dy)


# ---------------------------------------------------------------- 布尔运算

def union(*paths: Path) -> Path:
    return tree_union(paths)


def difference(a: Path, *bs: Path) -> Path:
    if not bs:
        return a
    return pathops.op(a, union(*bs), PathOp.DIFFERENCE, fix_winding=True, keep_starting_points=False)


def intersection(a: Path, b: Path) -> Path:
    return pathops.op(a, b, PathOp.INTERSECTION, fix_winding=True, keep_starting_points=False)


# ---------------------------------------------------------------- 曲线采样

def cubic_points(p0, p1, p2, p3, n: int = 64) -> np.ndarray:
    t = np.linspace(0.0, 1.0, n)[:, None]
    p0, p1, p2, p3 = (np.asarray(v, float) for v in (p0, p1, p2, p3))
    return ((1 - t) ** 3) * p0 + 3 * ((1 - t) ** 2) * t * p1 + 3 * (1 - t) * (t ** 2) * p2 + (t ** 3) * p3


def catmull_rom(points: Sequence[Sequence[float]], n: int = 48, alpha: float = 0.5) -> np.ndarray:
    """过给定点的向心 Catmull-Rom 样条（开放曲线）→ 稠密折线。"""
    P = np.asarray(points, float)
    P = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        t0 = 0.0
        t1 = t0 + max(np.linalg.norm(p1 - p0), 1e-9) ** alpha
        t2 = t1 + max(np.linalg.norm(p2 - p1), 1e-9) ** alpha
        t3 = t2 + max(np.linalg.norm(p3 - p2), 1e-9) ** alpha
        t = np.linspace(t1, t2, n)[:, None]
        a1 = (t1 - t) / (t1 - t0) * p0 + (t - t0) / (t1 - t0) * p1
        a2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2
        a3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3
        b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2
        b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3
        c = (t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2
        out.append(c if i == 1 else c[1:])
    return np.vstack(out)


def resample(poly: np.ndarray, step: float) -> tuple[np.ndarray, np.ndarray]:
    """按弧长等距重采样，返回 (点, 归一化弧长 s∈[0,1])。"""
    d = np.r_[0.0, np.cumsum(np.linalg.norm(np.diff(poly, axis=0), axis=1))]
    total = d[-1]
    n = max(2, int(math.ceil(total / step)) + 1)
    s = np.linspace(0.0, total, n)
    x = np.interp(s, d, poly[:, 0])
    y = np.interp(s, d, poly[:, 1])
    return np.c_[x, y], s / total


# ---------------------------------------------------------------- 毛笔线

def brush(center: np.ndarray, width: Callable[[np.ndarray], np.ndarray], step: float = 0.2,
          tol: float = 0.015) -> Path:
    """沿中心线的变宽笔画。

    做法：沿中心线每隔 step 放一个圆（直径 = width(s)），全部求并集，得到圆头、可变宽、
    自交处也正确的包络；再把包络重新拟合成少量三次贝塞尔（误差 ≤ tol）。
    width 接收归一化弧长数组 s∈[0,1]，返回同长度的线宽数组。
    """
    pts, s = resample(center, step)
    w = np.asarray(width(s), float)
    discs = [circle(x, y, wi / 2) for (x, y), wi in zip(pts, w) if wi > 0.02]
    return refit(tree_union(discs), tol=tol)


def tree_union(paths: Sequence[Path]) -> Path:
    """两两分批求并集。几百个高度重叠的圆一次性交给 OpBuilder 会失败，分批则稳定。"""
    paths = list(paths)
    while len(paths) > 1:
        nxt = []
        for i in range(0, len(paths), 2):
            if i + 1 < len(paths):
                nxt.append(pathops.op(paths[i], paths[i + 1], PathOp.UNION,
                                      fix_winding=True, keep_starting_points=False))
            else:
                nxt.append(paths[i])
        paths = nxt
    return paths[0]


class _FlattenPen(BasePen):
    """把路径压平成折线，每条轮廓一组点。"""

    def __init__(self, step: float):
        super().__init__(None)
        self.step = step
        self.contours: list[list[tuple[float, float]]] = []

    def _moveTo(self, pt):
        self.contours.append([pt])

    def _lineTo(self, pt):
        a = self.contours[-1][-1]
        n = max(1, int(math.dist(a, pt) / self.step))
        for i in range(1, n + 1):
            t = i / n
            self.contours[-1].append((a[0] + (pt[0] - a[0]) * t, a[1] + (pt[1] - a[1]) * t))

    def _curveToOne(self, p1, p2, p3):
        p0 = self.contours[-1][-1]
        est = math.dist(p0, p1) + math.dist(p1, p2) + math.dist(p2, p3)
        n = max(2, int(est / self.step))
        pts = cubic_points(p0, p1, p2, p3, n + 1)[1:]
        self.contours[-1].extend(map(tuple, pts))

    def _qCurveToOne(self, p1, p2):
        p0 = self.contours[-1][-1]
        c1 = (p0[0] + 2 / 3 * (p1[0] - p0[0]), p0[1] + 2 / 3 * (p1[1] - p0[1]))
        c2 = (p2[0] + 2 / 3 * (p1[0] - p2[0]), p2[1] + 2 / 3 * (p1[1] - p2[1]))
        self._curveToOne(c1, c2, p2)

    def _closePath(self):
        c = self.contours[-1]
        if len(c) > 1 and math.dist(c[0], c[-1]) < 1e-9:
            c.pop()

    _endPath = _closePath


def flatten(p: Path, step: float = 0.05) -> list[np.ndarray]:
    pen = _FlattenPen(step)
    p.draw(pen)
    return [np.asarray(c, float) for c in pen.contours if len(c) >= 3]


def _signed_area(c: np.ndarray) -> float:
    x, y = c[:, 0], c[:, 1]
    return 0.5 * float(np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y))


def refit(p: Path, tol: float = 0.015, corner_deg: float = 40.0) -> Path:
    """把路径压平后重新拟合成三次贝塞尔：节点少、曲率连续，尖角处保留尖角。"""
    out = Path()
    for c in flatten(p, step=0.04):
        # 去掉几乎重合的相邻点
        keep = np.r_[True, np.linalg.norm(np.diff(c, axis=0), axis=1) > 1e-6]
        c = c[keep]
        if len(c) < 4 or abs(_signed_area(c)) < 1e-4:
            continue
        # 重采样成等距点，方便找尖角
        closed = np.vstack([c, c[:1]])
        pts, _ = resample(closed, 0.05)
        pts = pts[:-1]
        n = len(pts)
        k = 4
        v1 = pts - np.roll(pts, k, axis=0)
        v2 = np.roll(pts, -k, axis=0) - pts
        ang = np.degrees(np.abs(np.arctan2(v1[:, 0] * v2[:, 1] - v1[:, 1] * v2[:, 0],
                                           np.sum(v1 * v2, axis=1))))
        corners = [i for i in range(n)
                   if ang[i] > corner_deg and ang[i] >= ang[(i - 1) % n] and ang[i] > ang[(i + 1) % n]]
        # 相邻太近的尖角只留一个
        merged = []
        for i in corners:
            if merged and (i - merged[-1]) < 2 * k:
                if ang[i] > ang[merged[-1]]:
                    merged[-1] = i
                continue
            merged.append(i)
        if len(merged) > 1 and (merged[0] + n - merged[-1]) < 2 * k:
            merged.pop() if ang[merged[-1]] < ang[merged[0]] else merged.pop(0)
        corners = merged
        if not corners:
            # 光滑闭合曲线：从 0 号点切开，两端切线一致
            loop = np.vstack([pts, pts[:1]])
            t = _unit(pts[1] - pts[-1])
            beziers = _fit(loop, t, -t, tol)
        else:
            beziers = []
            for j, ci in enumerate(corners):
                cj = corners[(j + 1) % len(corners)]
                seg = pts[ci:cj + 1] if cj > ci else np.vstack([pts[ci:], pts[:cj + 1]])
                if len(seg) < 2:
                    continue
                beziers += fit_cubics(seg, tol)
        out.moveTo(*beziers[0][0])
        for bz in beziers:
            out.cubicTo(*bz[1], *bz[2], *bz[3])
        out.close()
    return pathops.simplify(out, fix_winding=True, keep_starting_points=False)


# ---------------------------------------------------------------- Schneider 曲线拟合

def _unit(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v)
    return v / n if n > 1e-12 else v


def fit_cubics(pts: np.ndarray, tol: float) -> list[tuple[np.ndarray, ...]]:
    pts = np.asarray(pts, float)
    if len(pts) < 3:
        d = np.linalg.norm(pts[-1] - pts[0]) / 3
        t = _unit(pts[-1] - pts[0])
        return [(pts[0], pts[0] + t * d, pts[-1] - t * d, pts[-1])]
    k = min(3, len(pts) - 1)
    t1 = _unit(pts[k] - pts[0])
    t2 = _unit(pts[-1 - k] - pts[-1])
    return _fit(pts, t1, t2, tol)


def _bez(b, u):
    u = u[:, None]
    return ((1 - u) ** 3) * b[0] + 3 * ((1 - u) ** 2) * u * b[1] + 3 * (1 - u) * u ** 2 * b[2] + u ** 3 * b[3]


def _bez_d1(b, u):
    u = u[:, None]
    return 3 * ((1 - u) ** 2) * (b[1] - b[0]) + 6 * (1 - u) * u * (b[2] - b[1]) + 3 * u ** 2 * (b[3] - b[2])


def _bez_d2(b, u):
    u = u[:, None]
    return 6 * (1 - u) * (b[2] - 2 * b[1] + b[0]) + 6 * u * (b[3] - 2 * b[2] + b[1])


def _generate(pts, u, t1, t2):
    p0, p3 = pts[0], pts[-1]
    b0 = (1 - u) ** 3
    b1 = 3 * u * (1 - u) ** 2
    b2 = 3 * u ** 2 * (1 - u)
    b3 = u ** 3
    a1 = t1[None, :] * b1[:, None]
    a2 = t2[None, :] * b2[:, None]
    c00 = np.sum(a1 * a1)
    c01 = np.sum(a1 * a2)
    c11 = np.sum(a2 * a2)
    tmp = pts - (np.outer(b0 + b1, p0) + np.outer(b2 + b3, p3))
    x0 = np.sum(a1 * tmp)
    x1 = np.sum(a2 * tmp)
    det = c00 * c11 - c01 * c01
    seg = np.linalg.norm(p3 - p0)
    if abs(det) > 1e-12:
        al = (x0 * c11 - x1 * c01) / det
        ar = (c00 * x1 - c01 * x0) / det
    else:
        al = ar = seg / 3
    eps = 1e-6 * seg
    if al < eps or ar < eps:
        al = ar = seg / 3
    return (p0, p0 + t1 * al, p3 + t2 * ar, p3)


def _max_error(pts, b, u):
    d = np.sum((_bez(b, u) - pts) ** 2, axis=1)
    i = int(np.argmax(d))
    return math.sqrt(d[i]), i


def _reparam(b, pts, u):
    q = _bez(b, u) - pts
    d1 = _bez_d1(b, u)
    d2 = _bez_d2(b, u)
    num = np.sum(q * d1, axis=1)
    den = np.sum(d1 * d1, axis=1) + np.sum(q * d2, axis=1)
    with np.errstate(divide="ignore", invalid="ignore"):
        nu = np.where(np.abs(den) > 1e-12, u - num / den, u)
    return np.clip(nu, 0.0, 1.0)


def _fit(pts, t1, t2, tol, depth=0):
    if len(pts) == 2 or depth > 40:
        d = np.linalg.norm(pts[-1] - pts[0]) / 3
        return [(pts[0], pts[0] + t1 * d, pts[-1] + t2 * d, pts[-1])]
    d = np.r_[0.0, np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]
    u = d / d[-1]
    b = _generate(pts, u, t1, t2)
    err, split = _max_error(pts, b, u)
    if err < tol:
        return [b]
    if err < tol * 6:
        for _ in range(12):
            u = _reparam(b, pts, u)
            b = _generate(pts, u, t1, t2)
            err, split = _max_error(pts, b, u)
            if err < tol:
                return [b]
    split = min(max(split, 1), len(pts) - 2)
    tc = _unit(pts[split - 1] - pts[split + 1])
    return _fit(pts[:split + 1], t1, tc, tol, depth + 1) + _fit(pts[split:], -tc, t2, tol, depth + 1)


# ---------------------------------------------------------------- 输出

def _num(v: float, prec: int) -> str:
    s = f"{v:.{prec}f}".rstrip("0").rstrip(".")
    if s in ("-0", ""):
        s = "0"
    return s


def to_d(p: Path, prec: int = 2) -> str:
    """Path → SVG path data（绝对坐标）。"""
    parts: list[str] = []
    f = lambda *vs: " ".join(_num(v, prec) for v in vs)  # noqa: E731
    for verb, pts in p.segments:
        if verb == "moveTo":
            parts.append("M" + f(*pts[0]))
        elif verb == "lineTo":
            parts.append("L" + f(*pts[0]))
        elif verb == "curveTo":
            parts.append("C" + f(*pts[0], *pts[1], *pts[2]))
        elif verb == "qCurveTo":
            # pathops 的二次段可能带多个离线点（TrueType 隐含点），逐段拆开
            for q in pathops.decompose_quadratic_segment(pts):
                parts.append("Q" + f(*q[0], *q[1]))
        elif verb == "closePath":
            parts.append("Z")
    return "".join(parts)
