"""过程稿：试过、但没通过自查的几种做法，拼成 screenshots/explorations.png。

用法（在 logo/ 下）：python3 tools/explore.py
这里的图形只用来说明为什么没采用，不进交付的 svg/、png/。
"""
from __future__ import annotations

import base64
import math
import os
import subprocess
import sys
import tempfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import geom  # noqa: E402
import marks  # noqa: E402
from marks import drop_onto, pulse_curve, pulse_line, pulse_points, smoothstep, stroke_by_points  # noqa: E402

ROOT = os.path.dirname(HERE)


def a_nails():
    """A 加指甲轮廓：大尺寸最像手指，但指甲一圈红线像回形针、小杯子，16 px 下只剩噪点。"""
    xs, thetas, rs, lengths = (17.0, 32.0, 47.0), (22, 20, 18), (5.0, 5.25, 5.0), (12.5, 15.0, 13.0)
    c = pulse_curve(8.0, 56.0, 47.0, xs, 2.2)
    line, top = pulse_line(c, 5.2)
    parts, cuts = [line], []
    for x, th, r, L in zip(xs, thetas, rs, lengths):
        f = marks.digit(r, L, th)
        lo = marks.lowest(f)
        dx, dy = x - lo[0], top(x) + 0.4 - lo[1]
        parts.append(geom.translate(f, dx, dy))
        nw = r - 1.8
        yb = -L * 0.45
        front = [(nw * math.cos(a), r * 0.82 * math.sin(a)) for a in np.linspace(math.pi, 0, 30)]
        base = [(nw * math.cos(a), yb - 1.3 * math.sin(a)) for a in np.linspace(0, math.pi, 20)]
        loop = np.array(front + [(nw, yb)] + base + [(-nw, yb), front[0]])
        ring = geom.brush(loop, lambda s: np.full_like(s, 1.3), step=0.12)
        cuts.append(geom.translate(geom.rotate(ring, th, 0, 0), dx, dy))
    return geom.difference(geom.union(*parts), *cuts)


def c_outline(theta=22.0, xs=(17.5, 32.0, 46.5), base=47.0, amp=2.0, d=7.0, arm=(7.5, 9.0, 7.5),
              w=4.4, w_tip=5.0, hair=0.9, w_line=5.0, x0=7.5, x_end=56.5, touch=0.6):
    """C 的字面做法：一笔把三个指尖勾成 U 形轮廓。相邻指尖的轮廓连起来就是“ɯ / www”，16 px 下糊成一条带子。"""
    t = math.radians(theta)
    ax = np.array([math.sin(t), -math.cos(t)])
    nr = np.array([math.cos(t), math.sin(t)])
    h = d / 2
    crest_top = base - amp - w_line / 2
    tips = [np.array([x, crest_top + touch - w_tip / 2 - h * 1.05]) for x in xs]
    P, W = [], []

    def add(p, wd):
        P.append(np.asarray(p, float))
        W.append(wd)
    for k, i in enumerate((2, 1, 0)):
        C = tips[i]
        add(C + nr * h + ax * arm[i], w * (0.6 if k == 0 else 0.75))
        add(C + nr * h + ax * arm[i] * 0.45, w)
        for a in np.linspace(0, math.pi, 9)[1:-1]:
            add(C + nr * h * math.cos(a) - ax * h * math.sin(a) * 1.05, w + (w_tip - w) * math.sin(a))
        add(C - nr * h + ax * arm[i] * 0.45, w)
        if i > 0:
            add(C - nr * h + ax * arm[i] * 0.95, w * 0.5)
            start_next = tips[i - 1] + nr * h + ax * arm[i - 1]
            add((C - nr * h + ax * arm[i] + start_next) / 2 + ax * 2.0, hair)
            add(start_next + ax * 0.8 + nr * 0.8, hair * 1.4)
    C = tips[0]
    add(C - nr * h + ax * arm[0] * 0.85, w * 0.8)
    add(C - nr * (h + 3.0) + ax * arm[0] * 0.5, w * 0.7)
    add(np.array([x0 + 1.0, base - 0.6]), w_line * 0.8)
    for k, (x, y) in enumerate(pulse_points(x0 + 4.0, x_end, xs, base, amp, n=16)):
        add((x, y), w_line * (1 - 0.55 * smoothstep(0.8, 1.0, k / 15)))
    return stroke_by_points(P, W)


def c_bend(theta=25.0, xs=(16.0, 31.0, 46.0), base=47.0, amp=2.2, wd=(9.0, 9.6, 9.0), L=(8.5, 9.5, 8.0),
           hair=0.9, w_line=5.0, x_end=57.0, touch=0.6, bend_r=8.0):
    """C 的“竖弯”：最左一指不提笔，圆转成脉搏线。大尺寸有笔势，16 px 下最左一指和线围成 U 形，整体像“ш”（梳子）。"""
    t = math.radians(theta)
    ax = np.array([math.sin(t), -math.cos(t)])
    nr = np.array([math.cos(t), math.sin(t)])
    crest_top = base - amp - w_line / 2
    P, W = [], []

    def add(p, w):
        P.append(np.asarray(p, float))
        W.append(w)
    centers = [np.array([x, crest_top + touch - w / 2]) for x, w in zip(xs, wd)]
    for i in (2, 1):
        C, w, Li = centers[i], wd[i], L[i]
        add(C + ax * (Li + w * 0.42), w * 0.55)
        add(C + ax * Li, w * 0.92)
        add(C + ax * Li * 0.5, w)
        add(C, w)
        add(C - nr * w * 0.3 - ax * w * 0.05, w * 0.55)
        start_next = centers[i - 1] + ax * (L[i - 1] + wd[i - 1] * 0.42)
        add(C - nr * w * 0.5 + ax * w * 0.2, hair * 1.6)
        add((C - nr * w * 0.5 + start_next) / 2 + ax * 1.5 - nr * 1.0, hair)
        add(start_next + ax * 1.2 + nr * 0.6, hair * 1.3)
    C, w, Li = centers[0], wd[0], L[0]
    add(C + ax * (Li + w * 0.42), w * 0.55)
    add(C + ax * Li, w * 0.92)
    add(C + ax * Li * 0.5, w)
    add(C + ax * 0.5, w * 0.95)
    add(np.array([C[0] - 1.2, base - bend_r * 0.55]), w * 0.82)
    add(np.array([C[0] + bend_r * 0.35, base - 0.4]), w_line * 1.15)
    pts = pulse_points(C[0] + bend_r * 0.9, x_end, xs, base, amp, n=14)
    for k, (x, y) in enumerate(pts):
        f = k / (len(pts) - 1)
        add((x, y), w_line * (1.05 - 0.05 * f) * (1 - 0.55 * smoothstep(0.75, 1.0, f)))
    return stroke_by_points(P, W)


ITEMS = [
    ("早期 A1：手指与线粘连", "手指只斜 20°，16 px 下横向只偏 1.8 px，三根平顶竖条立在一条底线上，就是柱状图。",
     lambda: marks.mark_A(thetas=(22, 20, 18), rs=(5.0, 5.25, 5.0), lengths=(11.0, 13.5, 11.5), xs=(17.0, 32.0, 47.0))),
    ("A 加指甲", "大尺寸最像手指，但一圈红线让指尖像回形针、小杯子；16 px 下指甲只剩噪点。",
     a_nails),
    ("A 三指并拢", "像一只手，但三指在 16 px 下糊成一块，连“三点”都看不出。",
     lambda: marks.mark_A(thetas=(21, 20, 19), rs=(5.6, 5.8, 5.6), lengths=(11.0, 13.5, 11.5), xs=(20.0, 32.0, 44.0),
                          cluster_sep=2.0, top_r=4.0)),
    ("A 刻指节纹", "想用一道横纹交代“第一指节”，结果每根手指像一节电池。",
     lambda: marks.mark_A(thetas=(22, 20, 18), rs=(5.0, 5.25, 5.0), lengths=(12.5, 15.0, 13.0), xs=(17.0, 32.0, 47.0), crease=10.0)),
    ("B 指腹悬空", "指腹和线之间留了空，三个圆点浮在线上，像“用户 / 人群”图标的三个人头。",
     lambda: marks.mark_B(rx=4.6, ry=5.6, rot=20.0, press=-2.6, amp=2.6)),
    ("B 点在线中", "圆点压在线的正中，线从点后穿过：读成网页的步骤条（第 1-2-3 步）。",
     lambda: marks.mark_B(rx=5.0, ry=5.0, rot=0.0, press=7.6, layered=True, lw=5.0, amp=2.0)),
    ("C 勾勒指尖轮廓", "照字面一笔勾出三个指尖轮廓：相邻指尖连起来就是“ɯ / www”，16 px 下糊成一条带子。",
     c_outline),
    ("C 竖弯", "最左一指圆转成脉搏线，笔势像“心”字；16 px 下围成 U 形，整体像“ш”，有梳子感。",
     c_bend),
]


def main():
    tmp = tempfile.mkdtemp()
    cards = []
    for i, (title, why, fn) in enumerate(ITEMS):
        fig = geom.intersection(marks.center_in_seal(fn()), marks.seal_shape())
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="#B5382A" d="{geom.to_d(marks.seal_shape())}"/>'
               f'<path fill="#F8F7F2" d="{geom.to_d(fig)}"/></svg>')
        cards.append((title, why, 'data:image/svg+xml;base64,' + base64.b64encode(svg.encode()).decode()))
    html = '''<html><head><style>
      body{margin:0;padding:24px 28px;background:#ECEAE1;font:13px/1.5 "WenQuanYi Zen Hei",sans-serif;color:#24231F;width:1180px}
      h1{font-size:20px;margin:0 0 4px} p.sub{margin:0 0 16px;color:#4E4C45}
      .g{display:grid;grid-template-columns:repeat(4,1fr);gap:22px 18px}
      .c b{display:block;font-size:14px;margin-bottom:6px}
      .im{display:flex;gap:10px;align-items:flex-start}
      .px{image-rendering:pixelated}
      .c span{display:block;margin-top:6px;color:#4E4C45;font-size:12px}
    </style></head><body><h1>过程稿：试过但没有采用的做法</h1>
    <p class="sub">左：180 px；右：16 px 放大 6 倍（先按 1 倍像素栅格化，再最近邻放大）。每张下面写了没通过的原因。</p><div class="g">''' + ''.join(
        f'<div class="c"><b>{t}</b><div class="im"><img src="{u}" width="180" height="180">'
        f'<canvas data-src="{u}" width="96" height="96"></canvas></div><span>{w}</span></div>' for t, w, u in cards) + '''</div>
    <script>
      // 16 px：先画到 16×16 的画布上（真实像素），再最近邻放大到 96×96
      window.ready = Promise.all([...document.querySelectorAll('canvas')].map(cv => new Promise(res => {
        const im = new Image(); im.onload = () => {
          const s = document.createElement('canvas'); s.width = s.height = 16;
          s.getContext('2d').drawImage(im, 0, 0, 16, 16);
          const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(s, 0, 0, 96, 96); res();
        }; im.src = cv.dataset.src; })));
    </script></body></html>'''
    page = os.path.join(tmp, 'explore.html')
    open(page, 'w', encoding='utf-8').write(html)
    js = os.path.join(tmp, 'shot.cjs')
    open(js, 'w').write('''
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ deviceScaleFactor: 1, viewport: { width: 1240, height: 600 } });
  await p.goto('file://' + process.argv[2]); await p.evaluate(() => window.ready);
  await p.screenshot({ path: process.argv[3], fullPage: true }); await b.close();
})();''')
    out = os.path.join(ROOT, 'screenshots', 'explorations.png')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    subprocess.run(['node', js, page, out], check=True, cwd=ROOT)
    print('wrote', out)


if __name__ == '__main__':
    main()
