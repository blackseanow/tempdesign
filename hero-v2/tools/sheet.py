"""把 shoot.cjs 截的帧拼成联系表 screenshots/sequence-sheet.png（每帧标时间和阶段），
以及 logo_options.cjs 截的候选特写拼成 screenshots/logo-options.png。

用法：python3 tools/sheet.py <帧目录> <输出目录> <时间,时间,...>
      python3 tools/sheet.py logos <特写目录> <输出目录>
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONT = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'


def phase(t):
    return '把脉前' if t < 4 else '收住' if t < 6 else '把脉后'


def main():
    if sys.argv[1] == 'logos':
        return logos(Path(sys.argv[2]), Path(sys.argv[3]))
    src, out, times = Path(sys.argv[1]), Path(sys.argv[2]), [float(t) for t in sys.argv[3].split(',')]
    frames = [Image.open(src / f'frame-{t:.1f}.png').convert('RGB') for t in times]
    w, h = 720, round(frames[0].size[1] * 720 / frames[0].size[0])
    cols, gap, head = 3, 12, 30
    rows = (len(frames) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * w + (cols + 1) * gap, rows * (h + head) + (rows + 1) * gap), (236, 234, 225))
    d = ImageDraw.Draw(sheet)
    f = ImageFont.truetype(FONT, 18)
    for i, (t, im) in enumerate(zip(times, frames)):
        x = gap + (i % cols) * (w + gap)
        y = gap + (i // cols) * (h + head + gap)
        d.text((x, y + 4), f'{t:.1f} 秒 · {phase(t)}', font=f, fill=(36, 35, 31))
        sheet.paste(im.resize((w, h), Image.LANCZOS), (x, y + head))
    sheet.save(out / 'sequence-sheet.png', optimize=True)
    print('sequence-sheet.png', sheet.size)
    strip(src, out, 'mouth', ['张嘴（底图）', '大半张', '半张', '闭嘴'], 'mouth-close@2x.png')
    strip(src, out, 'rec', ['把脉前', '把脉后'], 'recorder-close@2x.png')


def strip(src, out, prefix, labels, name):
    """几张特写横排成一张，每张上面写一行说明。"""
    ims = [Image.open(src / f'{prefix}-{i}.png').convert('RGB') for i in range(len(labels))]
    w, h = ims[0].size
    gap, head = 12, 34
    sheet = Image.new('RGB', (len(ims) * w + (len(ims) + 1) * gap, h + head + gap), (236, 234, 225))
    d = ImageDraw.Draw(sheet)
    f = ImageFont.truetype(FONT, 20)
    for i, (label, im) in enumerate(zip(labels, ims)):
        x = gap + i * (w + gap)
        d.text((x, 6), label, font=f, fill=(36, 35, 31))
        sheet.paste(im, (x, head))
    sheet.save(out / name, optimize=True)
    print(name, sheet.size)


def logos(src, out):
    """12 款候选两栏排开：左栏 logo-b，右栏 logo；每行是原稿、录音笔铭牌、盖在材料上的印章（都是 2 倍像素）。"""
    rows = json.loads((src / 'rows.json').read_text())
    cells = []
    f, fs = ImageFont.truetype(FONT, 22), ImageFont.truetype(FONT, 16)
    for r in rows:
        ref, rec, stamp = (Image.open(src / f'{r["id"]}-{k}.png').convert('RGB') for k in ('ref', 'rec', 'stamp'))
        h = max(ref.size[1], rec.size[1], stamp.size[1])
        w = ref.size[0] + rec.size[0] + stamp.size[0] + 24
        cell = Image.new('RGB', (w, h + 40), (236, 234, 225))
        d = ImageDraw.Draw(cell)
        d.text((0, 6), f'{r["spec"]}  {r["name"]}', font=f, fill=(36, 35, 31))
        x = 0
        for im in (ref, rec, stamp):
            cell.paste(im, (x, 40 + (h - im.size[1]) // 2))
            x += im.size[0] + 12
        cells.append(cell)
    cw, ch = max(c.size[0] for c in cells), max(c.size[1] for c in cells)
    gap, head = 28, 60
    half = (len(cells) + 1) // 2
    sheet = Image.new('RGB', (2 * cw + 3 * gap, head + half * (ch + gap) + gap), (236, 234, 225))
    d = ImageDraw.Draw(sheet)
    d.text((gap, 18), '每行：候选原稿 · 印在录音笔上（反白） · 盖在材料上的朱砂印章（8 秒定格）', font=fs, fill=(78, 76, 69))
    for i, c in enumerate(cells):
        col, row = (0, i) if i < half else (1, i - half)
        sheet.paste(c, (gap + col * (cw + gap), head + row * (ch + gap)))
    sheet.save(out / 'logo-options.png', optimize=True)
    print('logo-options.png', sheet.size)


if __name__ == '__main__':
    main()
