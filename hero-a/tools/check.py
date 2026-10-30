"""第四步：逐项判定。读 shoot.cjs 写的 report.json、截图和 hero.svg。

用法：python3 check.py <工作目录>
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from svgelements import SVG, Path as SvgPath

ROOT = Path(__file__).resolve().parents[1]
WORK = Path(sys.argv[1] if len(sys.argv) > 1 else 'build')
PALETTE = ['#ECEAE1', '#F8F7F2', '#1F3A4D', '#24231F', '#B5382A', '#EDCAB1', '#3B3A37', '#5B5A55', '#DACCB8']
BG = np.array([0xEC, 0xEA, 0xE1])
rep = json.loads((WORK / 'report.json').read_text())
rows = []


def check(item, ok, detail):
    rows.append((item, ok, detail))


def box(r, dpr, pad, shape):
    h, w = shape[:2]
    x0, y0 = max(int((r['x'] - pad) * dpr), 0), max(int((r['y'] - pad) * dpr), 0)
    x1, y1 = min(int((r['x'] + r['w'] + pad) * dpr) + 1, w), min(int((r['y'] + r['h'] + pad) * dpr) + 1, h)
    return x0, y0, x1, y1


def red_mask(a):
    return (a[..., 0] > 140) & (a[..., 1] < 110) & (a[..., 2] < 100) & (a[..., 0] - a[..., 1] > 60)


for name, r in rep.items():
    if name in ('reducedMotion', 'pause'):
        continue
    dpr = r['dpr']
    shot = (WORK if r['scratch'] else ROOT / 'screenshots') / f'{name}.png'
    a = np.asarray(Image.open(shot).convert('RGB')).astype(int)
    nt = np.asarray(Image.open(WORK / f'{name}-notext.png').convert('RGB')).astype(int)

    # 文字和画面不重叠：把文字隐藏后，文字框外扩 8px 的范围里只能是墙面底色
    x0, y0, x1, y1 = box(r['sign'], dpr, 8, nt.shape)
    under = int((np.abs(nt[y0:y1, x0:x1] - BG).max(-1) > 3).sum())
    art = r['art']
    gap = round(art['y'] - (r['sign']['y'] + r['sign']['h']), 1)
    stacked = gap >= 0
    check(f'{name} 文字不压画面', under == 0,
          f'文字框下非墙面像素 {under}' + (f'，文字在插画上方，间距 {gap}px' if stacked else '，叠在墙面上'))

    # 牌匾位置：叠放时在横向 35%–60% 之间
    if not stacked:
        p = r['plaque']
        lo, hi = (p['x'] - art['x']) / art['w'] * 100, (p['x'] + p['w'] - art['x']) / art['w'] * 100
        m = r['motto']
        mlo, mhi = (m['x'] - art['x']) / art['w'] * 100, (m['x'] + m['w'] - art['x']) / art['w'] * 100
        check(f'{name} 牌匾横向位置', lo >= 35 and hi <= 60, f'牌匾 {lo:.1f}%–{hi:.1f}%，标语 {mlo:.1f}%–{mhi:.1f}%')

    # 颜色只有规定的几种（计算后的 fill）
    check(f'{name} 插画只用色板', not r['offPalette'],
          f"{len(r['fills'])} 种：" + ' '.join(f'{k}×{v}' for k, v in r['fills'].items()))

    # 红色只在录音笔：只有 1 个朱砂色元素，且截图里的红像素都落在它附近
    red_px = red_mask(a)
    rx0, ry0, rx1, ry1 = box(r['recDot'], dpr, 3, a.shape)
    inside = red_px[ry0:ry1, rx0:rx1].sum()
    outside = int(red_px.sum() - inside)
    check(f'{name} 红色只在录音笔', len(r['red']) == 1 and 'rec-dot' in r['red'][0]['cls'] and outside == 0,
          f"朱砂色元素 {[e['cls'] for e in r['red']]}，红点外的红像素 {outside}")

    # 会动的部件（纸笺、虚线、说话和落笔的短弧）在整个循环里都不碰文字框
    mo = r['motion']
    check(f'{name} 动效不碰文字', mo['hits'] == 0, f"循环内碰到文字框 {mo['hits']} 次，最近时在文字框下方 {mo['gapPx']}px")

    # 中文没有方块：实际排版字体
    fonts = [f for v in r['platformFonts'].values() for f in v]
    bad = [f for f in fonts if not any(k in f for k in ('LXGW', 'Noto', 'CJK', 'Kai', 'Song'))]
    check(f'{name} 中文字体', not bad, '；'.join(f'{k} → {"、".join(v)}' for k, v in r['platformFonts'].items()))

# 动效
d = rep['desktop-1440']['anim']
ok = (all(x.startswith('hero-breathe/2.4s/infinite') for x in d['dot'])
      and len(d['wave']) == 6 and all(x.startswith('hero-wave/1.6s/infinite') for x in d['wave'])
      and len(d['note']) == 3 and all(x.startswith('hero-fly/4.8s/infinite') for x in d['note'])
      and len(d['dash']) > 40 and all(x.startswith('hero-trail/1.6s/infinite') for x in d['dash'])
      and len(d['talk']) == 3 and len(d['scrib']) == 4
      and all(x.startswith('hero-blip/1.6s/infinite') for x in d['talk'] + d['scrib']))
check('动效', ok, f"红点 {d['dot'][0]}；声波 {len(d['wave'])} 道；纸笺 {len(d['note'])} 张 {d['note'][0]}；"
      f"虚线 {len(d['dash'])} 节；说话短弧 {len(d['talk'])} 道；落笔短线 {len(d['scrib'])} 道")

# 一个循环 12 帧：拼联系表，逐帧查红色只在录音笔
r = rep['desktop-1440']
c, dot = r['loopClip'], r['recDotLoop']
frames = [Image.open(WORK / f'loop-{i}.png').convert('RGB') for i in range(12)]
outside = []
for img in frames:
    a = np.asarray(img).astype(int)
    m = red_mask(a)
    x0, y0 = int((dot['x'] - c['x'] - 3)), int((dot['y'] - c['y'] - 3))
    x1, y1 = int((dot['x'] + dot['w'] - c['x'] + 3)) + 1, int((dot['y'] + dot['h'] - c['y'] + 3)) + 1
    outside.append(int(m.sum() - m[max(y0, 0):y1, max(x0, 0):x1].sum()))
check('循环内红色只在录音笔', not any(outside), f'12 帧红点外的红像素 {outside}')
w, h = frames[0].size
pad, cap = 12, 30
sheet = Image.new('RGB', (4 * w + 5 * pad, 3 * (h + cap) + 4 * pad + 40), '#D6D2C4')
dr = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 18, index=2)
except OSError:
    font = ImageFont.load_default()
dr.text((pad, pad), '招牌插画循环 4.8s，每 0.4s 一帧（desktop 1440，插画中段）', fill='#24231F', font=font)
for i, img in enumerate(frames):
    x, y = pad + (i % 4) * (w + pad), 40 + pad + (i // 4) * (h + cap + pad)
    sheet.paste(img, (x, y))
    dr.text((x + 2, y + h + 5), f'{i * 0.4:.1f} s', fill='#24231F', font=font)
sheet.save(ROOT / 'screenshots' / 'loop-sheet.png')

pz = rep['pause']
ok = (not pz['before']['paused'] and pz['out1']['paused'] and pz['out1']['states'] == ['paused']
      and pz['out2']['t'] == pz['out1']['t'] and not pz['back1']['paused'] and pz['back2']['states'] == ['running']
      and pz['back2']['t'] > pz['back1']['t'])
check('滚出视口暂停', ok, f"滚出后 {pz['out1']['states']}，0.6s 内纸笺时间 {pz['out1']['t']:.0f}→{pz['out2']['t']:.0f}ms；"
      f"滚回后 {pz['back2']['states']}，{pz['back1']['t']:.0f}→{pz['back2']['t']:.0f}ms")
rm = rep['reducedMotion']
check('减少动态效果', rm['running'] == 0 and set(rm['names']) == {'none'} and set(rm['hidden']) == {'0'},
      f"运行中的动画 {rm['running']} 个；只在动效里出现的 {len(rm['hidden'])} 个元素都隐藏")

# 斑点：hero.svg 里每个子路径的面积（原图像素²）
areas = []
for el in SVG.parse(str(ROOT / 'hero.svg')).elements():
    if isinstance(el, SvgPath) and 'k-ink' not in (el.values.get('class') or ''):   # 描边短弧不是色块
        for sub in el.as_subpaths():
            sp = SvgPath(sub)
            pts = [sp.point(t) for t in np.linspace(0, 1, 64)]
            xs, ys = np.array([p.x for p in pts]), np.array([p.y for p in pts])
            areas.append(abs(np.dot(xs, np.roll(ys, 1)) - np.dot(ys, np.roll(xs, 1))) / 2)
areas = np.array(areas)
check('无细碎斑点', int((areas < 4).sum()) == 0,
      f'{len(areas)} 个子路径，最小面积 {areas.min():.1f} 原图像素²，<4 的 {int((areas < 4).sum())} 个，<10 的 {int((areas < 10).sum())} 个')

size = (ROOT / 'hero.svg').stat().st_size
check('hero.svg 体积', size < 300 * 1024, f'{size / 1024:.1f} KB')

w = max(len(i) for i, _, _ in rows)
for item, ok, detail in rows:
    print(f"{'通过' if ok else '未通过'}  {item.ljust(w)}  {detail}")
print('全部通过' if all(ok for _, ok, _ in rows) else '有未通过项')
