#!/usr/bin/env python3
"""煎药中加载动效：截图与自查。

用法（在 loading/ 目录下）：
  python3 -m http.server 8000 --bind 127.0.0.1 &
  python3 tools/shoot.py [--base http://127.0.0.1:8000/] [--font-dir 路径]

--font-dir 指向 lxgw-wenkai-webfont 的 npm 包目录（含 style.css 和 files/）。
CDN 访问不到时，用它在本地应答 cdn.jsdelivr.net 的字体请求，截图里的楷体与线上一致。

动画帧用 Playwright 的假时钟逐帧推进（requestAnimationFrame 每 16ms 一帧），
截图时刻是确定的，不受截图本身耗时影响。
"""
import argparse
import json
import math
import mimetypes
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent.parent
OUT = HERE / "screenshots"
CDN = "https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont"

# 与 index.html 里的时间轴一致（毫秒）
STROKES = [(0, 1000), (1100, 1380), (1480, 1680)]
WRITTEN, FADE, CYCLE = 1680, (2000, 2340), 2400


def phase_name(t):
    t %= CYCLE
    names = ["脉搏线、第一行", "第二行", "第三行"]
    for i, (s, e) in enumerate(STROKES):
        if s <= t < e:
            return names[i]
    if t < WRITTEN:
        return "提笔换行"
    if t < FADE[0]:
        return "停顿"
    if t < FADE[1]:
        return "淡出"
    return "留白"


def label_font(size):
    for path, index in (("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", 2),
                        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 0)):
        if Path(path).exists():
            return ImageFont.truetype(path, size, index=index)
    return ImageFont.load_default(size=size)


def contact_sheet(frames, path, cols=4, title=""):
    """frames: [(PIL.Image, label)]，拼成一张带标注的联系表。"""
    w, h = frames[0][0].size
    pad, cap, head = 16, 40, 56 if title else 0
    rows = math.ceil(len(frames) / cols)
    sheet = Image.new("RGB", (cols * w + (cols + 1) * pad, head + rows * (h + cap) + (rows + 1) * pad), "#D6D2C4")
    d = ImageDraw.Draw(sheet)
    f = label_font(22)
    if title:
        d.text((pad, pad), title, fill="#24231F", font=label_font(26))
    for i, (img, text) in enumerate(frames):
        x = pad + (i % cols) * (w + pad)
        y = head + pad + (i // cols) * (h + cap + pad)
        sheet.paste(img, (x, y))
        d.text((x + 4, y + h + 8), text, fill="#24231F", font=f)
    sheet.save(path)


def red_mask(img):
    """朱砂一类的红：R 明显高于 G、B。墨、纸、函套青、铜色都不会命中。"""
    a = np.asarray(img.convert("RGB")).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return (r - np.maximum(g, b) > 40) & (r > 100)


def route_fonts(context, font_dir):
    if not font_dir:
        return
    base = Path(font_dir).resolve()

    def handle(route):
        rel = route.request.url.split("lxgw-wenkai-webfont", 1)[1]
        rel = rel.split("?", 1)[0].lstrip("/")
        if rel.startswith("@"):  # 带版本号的地址
            rel = rel.split("/", 1)[1] if "/" in rel else ""
        f = (base / (rel or "style.css")).resolve()
        if base not in f.parents or not f.is_file():
            return route.fulfill(status=404, body="")
        ctype = "font/woff2" if f.suffix == ".woff2" else (mimetypes.guess_type(f.name)[0] or "application/octet-stream")
        route.fulfill(status=200, body=f.read_bytes(), content_type=ctype,
                      headers={"Access-Control-Allow-Origin": "*", "Cache-Control": "max-age=3600"})

    context.route(CDN + "/**", handle)


def wait_fonts(page):
    page.evaluate("""async () => {
      await document.fonts.load('20px "LXGW WenKai"', '煎药中，请稍候正在拟写已成');
      await document.fonts.ready;
    }""")


def platform_fonts(page, selector):
    cdp = page.context.new_cdp_session(page)
    cdp.send("DOM.enable")
    cdp.send("CSS.enable")
    root = cdp.send("DOM.getDocument", {"depth": -1})["root"]["nodeId"]
    node = cdp.send("DOM.querySelector", {"nodeId": root, "selector": selector})["nodeId"]
    fonts = cdp.send("CSS.getPlatformFontsForNode", {"nodeId": node})["fonts"]
    cdp.detach()
    return [(x["familyName"], x["glyphCount"]) for x in fonts]


def brew_clip(page, sel="#brew-main .brew", mx=24, my=20):
    b = page.locator(sel).bounding_box()
    return {"x": b["x"] - mx, "y": b["y"] - my, "width": b["width"] + 2 * mx, "height": b["height"] + 2 * my}


def shot(page, clip, path=None):
    from io import BytesIO
    data = page.screenshot(clip=clip, animations="allow")
    img = Image.open(BytesIO(data)).convert("RGB")
    if path:
        img.save(path)
    return img


SAMPLE_JS = """() => {
  const r = document.querySelector('#brew-main .brew');
  const ink = r.querySelector('.brew-ink'), pen = r.querySelector('.brew-pen');
  const lines = [...r.querySelectorAll('.brew-line')].map(el => {
    const len = el.getTotalLength(), s = el.style;
    const vis = s.visibility !== 'hidden';
    const full = !s.strokeDasharray || s.strokeDasharray === 'none';
    const drawn = !vis ? 0 : full ? len : len - parseFloat(s.strokeDashoffset);
    const p = el.getPointAtLength(Math.max(0, drawn));
    return { len, drawn, tx: p.x, ty: p.y };
  });
  return { a: +getComputedStyle(ink).opacity, px: +pen.getAttribute('cx'), py: +pen.getAttribute('cy'),
           pr: +pen.getAttribute('r'), lines };
}"""


def check_motion(samples, step_ms):
    """逐帧检查：笔头在线头、墨线不跳、淡出淡入连贯。返回问题列表。"""
    issues = []
    prev = None
    max_tip_err = 0.0
    for i, s in enumerate(samples):
        partial = [l for l in s["lines"] if 0 < l["drawn"] < l["len"]]  # 还没写完的线
        if s["pr"] > 0:
            if not partial:
                issues.append(f"帧 {i}: 笔头可见，但没有正在画的线")
            else:
                err = min(math.hypot(s["px"] - l["tx"], s["py"] - l["ty"]) for l in partial)
                max_tip_err = max(max_tip_err, err)
                if err > 0.6:
                    issues.append(f"帧 {i}: 笔头离线头 {err:.2f}px")
        if len(partial) > 1:
            issues.append(f"帧 {i}: 同时有 {len(partial)} 根线在画")
        if prev:
            ink = sum(l["drawn"] for l in s["lines"])
            if ink > 0.5 and prev["a"] > 0 and abs(s["a"] - prev["a"]) > 0.09:
                issues.append(f"帧 {i}: 墨色透明度一帧变了 {abs(s['a'] - prev['a']):.3f}")
            for k, (l0, l1) in enumerate(zip(prev["lines"], s["lines"])):
                d = l1["drawn"] - l0["drawn"]
                visible = s["a"] > 0.01 and prev["a"] > 0.01
                if visible and (d < -0.01 or d > 9):
                    issues.append(f"帧 {i}: 第 {k + 1} 根线一帧变了 {d:.1f}px")
            if s["pr"] > 0 and prev["pr"] > 0:
                jump = math.hypot(s["px"] - prev["px"], s["py"] - prev["py"])
                if jump > 9:
                    issues.append(f"帧 {i}: 笔头一帧跳了 {jump:.1f}px")
            if abs(s["pr"] - prev["pr"]) > 0.8:
                issues.append(f"帧 {i}: 笔头大小一帧变了 {abs(s['pr'] - prev['pr']):.2f}")
        prev = s
    return issues, max_tip_err


TEXT_BOXES_JS = """(sel) => {
  const r = document.querySelector(sel);
  const box = el => { const b = el.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map(v => Math.round(v * 100) / 100); };
  const step = r.querySelector('.brew-step'), title = r.querySelector('.brew-title');
  // 文字本身（不含空 span 的边距）的水平中心，应与组件中心对齐
  const inkCenter = el => {
    const g = document.createRange(); g.selectNodeContents(el);
    const rs = [...g.getClientRects()].filter(b => b.width > 0);
    if (!rs.length) return null;
    return (Math.min(...rs.map(b => b.left)) + Math.max(...rs.map(b => b.right))) / 2;
  };
  const a = r.querySelector('.brew-art').getBoundingClientRect();
  const mid = a.x + a.width / 2;
  const off = el => { const c = inkCenter(el); return c === null ? 0 : Math.round((c - mid) * 100) / 100; };
  return { art: box(r.querySelector('.brew-art')), title: box(title), step: box(step),
           text: r.querySelector('.brew-text').innerText, clipped: step.scrollWidth > step.clientWidth + 1,
           off_title: off(title), off_step: off(step) };
}"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8000/")
    ap.add_argument("--font-dir", default="")
    args = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    url = args.base.rstrip("/") + "/index.html"
    report = {"issues": []}
    issues = report["issues"]

    with sync_playwright() as p:
        browser = p.chromium.launch()

        def new_page(width=1000, height=1000, dpr=2, reduced="no-preference", clock=False):
            ctx = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=dpr,
                                      reduced_motion=reduced, locale="zh-CN")
            route_fonts(ctx, args.font_dir)
            pg = ctx.new_page()
            errors = []
            pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
            if clock:
                pg.clock.install()
            pg.goto(url)
            wait_fonts(pg)
            pg._errors = errors
            return pg

        # ---------- 1. 一个循环周期：假时钟逐帧 ----------
        pg = new_page(clock=True)
        report["fonts"] = {
            "title": platform_fonts(pg, "#brew-main .brew-title"),
            "step": platform_fonts(pg, "#brew-main .brew-step-t"),
            "seal": platform_fonts(pg, "#brew-main .brew-seal text"),
            "page": platform_fonts(pg, ".lead"),
        }
        for k, v in report["fonts"].items():
            if not v or any(name != "LXGW WenKai" for name, _ in v):
                issues.append(f"字体：{k} 用了 {v}")
        pg.clock.pause_at(pg.evaluate("Date.now()") + 1000)
        pg.evaluate("() => { const b = brewDemo.main; b.reset(); b.setStep('正在拟写 责任分工', 3, 5); }")
        pg.clock.run_for(400)
        pg.wait_for_timeout(400)  # 文案的 CSS 过渡按真实时间走完
        clip = brew_clip(pg)
        pg.evaluate("() => brewDemo.main.start()")

        elapsed = [0]  # 从 start() 起已推进的毫秒

        def frames_at(times):
            """从 start() 起算，在给定时刻（毫秒，递增）各截一帧。"""
            out = []
            for t in times:
                if t > elapsed[0]:
                    pg.clock.run_for(t - elapsed[0])
                    elapsed[0] = t
                out.append((shot(pg, clip), t))
            return out

        cycle = frames_at([i * 200 for i in range(12)])
        contact_sheet([(img, f"{t / 1000:.1f} s　{phase_name(t)}") for img, t in cycle],
                      OUT / "cycle-sheet.png", title="一个循环周期（2.4 s），每 0.2 s 一帧")
        for img, t in cycle:
            n = int(red_mask(img).sum())
            if n:
                issues.append(f"循环帧 {t}ms 出现 {n} 个红色像素")

        # 衔接处细看：换行（提笔、落笔）与淡出、重新开始
        base = 2400 * 1  # 第二圈，避开 start() 的首帧
        hand = frames_at([base + 880 + i * 60 for i in range(12)])
        contact_sheet([(img, f"{(t - base) / 1000:.2f} s　{phase_name(t)}") for img, t in hand],
                      OUT / "strokes-sheet.png", title="换行衔接：0.88–1.54 s，每 60 ms 一帧")
        base = 2400 * 2
        seam = frames_at([base + 1940 + i * 60 for i in range(12)])
        contact_sheet([(img, f"{(t - base) / 1000:.2f} s　{phase_name(t)}") for img, t in seam],
                      OUT / "seam-sheet.png", title="淡出与重新开始：1.94–2.60 s，每 60 ms 一帧")
        for img, t in hand + seam:
            n = int(red_mask(img).sum())
            if n:
                issues.append(f"衔接帧 {t}ms 出现 {n} 个红色像素")

        # 逐帧数值检查：两圈，每 16ms 取一次
        samples = []
        for _ in range(2 * CYCLE // 16):
            pg.clock.run_for(16)
            samples.append(pg.evaluate(SAMPLE_JS))
        motion_issues, tip_err = check_motion(samples, 16)
        issues.extend(motion_issues)
        report["pen_tip_max_error_px"] = round(tip_err, 3)
        report["samples"] = len(samples)

        # ---------- 2. 完成状态 ----------
        # 停顿期间调用 done()：立刻盖印。把印章的过渡定格，截 0–200ms 的落印过程
        now_t = 0
        while True:
            s = pg.evaluate(SAMPLE_JS)
            if all(l["drawn"] >= l["len"] - 0.01 for l in s["lines"]) and s["a"] >= 0.999 and s["pr"] == 0:
                break
            pg.clock.run_for(16)
            now_t += 16
            if now_t > 3000:
                issues.append("找不到停顿帧")
                break
        art = pg.locator("#brew-main .brew-art").bounding_box()
        art_clip = {"x": art["x"] + 150, "y": art["y"], "width": art["width"] - 150, "height": art["height"]}
        pg.evaluate("""() => {
          brewDemo.main.done();
          const seal = document.querySelector('#brew-main .brew-seal');
          getComputedStyle(seal).opacity;
          window.__sealAnims = seal.getAnimations();
          window.__sealAnims.forEach(a => a.pause());
        }""")
        n_anims = pg.evaluate("window.__sealAnims.length")
        if n_anims < 2:
            issues.append(f"印章过渡只有 {n_anims} 个（应有透明度、缩放两个）")
        stamp = []
        for ms in (0, 40, 80, 120, 160, 200):
            pg.evaluate(f"window.__sealAnims.forEach(a => {{ a.currentTime = {ms}; }})")
            stamp.append((shot(pg, art_clip), f"{ms} ms"))
        contact_sheet(stamp, OUT / "stamp-sheet.png", cols=6, title="盖印：1.3 倍透明 → 正常大小，0.2 s")
        pg.evaluate("window.__sealAnims.forEach(a => a.finish())")
        pg.clock.run_for(600)
        pg.wait_for_timeout(500)
        done_img = shot(pg, clip, OUT / "done.png")
        red = red_mask(done_img)
        seal_box = pg.locator("#brew-main .brew-seal").bounding_box()
        if not red.any():
            issues.append("完成状态没有找到印章的红色")
        else:
            ys, xs = np.nonzero(red)
            dpr = 2
            rb = [xs.min() / dpr + clip["x"], ys.min() / dpr + clip["y"], xs.max() / dpr + clip["x"], ys.max() / dpr + clip["y"]]
            sb = [seal_box["x"], seal_box["y"], seal_box["x"] + seal_box["width"], seal_box["y"] + seal_box["height"]]
            report["red_bbox_css"] = [round(v, 1) for v in rb]
            report["seal_bbox_css"] = [round(v, 1) for v in sb]
            if rb[0] < sb[0] - 1 or rb[1] < sb[1] - 1 or rb[2] > sb[2] + 1 or rb[3] > sb[3] + 1:
                issues.append(f"红色超出印章范围：{rb} vs {sb}")
        done_state = pg.evaluate("""() => {
          const r = document.querySelector('#brew-main .brew');
          return { busy: r.getAttribute('aria-busy'), title: r.querySelector('.brew-title').textContent,
                   step: r.querySelector('.brew-step').innerText };
        }""")
        report["done_state"] = done_state
        if done_state["title"] != "药已备好" or done_state["busy"] != "false":
            issues.append(f"完成状态不对：{done_state}")

        # done() 在画线途中、淡出途中、留白时调用：先写完或淡回，再盖印；过程同样逐帧检查
        report["done_latency_ms"] = {}
        for label, at in (("画线途中", 600), ("淡出途中", 2150), ("留白时", 2370)):
            pg.evaluate("() => { const b = brewDemo.main; b.reset(); b.start(); }")
            pg.clock.run_for(at)
            seq = [pg.evaluate(SAMPLE_JS)]
            pg.evaluate("() => { brewDemo.main.done(); }")
            for _ in range(200):
                pg.clock.run_for(16)
                seq.append(pg.evaluate(SAMPLE_JS))
                if pg.evaluate("document.querySelector('#brew-main .brew').classList.contains('is-done')"):
                    break
            else:
                issues.append(f"{label}调用 done()：3 秒内没有盖印")
            iss, _ = check_motion(seq, 16)
            issues.extend(f"{label}调用 done()：{x}" for x in iss)
            end = seq[-1]
            if not all(l["drawn"] >= l["len"] - 0.01 for l in end["lines"]) or end["a"] < 0.999:
                issues.append(f"{label}调用 done()：盖印时画面不完整 {end}")
            report["done_latency_ms"][label] = (len(seq) - 1) * 16
        page_errors = list(pg._errors)
        pg.context.close()

        # ---------- 3. 整页（加载中）与文案切换 ----------
        pg = new_page(clock=True)
        pg.clock.pause_at(pg.evaluate("Date.now()") + 1000)
        pg.evaluate("() => document.querySelectorAll('#btn-restart, [data-act=restart]').forEach(b => b.click())")
        pg.clock.run_for(400)
        pg.wait_for_timeout(400)
        pg.clock.run_for(1400)  # 1.8s：字行写完、停顿中
        pg.screenshot(path=str(OUT / "page.png"), full_page=True)
        full = Image.open(OUT / "page.png")
        if red_mask(full).any():
            issues.append(f"整页（加载中）出现 {int(red_mask(full).sum())} 个红色像素")
        page_errors += pg._errors
        pg.context.close()

        # 文案切换不抖动：真实时钟下点步骤按钮，过渡期间每 25ms 量一次位置
        pg = new_page()
        boxes = []
        for i in range(5):
            pg.locator(f"#steps button[data-i='{i}']").click()
            for _ in range(14):
                boxes.append(pg.evaluate(TEXT_BOXES_JS, "#brew-main .brew"))
                pg.wait_for_timeout(25)
        pg.locator("#show-n").click()
        for _ in range(14):
            boxes.append(pg.evaluate(TEXT_BOXES_JS, "#brew-main .brew"))
            pg.wait_for_timeout(25)
        pg.locator("#btn-done").click()
        for _ in range(80):
            boxes.append(pg.evaluate(TEXT_BOXES_JS, "#brew-main .brew"))
            pg.wait_for_timeout(25)
        texts = sorted({b["text"].replace("\n", " / ") for b in boxes})
        for key in ("art", "title", "step"):
            uniq = {tuple(b[key]) for b in boxes}
            if len(uniq) > 1:
                issues.append(f"文案切换时 {key} 位置变了：{sorted(uniq)}")
        if any(b["clipped"] for b in boxes):
            issues.append("步骤文案被截断")
        off = max(max(abs(b["off_title"]), abs(b["off_step"])) for b in boxes)
        report["text_center_max_offset_px"] = off
        if off > 1:
            issues.append(f"文案没有居中：最大偏移 {off}px")
        report["text_states_seen"] = texts
        page_errors += pg._errors
        pg.context.close()

        # ---------- 4. 减少动态效果 ----------
        pg = new_page(reduced="reduce")
        pg.wait_for_timeout(300)
        pg.screenshot(path=str(OUT / "reduced-motion.png"), full_page=True)
        rm = Image.open(OUT / "reduced-motion.png")
        if red_mask(rm).any():
            issues.append("减少动态效果（加载中）出现红色")
        a = pg.evaluate(SAMPLE_JS)
        if not all(l["drawn"] >= l["len"] - 0.01 for l in a["lines"]) or a["pr"] != 0:
            issues.append(f"减少动态效果：没有静态显示整幅画 {a}")
        still = shot(pg, brew_clip(pg))
        pg.wait_for_timeout(700)
        if np.abs(np.asarray(still).astype(int) - np.asarray(shot(pg, brew_clip(pg))).astype(int)).max() > 0:
            issues.append("减少动态效果：画面仍在变化")
        pg.locator("#steps button[data-i='3']").click()
        rm_step = pg.evaluate(TEXT_BOXES_JS, "#brew-main .brew")["text"]
        if "时间安排" not in rm_step:
            issues.append(f"减少动态效果：文案没有更新 {rm_step}")
        pg.locator("#btn-done").click()
        op = pg.evaluate("getComputedStyle(document.querySelector('#brew-main .brew-seal')).opacity")
        if op != "1":
            issues.append(f"减少动态效果：印章没有直接出现（opacity {op}）")
        shot(pg, brew_clip(pg), OUT / "reduced-motion-done.png")
        page_errors += pg._errors
        pg.context.close()

        # ---------- 5. 手机 390 宽 ----------
        pg = new_page(width=390, height=844, dpr=2, clock=True)
        pg.clock.pause_at(pg.evaluate("Date.now()") + 1000)
        pg.evaluate("() => document.querySelectorAll('#btn-restart, [data-act=restart]').forEach(b => b.click())")
        pg.clock.run_for(400)
        pg.wait_for_timeout(400)
        pg.clock.run_for(400)  # 0.8s：脉搏线画到素笺里
        pg.screenshot(path=str(OUT / "mobile-390.png"), full_page=True)
        mob = Image.open(OUT / "mobile-390.png")
        if red_mask(mob).any():
            issues.append("手机（加载中）出现红色")
        sw = pg.evaluate("document.documentElement.scrollWidth")
        if sw > 390:
            issues.append(f"手机宽度溢出：scrollWidth {sw}")
        for sel in ("#brew-main .brew", "#brew-transcribe .brew", "#brew-rx .brew"):
            if pg.evaluate(TEXT_BOXES_JS, sel)["clipped"]:
                issues.append(f"手机：{sel} 文案被截断")
        page_errors += pg._errors
        pg.context.close()

        browser.close()

    report["page_errors"] = page_errors
    issues.extend(f"页面报错：{e}" for e in page_errors)
    (OUT / "check.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if issues else 0


if __name__ == "__main__":
    sys.exit(main())
