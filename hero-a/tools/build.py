"""第二步：labels.png → vtracer → 色板 class / 动效 class → svgo → hero.svg，并同步进 index.html。

用法：python3 build.py <quantize 输出目录>
依赖：pip install vtracer；svgo 用 npx 拉取固定版本。
"""
import re
import subprocess
import sys
from pathlib import Path

import vtracer

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent                                   # hero-a/
WORK = Path(sys.argv[1] if len(sys.argv) > 1 else 'build')
S = 3                                                # 与 quantize.py 的放大倍数一致
SVGO = 'svgo@3.3.5'

# vtracer 参数（在 3 倍标签图上）。调参过程见 README
VT = dict(colormode='color', hierarchical='stacked', mode='spline',
          filter_speckle=8,       # 面积 < 8² 像素（原图约 7 像素²）的碎块并入邻居；红点约 92 像素²，能保住
          color_precision=6,      # 输入已是 9 色，再降到 4 会把竹纸/素笺并成中间色
          layer_difference=4,     # ≥8 时两张纸笺的素笺底色会被并进竹纸
          corner_threshold=75,    # 默认 60，调大少出尖角
          length_threshold=6.0,   # 默认 4，调大曲线段更少更顺
          splice_threshold=60,    # 默认 45
          max_iterations=10, path_precision=2)

PALETTE = {  # class 名 → (CSS 变量, 兜底色)
    'paper': ('--paper', '#ECEAE1'), 'sheet': ('--sheet', '#F8F7F2'), 'indigo': ('--indigo', '#1F3A4D'),
    'ink': ('--ink', '#24231F'), 'red': ('--cinnabar', '#B5382A'), 'skin': ('--skin', '#EDCAB1'),
    'hair': ('--hair', '#3B3A37'), 'gray': ('--gray', '#5B5A55'), 'mount': ('--mount', '#DACCB8')}
W0, H0 = 1916, 821

# 原图坐标里的几个区域
REC_CX = 937
WAVE_L, WAVE_R = (896, 420, 926, 466), (948, 420, 980, 466)
NOTES = {'n1': (798, 318, 872, 362), 'n2': (970, 350, 1054, 400), 'n3': (1122, 422, 1206, 474)}

STYLE = """
.hero-art .f-paper{fill:var(--paper,#ECEAE1)}
.hero-art .f-sheet{fill:var(--sheet,#F8F7F2)}
.hero-art .f-indigo{fill:var(--indigo,#1F3A4D)}
.hero-art .f-ink{fill:var(--ink,#24231F)}
.hero-art .f-red{fill:var(--cinnabar,#B5382A)}
.hero-art .f-skin{fill:var(--skin,#EDCAB1)}
.hero-art .f-hair{fill:var(--hair,#3B3A37)}
.hero-art .f-gray{fill:var(--gray,#5B5A55)}
.hero-art .f-mount{fill:var(--mount,#DACCB8)}
.hero-art .rec-dot{transform-box:fill-box;transform-origin:center;animation:hero-breathe 2.4s ease-in-out infinite}
.hero-art .wave{animation:hero-wave 2.4s ease-in-out infinite}
.hero-art .w2{animation-delay:.3s}
.hero-art .w3{animation-delay:.6s}
.hero-art .note{animation:hero-drift 1.6s cubic-bezier(.22,.61,.36,1) both}
.hero-art .n1{--dx:-18px;--dy:-1.4px;animation-delay:.3s}
.hero-art .n2{--dx:-17px;--dy:-5.8px;animation-delay:.55s}
.hero-art .n3{--dx:-13.5px;--dy:-11.9px;animation-delay:.8s}
@keyframes hero-breathe{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.85)}}
@keyframes hero-wave{0%,100%{opacity:.2}35%{opacity:1}}
@keyframes hero-drift{0%{opacity:0;transform:translate(var(--dx),var(--dy))}50%{opacity:1}100%{opacity:1;transform:translate(0,0)}}
@media (prefers-reduced-motion:reduce){.hero-art .rec-dot,.hero-art .wave,.hero-art .note{animation:none}}
"""
LABEL = '插画：领导与下属隔着会议桌对坐，桌上录音笔亮着红点收音，三张纸笺沿虚线飞向下属的笔记本'


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def nearest(h):
    c = rgb(h)
    return min(PALETTE, key=lambda k: sum((a - b) ** 2 for a, b in zip(rgb(PALETTE[k][1]), c)))


def fmt(v):
    t = f'{v:.2f}'.rstrip('0').rstrip('.')
    return '0' if t in ('', '-0') else t


def inside(bb, box):
    return bb[0] >= box[0] and bb[1] >= box[1] and bb[2] <= box[2] and bb[3] <= box[3]


def main():
    labels = WORK / 'labels.png'
    traced = WORK / 'traced.svg'
    vtracer.convert_image_to_svg_py(str(labels), str(traced), **VT)
    raw = traced.read_text()
    items = re.findall(r'<path d="([^"]*)" fill="(#[0-9A-Fa-f]{6})" transform="translate\(([-\d.]+),([-\d.]+)\)"', raw)

    paths = []  # (class 名, d, bbox)
    for d, fill, tx, ty in items:
        name = nearest(fill)
        tx, ty = float(tx), float(ty)
        toks = re.findall(r'[A-Za-z]|-?\d+(?:\.\d+)?', d)
        out, xs, ys, k = [], [], [], 0
        for t in toks:
            if t.isalpha():
                out.append(t)
                k = 0
                continue
            v = (float(t) + (tx if k % 2 == 0 else ty)) / S
            (xs if k % 2 == 0 else ys).append(v)
            out.append(fmt(v))
            k += 1
        bb = (min(xs), min(ys), max(xs), max(ys))
        # 整块背景：覆盖全画布的竹纸色路径，删掉，插画直接浮在页面底色上
        if name == 'paper' and bb[0] <= 0.5 and bb[1] <= 0.5 and bb[2] >= W0 - 0.5 and bb[3] >= H0 - 0.5:
            continue
        paths.append([name, ' '.join(out), bb, []])

    # 录音笔红点、两侧声波
    reds = [p for p in paths if p[0] == 'red']
    assert len(reds) == 1, f'红点路径应当只有 1 条，实际 {len(reds)}'
    reds[0][3].append('rec-dot')
    for box in (WAVE_L, WAVE_R):
        waves = [p for p in paths if p[0] == 'ink' and inside(p[2], box)]
        assert len(waves) == 3, f'每侧声波应为 3 道，实际 {len(waves)}'
        waves.sort(key=lambda p: abs((p[2][0] + p[2][2]) / 2 - REC_CX))
        for i, p in enumerate(waves, 1):
            p[3] += ['wave', f'w{i}']

    # 三张纸笺：各自框内的路径编成一组，移到最上层（原本只压在背景上，层级变化不影响画面）
    groups = {}
    for key, box in NOTES.items():
        members = [p for p in paths if inside(p[2], box)]
        assert any(p[0] == 'sheet' for p in members), f'{key} 缺少纸面'
        groups[key] = members
    grouped = {id(p) for ms in groups.values() for p in ms}
    body = [p for p in paths if id(p) not in grouped]

    def el(p):
        cls = ' '.join([f'f-{p[0]}'] + p[3])
        return f'<path class="{cls}" d="{p[1]}"/>'

    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" class="hero-art" width="{W0}" height="{H0}" viewBox="0 0 {W0} {H0}" '
           f'role="img" aria-label="{LABEL}">',
           f'<style>{STYLE}</style>']
    svg += [el(p) for p in body]
    for key, ms in groups.items():
        svg.append(f'<g class="note {key}">' + ''.join(el(p) for p in ms) + '</g>')
    svg.append('</svg>')
    pre = WORK / 'hero.pre.svg'
    pre.write_text('\n'.join(svg))

    out = ROOT / 'hero.svg'
    subprocess.run(['npx', '-y', SVGO, '--config', str(HERE / 'svgo.config.mjs'), '-i', str(pre), '-o', str(out)], check=True)

    # 同步进 index.html（两处标记之间）
    html_path = ROOT / 'index.html'
    if html_path.exists():
        html = html_path.read_text()
        art = out.read_text().strip()
        html = re.sub(r'(<!-- hero\.svg:start -->).*?(<!-- hero\.svg:end -->)', lambda m: m.group(1) + art + m.group(2), html, flags=re.S)
        html_path.write_text(html)

    final = out.read_text()
    used = sorted(set(re.findall(r'class="f-(\w+)', final)))
    print(f'hero.svg {len(final.encode()) / 1024:.1f} KB, paths {final.count("<path")}, '
          f'colors {used}, note paths {[len(m) for m in groups.values()]}')


if __name__ == '__main__':
    main()
