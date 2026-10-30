"""第二步：labels.png → vtracer → 色板 class / 动效 class → svgo → hero.svg，并同步进 index.html。

用法：python3 build.py <quantize 输出目录>
依赖：pip install vtracer；svgo 用 npx 拉取固定版本。
"""
import ast
import re
import subprocess
import sys
import textwrap
from pathlib import Path

import vtracer

import motion

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
"""  # 动效样式由 motion.py 生成，接在后面
LABEL = '插画：领导与下属隔着会议桌对坐，桌上录音笔亮着红点收音，一张张纸笺从领导手边沿虚线飞落到下属的笔记本上'


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


def shift(d, dx, dy):
    """平移路径：vtracer 输出只有 M/C/L/Z 的绝对坐标，数字两两成对"""
    out, k = [], 0
    for t in re.findall(r'[A-Za-z]|-?\d+(?:\.\d+)?', d):
        if t.isalpha():
            out.append(t)
            k = 0
            continue
        out.append(fmt(float(t) + (dx if k % 2 == 0 else dy)))
        k += 1
    return ' '.join(out)


def redrawn_dashes(segs):
    """quantize.py 第 8 步重画虚线的中心点：每段按弧长二次拟合，再等距取点"""
    import numpy as np
    out = []
    for seg in segs:
        pts = np.array(seg)
        t = np.r_[0, np.cumsum(np.hypot(*np.diff(pts, axis=0).T))]
        fx, fy = np.polyfit(t, pts[:, 0], 2), np.polyfit(t, pts[:, 1], 2)
        out += [(np.polyval(fx, tt), np.polyval(fy, tt)) for tt in np.linspace(0, t[-1], len(seg))]
    return out


def quantize_const(name):
    """读 quantize.py 里的常量（只解析，不执行）"""
    tree = ast.parse((HERE / 'quantize.py').read_text())
    node = next(n for n in tree.body if isinstance(n, ast.Assign) and getattr(n.targets[0], 'id', None) == name)
    return ast.literal_eval(node.value)


VUE_HEAD = """<!--
  HeroSignboard：首页招牌（牌匾“咸鱼把脉了”、标语、插画），规格见 hero-a/README.md。
  由 hero-a/tools/build.py 从 hero.svg 和 index.html 生成，不要手改；改插画或版式后重新运行 build.py。

  <HeroSignboard />

  插画一直循环播放；招牌滚出视口时暂停，滚回来接着播（IntersectionObserver）。

  依赖：全局已加载霞鹜文楷；色值读 --paper --sheet --indigo --ink --ink-2 --cinnabar --skin --hair --gray --mount 和 --kai，
  未定义时用设计稿的值。样式不加 scoped：选择器都带 hero- 前缀，只作用于本组件，也不会被全站的 .plaque 等规则影响。
-->
"""


VUE_SCRIPT = """<script setup>
// 招牌滚出视口时暂停插画动效，滚回来接着播
import { ref, onMounted, onBeforeUnmount } from 'vue'

const art = ref(null)
const paused = ref(false)
let io = null
onMounted(() => {
  if (!('IntersectionObserver' in window)) return
  io = new IntersectionObserver(([e]) => { paused.value = !e.isIntersecting })
  io.observe(art.value)
})
onBeforeUnmount(() => io && io.disconnect())
</script>

"""


def css_rules(css):
    """把压缩成一行的 CSS 按顶层规则拆成一行一条"""
    out, depth, start = [], 0, 0
    for i, ch in enumerate(css):
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                out.append(css[start:i + 1].strip())
                start = i + 1
    return '\n'.join(out)


def write_vue(art, html):
    """Vue 模板里的 <style> 会被编译器丢掉，所以把插画的样式挪进组件的 <style> 块"""
    m = re.search(r'<style>(.*?)</style>', art, re.S)
    art_css, art = m.group(1), art[:m.start()] + art[m.end():]
    assert art.count('class="hero-art"') == 1
    art = art.replace('class="hero-art"', 'ref="art" class="hero-art" :class="{ \'hero-paused\': paused }"')
    header = re.search(r'<header class="hero-signboard">.*?</header>', html, re.S).group(0)
    header = re.sub(r'<!-- hero\.svg:start -->.*?<!-- hero\.svg:end -->', lambda _: art, header, flags=re.S)
    layout = re.search(r'/\* hero-signboard:start[^\n]*\n(.*?)/\* hero-signboard:end \*/', html, re.S).group(1)
    vue = (VUE_HEAD + VUE_SCRIPT + '<template>\n' + textwrap.indent(header, '  ') + '\n</template>\n\n<style>\n'
           + '/* ---------- 插画：配色和动效（来自 hero.svg） ---------- */\n' + css_rules(art_css) + '\n\n'
           + layout.strip() + '\n</style>\n')
    (ROOT / 'HeroSignboard.vue').write_text(vue)


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

    # 描出来的虚线：墨色小块、中心落在 quantize.py 重画虚线的点位上，换成沿飞行路线重画的一节节短线。
    # 原稿 26 节里有 2 节贴着纸笺边，描成了纸笺轮廓的一部分，拆不出来，留在纸笺上
    dash_pts = redrawn_dashes(quantize_const('DASH_SEGS'))

    def is_dash(p):
        bb = p[2]
        cx, cy = (bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2
        return (p[0] == 'ink' and bb[2] - bb[0] < 9 and bb[3] - bb[1] < 9
                and min((cx - x) ** 2 + (cy - y) ** 2 for x, y in dash_pts) < 2 ** 2)
    traced_dashes = [p for p in paths if is_dash(p)]
    assert len(traced_dashes) == 24, f'描出来的独立虚线应为 24 节，实际 {len(traced_dashes)}'
    paths = [p for p in paths if not is_dash(p)]

    # 三张纸笺：各自框内的路径编成一组，移到最上层（原本只压在背景上，层级变化不影响画面）
    groups = {}
    for key, box in NOTES.items():
        members = [p for p in paths if inside(p[2], box)]
        assert any(p[0] == 'sheet' for p in members), f'{key} 缺少纸面'
        groups[key] = members
    grouped = {id(p) for ms in groups.values() for p in ms}
    body = [p for p in paths if id(p) not in grouped]

    # 纸笺以自身中心为原点，位置和飞行交给 CSS（motion.py）
    slots = {}
    for key, ms in groups.items():
        x0, y0 = min(p[2][0] for p in ms), min(p[2][1] for p in ms)
        x1, y1 = max(p[2][2] for p in ms), max(p[2][3] for p in ms)
        slots[key] = ((x0 + x1) / 2, (y0 + y1) / 2)
        for p in ms:
            p[1] = shift(p[1], -slots[key][0], -slots[key][1])
    motion_css, extra, route = motion.build(slots)

    def el(p):
        cls = ' '.join([f'f-{p[0]}'] + p[3])
        return f'<path class="{cls}" d="{p[1]}"/>'

    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" class="hero-art" width="{W0}" height="{H0}" viewBox="0 0 {W0} {H0}" '
           f'role="img" aria-label="{LABEL}">',
           f'<style>{STYLE}{motion_css}</style>']
    svg += [el(p) for p in body] + extra
    for key, ms in groups.items():
        svg.append(f'<g class="note {key}">' + ''.join(el(p) for p in ms) + '</g>')
    svg.append('</svg>')
    pre = WORK / 'hero.pre.svg'
    pre.write_text('\n'.join(svg))

    out = ROOT / 'hero.svg'
    subprocess.run(['npx', '-y', SVGO, '--config', str(HERE / 'svgo.config.mjs'), '-i', str(pre), '-o', str(out)], check=True)

    # 同步进 index.html（两处标记之间），再由 index.html + hero.svg 生成 Vue 组件
    html_path = ROOT / 'index.html'
    if html_path.exists():
        html = html_path.read_text()
        art = out.read_text().strip()
        html = re.sub(r'(<!-- hero\.svg:start -->).*?(<!-- hero\.svg:end -->)', lambda m: m.group(1) + art + m.group(2), html, flags=re.S)
        html_path.write_text(html)
        write_vue(art, html)

    final = out.read_text()
    used = sorted(set(re.findall(r'class="f-(\w+)', final)))
    print(f'hero.svg {len(final.encode()) / 1024:.1f} KB, paths {final.count("<path")}, '
          f'colors {used}, note paths {[len(m) for m in groups.values()]}, dashes {final.count(" dash ")}')


if __name__ == '__main__':
    main()
