#!/usr/bin/env python3
"""Deterministic geometric marks + fontTools-derived wordmark paths."""
from pathlib import Path
import json, math
from xml.sax.saxutils import escape
ROOT=Path(__file__).resolve().parents[1]
C={'red':'#B5382A','sheet':'#F8F7F2','ink':'#24231F','blue':'#1F3A4D','paper':'#ECEAE1'}
GLYPHS=json.loads((ROOT/'fonts/glyphs.json').read_text())
if 'glyphs' in GLYPHS: GLYPHS=GLYPHS['glyphs']
NAMES={'A1':'三指按脉 · 稳按','A2':'三指按脉 · 轻搭','B1':'寸关尺 · 三点轻落','B2':'寸关尺 · 随脉而落','C1':'一笔搭脉 · 回锋','C2':'一笔搭脉 · 连绵'}

def finger(x,y,length,width,angle):
    r=width/2
    return f'<path transform="translate({x} {y}) rotate({angle})" d="M{-r} 0 Q0 -1.4 {r} 0 L{r} {length} C{r} {length+r*.6} {r*.55} {length+r} 0 {length+r} C{-r*.55} {length+r} {-r} {length+r*.6} {-r} {length}Z"/>'

def line(d,w=5.7):
    return f'<path d="{d}" fill="none" stroke="currentColor" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>'

def brush(start, start_width, segments):
    """Expand one continuous cubic pen gesture into one variable-width outline.

    The pen is heavier on the three fingertip downstrokes and lighter on returns.
    Sampling only expands prescribed cubic geometry; no raster tracing is used.
    """
    points=[]; widths=[]; p0=start; w0=start_width
    for p1,p2,p3,w1 in segments:
        for j in range(32):
            t=j/32; u=1-t
            points.append((u*u*u*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p3[0],u*u*u*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p3[1]))
            widths.append(w0+(w1-w0)*(t*t*(3-2*t)))
        p0=p3; w0=w1
    points.append(p0); widths.append(w0)
    left=[]; right=[]; angles=[]
    for i,((x,y),w) in enumerate(zip(points,widths)):
        a=points[max(0,i-1)]; b=points[min(len(points)-1,i+1)]
        angle=math.atan2(b[1]-a[1],b[0]-a[0]); angles.append(angle)
        nx=-math.sin(angle)*w/2; ny=math.cos(angle)*w/2
        left.append((x+nx,y+ny)); right.append((x-nx,y-ny))
    # Round the exposed start and finish of the single brushstroke.
    end=points[-1]; r=widths[-1]/2; a=angles[-1]+math.pi/2
    endcap=[(end[0]+r*math.cos(a-j*math.pi/12),end[1]+r*math.sin(a-j*math.pi/12)) for j in range(1,12)]
    first=points[0]; r=widths[0]/2; a=angles[0]-math.pi/2
    startcap=[(first[0]+r*math.cos(a-j*math.pi/12),first[1]+r*math.sin(a-j*math.pi/12)) for j in range(1,12)]
    polygon=left+endcap+right[::-1]+startcap
    d='M'+' L'.join(f'{x:.3f} {y:.3f}' for x,y in polygon)+' Z'
    return f'<path d="{d}"/>'

PULSE='M13 71 C20 72 21 64.5 28 64.5 C34 64.5 34 71 37 71 C40 71 40 68 45 68 C52 68 54 73 59 73 C64 73 65 67 71 67 C78 67 82 74 88 70'

def geometry(id):
    if id=='A1':
        return finger(42,28,30,13,23)+finger(64,20,42,14,23)+finger(85,31,30,12.5,23)+line(PULSE)
    if id=='A2':
        return finger(44,29,26,14,32)+finger(72,21,39,15,32)+finger(87,31,27,13.5,32)+line('M12 67 C20 69 20 60 27 60 C33 60 34 68 38 68 C42 68 42 63.4 47 63.4 C54 63.4 54 71 59 71 C64 71 63 62.6 69 62.6 C76 62.6 82 71 89 67',6)
    if id in ('B1','B2'):
        points=[(29,47,8,11.5,25),(50,50,8.5,12,25),(72,48,8,11.5,25)] if id=='B1' else [(28,45,8.2,11.3,33),(49,49,9,12.2,33),(72,46,8.2,11.3,33)]
        ell=''.join(f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" transform="rotate({a} {x} {y})"/>' for x,y,rx,ry,a in points)
        d='M13 64 C20 65 21 60 27 60 C34 60 35 66 39 66 C43 66 43 63 48 63 C55 63 57 67 62 67 C66 67 65 61 70 61 C78 61 81 67 87 64' if id=='B1' else 'M12 63 C19 65 20 58 26 58 C33 58 34 66 39 66 C43 66 42 63 47 63 C54 63 56 68 61 68 C66 68 65 59 70 59 C78 59 81 67 89 63'
        return ell+line(d,6)
    if id=='C1':
        return brush((41,33),4,[
            ((38,37),(27,46),(27,53),8),
            ((26,61),(32,63),(37,57),7),
            ((42,51),(49,32),(55,29),3),
            ((60,27),(63,32),(59,39),3),
            ((54,47),(44,55),(45,62),9),
            ((45,68),(51,69),(56,62),7),
            ((61,55),(66,43),(72,42),3),
            ((78,40),(79,44),(75,50),4),
            ((72,55),(66,60),(67,65),8),
            ((68,70),(76,71),(76,76),5),
            ((75,81),(65,74),(55,76),6),
            ((44,81),(41,80),(32,77),5),
            ((24,73),(20,75),(13,76),2.3),
        ])
    return brush((42,32),3.5,[
        ((35,41),(25,46),(26,54),8.5),
        ((27,62),(33,62),(38,55),7),
        ((43,49),(48,41),(52,40),3),
        ((58,39),(57,43),(53,48),3.2),
        ((49,53),(42,59),(45,64),9.5),
        ((48,70),(54,65),(57,59),7),
        ((61,53),(66,47),(71,47),3),
        ((76,47),(73,52),(70,56),3.5),
        ((66,61),(63,66),(70,69),8),
        ((74,71),(78,74),(76,77),4),
        ((72,79),(60,77),(53,79),6),
        ((42,82),(37,77),(30,76),4),
        ((23,74),(18,75),(12,76),1.8),
    ])

def micro_geometry(id):
    # A continuous pressure-modulated gesture: three broad pads joined by a
    # thin pulse. This is a deliberately redrawn optical size, not a scale-down.
    if id=='C1':
        return brush((13,66),3.8,[
            ((20,67),(20,50),(27,49),16),
            ((34,48),(33,64),(39,65),4),
            ((45,66),(43,53),(49,52),17),
            ((55,51),(55,67),(61,67),4),
            ((67,68),(65,51),(72,50),16),
            ((79,49),(80,65),(87,63),3.8),
        ])
    return brush((12,65),3.8,[
        ((19,65),(19,47),(27,47),16),
        ((35,47),(33,64),(39,65),3.4),
        ((45,66),(43,50),(49,49),17),
        ((55,48),(55,67),(61,67),3.4),
        ((67,67),(66,50),(73,49),16),
        ((80,48),(80,65),(88,62),3.8),
    ])

def mark(id,mode,adaptive=False,micro=False):
    seal=C['red'] if mode=='color' else C['ink'] if mode=='ink' else C['sheet']
    symbol=C['sheet'] if mode!='reverse' else C['blue']
    artwork=micro_geometry(id) if micro else geometry(id)
    if adaptive and id.startswith('C'):
        artwork=f'<style>.micro{{display:none}}@media(max-width:24px){{.regular{{display:none}}.micro{{display:inline}}}}</style><g class="regular">{geometry(id)}</g><g class="micro">{micro_geometry(id)}</g>'
    return f'<rect width="100" height="100" rx="2.5" fill="{seal}"/><g fill="{symbol}" color="{symbol}">{artwork}</g>'

def word(x,baseline,size,fill,vertical=False,step=None):
    out=[]
    for i,ch in enumerate('咸鱼把脉了'):
        g=GLYPHS[ch]; scale=size/g['unitsPerEm']
        xx=x if vertical else x+i*(step or size*1.12)
        yy=baseline+i*(step or size*1.25) if vertical else baseline
        out.append(f'<path fill="{fill}" transform="translate({xx:g} {yy:g}) scale({scale:g} {-scale:g})" d="{g["path"]}"/>')
    return ''.join(out)

def svg(id,mode,layout,micro=False):
    name=NAMES[id]; reverse=mode=='reverse'; textcolor=C['sheet'] if reverse else C['ink']
    if layout=='mark':
        w=h=100; body=mark(id,mode,adaptive=not micro,micro=micro)
    elif layout=='horizontal':
        w,h=550,120
        body=f'<g transform="translate(10 10)">{mark(id,mode)}</g>'+word(140,80,68,textcolor,step=84)
    else:
        w,h=64,264
        body=f'<rect width="64" height="264" fill="{C["sheet"]}"/><rect x="4.5" y="4.5" width="55" height="255" fill="none" stroke="{C["ink"]}" stroke-width="1"/>'+word(17,39,30,C['ink'],True,35)
        body+=f'<g transform="translate(10 204) scale(.44)">{mark(id,"ink" if mode=="ink" else "color")}</g>'
        if reverse:
            body=f'<rect width="64" height="264" fill="{C["blue"]}"/><rect x="4.5" y="4.5" width="55" height="255" fill="none" stroke="{C["sheet"]}" stroke-width="1"/>'+word(17,39,30,C['sheet'],True,35)+f'<g transform="translate(10 204) scale(.44)">{mark(id,mode)}</g>'
    bg=f'<rect width="{w}" height="{h}" fill="{C["blue"]}"/>' if reverse else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-labelledby="title"><title id="title">咸鱼把脉了 — {id} {escape(name)} — {layout} {mode}</title>{bg}{body}</svg>\n'

for id in NAMES:
    dest=ROOT/'candidates'/id; dest.mkdir(parents=True,exist_ok=True)
    for layout in ('mark','horizontal','vertical'):
        for mode in ('color','ink','reverse'):
            (dest/f'{layout}-{mode}.svg').write_text(svg(id,mode,layout))
    if id.startswith('C'):
        for mode in ('color','ink','reverse'):
            (dest/f'mark-micro-{mode}.svg').write_text(svg(id,mode,'mark',micro=True))
(ROOT/'candidates/manifest.json').write_text(json.dumps({'brand':'咸鱼把脉了','palette':C,'candidates':NAMES,'layouts':['mark','horizontal','vertical'],'modes':['color','ink','reverse'],'sizes':[16,32,64,180],'opticalSizes':{'candidates':['C1','C2'],'maxWidth':24,'fixedFiles':'mark-micro-{mode}.svg'}},ensure_ascii=False,indent=2)+'\n')
print('Built 54 primary + 6 fixed optical SVGs; wordmarks contain only glyph paths.')
