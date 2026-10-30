"""第 0 步：检查三张图的尺寸，给两张底图做差异图。

用法：python3 tools/check_diff.py
输出：checks/diff.png（差异图）、checks/diff-pairs.png（逐处前后对照）、checks/diff-report.json（数字）

差异按 CIELAB ΔE76 算，3×3 平滑后 ΔE > 10 算“看得出的差别”。base-after 比另外两张窄时，
在右边补一列（复制最后一列）再比，和 build.py 生成 webp 的补法一样。
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'checks'
FONT = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'
REF_W, REF_H = 1916, 821  # 下面的区域和取样点按这个尺寸写，图换了尺寸会按比例换算
THRESH = 10

# 预期会变的地方：员工和他面前的桌面（两张图里员工姿势不同，取两者的并集）
EXPECTED = [(1215, 560, 1916, 821), (1340, 265, 1916, 560)]

# 员工以外、看得出差别的地方。shift 是取样点：(x, y, 量哪个方向)。水平的边只量 dy，竖直的边只量 dx
REGIONS = [
    ('领导的头和脸', (118, 222, 306, 410), [(160, 250, 'xy'), (220, 240, 'xy')]),
    ('领导的身体和椅子', (0, 410, 470, 821), [(160, 420, 'xy'), (420, 520, 'xy'), (200, 690, 'xy')]),
    ('拿杯盖的手、茶杯和热气', (455, 448, 652, 642), [(530, 590, 'xy')]),
    ('录音笔和桌上的波纹', (826, 546, 1020, 676), [(922, 575, 'xy')]),
    ('月洞门和门里的竹子', (600, 0, 1225, 525), [(615, 330, 'x'), (1205, 330, 'x'), (912, 515, 'y')]),
    ('桌沿和桌腿', (210, 584, 1230, 821), [(600, 598, 'y'), (1000, 598, 'y'), (300, 740, 'y'), (900, 748, 'y'), (1100, 752, 'y'), (420, 800, 'x')]),
    ('墙面腰线和护墙板', (560, 512, 1215, 584), [(1000, 526, 'y'), (770, 560, 'y'), (1100, 560, 'y')]),
    ('右侧盆栽竹子（员工以上）', (1728, 180, 1916, 265), [(1800, 230, 'xy')]),
    ('墙面竖线', (1835, 0, 1872, 265), [(1852, 120, 'x'), (50, 300, 'x')]),
]
# 平整墙面：量整体色差
WALL = [(80, 20, 480, 200), (1250, 30, 1700, 200)]


def lab(rgb):
    c = rgb / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def box_blur(a, r):
    k = 2 * r + 1
    c = np.pad(np.pad(a, r, mode='edge').cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)


def shift_at(b, a, x, y, h=22, r=12):
    """b 上 (x, y) 处的图案在 a 里挪到了哪里：返回 (dx, dy)，亚像素。"""
    ref = b[y - h:y + h, x - h:x + h]
    ref = ref - ref.mean()
    s = np.full((2 * r + 1, 2 * r + 1), np.inf)
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            m = a[y - h + dy:y + h + dy, x - h + dx:x + h + dx]
            if m.shape == ref.shape:
                s[dy + r, dx + r] = ((ref - (m - m.mean())) ** 2).mean()
    iy, ix = np.unravel_index(np.argmin(s), s.shape)

    def sub(p, q, t):
        d = p - 2 * q + t
        return 0.0 if not np.isfinite(d) or d <= 0 else 0.5 * (p - t) / d

    sx = ix - r + (sub(s[iy, ix - 1], s[iy, ix], s[iy, ix + 1]) if 0 < ix < 2 * r else 0)
    sy = iy - r + (sub(s[iy - 1, ix], s[iy, ix], s[iy + 1, ix]) if 0 < iy < 2 * r else 0)
    return float(sx), float(sy)


def main():
    OUT.mkdir(exist_ok=True)
    names = ['hero-static.png', 'base-before.png', 'base-after.png']
    imgs = {n: Image.open(ROOT / n).convert('RGB') for n in names}
    sizes = {n: list(im.size) for n, im in imgs.items()}
    w, h = imgs['base-before.png'].size
    sx, sy = w / REF_W, h / REF_H
    sc = lambda bx: tuple(int(round(v * (sx if i % 2 == 0 else sy))) for i, v in enumerate(bx))

    before = np.asarray(imgs['base-before.png']).astype(np.float64)
    after = np.asarray(imgs['base-after.png']).astype(np.float64)
    padded = {}
    if after.shape[1] < w:
        padded['right'] = w - after.shape[1]
        after = np.concatenate([after] + [after[:, -1:]] * (w - after.shape[1]), 1)
    if after.shape[0] < h:
        padded['bottom'] = h - after.shape[0]
        after = np.concatenate([after] + [after[-1:]] * (h - after.shape[0]), 0)
    after = after[:h, :w]

    de = box_blur(np.sqrt(((lab(before) - lab(after)) ** 2).sum(-1)), 1)
    changed = de > THRESH
    expected = np.zeros_like(changed)
    for bx in EXPECTED:
        x0, y0, x1, y1 = sc(bx)
        expected[y0:y1, x0:x1] = True

    gb, ga = before.mean(-1), after.mean(-1)
    regions = []
    for i, (name, bx, pts) in enumerate(REGIONS, 1):
        x0, y0, x1, y1 = sc(bx)
        sel = ~expected[y0:y1, x0:x1]
        shifts = []
        for px, py, axis in pts:
            dx, dy = shift_at(gb, ga, int(px * sx), int(py * sy))
            shifts.append({'at': [px, py], 'dx': round(dx, 1) if 'x' in axis else None,
                           'dy': round(dy, 1) if 'y' in axis else None})
        regions.append({
            'n': i, 'name': name, 'box': [x0, y0, x1, y1],
            'box_pct': [round(x0 / w * 100, 1), round(y0 / h * 100, 1), round(x1 / w * 100, 1), round(y1 / h * 100, 1)],
            'changed_pct': round(float(changed[y0:y1, x0:x1][sel].mean() * 100), 1),
            'mean_de': round(float(de[y0:y1, x0:x1][sel].mean()), 1),
            'shifts': shifts,
        })

    wall = []
    for bx in WALL:
        x0, y0, x1, y1 = sc(bx)
        cb, ca = before[y0:y1, x0:x1].reshape(-1, 3).mean(0), after[y0:y1, x0:x1].reshape(-1, 3).mean(0)
        wall.append({'box': [x0, y0, x1, y1], 'before': cb.round(1).tolist(), 'after': ca.round(1).tolist(),
                     'de': round(float(np.sqrt(((lab(cb[None]) - lab(ca[None])) ** 2).sum())), 1)})

    report = {
        'sizes': sizes, 'same_size': len({tuple(s) for s in sizes.values()}) == 1, 'padded_after': padded,
        'threshold_de': THRESH,
        'changed_pct_expected': round(float(changed[expected].mean() * 100), 1),
        'changed_pct_elsewhere': round(float(changed[~expected].mean() * 100), 1),
        'changed_px_elsewhere': int(changed[~expected].sum()),
        'wall': wall, 'regions': regions,
    }
    (OUT / 'diff-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=1) + '\n')
    render_overlay(before, de, expected, regions, report, w, h, sc)
    render_pairs(imgs['base-before.png'], Image.fromarray(after.astype(np.uint8)), regions)
    print_summary(report)


def font(size):
    return ImageFont.truetype(FONT, size)


def render_overlay(before, de, expected, regions, report, w, h, sc):
    g = before.mean(-1, keepdims=True)
    base = np.repeat(150 + g * 0.4, 3, -1)
    alpha = np.clip((de - 4) / 26, 0, 1)[..., None]
    rgb = base * (1 - alpha) + np.array([196, 38, 28]) * alpha
    im = Image.fromarray(rgb.clip(0, 255).astype(np.uint8))
    d = ImageDraw.Draw(im)
    f, fs = font(22), font(17)
    for bx in EXPECTED:
        x0, y0, x1, y1 = sc(bx)
        dash_rect(d, (x0, y0, x1 - 1, y1 - 1), (31, 58, 77), 3)
    ex = sc(EXPECTED[1])
    d.text((ex[0] + 10, ex[1] + 8), '预期会变：员工和他面前的桌面', font=fs, fill=(31, 58, 77))
    for r in regions:
        x0, y0, x1, y1 = r['box']
        d.rectangle((x0, y0, x1 - 1, y1 - 1), outline=(36, 35, 31), width=2)
        tag = str(r['n'])
        d.rectangle((x0, y0, x0 + 26, y0 + 26), fill=(36, 35, 31))
        d.text((x0 + 13, y0 + 13), tag, font=f, fill=(248, 247, 242), anchor='mm')
    s = report['sizes']
    head = (f'base-before {s["base-before.png"][0]}×{s["base-before.png"][1]} 对 base-after {s["base-after.png"][0]}×{s["base-after.png"][1]}'
            f'（右侧补 {report["padded_after"].get("right", 0)} 列）· 红色越深差得越多（CIELAB ΔE76）'
            f' · 员工以外 ΔE>{THRESH} 的像素 {report["changed_pct_elsewhere"]}%')
    tw = d.textlength(head, font=fs)
    d.rectangle((0, h - 30, tw + 20, h), fill=(248, 247, 242))
    d.text((10, h - 15), head, font=fs, fill=(36, 35, 31), anchor='lm')
    im.quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(OUT / 'diff.png', optimize=True)


def dash_rect(d, bx, color, width, on=14, off=8):
    x0, y0, x1, y1 = bx
    for (ax, ay, bx_, by) in ((x0, y0, x1, y0), (x1, y0, x1, y1), (x1, y1, x0, y1), (x0, y1, x0, y0)):
        length = max(abs(bx_ - ax), abs(by - ay))
        t = 0
        while t < length:
            t1 = min(t + on, length)
            fx = lambda u: (ax + (bx_ - ax) * u / length, ay + (by - ay) * u / length)
            d.line([fx(t), fx(t1)], fill=color, width=width)
            t += on + off


def render_pairs(b, a, regions):
    rows, f, fs = [], font(20), font(16)
    for r in regions:
        x0, y0, x1, y1 = r['box']
        cb, ca = b.crop((x0, y0, x1, y1)), a.crop((x0, y0, x1, y1))
        k = min(2.0, 700 / cb.size[0], 380 / cb.size[1])
        size = (max(1, int(cb.size[0] * k)), max(1, int(cb.size[1] * k)))
        cb, ca = cb.resize(size, Image.LANCZOS), ca.resize(size, Image.LANCZOS)
        title = f'{r["n"]}  {r["name"]}（左 before，右 after）'
        sh = '；'.join(shift_text(s) for s in r['shifts'])
        probe = ImageDraw.Draw(Image.new('RGB', (1, 1)))
        width = int(max(size[0] * 2 + 12, probe.textlength(title, font=f), probe.textlength(sh, font=fs))) + 4
        row = Image.new('RGB', (width, size[1] + 58), (248, 247, 242))
        d = ImageDraw.Draw(row)
        d.text((0, 2), title, font=f, fill=(36, 35, 31))
        d.text((0, 30), sh, font=fs, fill=(78, 76, 69))
        row.paste(cb, (0, 58))
        row.paste(ca, (size[0] + 12, 58))
        rows.append(row)
    width = max(r.size[0] for r in rows)
    sheet = Image.new('RGB', (width, sum(r.size[1] + 22 for r in rows)), (248, 247, 242))
    y = 0
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.size[1] + 22
    # 256 色，控制体积
    sheet.quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(OUT / 'diff-pairs.png', optimize=True)


def shift_text(s):
    parts = []
    if s['dx'] is not None:
        parts.append(f'横 {s["dx"]:+.1f}')
    if s['dy'] is not None:
        parts.append(f'纵 {s["dy"]:+.1f}')
    return f'({s["at"][0]},{s["at"][1]}) ' + ' '.join(parts) + ' px'


def print_summary(rep):
    print('尺寸：', ', '.join(f'{k} {v[0]}×{v[1]}' for k, v in rep['sizes'].items()),
          '（一致）' if rep['same_size'] else '（不一致）')
    if rep['padded_after']:
        print('base-after 补边：', rep['padded_after'])
    print(f'ΔE>{rep["threshold_de"]}：员工区域 {rep["changed_pct_expected"]}%，其余 {rep["changed_pct_elsewhere"]}%（{rep["changed_px_elsewhere"]} 像素）')
    for wl in rep['wall']:
        print(f'墙面 {wl["box"]}：before {wl["before"]} → after {wl["after"]}，ΔE {wl["de"]}')
    for r in rep['regions']:
        print(f'{r["n"]} {r["name"]} {r["box"]}：变了 {r["changed_pct"]}%，平均 ΔE {r["mean_de"]}；'
              + '；'.join(shift_text(s) for s in r['shifts']))


if __name__ == '__main__':
    main()
