"""生成招牌 v2：webp、index.html、HeroSignboard.vue。

用法：python3 tools/build.py

- 三张原图各出一份 1x 的 webp（宽 1916）。原图宽度到 3000 像素才另出 @2x（宽取原图和 3832 的较小值），
  srcset 按实际生成了哪些写，换了大图重跑一遍就行。
- 三张图必须叠得上：以 base-before 的尺寸为准，差几个像素的在右边、下边补（复制最后一列、行），差得多的等比缩放。
- 道具 props/*.svg 和印章 seal.svg 内联进页面（只有内联，页面的 CSS 变量才传得进去），
  并检查颜色：只能用 props/_style.css 里的 class（都是设计系统变量），不许写死颜色；朱砂只许印章用。
- index.html 内嵌一份 anchors.json（file:// 打开时用）；HeroSignboard.vue 直接 import anchors.json。
"""
import json
import re
import sys
from pathlib import Path

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
    """props/_style.css 的规则加上 .hero-fx 前缀，放进页面。"""
    css = (ROOT / 'props' / '_style.css').read_text().split('*/', 1)[1]
    out = []
    for sel, decl in re.findall(r'([^{}]+)\{([^}]*)\}', css):
        sels = ','.join('.hero-fx ' + s.strip() for s in sel.split(','))
        out.append(f'{sels}{{{decl}}}')
    return '\n'.join(out)


def stage_markup(img, vue):
    props = '\n'.join(f'<g class="fx-prop" data-prop="{p}" opacity="0">{svg_art(ROOT / "props" / f"{p}.svg", PROP_BOX, "prop")}</g>' for p in PROPS)
    seal = svg_art(ROOT / 'seal.svg', SEAL_BOX, 'seal')
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
    <svg class="hero-fx" viewBox="0 0 1916 821" aria-hidden="true" focusable="false">
      <g class="fx-ripples"><ellipse class="fx-ripple"/><ellipse class="fx-ripple"/><ellipse class="fx-ripple"/></g>
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
    img, notes, size = build_images()
    css = (SRC / 'hero.css').read_text().strip() + '\n\n/* 道具和印章的配色（props/_style.css） */\n' + palette_css()
    motion = (SRC / 'motion.js').read_text().strip()
    anchors = json.loads((ROOT / 'anchors.json').read_text())
    for k in ('mouth', 'recorder', 'notebook', 'stack'):
        if not (0 <= anchors[k]['x'] <= 100 and 0 <= anchors[k]['y'] <= 100):
            problems.append(f'anchors.json: {k} 超出 0–100')

    page = (SRC / 'page.html').read_text()
    page = (page.replace('{{CSS}}', css)
                .replace('{{MARKUP}}', stage_markup(img, vue=False))
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
              .replace('{{MARKUP}}', indent(stage_markup(img, vue=True), 2))
              .replace('{{CSS}}', css))
    (ROOT / 'HeroSignboard.vue').write_text(vue)

    print('图片：', ', '.join(f'{n}: {srcset(d)}' for n, d in img.items()))
    for f in sorted(IMG.glob('*.webp')):
        im = Image.open(f)
        print(f'  {f.name} {im.size[0]}×{im.size[1]} {f.stat().st_size / 1024:.0f} KB')
    for n in notes:
        print('说明：', n)
    print(f'index.html {(ROOT / "index.html").stat().st_size / 1024:.0f} KB，HeroSignboard.vue {(ROOT / "HeroSignboard.vue").stat().st_size / 1024:.0f} KB')
    if problems:
        print('\n要处理：\n  ' + '\n  '.join(problems))
        sys.exit(1)


if __name__ == '__main__':
    main()
