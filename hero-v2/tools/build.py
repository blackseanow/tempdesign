"""生成招牌 v2：webp、index.html、HeroSignboard.vue。

用法：python3 tools/build.py

- 三张原图各出一份 1x 的 webp（宽 1916）。原图宽度到 3000 像素才另出 @2x（宽取原图和 3832 的较小值），
  srcset 按实际生成了哪些写，换了大图重跑一遍就行。
- 三张图必须叠得上：以 base-before 的尺寸为准，差几个像素的在右边、下边补（复制最后一列、行），差得多的等比缩放。
- 道具 props/*.svg 和 logo 内联进页面（只有内联，页面的 CSS 变量才传得进去），
  并检查颜色：只能用 props/_style.css 里的 class（都是设计系统变量），不许写死颜色；朱砂只许印章用。
- index.html 内嵌一份 anchors.json（file:// 打开时用）；HeroSignboard.vue 直接 import anchors.json。
- 领导说话的嘴形：从页面上显示的同一份 base-before.webp 生成闭嘴、半张、大半张三帧（见 mouth_sprites）。
- logo 用仓库里的候选（logo.json 选哪一款，命令行 --logo 可临时换）：盖在材料上的朱砂印章，
  和录音笔正面铭牌上的反白版；铭牌下面是 wordmark-*.svg 的“把脉了”，按 recorder 锚点放。
"""
import base64
import io
import json
import re
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC, IMG = ROOT / 'src', ROOT / 'img'
NAMES = ['hero-static', 'base-before', 'base-after']
W1 = 1916            # 1x 宽度：招牌最宽 1920 CSS 像素
MIN_2X = 3000        # 原图宽度不到 3000 只出 1x
QUALITY = 88
PROPS = ['mask-book', 'scroll', 'pie', 'soup', 'go-board', 'rocket']
PROP_BOX, SEAL_BOX = 160, 64
STATIC_MEDIA = '(prefers-reduced-motion: reduce), (max-width: 767.98px)'
ALT = ('插画：领导靠在椅背上侃侃而谈，脸谱、宏图、大饼、鸡汤、棋盘和火箭顺着声浪飘向对面埋头狂记的员工，'
       '会议桌中间的录音笔正在收音。')
problems = []
notes_extra = []


def build_images():
    IMG.mkdir(exist_ok=True)
    ref = Image.open(ROOT / 'base-before.png')
    rw, rh = ref.size
    out, notes = {}, []
    for name in NAMES:
        im = Image.open(ROOT / f'{name}.png').convert('RGB')
        w, h = im.size
        if (w, h) != (rw, rh):
            if abs(w - rw) <= 4 and abs(h - rh) <= 4:
                im = pad_to(im, rw, rh)
                notes.append(f'{name}.png 是 {w}×{h}，按 base-before 的 {rw}×{rh} 在右边/下边补齐（复制最后一列/行）')
            else:
                im = im.resize((rw, round(h * rw / w)), Image.LANCZOS)
                im = pad_to(im, rw, rh)
                notes.append(f'{name}.png 是 {w}×{h}，和 base-before 差得多，等比缩放到 {rw} 宽再补齐')
        dens = {}
        if rw >= MIN_2X:
            w2 = min(rw, 2 * W1)
            save(im if w2 == rw else im.resize((w2, round(rh * w2 / rw)), Image.LANCZOS), f'{name}@2x.webp')
            dens['2x'] = f'img/{name}@2x.webp'
        else:
            stale = IMG / f'{name}@2x.webp'
            if stale.exists():
                stale.unlink()
        w1 = min(rw, W1)
        save(im if w1 == rw else im.resize((w1, round(rh * w1 / rw)), Image.LANCZOS), f'{name}.webp')
        dens['1x'] = f'img/{name}.webp'
        out[name] = dens
    if rw < MIN_2X:
        notes.append(f'原图宽 {rw} 像素，不到 {MIN_2X}，只生成了 1x；2x 屏上会被放大，略糊')
    return out, notes, (rw, rh)


def pad_to(im, w, h):
    im = im.crop((0, 0, min(im.size[0], w), min(im.size[1], h)))
    if im.size[0] < w:
        col = im.crop((im.size[0] - 1, 0, im.size[0], im.size[1]))
        wide = Image.new('RGB', (w, im.size[1]))
        wide.paste(im, (0, 0))
        for x in range(im.size[0], w):
            wide.paste(col, (x, 0))
        im = wide
    if im.size[1] < h:
        row = im.crop((0, im.size[1] - 1, w, im.size[1]))
        tall = Image.new('RGB', (w, h))
        tall.paste(im, (0, 0))
        for y in range(im.size[1], h):
            tall.paste(row, (0, y))
        im = tall
    return im


def save(im, fname):
    im.save(IMG / fname, 'WEBP', quality=QUALITY, method=6)


def srcset(d):
    return ', '.join(f'{d[k]} {k}' for k in ('1x', '2x') if k in d)


ALLOWED_TAGS = {'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'}
COLOR_RE = re.compile(r'#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(')


def svg_art(path, box, role):
    """取出 SVG 里画东西的部分，平移、缩放到以原点为中心、边长 box 的方框里。"""
    s = path.read_text()
    m = re.search(r'<svg\b([^>]*)>(.*)</svg>', s, re.S)
    attrs, body = m.group(1), m.group(2)
    vb = re.search(r'viewBox="([^"]+)"', attrs)
    x, y, w, h = (float(v) for v in re.split(r'[\s,]+', vb.group(1).strip())) if vb else (0, 0, float(re.search(r'width="([\d.]+)', attrs).group(1)), float(re.search(r'height="([\d.]+)', attrs).group(1)))
    body = re.sub(r'<!--.*?-->|<title>.*?</title>|<desc>.*?</desc>|<style\b.*?</style>|<metadata\b.*?</metadata>', '', body, flags=re.S)
    body = '\n'.join(line.strip() for line in body.strip().splitlines() if line.strip())
    # 颜色检查
    for hit in COLOR_RE.finditer(body):
        problems.append(f'{path.name}: 写死了颜色 {hit.group(0)}，要改成 props/_style.css 里的 class')
    for attr in re.finditer(r'\b(fill|stroke)="([^"]+)"', body):
        if attr.group(2) not in ('none',):
            problems.append(f'{path.name}: {attr.group(1)}="{attr.group(2)}"，颜色要用 class')
    for tag in set(re.findall(r'<([a-zA-Z]+)\b', body)) - ALLOWED_TAGS:
        problems.append(f'{path.name}: 用了 <{tag}>，引擎没考虑过这种元素，看一下效果')
    classes = set(c for grp in re.findall(r'class="([^"]+)"', body) for c in grp.split())
    if role == 'prop' and 'f-cinnabar' in classes:
        problems.append(f'{path.name}: 道具不能用朱砂，朱砂只给印章')
    if role == 'seal' and classes - {'f-cinnabar'}:
        problems.append(f'{path.name}: 印章只用朱砂一种颜色，多了 {sorted(classes - {"f-cinnabar"})}')
    known = set(re.findall(r'\.([a-z][\w-]*)', (ROOT / 'props' / '_style.css').read_text())) | {'flame'}
    for c in sorted(classes - known):
        problems.append(f'{path.name}: class "{c}" 在 props/_style.css 里没有定义')
    k = box / max(w, h)
    cx, cy = x + w / 2, y + h / 2
    return f'<g transform="scale({k:g}) translate({-cx:g} {-cy:g})">\n{body}\n</g>'


def palette_css():
    """props/_style.css 的规则加上 .hero-fx / .hero-decal 前缀，放进页面。"""
    css = (ROOT / 'props' / '_style.css').read_text().split('*/', 1)[1]
    out = []
    for sel, decl in re.findall(r'([^{}]+)\{([^}]*)\}', css):
        sels = ','.join(f'{scope} {s.strip()}' for scope in ('.hero-fx', '.hero-decal') for s in sel.split(','))
        out.append(f'{sels}{{{decl}}}')
    return '\n'.join(out)


def mouth_sprites(anchors):
    """领导说话时换嘴形。底图上嘴是张开的；这里从 base-before 的像素里把嘴“合上”：
    找出 mouth 锚点左边 46 px 以内那一整块嘴（上唇线、牙、口腔、舌头、下唇线连成的一片），
    逐列把口腔压扁、下唇线往上提，空出来的地方用这一列嘴下方的皮肤色补上。下巴和脸的轮廓不动。
    用的是页面上显示的同一份 webp（有 @2x 就用 @2x），拼回去看不出接缝。找不到嘴就不做嘴形动画。"""
    src = IMG / 'base-before@2x.webp'
    if not src.exists():
        src = IMG / 'base-before.webp'
    im = np.asarray(Image.open(src).convert('RGB')).astype(float)
    k = im.shape[1] / 1916
    ax, ay = anchors['mouth']['x'] / 100 * im.shape[1], anchors['mouth']['y'] / 100 * im.shape[0]

    def px(v):
        return int(round(v * k))

    bx0, bx1, by0, by1 = int(ax) - px(46), int(ax) - px(5), int(ay) - px(9), int(ay) + px(18)
    skin = np.median(im[int(ay) + px(14):int(ay) + px(20), int(ax) - px(35):int(ax) - px(12)].reshape(-1, 3), 0)
    dist = np.sqrt(((im - skin) ** 2).sum(2))
    mask = np.zeros(im.shape[:2], bool)
    mask[by0:by1, bx0:bx1] = dist[by0:by1, bx0:bx1] > 28
    sub = dist[by0:by1, bx0 + px(10):bx1 - px(6)]
    sy, sx = np.unravel_index(np.argmax(sub), sub.shape)
    seed = (by0 + sy, bx0 + px(10) + sx)
    comp = np.zeros_like(mask)
    comp[seed] = True
    queue = deque([seed])
    while queue:
        y, x = queue.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if mask[yy, xx] and not comp[yy, xx]:
                comp[yy, xx] = True
                queue.append((yy, xx))
    ys, xs = np.nonzero(comp)
    if not (150 * k * k <= comp.sum() <= 1500 * k * k and np.ptp(xs) >= 20 * k and np.ptp(ys) >= 8 * k):
        notes_extra.append('在 mouth 锚点左边没找到嘴，这一版不做嘴形动画（锚点要放在嘴角右边）')
        return None

    def frame(o):
        out = im.copy()
        for x in range(xs.min(), xs.max() + 1):
            rows = np.nonzero(comp[:, x])[0]
            if len(rows) < 6:
                continue
            a, b = rows.min(), rows.max()
            top, bot = a + 2, b - 1           # 上唇线 a..a+1，口腔 top..bot-1，下唇线 bot..b
            h = bot - top
            if h <= 0:
                continue
            n = int(round(h * o))
            col = []
            for r in range(n):
                s = top + (r + 0.5) * h / n - 0.5
                s0 = int(np.floor(s))
                f = s - s0
                col.append(im[s0, x] * (1 - f) + im[min(s0 + 1, bot - 1), x] * f)
            col += [im[r, x] for r in range(bot, b + 1)]
            below = [im[r, x] for r in range(b + 2, b + 2 + px(7)) if dist[r, x] < 22]
            col += [np.median(below, 0) if below else skin] * ((b + 1) - top - len(col))
            out[top:b + 1, x] = np.array(col)
        return out

    pad = px(3)
    x0, x1, y0, y1 = xs.min() - pad, xs.max() + 1 + pad, ys.min() - pad, ys.max() + 1 + pad
    frames = []
    for o in (0, 0.4, 0.75):
        crop = Image.fromarray(frame(o)[y0:y1, x0:x1].clip(0, 255).astype(np.uint8))
        buf = io.BytesIO()
        crop.save(buf, 'PNG', optimize=True)
        frames.append((o, 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()))
    return {'rect': (x0 / k, y0 / k, (x1 - x0) / k, (y1 - y0) / k), 'frames': frames}


def mouth_markup(m):
    if not m:
        return ''
    x, y, w, h = m['rect']
    imgs = ''.join(f'<image data-o="{o}" x="{x:g}" y="{y:g}" width="{w:g}" height="{h:g}" href="{uri}" opacity="0"/>' for o, uri in m['frames'])
    return f'<g class="fx-mouth">{imgs}</g>'


LOGO_SETS = {
    # 仓库里两套 logo 候选，都是“三指搭脉”方印。值是（印章文件，小尺寸专用文件，字标字重）
    'logo-b': lambda k: (ROOT.parent / 'logo-b' / 'svg' / k / f'{k}-seal-color.svg', None, 'bold'),
    'logo': lambda k: (ROOT.parent / 'logo' / 'candidates' / k / 'mark-color.svg',
                       ROOT.parent / 'logo' / 'candidates' / k / 'mark-micro-color.svg', 'regular'),
}
LOGO_NAMES = {
    'logo-b/A1': '略斜三指（logo-b 推荐）', 'logo-b/A2': '斜入三指', 'logo-b/B1': '指腹压线', 'logo-b/B2': '指腹留红',
    'logo-b/C1': '点按指尖', 'logo-b/C2': '斜按指尖',
    'logo/A1': '稳按', 'logo/A2': '轻搭（logo 推荐）', 'logo/B1': '三点轻落', 'logo/B2': '随脉而落',
    'logo/C1': '回锋', 'logo/C2': '连绵',
}
FACE, FIGURE = '#B5382A', '#F8F7F2'   # 候选文件里印面（朱砂）和图形（素笺）的颜色


def chosen_logo():
    """logo.json 里选的那一款；命令行 --logo logo-b/A2 可以临时换。"""
    if '--logo' in sys.argv:
        return sys.argv[sys.argv.index('--logo') + 1]
    return json.loads((ROOT / 'logo.json').read_text())['logo']


def logo_art(spec, size, small=False):
    """把候选 logo 的全彩印章取出来：印面标成 lg-face，图形标成 lg-figure，颜色由页面按用处给
    （盖在材料上：朱砂印面、素笺图形；录音笔上：素笺印面、松烟墨图形）。缩放到以原点为中心、边长 size。
    small=True 时，有小尺寸光学稿（logo/C1、C2 的 mark-micro）就用它。"""
    group, key = spec.split('/')
    if group not in LOGO_SETS or spec not in LOGO_NAMES:
        sys.exit(f'logo.json 里的 “{spec}” 不在候选里，可选：{"、".join(LOGO_NAMES)}')
    path, micro, _ = LOGO_SETS[group](key)
    if small and micro and micro.exists():
        path = micro
    s = path.read_text()
    attrs, body = re.search(r'<svg\b([^>]*)>(.*)</svg>', s, re.S).groups()
    _, _, w, h = (float(v) for v in re.search(r'viewBox="([^"]+)"', attrs).group(1).split())
    body = re.sub(r'<title\b.*?</title>|<style\b.*?</style>|<!--.*?-->', '', body, flags=re.S)
    body = re.sub(r'<g class="micro">.*?</g>\s*(?=<g class="regular">|</g>|$)', '', body, flags=re.S)  # 大尺寸只留常规稿
    body = re.sub(r'<g class="regular">(.*?)</g>', r'\1', body, flags=re.S)
    body = re.sub(rf'\s(?:fill|color)="{FIGURE}"', '', body.replace(f'fill="{FIGURE}"', 'class="lg-figure"'), count=0)
    body = body.replace(f'fill="{FACE}"', 'class="lg-face"')
    if re.search(r'#[0-9a-fA-F]{3,6}\b', body):
        problems.append(f'{path.name}: 除了印面和图形还有别的颜色：{sorted(set(re.findall(r"#[0-9a-fA-F]{3,6}", body)))}')
    k = size / max(w, h)
    return f'<g class="logo" transform="scale({k:g}) translate({-w / 2:g} {-h / 2:g})">{body}</g>'


def wordmark_art(height, weight):
    """wordmark-<字重>.svg（“把脉了”的字形路径）缩放到给定高度，返回 (标记, 宽度)。"""
    s = (ROOT / f'wordmark-{weight}.svg').read_text()
    _, _, w, h = (float(v) for v in re.search(r'viewBox="([^"]+)"', s).group(1).split())
    d = re.search(r'<path class="f-sheet" d="([^"]+)"', s).group(1)
    k = height / h
    return f'<path class="f-sheet" transform="scale({k:g})" d="{d}"/>', w * k


def decal_markup(anchors, spec):
    """录音笔正面的铭牌：深色底板盖住按键，上面一枚反白的 logo（素笺印面、松烟墨图形，像丝印），下面横排“把脉了”。
    坐标以 recorder 锚点（机身中心）为原点，单位是 1916 宽的像素；动效脚本按锚点重新摆。
    朱砂仍然只留给最后那枚印章。"""
    rx, ry = anchors['recorder']['x'] / 100 * 1916, anchors['recorder']['y'] / 100 * 821
    mark = logo_art(spec, 13, small=True)
    word, ww = wordmark_art(9.6, LOGO_SETS[spec.split('/')[0]](spec.split('/')[1])[2])
    return (f'<svg class="hero-decal" viewBox="0 0 1916 821" aria-hidden="true" focusable="false">'
            f'<g class="decal" transform="translate({rx:.1f} {ry:.1f})">'
            f'<rect class="f-ink decal-plate" x="-16" y="-1" width="32" height="35" rx="3"/>'
            f'<g class="decal-mark" transform="translate(0 10.5)">{mark}</g>'
            f'<g class="decal-word" transform="translate({-ww / 2:.2f} 21.5)">{word}</g>'
            f'</g></svg>')


def stage_markup(img, vue, anchors, mouth, spec):
    props ='\n'.join(f'<g class="fx-prop" data-prop="{p}" opacity="0">{svg_art(ROOT / "props" / f"{p}.svg", PROP_BOX, "prop")}</g>' for p in PROPS)
    seal = logo_art(spec, SEAL_BOX)
    if vue:
        attr = lambda name, value: f':{name}="{value}"'
        static_set, before_src, before_set = 'img.static', 'img.before', 'img.beforeSet'
        after_src, after_set = 'img.after', 'img.afterSet'
        static_attr = attr('srcset', static_set)
        base_attrs = f'{attr("src", before_src)} {attr("srcset", before_set)}'
        after_attrs = f'{attr("data-src", after_src)} {attr("data-srcset", after_set)}'
    else:
        static_attr = f'srcset="{srcset(img["hero-static"])}"'
        base_attrs = f'src="{img["base-before"]["1x"]}" srcset="{srcset(img["base-before"])}"'
        after_attrs = f'data-src="{img["base-after"]["1x"]}" data-srcset="{srcset(img["base-after"])}"'
    return f'''<header class="hero-signboard">
  <div class="hero-sign">
    <h1 class="hero-plaque"><span>咸鱼把脉了</span></h1>
    <p class="hero-motto"><span>领导把脉，一字不落；</span><span>对症开方，按时交差。</span></p>
  </div>
  <div {'ref="stage" ' if vue else ''}class="hero-stage">
    <picture>
      <source media="{STATIC_MEDIA}" {static_attr} type="image/webp">
      <img class="hero-base" {base_attrs} width="1916" height="821" alt="{ALT}" fetchpriority="high">
    </picture>
    <img class="hero-after" {after_attrs} width="1916" height="821" alt="" aria-hidden="true" decoding="async">
    {decal_markup(anchors, spec)}
    <svg class="hero-fx" viewBox="0 0 1916 821" aria-hidden="true" focusable="false">
      <g class="fx-ripples"><ellipse class="fx-ripple"/><ellipse class="fx-ripple"/><ellipse class="fx-ripple"/></g>
      {mouth_markup(mouth)}
      <g class="fx-waves"></g>
      <g class="fx-props">
{indent(props, 8)}
      </g>
      <g class="fx-seal" opacity="0">{seal}</g>
    </svg>
    <button class="hero-replay" type="button" aria-label="再看一遍：点录音笔重播动画" title="再看一遍"></button>
  </div>
</header>'''


def indent(s, n):
    return '\n'.join(' ' * n + line for line in s.splitlines())


def main():
    if '--logo-markup' in sys.argv:
        # 给 tools/logo_options.cjs 用：每一款候选的印章、铭牌 logo、字标，JSON 输出，不动任何文件
        out = {spec: {'name': name, 'stamp': logo_art(spec, SEAL_BOX), 'mark': logo_art(spec, 13, small=True),
                      'word': wordmark_art(9.6, LOGO_SETS[spec.split('/')[0]](spec.split('/')[1])[2])}
               for spec, name in LOGO_NAMES.items()}
        print(json.dumps(out, ensure_ascii=False))
        return
    img, notes, size = build_images()
    css = (SRC / 'hero.css').read_text().strip() + '\n\n/* 道具和印章的配色（props/_style.css） */\n' + palette_css()
    motion = (SRC / 'motion.js').read_text().strip()
    anchors = json.loads((ROOT / 'anchors.json').read_text())
    for k in ('mouth', 'recorder', 'notebook', 'stack'):
        if not (0 <= anchors[k]['x'] <= 100 and 0 <= anchors[k]['y'] <= 100):
            problems.append(f'anchors.json: {k} 超出 0–100')
    mouth = mouth_sprites(anchors)
    spec = chosen_logo()

    page = (SRC / 'page.html').read_text()
    page = (page.replace('{{CSS}}', css)
                .replace('{{MARKUP}}', stage_markup(img, False, anchors, mouth, spec))
                .replace('{{ANCHORS}}', json.dumps(anchors, ensure_ascii=False))
                .replace('{{MOTION}}', motion)
                .replace('{{DEBUG}}', (SRC / 'debug.js').read_text().strip()))
    (ROOT / 'index.html').write_text(page)

    imports, fields = [], []
    for name, key in (('hero-static', 'static'), ('base-before', 'before'), ('base-after', 'after')):
        var = re.sub(r'-(\w)', lambda m: m.group(1).upper(), name)
        imports.append(f"import {var} from './img/{name}.webp'")
        two = ''
        if '2x' in img[name]:
            imports.append(f"import {var}2x from './img/{name}@2x.webp'")
            two = f" + ', ' + {var}2x + ' 2x'"
        if key == 'static':
            fields.append(f"static: {var} + ' 1x'{two}")
        else:
            fields.append(f'{key}: {var}')
            fields.append(f"{key}Set: {var} + ' 1x'{two}")
    imports.append('// srcset 按屏幕清晰度挑图；原图到 3000 宽 build.py 才会出 @2x')
    imports.append('const img = {\n  ' + ',\n  '.join(fields) + ',\n}')
    vue = (SRC / 'HeroSignboard.vue.tpl').read_text()
    vue = (vue.replace('{{IMPORTS}}', '\n'.join(imports))
              .replace('{{MOTION}}', motion)
              .replace('{{MARKUP}}', indent(stage_markup(img, True, anchors, mouth, spec), 2))
              .replace('{{CSS}}', css))
    (ROOT / 'HeroSignboard.vue').write_text(vue)

    print('图片：', ', '.join(f'{n}: {srcset(d)}' for n, d in img.items()))
    for f in sorted(IMG.glob('*.webp')):
        im = Image.open(f)
        print(f'  {f.name} {im.size[0]}×{im.size[1]} {f.stat().st_size / 1024:.0f} KB')
    for n in notes + notes_extra:
        print('说明：', n)
    print(f'logo：{spec} {LOGO_NAMES[spec]}')
    if mouth:
        print('嘴形：{} 帧，位置 {}'.format(len(mouth['frames']), ', '.join(f'{v:g}' for v in mouth['rect'])))
    print(f'index.html {(ROOT / "index.html").stat().st_size / 1024:.0f} KB，HeroSignboard.vue {(ROOT / "HeroSignboard.vue").stat().st_size / 1024:.0f} KB')
    if problems:
        print('\n要处理：\n  ' + '\n  '.join(problems))
        sys.exit(1)


if __name__ == '__main__':
    main()
