"""招牌插画的循环动效：纸笺从领导手边起飞，沿虚线飞到下属的笔记本；虚线随纸笺亮起，
领导说话、下属落笔时各有一组短弧。build.py 调用 style() 和 elements() 生成 CSS 和新增的 SVG 元素。

坐标都是原图像素（viewBox 单位）。时间单位是秒。
"""
import math

import numpy as np
from scipy.interpolate import PchipInterpolator

FLIGHT = 4.8           # 一张纸笺飞一趟
BEAT = FLIGHT / 3      # 三张纸笺错开的间隔
S0 = (712.0, 352.0)    # 起飞点：领导摊开的手掌上方
LAND = (1197.0, 488.0)  # 落点：笔记本左页，离执笔的手留出一指
# 飞行时刻表：起飞 0 → 三个纸笺位 → 落到本子上 → 压扁淡入纸面
T_SLOTS = (0.7, 0.7 + BEAT, 0.7 + 2 * BEAT)
T_LAND, T_FADE = 4.45, FLIGHT
DASH_LEN, DASH_W, DASH_GAP = 5.2, 1.9, 8.8   # 与原稿重画的虚线同规格（quantize.py 的 dash_len / dash_w）
MOUTH = (562.0, 336.0)                        # 领导嘴边，说话短弧的圆心
PEN_TOP = (1250.0, 441.0)                     # 笔帽，落笔短线从这里向外
REDUCE = '@media (prefers-reduced-motion:reduce)'


def smooth(u):
    u = min(1.0, max(0.0, u))
    return u * u * (3 - 2 * u)


def ease_out(u):
    u = min(1.0, max(0.0, u))
    return 1 - (1 - u) ** 3


def fmt(v, nd=2):
    t = f'{v:.{nd}f}'.rstrip('0').rstrip('.')
    return '0' if t in ('', '-0') else t


class Route:
    """飞行路线：向心 Catmull-Rom 过 起飞点、三个纸笺中心、落点，按弧长取点"""

    def __init__(self, slots):
        pts = [np.array(p, float) for p in [S0, *slots, LAND]]
        pts = [2 * pts[0] - pts[1], *pts, 2 * pts[-1] - pts[-2]]
        poly = []
        for i in range(1, len(pts) - 2):
            p0, p1, p2, p3 = pts[i - 1:i + 3]
            t0 = 0.0
            t1 = t0 + np.linalg.norm(p1 - p0) ** 0.5
            t2 = t1 + np.linalg.norm(p2 - p1) ** 0.5
            t3 = t2 + np.linalg.norm(p3 - p2) ** 0.5
            for t in np.linspace(t1, t2, 240, endpoint=False):
                a1 = (t1 - t) / (t1 - t0) * p0 + (t - t0) / (t1 - t0) * p1
                a2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2
                a3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3
                b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2
                b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3
                poly.append((t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2)
        poly.append(pts[-2])
        self.pts = np.array(poly)
        self.s = np.r_[0, np.cumsum(np.hypot(*np.diff(self.pts, axis=0).T))]
        self.length = self.s[-1]
        self.knots = [self.closest(p) for p in [S0, *slots, LAND]]
        # 弧长随时间：PCHIP 保证单调、速度连续；起飞时被“抛”出、到纸笺位匀速、落地前减速停住
        self.dist = PchipInterpolator([0, *T_SLOTS, T_LAND, T_FADE], [*self.knots, self.knots[-1]])

    def closest(self, p):
        return float(self.s[np.argmin(np.hypot(*(self.pts - np.array(p)).T))])

    def at(self, s):
        x = np.interp(s, self.s, self.pts[:, 0])
        y = np.interp(s, self.s, self.pts[:, 1])
        return x, y

    def tangent(self, s, h=1.0):
        (x0, y0), (x1, y1) = self.at(max(0, s - h)), self.at(min(self.length, s + h))
        n = math.hypot(x1 - x0, y1 - y0)
        return (x1 - x0) / n, (y1 - y0) / n

    def time_at(self, s):
        lo, hi = 0.0, T_LAND
        for _ in range(60):
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if self.dist(mid) < s else (lo, mid)
        return (lo + hi) / 2


def note_pose(route, t):
    """第 t 秒纸笺的位置、旋转、缩放、透明度"""
    x, y = route.at(float(route.dist(min(t, T_LAND))))
    toss = -18 * (1 - ease_out(t / 0.6))                                   # 出手时带一点甩
    flutter = 5 * math.sin(2 * math.pi * (t - T_SLOTS[0]) / BEAT) * (1 - smooth((t - 3.6) / (T_LAND - 3.6)))
    grow = 0.3 + 0.7 * ease_out(t / 0.5)
    settle = smooth((t - T_SLOTS[2]) / (T_LAND - T_SLOTS[2]))   # 过了第三个纸笺位，边落边缩小、放平
    land = smooth((t - T_LAND) / (T_FADE - T_LAND))             # 落到本子上：压扁、淡入纸面
    sx = grow * (1 - 0.25 * settle) * (1 - 0.3 * land)
    sy = grow * (1 - 0.4 * settle) * (1 - 0.65 * land)
    return x, y, toss + flutter, sx, sy, smooth(t / 0.2) * (1 - land)


def fly_keyframes(route):
    ts = sorted(set([round(t, 3) for t in np.arange(0, FLIGHT + 1e-9, 0.1)]
                    + [round(t, 3) for t in np.arange(0, 0.6, 0.05)]
                    + [round(t, 3) for t in np.arange(T_LAND - 0.2, FLIGHT, 0.05)]
                    + [0.2, T_LAND, FLIGHT]))
    stops = []
    for t in ts:
        x, y, r, sx, sy, a = note_pose(route, t)
        rule = f'transform:translate({fmt(x, 1)}px,{fmt(y, 1)}px) rotate({fmt(r, 1)}deg) scale({fmt(sx)},{fmt(sy)})'
        if t in (0, 0.2, T_LAND, FLIGHT):
            rule += f';opacity:{fmt(a)}'
        stops.append(f'{fmt(t / FLIGHT * 100, 2)}%{{{rule}}}')
    return '@keyframes hero-fly{' + ''.join(stops) + '}'


def dashes(route, static_from_x):
    """沿路线等距排圆头短线。返回 [(d, 经过时刻, 是否只在动效里出现)]"""
    out, r = [], DASH_W / 2
    half = (DASH_LEN - DASH_W) / 2
    s = 16.0
    while s < route.length - 2:
        (cx, cy), (tx, ty) = route.at(s), route.tangent(s)
        nx, ny = -ty, tx
        p0 = (cx - tx * half, cy - ty * half)
        p1 = (cx + tx * half, cy + ty * half)
        pt = lambda p, k: f'{fmt(p[0] + nx * r * k)} {fmt(p[1] + ny * r * k)}'
        d = (f'M{pt(p0, 1)}L{pt(p1, 1)}A{fmt(r)} {fmt(r)} 0 0 0 {pt(p1, -1)}'
             f'L{pt(p0, -1)}A{fmt(r)} {fmt(r)} 0 0 0 {pt(p0, 1)}Z')
        out.append((d, route.time_at(s), cx < static_from_x))
        s += DASH_GAP
    return out


def arc(c, r, a0, a1):
    (x0, y0), (x1, y1) = [(c[0] + r * math.cos(math.radians(a)), c[1] + r * math.sin(math.radians(a))) for a in (a0, a1)]
    return f'M{fmt(x0)} {fmt(y0)}A{fmt(r)} {fmt(r)} 0 0 1 {fmt(x1)} {fmt(y1)}'


def ray(c, ang, r0, r1):
    ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    return f'M{fmt(c[0] + ca * r0)} {fmt(c[1] + sa * r0)}L{fmt(c[0] + ca * r1)} {fmt(c[1] + sa * r1)}'


def delay(t):
    """让一个 BEAT 周期的动画在全局第 t 秒（模 BEAT）走到 0%"""
    return fmt((t % BEAT) - BEAT)


def build(slots):
    """slots：三个纸笺的设计位置中心。返回 (css, svg 元素列表)"""
    route = Route(list(slots.values()))
    off = {k: T_SLOTS[i] for i, k in enumerate(slots)}   # 全局 0s 时每张纸笺正好在自己的设计位置
    els, css = [], []

    for i, (d, t, pre) in enumerate(dashes(route, static_from_x=slots['n1'][0] - 36), 1):
        els.append(f'<path class="f-ink dash k{i}{" pre" if pre else ""}" d="{d}"/>')
        css.append(f'.hero-art .k{i}{{animation-delay:{delay(t - T_SLOTS[0])}s}}')
    talk = [arc(MOUTH, r, -32, 32) for r in (12, 19, 26)]
    for i, d in enumerate(talk, 1):
        els.append(f'<path class="k-ink talk t{i}" d="{d}"/>')
        css.append(f'.hero-art .t{i}{{animation-delay:{delay(-T_SLOTS[0] - 0.45 + 0.1 * (i - 1))}s}}')
    scrib = [ray(PEN_TOP, a, 8, 14) for a in (195, 240, 285, 330)]
    for i, d in enumerate(scrib, 1):
        els.append(f'<path class="k-ink scrib s{i}" d="{d}"/>')
        css.append(f'.hero-art .s{i}{{animation-delay:{delay(T_LAND - T_SLOTS[0] + 0.05 + 0.06 * (i - 1))}s}}')

    note_css = [f'.hero-art .{k}{{transform:translate({fmt(x, 1)}px,{fmt(y, 1)}px);animation-delay:-{fmt(off[k])}s}}'
                for k, (x, y) in slots.items()]
    # 声波在纸笺出手后由内向外依次最亮（hero-wave 在 35% 处最亮）
    wave_css = [f'.hero-art .w{i}{{animation-delay:{delay(-T_SLOTS[0] + 0.05 + 0.1 * (i - 1) - 0.35 * BEAT)}s}}' for i in (1, 2, 3)]
    style = '\n'.join([
        '.hero-art .k-ink{fill:none;stroke:var(--ink,#24231F);stroke-width:2;stroke-linecap:round}',
        '.hero-art .scrib{stroke-width:1.8}',
        '.hero-art .rec-dot{transform-box:fill-box;transform-origin:center;animation:hero-breathe 2.4s ease-in-out infinite}',
        f'.hero-art .wave{{animation:hero-wave {fmt(BEAT)}s ease-in-out infinite}}',
        *wave_css,
        f'.hero-art .note{{transform-box:view-box;transform-origin:0 0;animation:hero-fly {fmt(FLIGHT)}s linear infinite}}',
        *note_css,
        f'.hero-art .dash{{animation:hero-trail {fmt(BEAT)}s linear infinite}}',
        # 说话、落笔的短弧只在动效里出现；静止时（减少动态效果）隐藏
        f'.hero-art .talk,.hero-art .scrib{{animation:hero-blip {fmt(BEAT)}s ease-in-out infinite}}',
        *css,
        '@keyframes hero-breathe{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.85)}}',
        '@keyframes hero-wave{0%,100%{opacity:.2}35%{opacity:1}}',
        # 纸笺经过时（0%）最亮，之后 0.7s 内淡到 0.3；下一张到来前（在纸笺底下）再亮回来
        '@keyframes hero-trail{0%,15%{opacity:1}60%,88%{opacity:.3}100%{opacity:1}}',
        '@keyframes hero-blip{0%{opacity:0}14%{opacity:1}40%,100%{opacity:0}}',
        fly_keyframes(route),
        REDUCE + '{.hero-art .rec-dot,.hero-art .wave,.hero-art .note,.hero-art .dash,.hero-art .talk,.hero-art .scrib'
        '{animation:none}.hero-art .pre,.hero-art .talk,.hero-art .scrib{opacity:0}}',
    ])
    return style, els, route
