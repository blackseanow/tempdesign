"""字体子集：只保留页面用到的字，做成两个 woff2，放进仓库（不走外部 CDN）。

- fonts/pano-kai.woff2：霞鹜文楷 Regular（LXGW WenKai），页面上所有的字：界面、卡片、假数据、门牌、横匾、抽屉标签、字幕……
- fonts/pano-brush.woff2：马善政毛笔楷书（Ma Shan Zheng），只给"毛笔字标签"和卡片标题用

用到哪些字：扫 index.html、scene.json、mock.json、src/**/*.js 里的汉字和全角标点（霞鹜文楷再加上 ASCII 可见字符）；
毛笔字只取 scene.json 里入口的 label、title，以及 src 里标了 // brush: 的字符串。改了文案要重跑一遍。

字体来源（npm 包，按 unicode-range 切成很多片；这里从片里取字再合并成一个文件）：
  npm pack lxgw-wenkai-webfont@1.7.0 && tar -xzf lxgw-wenkai-webfont-1.7.0.tgz   → --kai <解压出来的 package 目录>
  npm pack @fontsource/ma-shan-zheng@5.3.1 && tar -xzf fontsource-ma-shan-zheng-5.3.1.tgz → --brush <package 目录>
运行：python3 tools/subset.py --kai <目录> --brush <目录>   （需要 fonttools、brotli）
"""

import argparse
import json
import re
import tempfile
from pathlib import Path

from fontTools import subset
from fontTools.merge import Merger
from fontTools.ttLib import TTFont

HERE = Path(__file__).resolve().parent.parent
CJK = re.compile(r"[　-〿㐀-䶿一-鿿＀-￯—…“”‘’·]")


def text_sources():
    files = [HERE / "index.html", HERE / "scene.json", HERE / "mock.json"]
    files += sorted((HERE / "src").rglob("*.js"))
    return files


def kai_chars():
    chars = set()
    for f in text_sources():
        chars.update(CJK.findall(f.read_text(encoding="utf8")))
    chars.update(chr(c) for c in range(0x20, 0x7F))
    return chars


def brush_chars():
    scene = json.loads((HERE / "scene.json").read_text(encoding="utf8"))
    chars = set()
    for e in scene["entries"]:
        for k in ("label", "title"):
            chars.update(CJK.findall(e.get(k, "") or ""))
    for f in sorted((HERE / "src").rglob("*.js")):
        for line in f.read_text(encoding="utf8").splitlines():
            if "// brush:" in line:
                chars.update(CJK.findall(line.split("// brush:", 1)[1]))
    chars.update("解剖图按下录音笔")
    chars.update(chr(c) for c in range(0x30, 0x3A))
    return chars


def ranges_of(text):
    points = set()
    for part in text.split(","):
        part = part.strip().upper().removeprefix("U+")
        if not part:
            continue
        if "-" in part:
            lo, hi = part.split("-")
            points.update(range(int(lo, 16), int(hi, 16) + 1))
        else:
            points.add(int(part, 16))
    return points


def slices(css_text, files_dir):
    out = []
    for block in re.findall(r"@font-face\s*{(.*?)}", css_text, re.S):
        src = re.search(r"url\(['\"]?\.?/?files/([^'\")]+\.woff2)['\"]?\)", block)
        span = re.search(r"unicode-range:\s*([^;}]+)", block)
        if src and span:
            out.append((files_dir / src.group(1), ranges_of(span.group(1))))
    return out


def build(css_files, files_dir, wanted, out_path, family):
    css = "".join(Path(c).read_text(encoding="utf8") for c in css_files)
    parts = slices(css, files_dir)
    tmp = Path(tempfile.mkdtemp())
    pieces, covered = [], set()
    for path, rng in parts:
        need = sorted(({ord(c) for c in wanted} & rng) - covered)
        if not need or not path.exists():
            continue
        font = TTFont(path)
        cmap = font.getBestCmap()
        need = [cp for cp in need if cp in cmap]
        if not need:
            continue
        opts = subset.Options()
        opts.hinting = False
        opts.desubroutinize = True
        opts.layout_features = ["kern", "liga", "calt", "ccmp", "locl", "mark", "mkmk", "vert", "vrt2", "palt"]
        opts.name_IDs = ["*"]
        opts.notdef_outline = True
        ss = subset.Subsetter(options=opts)
        ss.populate(unicodes=need)
        ss.subset(font)
        font.flavor = None
        p = tmp / f"{len(pieces)}.ttf"
        font.save(p)
        pieces.append(str(p))
        covered.update(need)
    missing = sorted(c for c in wanted if ord(c) not in covered and not c.isspace())
    merged = Merger().merge(pieces)
    merged["name"].setName(family, 1, 3, 1, 0x409)
    merged["name"].setName(family, 4, 3, 1, 0x409)
    merged.flavor = "woff2"
    merged.save(out_path)
    return len(covered), missing, len(pieces)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kai", required=True)
    ap.add_argument("--brush", required=True)
    args = ap.parse_args()
    out = HERE / "fonts"
    out.mkdir(exist_ok=True)
    kai = Path(args.kai)
    n, miss, k = build([kai / "lxgwwenkai-regular.css"], kai / "files", kai_chars(), out / "pano-kai.woff2", "PanoKai")
    print(f"pano-kai.woff2：{n} 个字，取自 {k} 片，{(out / 'pano-kai.woff2').stat().st_size / 1024:.0f} KB；字体里没有的：{''.join(miss) or '无'}")
    br = Path(args.brush)
    css = sorted(br.glob("*400*.css")) or sorted(br.glob("index.css"))
    n, miss, k = build([css[0]], br / "files" if (br / "files").exists() else br, brush_chars(), out / "pano-brush.woff2", "PanoBrush")
    print(f"pano-brush.woff2：{n} 个字，取自 {k} 片，{(out / 'pano-brush.woff2').stat().st_size / 1024:.0f} KB；字体里没有的：{''.join(miss) or '无'}")
    (out / "chars-kai.txt").write_text("".join(sorted(kai_chars())), encoding="utf8")
    (out / "chars-brush.txt").write_text("".join(sorted(brush_chars())), encoding="utf8")


if __name__ == "__main__":
    main()
