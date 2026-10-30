"""Cut LXGW WenKai down to the glyphs 剧本解剖图 uses, so the page and the SVG render offline.

The page asks for LXGW WenKai from the CDN first; these subsets back it up under the family
name "Juben WenKai" (and KaiTi, serif after that). Source: the npm package
lxgw-wenkai-webfont@1.7.0, regular weight, unmodified apart from subsetting.

  npm pack lxgw-wenkai-webfont@1.7.0 && tar -xzf lxgw-wenkai-webfont-1.7.0.tgz
  node build.mjs --chars
  python3 tools/subset.py --package path/to/package
"""

import argparse
import json
import re
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

HERE = Path(__file__).resolve().parent.parent


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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--package", required=True, help="the unpacked lxgw-wenkai-webfont package directory")
    parser.add_argument("--chars", default=str(HERE / "fonts" / "chars.txt"))
    parser.add_argument("--out", default=str(HERE / "fonts"))
    args = parser.parse_args()

    package = Path(args.package)
    css = (package / "lxgwwenkai-regular.css").read_text(encoding="utf8")
    wanted = {ord(ch) for ch in Path(args.chars).read_text(encoding="utf8").strip()}
    out = Path(args.out)
    for old in out.glob("juben-wenkai-*.woff2"):
        old.unlink()

    manifest = []
    covered = set()
    for block in re.findall(r"@font-face\s*{(.*?)}", css, re.S):
        src = re.search(r"url\('\./files/([^']+)'\)", block)
        span = re.search(r"unicode-range:\s*([^;}]+)", block)
        if not src or not span:
            continue
        need = sorted(wanted & ranges_of(span.group(1)) - covered)
        if not need:
            continue
        font = TTFont(package / "files" / src.group(1))
        cmap = font.getBestCmap()
        need = [cp for cp in need if cp in cmap]
        if not need:
            continue
        options = subset.Options()
        options.flavor = "woff2"
        options.hinting = False
        options.desubroutinize = True
        options.layout_features = ["kern", "liga", "calt", "ccmp", "locl", "mark", "mkmk", "vert", "vrt2"]
        subsetter = subset.Subsetter(options=options)
        subsetter.populate(unicodes=need)
        subsetter.subset(font)
        name = f"juben-wenkai-{len(manifest) + 1}.woff2"
        font.flavor = "woff2"
        font.save(out / name)
        covered.update(need)
        manifest.append({"file": name, "source": src.group(1), "range": ",".join(f"U+{cp:04X}" for cp in need), "glyphs": len(need)})

    missing = sorted(wanted - covered)
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    size = sum((out / entry["file"]).stat().st_size for entry in manifest)
    print(f"{len(covered)} glyphs in {len(manifest)} files, {size / 1024:.1f} KB")
    if missing:
        print("not in the font:", "".join(chr(cp) for cp in missing))


if __name__ == "__main__":
    main()
