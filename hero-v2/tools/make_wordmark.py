"""生成 wordmark-bold.svg 和 wordmark-regular.svg：录音笔上印的“把脉了”，霞鹜文楷的字形轮廓转成路径（不依赖字体加载）。

用法：python3 tools/make_wordmark.py <lxgw-wenkai-webfont 包目录>
需要 fontTools 和 brotli（pip install fonttools brotli）。字体来自 npm 包 lxgw-wenkai-webfont@1.7.0
（SIL OFL 1.1）。logo-b 的字标用 Bold，logo 的字标用 Regular，build.py 按选中的 logo 挑对应的一份。
"""
import re
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
TEXT = '把脉了'
TRACK = 40  # 字距（字体单位，1000 一个字宽）


def main():
    for weight in ('bold', 'regular'):
        make(Path(sys.argv[1]), weight)


def make(pkg, weight):
    css = (pkg / f'lxgwwenkai-{weight}.css').read_text()
    files = re.findall(r"url\('\./files/([^']+)'\)", css)
    paths, x = [], 0
    for ch in TEXT:
        for f in files:
            font = TTFont(pkg / 'files' / f)
            cmap = font.getBestCmap()
            if ord(ch) in cmap:
                break
        else:
            sys.exit(f'字体里找不到“{ch}”')
        gname = cmap[ord(ch)]
        gs = font.getGlyphSet()
        pen = SVGPathPen(gs)
        asc = font['OS/2'].sTypoAscender
        # 字体坐标 y 朝上，SVG 朝下：翻转，并把 em 框顶边放在 y=0
        gs[gname].draw(TransformPen(pen, (1, 0, 0, -1, x, asc)))
        paths.append(pen.getCommands())
        x += gs[gname].width + TRACK
    width = x - TRACK
    em = font['OS/2'].sTypoAscender - font['OS/2'].sTypoDescender
    style = (ROOT / 'props' / '_style.css').read_text().split('*/', 1)[1].strip()
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {em}" width="{width / 10:g}" height="{em / 10:g}" role="img" aria-label="把脉了">\n'
           f'<title>把脉了（霞鹜文楷 {weight.capitalize()} 轮廓）</title>\n'
           f'<style>/* style:start */\n{style}\n/* style:end */</style>\n'
           f'<path class="f-sheet" d="{" ".join(paths)}"/>\n</svg>\n')
    (ROOT / f'wordmark-{weight}.svg').write_text(svg)
    print(f'wordmark-{weight}.svg', len(svg), 'bytes, viewBox', width, em)


if __name__ == '__main__':
    main()
