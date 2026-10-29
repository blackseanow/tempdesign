#!/usr/bin/env python3
"""Extract the five logo glyphs from the bundled, unmodified WenKai subsets.

Run from any directory with fonttools and brotli available. The JSON contains
original font-unit coordinates (positive y points upwards); SVG placement must
flip the y axis. No system-installed font or network connection is required.
"""

import json
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parents[1]
TEXT = "咸鱼把脉了"


def extract():
    found = {}
    for source in sorted((ROOT / "fonts").glob("lxgwwenkai-regular-*.woff2")):
        with TTFont(source) as font:
            cmap = font.getBestCmap()
            glyph_set = font.getGlyphSet()
            for character in TEXT:
                if character in found or ord(character) not in cmap:
                    continue
                name = cmap[ord(character)]
                path_pen = SVGPathPen(glyph_set)
                bounds_pen = BoundsPen(glyph_set)
                glyph_set[name].draw(path_pen)
                glyph_set[name].draw(bounds_pen)
                found[character] = {
                    "path": path_pen.getCommands(),
                    "unitsPerEm": font["head"].unitsPerEm,
                    "advance": font["hmtx"].metrics[name][0],
                    "bounds": list(bounds_pen.bounds),
                    "source": source.name,
                }
    missing = [character for character in TEXT if character not in found]
    if missing:
        raise RuntimeError(f"Missing glyphs: {''.join(missing)}")
    output = {character: found[character] for character in TEXT}
    (ROOT / "fonts" / "glyphs.json").write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    for character, glyph in output.items():
        print(character, glyph["unitsPerEm"], glyph["advance"], glyph["bounds"])


if __name__ == "__main__":
    extract()
