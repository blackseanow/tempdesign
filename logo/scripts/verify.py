#!/usr/bin/env python3
"""Audit the delivered SVGs for portability, inventory and outline structure.

This is a static artifact audit, not a visual-recognition test. Review the
Playwright contact sheet separately for readability and unintended readings.
Only Python's standard library is needed.
"""

import json
import re
import sys
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
SVG_NS = "http://www.w3.org/2000/svg"
PALETTE = {"#B5382A", "#F8F7F2", "#24231F", "#1F3A4D", "#ECEAE1"}
FORBIDDEN_ELEMENTS = {
    "text", "tspan", "textPath", "image", "foreignObject", "script",
    "linearGradient", "radialGradient", "filter", "font", "font-face",
}


def local_name(name):
    return name.rsplit("}", 1)[-1]


def main():
    manifest = json.loads((ROOT / "candidates/manifest.json").read_text())
    glyphs = json.loads((ROOT / "fonts/glyphs.json").read_text())
    issues = []
    files_report = []
    dimensions = {}
    candidates = manifest["candidates"]
    layouts = manifest["layouts"]
    modes = manifest["modes"]
    optical = manifest.get("opticalSizes", {})
    optical_candidates = optical.get("candidates", [])
    primary_expected = {
        f"{candidate}/{layout}-{mode}.svg"
        for candidate in candidates for layout in layouts for mode in modes
    }
    optical_expected = {
        f"{candidate}/{optical['fixedFiles'].format(mode=mode)}"
        for candidate in optical_candidates for mode in modes
    }
    expected = primary_expected | optical_expected
    actual = {
        str(path.relative_to(ROOT / "candidates"))
        for path in (ROOT / "candidates").rglob("*.svg")
    }

    def issue(file, message):
        issues.append({"file": file, "message": message})

    if len(primary_expected) != 54:
        issue("manifest.json", f"Expected 54 primary combinations, found {len(primary_expected)}")
    if len(optical_expected) != 6 or len(expected) != 60:
        issue("manifest.json", "Expected six fixed optical-size SVGs and 60 SVGs in total")
    if set(optical_candidates) != {"C1", "C2"} or optical.get("maxWidth") != 24:
        issue("manifest.json", "Optical sizes must apply to C1/C2 at widths up to 24px")
    if optical.get("fixedFiles") != "mark-micro-{mode}.svg":
        issue("manifest.json", "Unexpected fixed optical-size filename pattern")
    if set(candidates) != {"A1", "A2", "B1", "B2", "C1", "C2"}:
        issue("manifest.json", "Candidate IDs do not match the six requested variants")
    if set(layouts) != {"mark", "horizontal", "vertical"}:
        issue("manifest.json", "Required layouts are mark, horizontal and vertical")
    if set(modes) != {"color", "ink", "reverse"}:
        issue("manifest.json", "Required modes are color, ink and reverse")
    if set(manifest["palette"].values()) != PALETTE:
        issue("manifest.json", "Palette differs from the five specified colors")
    if manifest["sizes"] != [16, 32, 64, 180]:
        issue("manifest.json", "Required render sizes are 16, 32, 64 and 180")
    for name in sorted(expected - actual):
        issue(name, "Missing candidate SVG")
    for name in sorted(actual - expected):
        issue(name, "SVG not declared by manifest combinations")

    glyph_paths = {char: glyphs[char]["path"] for char in manifest["brand"]}
    known_glyph_paths = set(glyph_paths.values())
    for relative in sorted(actual & expected):
        path = ROOT / "candidates" / relative
        source = path.read_text()
        candidate, filename = relative.split("/")
        filename_layout, mode = filename.removesuffix(".svg").rsplit("-", 1)
        fixed_optical = relative in optical_expected
        layout = "mark" if fixed_optical else filename_layout
        adaptive_optical = candidate in optical_candidates and layout == "mark" and not fixed_optical
        before_count = len(issues)
        if re.search(r"<!DOCTYPE|<!ENTITY|<\?xml-stylesheet", source, re.I):
            issue(relative, "External XML declarations are not permitted")
        try:
            svg = ET.fromstring(source)
        except ET.ParseError as error:
            issue(relative, f"Invalid XML: {error}")
            continue
        if svg.tag != f"{{{SVG_NS}}}svg":
            issue(relative, "Root must be a standalone SVG with the SVG namespace")
        try:
            width = float(svg.attrib["width"])
            height = float(svg.attrib["height"])
            box = [float(value) for value in svg.attrib["viewBox"].split()]
            assert len(box) == 4 and width > 0 and height > 0
            assert box[2] > 0 and box[3] > 0
            assert abs(width / height - box[2] / box[3]) < 1e-8
            current = (width, height, tuple(box))
            if layout in dimensions and dimensions[layout] != current:
                issue(relative, "Layout dimensions differ across candidates or modes")
            dimensions.setdefault(layout, current)
            if layout == "mark" and width != height:
                issue(relative, "Standalone seal must have a square viewport")
        except (KeyError, ValueError, AssertionError, ZeroDivisionError):
            issue(relative, "Missing or inconsistent intrinsic dimensions/viewBox")

        ids = {element.attrib["id"] for element in svg.iter() if "id" in element.attrib}
        colors = set()
        paths = []
        styles = []
        for element in svg.iter():
            tag = local_name(element.tag)
            if tag in FORBIDDEN_ELEMENTS:
                issue(relative, f"Forbidden element: {tag}")
            if tag == "path":
                paths.append(element.attrib.get("d", ""))
            for key, value in element.attrib.items():
                attribute = local_name(key)
                if attribute.startswith("on") or attribute.startswith("font"):
                    issue(relative, f"Runtime/font dependency attribute: {attribute}")
                if attribute == "href":
                    if not value.startswith("#") or value[1:] not in ids:
                        issue(relative, f"External or unresolved href: {value}")
                if attribute in {"fill", "stroke", "color", "stop-color", "flood-color", "lighting-color"}:
                    if value not in {"none", "currentColor"}:
                        colors.add(value.upper())
                        if value.upper() not in PALETTE:
                            issue(relative, f"Color outside the specified palette: {value}")
                if "url(" in value.lower():
                    issue(relative, f"URL-based resource dependency in {attribute}")
                if attribute == "style" and re.search(r"font|filter|gradient|url\(", value, re.I):
                    issue(relative, "Inline style contains a font/effect/resource dependency")
            if tag == "style":
                css = element.text or ""
                styles.append(css)
                if re.search(r"font|filter|gradient|url\(|@import", css, re.I):
                    issue(relative, "Stylesheet contains a font/effect/resource dependency")
                for color in re.findall(r"#[0-9a-fA-F]{3,8}\b", css):
                    if color.upper() not in PALETTE:
                        issue(relative, f"CSS color outside the specified palette: {color}")

        path_counts = Counter(paths)
        glyph_count = sum(path_counts[value] for value in known_glyph_paths)
        if layout in {"horizontal", "vertical"}:
            for character, glyph_path in glyph_paths.items():
                if path_counts[glyph_path] != 1:
                    issue(relative, f"Expected one exact outlined glyph for {character}; found {path_counts[glyph_path]}")
        elif glyph_count:
            issue(relative, "Standalone mark unexpectedly contains wordmark glyphs")

        geometric_paths = [value for value in paths if value not in known_glyph_paths]
        if candidate.startswith("C"):
            expected_paths = 2 if adaptive_optical else 1
            if len(geometric_paths) != expected_paths:
                issue(relative, f"C geometry requires {expected_paths} path(s), found {len(geometric_paths)}")
            for geometry in geometric_paths:
                if len(re.findall(r"[Mm]", geometry)) != 1:
                    issue(relative, "Each C geometry path must be one continuous subpath (one moveto)")
        if adaptive_optical:
            groups = {}
            for group in svg.iter(f"{{{SVG_NS}}}g"):
                name = group.attrib.get("class")
                if name in {"regular", "micro"}:
                    groups.setdefault(name, []).append(group)
            for name in ("regular", "micro"):
                matches = groups.get(name, [])
                if len(matches) != 1 or len(list(matches[0])) != 1 or local_name(matches[0][0].tag) != "path":
                    issue(relative, f"Adaptive C mark requires exactly one path in g.{name}")
            # The only permitted CSS switches these two groups' display values.
            # Matching this small contract prevents hidden external style/resource
            # dependencies and ensures the fallback is enabled only below 24px.
            allowed_css = (
                ".micro{display:none}@media(max-width:"
                + str(optical["maxWidth"])
                + "px){.regular{display:none}.micro{display:inline}}"
            )
            if len(styles) != 1 or re.sub(r"\s+", "", styles[0]).replace(";}", "}") != allowed_css:
                issue(relative, "Adaptive CSS must only switch regular/micro display at the manifest max-width")
        elif styles:
            issue(relative, "Only adaptive optical-size marks may contain a stylesheet")
        title = svg.find(f"{{{SVG_NS}}}title")
        if title is None or not title.text or manifest["brand"] not in title.text:
            issue(relative, "Missing descriptive title containing the brand")
        files_report.append({
            "file": relative,
            "candidate": candidate,
            "layout": layout,
            "mode": mode,
            "opticalSize": "fixed" if fixed_optical else "adaptive" if adaptive_optical else None,
            "colors": sorted(colors),
            "glyphPaths": glyph_count,
            "geometricPaths": len(geometric_paths),
            "passed": len(issues) == before_count,
        })

    report = {
        "scope": "Static standalone SVG, manifest, palette and exact glyph-outline audit; visual recognition requires contact-sheet review.",
        "passed": not issues,
        "expectedSvgCount": len(expected),
        "primarySvgCount": len(primary_expected),
        "fixedOpticalSvgCount": len(optical_expected),
        "actualSvgCount": len(actual),
        "checkedSvgCount": len(files_report),
        "outlinedWordmarkCount": sum(item["layout"] != "mark" for item in files_report),
        "continuousCVariantCount": sum(item["candidate"].startswith("C") for item in files_report),
        "adaptiveOpticalSvgCount": sum(item["opticalSize"] == "adaptive" for item in files_report),
        "issues": issues,
        "files": files_report,
    }
    destination = ROOT / "screenshots" / "verification.json"
    destination.parent.mkdir(exist_ok=True)
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(f"{'PASS' if report['passed'] else 'FAIL'}: {len(files_report)} SVGs; {len(issues)} issues")
    for item in issues:
        print(f"{item['file']}: {item['message']}")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
