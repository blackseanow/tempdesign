"""生成 seal.svg：朱砂方印，印面刻一枚“声纹指印”（白文：纹线是挖空的）。

仓库里的 logo（logo/、logo-b/）都是三指搭脉，没有声纹指印，这枚是按名字画的替身，
拿到 logo v2 以后直接替换 seal.svg（单色、只用 class="f-cinnabar"，viewBox 随意）。

整枚印只有一条 path、fill-rule="evenodd"：外框是实心方块，每道纹线是一个闭合的轮廓（挖空），
环形纹线用内外两条边界，嵌套的环在 evenodd 下自然一实一空。纹线是指纹的同心椭圆，
半径随角度起伏，像一段声音的波形绕了一圈：右半边响（起伏大），左半边轻。
所有环用同一个相位，相邻纹线始终平行，不会碰到一起。

用法：python3 tools/make_seal.py
"""
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HALF, CORNER = 32, 4.2
CX, CY = 0.0, -1.2
RIDGE_W = 1.55
RIDGES = [3.1 + 3.95 * k for k in range(6)]  # 横向半径
ASPECT = 1.13                               # 竖向比横向长一点，像指肚
OPEN = {4: (78, 150), 5: (70, 156)}          # 外面两道在下方断开（角度，度；y 向下为正）
CYCLES = 17                                 # 绕一圈起伏几次


def envelope(t):
    """声音的包络：几段“音节”，右半边大、左半边小。"""
    loud = 0.55 + 0.45 * math.cos(t)               # 右边（t=0）最响
    syll = abs(math.sin(2.5 * t + 0.6)) ** 1.4     # 一段一段的音节
    return 0.25 + 0.95 * loud * syll


def ridge_point(k, t):
    rx = RIDGES[k]
    # 里圈太小，起伏会糊成一团：振幅随半径从 0 慢慢长到 1.15，相邻两圈的差很小，始终平行
    u = min(1.0, max(0.0, (rx - 5.0) / 12.0))
    amp = 1.15 * u * u * (3 - 2 * u) * envelope(t)
    wobble = amp * math.sin(CYCLES * t + 0.4)
    return CX + (rx + wobble) * math.cos(t), CY + (rx * ASPECT + wobble) * math.sin(t)


def offset(pts, d, closed):
    out = []
    n = len(pts)
    for i in range(n):
        p0 = pts[i - 1] if (i > 0 or closed) else pts[i]
        p1 = pts[(i + 1) % n] if (i < n - 1 or closed) else pts[i]
        tx, ty = p1[0] - p0[0], p1[1] - p0[1]
        ln = math.hypot(tx, ty) or 1
        out.append((pts[i][0] - ty / ln * d, pts[i][1] + tx / ln * d))
    return out


def cap(c, a0, r, steps=6):
    return [(c[0] + r * math.cos(a0 + math.pi * s / steps), c[1] + r * math.sin(a0 + math.pi * s / steps)) for s in range(1, steps)]


def poly(pts):
    return 'M' + 'L'.join(f'{x:.2f} {y:.2f}' for x, y in pts) + 'Z'


def main():
    h = RIDGE_W / 2
    parts = []
    # 外框：圆角方块
    r, s = CORNER, HALF
    parts.append(f'M{-s + r} {-s}H{s - r}A{r} {r} 0 0 1 {s} {-s + r}V{s - r}A{r} {r} 0 0 1 {s - r} {s}'
                 f'H{-s + r}A{r} {r} 0 0 1 {-s} {s - r}V{-s + r}A{r} {r} 0 0 1 {-s + r} {-s}Z')
    for k in range(len(RIDGES)):
        if k in OPEN:
            a0, a1 = (math.radians(a) for a in OPEN[k])
            n = 220
            ts = [a1 + (a0 + 2 * math.pi - a1) * i / n for i in range(n + 1)]
            c = [ridge_point(k, t) for t in ts]
            left, right = offset(c, h, False), offset(c, -h, False)

            def ang(p, q):
                return math.atan2(q[1] - p[1], q[0] - p[0])
            end_dir = ang(c[-2], c[-1])
            start_dir = ang(c[1], c[0])
            outline = left + cap(c[-1], end_dir - math.pi / 2, h)[::-1] + right[::-1] + cap(c[0], start_dir - math.pi / 2, h)[::-1]
            parts.append(poly(outline))
        else:
            n = 90 + 30 * k
            c = [ridge_point(k, 2 * math.pi * i / n) for i in range(n)]
            parts.append(poly(offset(c, h, True)))
            parts.append(poly(offset(c, -h, True)))
    # 印泥没吃匀的几个小白点
    for x, y, rr in ((-27.6, -21.0, .55), (-25.8, 26.4, .7), (24.9, -27.4, .5), (28.0, 18.2, .6), (-28.4, 6.0, .45), (9.0, 28.3, .5), (-12.5, -28.6, .4)):
        parts.append(f'M{x - rr:.2f} {y:.2f}a{rr} {rr * .8:.2f} 0 1 0 {2 * rr:.2f} 0a{rr} {rr * .8:.2f} 0 1 0 {-2 * rr:.2f} 0Z')
    style = (ROOT / 'props' / '_style.css').read_text()
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-32 -32 64 64" width="128" height="128" role="img" aria-label="声纹指印印章">\n'
           f'<title>声纹指印印章（logo v2 的替身）</title>\n'
           f'<style>/* style:start */\n{style.split("*/", 1)[1].strip()}\n/* style:end */</style>\n'
           f'<path class="f-cinnabar" fill-rule="evenodd" d="{"".join(parts)}"/>\n</svg>\n')
    (ROOT / 'seal.svg').write_text(svg)
    print('seal.svg', len(svg), 'bytes')


if __name__ == '__main__':
    main()
