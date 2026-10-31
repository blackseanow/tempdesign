// 入口：悬停或点按时描一圈松烟墨线、浮出毛笔字标签；点击先弹一张小卡片，说明会去哪里。
// 热区是透明的 <button>，每帧按镜头投影摆到画面里对应的物件上：键盘能 Tab 到，读屏读 aria-label。
// Tab 到画面外的入口时，镜头自动转过去。
// 彩蛋（五个抽屉、鸡汤炉）：点开时检查 anatomy/ 里对应的解剖图在不在，在就打开，不在就弹"这味药还在炮制中"。
import { rectSamples, screenBox, clamp } from './geom.js';

const NS = 'http://www.w3.org/2000/svg';
const SEGS = 12;
const figureCache = new Map();

export class Entries {
  constructor(o) {
    Object.assign(this, o);       // root, hot, ink, tags, card, viewer, scene, anchors, mock, pano, layers, reduced, isFlat, flatStrip
    this.items = new Map();
    this.state = 'locked';        // locked | recorder | free
    this.active = null;           // 悬停/聚焦中的入口
    this.cardFor = null;
    this.build();
    this.bindCard();
  }

  defs() {
    const admin = (new URLSearchParams(location.search).get('role') || this.mock.user.role) === 'admin';
    return this.scene.entries.filter(d => d.kind !== 'admin' || admin);
  }

  anchorOf(id) {
    const a = this.anchors;
    if (a.entries[id]) return a.entries[id];
    if (a.drawers[id]) return { layer: 'far', rect: a.drawers[id].rect };
    return null;
  }

  build() {
    if (!this.resizeBound) { this.resizeBound = true; addEventListener('resize', () => { this.hudDirty = true; }); }
    this.hot.textContent = '';
    this.items.clear();
    for (const def of this.defs()) {
      if (def.hud) {
        const el = document.querySelector(`[data-entry="${def.id}"]`);
        if (el) this.wire(el, def, null);
        this.items.set(def.id, { def, el, hud: true, parts: [] });
        continue;
      }
      const anchor = this.anchorOf(def.id);
      if (!anchor) continue;
      const rects = anchor.parts || [anchor.rect];
      const parts = rects.map((r, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'hot';
        b.dataset.id = def.id;
        if (i === 0) b.setAttribute('aria-label', `${def.name}：${def.label}`);
        else { b.tabIndex = -1; b.setAttribute('aria-hidden', 'true'); }
        if (this.isFlat) {
          const p = r;
          Object.assign(b.style, { left: p.x / 100 * 100 + '%', top: p.y + '%', width: p.w + '%', height: p.h + '%' });
          this.flatStrip.appendChild(b);
        } else {
          this.hot.appendChild(b);
        }
        this.wire(b, def, i);
        return { el: b, rect: r, samples: null };
      });
      this.items.set(def.id, { def, anchor, parts, pad: anchor.pad || 0 });
    }
    // 叠放次序：近层在远层上面；同一层里面积小的在上面（抽屉压在百子柜上、日历压在门帘上），小东西总能点到
    const list = [...this.items.values()].filter(it => !it.hud);
    const area = it => it.parts.reduce((a, p) => a + p.rect.w * p.rect.h, 0);
    list.sort((a, b) => (a.anchor.layer === b.anchor.layer ? area(b) - area(a) : a.anchor.layer === 'near' ? 1 : -1));
    list.forEach((it, i) => it.parts.forEach(p => { p.el.style.zIndex = String(10 + i); }));
    this.resample();
    this.applyState();
  }

  // 锚点改了（调试面板）以后重新取样
  resample() {
    const { pano, layers } = this;
    for (const it of this.items.values()) {
      if (it.hud) continue;
      const R = it.anchor.layer === 'near' ? layers.nearRadius : layers.farRadius;
      for (const p of it.parts) {
        const r = pano.pctToPx(p.rect);
        const pad = (it.pad || 0) / 100 * pano.W;
        p.samples = rectSamples(pano, { x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad }, R, 4);
      }
    }
  }

  wire(el, def, part) {
    el.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') this.hover(def.id, true); });
    el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') this.hover(def.id, false); });
    el.addEventListener('focus', () => { this.hover(def.id, true, true); if (this.onFocusEntry && part !== null) this.onFocusEntry(def.id); });
    el.addEventListener('blur', () => this.hover(def.id, false, true));
    el.addEventListener('click', e => {
      if (this.look && this.look.moved > 6) { e.preventDefault(); return; }   // 是拖动，不是点
      if (def.id === 'start') return;                                          // 直接开始把脉：直接走
      e.preventDefault();
      this.hover(def.id, true);
      this.activate(def.id, el);
    });
  }

  setState(st) { if (st !== this.state) { this.state = st; this.applyState(); } }
  applyState() {
    for (const it of this.items.values()) {
      if (it.hud) continue;
      const on = this.state === 'free' || (this.state === 'recorder' && it.def.id === 'recorder');
      for (const p of it.parts) p.el.disabled = !on;
    }
    if (this.state !== 'free' && this.active && this.active !== 'recorder') this.hover(this.active, false);
  }

  enabled(id) {
    const it = this.items.get(id);
    if (!it) return false;
    return it.hud || this.state === 'free' || (this.state === 'recorder' && id === 'recorder');
  }

  hover(id, on, focus = false) {
    if (on && !this.enabled(id)) return;
    // 伸手那一步：录音笔有自己的墨线圈和"按下录音笔"提示，不再叠一个普通的悬停标签
    if (on && id === 'recorder' && this.state === 'recorder') return;
    if (on) {
      if (this.active !== id) { this.active = id; this.activeSince = performance.now(); this.drawRing(id); }
      this.hoverFocus = focus;
    } else if (this.active === id) {
      this.active = null;
      this.hideRing();
    }
  }

  // —— 墨线圈和毛笔字标签 ——
  ringEl(key) {
    this.rings = this.rings || {};
    if (this.rings[key]) return this.rings[key];
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'ring');
    // 手绘感：半径逐段略有起伏，首尾重叠一点，线宽中间粗两头细
    for (let i = 0; i < SEGS; i++) {
      const a0 = (i / SEGS) * Math.PI * 2 - Math.PI * 0.62, a1 = ((i + 1.12) / SEGS) * Math.PI * 2 - Math.PI * 0.62;
      const r0 = 1 + 0.035 * Math.sin(i * 2.1), r1 = 1 + 0.035 * Math.sin((i + 1) * 2.1);
      const p = document.createElementNS(NS, 'path');
      const m = (a0 + a1) / 2, rm = (r0 + r1) / 2 + 0.01;
      p.setAttribute('d', `M${(Math.cos(a0) * r0).toFixed(4)} ${(Math.sin(a0) * r0).toFixed(4)} Q${(Math.cos(m) * rm * 1.02).toFixed(4)} ${(Math.sin(m) * rm * 1.02).toFixed(4)} ${(Math.cos(a1) * r1).toFixed(4)} ${(Math.sin(a1) * r1).toFixed(4)}`);
      p.setAttribute('vector-effect', 'non-scaling-stroke');
      p.style.strokeWidth = (2 + 1.6 * Math.sin(Math.PI * (i + 0.5) / SEGS)).toFixed(2) + 'px';
      p.style.transition = this.reduced ? 'opacity .15s linear' : `opacity .12s linear ${(i * 0.032).toFixed(3)}s`;
      g.appendChild(p);
    }
    this.ink.appendChild(g);
    const tag = document.createElement('div');
    tag.className = 'tag';
    tag.style.transition = this.reduced ? 'opacity .15s linear' : 'opacity .22s ease-out, transform .26s ease-out';
    this.tags.appendChild(tag);
    this.rings[key] = { g, tag, box: null };
    return this.rings[key];
  }
  drawRing(id) {
    const it = this.items.get(id);
    if (!it) return;
    const r = this.ringEl('hover');
    r.id = id;
    r.tag.innerHTML = '';
    r.tag.append(it.def.label);
    const small = document.createElement('small'); small.textContent = it.def.name; r.tag.append(small);
    r.g.classList.remove('on');
    r.tag.style.opacity = '0';
    r.tagSize = null;
    r.shownAt = performance.now();
    // 下一帧再加 on，过渡才会从 0 开始
    requestAnimationFrame(() => { if (r.id === id && this.active === id) r.g.classList.add('on'); });
  }
  hideRing() {
    const r = this.rings && this.rings.hover;
    if (!r) return;
    r.id = null;
    r.g.classList.remove('on');
    r.tag.style.opacity = '0';
  }
  placeRing(r, box, o = 1, faint = false) {
    if (!box) { r.g.style.display = 'none'; return; }
    r.g.style.display = '';
    const pad = Math.max(10, Math.min(box.w, box.h) * 0.16);
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const rx = box.w / 2 + pad, ry = box.h / 2 + pad;
    r.g.setAttribute('transform', `translate(${cx.toFixed(1)} ${cy.toFixed(1)}) scale(${rx.toFixed(1)} ${ry.toFixed(1)})`);
    r.g.style.setProperty('--o', o.toFixed(3));
    r.g.classList.toggle('faint', faint);
  }
  placeTag(r, box) {
    if (!box || !r.id) return;
    const t = r.tag;
    if (!r.tagSize) r.tagSize = [t.offsetWidth, t.offsetHeight];      // 内容变了才量一次
    const [w, h] = r.tagSize;
    const pad = Math.max(10, Math.min(box.w, box.h) * 0.16);
    let x = box.x + box.w / 2 - w / 2, y = box.y - pad - h - 8;
    // 标签不压在底部的按钮、字幕上：手机上底部留 150 px，电脑上 110 px
    const bottom = innerHeight - (innerWidth <= 640 ? 150 : 110);
    if (y < 64) y = box.y + box.h + pad + 8;
    if (y + h > bottom) y = Math.max(64, Math.min(box.y - pad - h - 8, bottom - h));
    x = clamp(x, 8, innerWidth - w - 8); y = clamp(y, 8, Math.max(8, bottom - h));
    const shown = (performance.now() - r.shownAt) > 60;
    t.style.transform = `translate(${x.toFixed(1)}px, ${(y + (shown || this.reduced ? 0 : 6)).toFixed(1)}px)`;
    if (shown) t.style.opacity = '1';
  }

  // —— 每帧：把热区摆到投影位置 ——
  update(cam, view) {
    this.view = view;
    const boxes = {};
    for (const [id, it] of this.items) {
      if (it.hud) {
        // 界面上的按钮（名章）位置只在窗口变化时量一次，不在每帧里读布局
        if (!it.box || this.hudDirty) it.box = it.el ? domBox(it.el) : null;
        boxes[id] = it.box;
        continue;
      }
      let union = null;
      for (const p of it.parts) {
        let b;
        if (this.isFlat) b = domBox(p.el);
        else {
          b = cam ? screenBox(cam, p.samples) : null;
          if (b) {
            const s = `translate(${b.x.toFixed(1)}px,${b.y.toFixed(1)}px) scale(${(b.w / 100).toFixed(4)},${(b.h / 100).toFixed(4)})`;
            if (p.lastT !== s) { p.el.style.transform = s; p.lastT = s; }
            if (p.el.dataset.off) delete p.el.dataset.off;
          } else if (!p.el.dataset.off) { p.el.dataset.off = '1'; p.el.style.transform = 'translate(-9999px,-9999px)'; }
        }
        if (b) union = union ? unionBox(union, b) : b;
      }
      boxes[id] = union;
    }
    this.boxes = boxes;
    this.hudDirty = false;
    const r = this.rings && this.rings.hover;
    if (r && r.id) { this.placeRing(r, boxes[r.id]); this.placeTag(r, boxes[r.id]); }
    if (this.cardFor && boxes[this.cardFor]) this.placeCard(boxes[this.cardFor]);
    return boxes;
  }

  // 伸手那一步：录音笔周围一圈淡淡的墨线
  cue(o, breathe) {
    const r = this.ringEl('cue');
    r.id = o > 0.001 ? 'recorder' : null;
    if (!r.id) { r.g.classList.remove('on'); return; }
    r.g.classList.add('on');
    this.placeRing(r, this.boxes && this.boxes.recorder, o * (0.38 + 0.22 * breathe), true);
  }

  // —— 点开 ——
  async activate(id, el) {
    const it = this.items.get(id);
    if (!it) return;
    const def = it.def;
    if (id === 'recorder' && this.state === 'recorder') { this.onPressRecorder && this.onPressRecorder(); return; }
    if (this.state !== 'free' && !it.hud) return;
    if (def.kind === 'egg') {
      const ok = await figureExists(def.figure);
      if (ok) { this.openViewer(def, el); return; }
      this.openCard(def, el, { egg: true });
      return;
    }
    this.openCard(def, el);
  }

  openCard(def, el, opt = {}) {
    const c = this.card;
    const kicker = c.querySelector('.card-kicker'), title = c.querySelector('.card-title'), body = c.querySelector('.card-body'), go = c.querySelector('.card-go');
    body.textContent = '';
    if (opt.egg) {
      kicker.textContent = def.name;
      title.textContent = def.label + '解剖图';
      body.append(par('这味药还在炮制中。'));
      go.setAttribute('aria-disabled', 'true');
    } else {
      kicker.textContent = def.kicker ? `${def.name} · ${def.kicker}` : def.name;
      title.textContent = def.title || def.label;
      if (def.desc) body.append(par(def.desc));
      const extra = cardData(def.data, this.mock);
      if (extra) body.append(extra);
      if (def.go) { go.textContent = def.go.label; go.href = def.go.href; go.removeAttribute('aria-disabled'); }
      else go.setAttribute('aria-disabled', 'true');
    }
    this.cardFor = def.id;
    this.cardReturn = el;
    c.hidden = false;
    c.style.transition = 'none';
    c.style.opacity = '0';
    const box = this.boxes && this.boxes[def.id];
    this.placeCard(box, true);
    requestAnimationFrame(() => {
      c.style.transition = this.reduced ? 'opacity .15s linear' : 'opacity .2s ease-out, transform .24s ease-out';
      c.style.opacity = '1';
      this.cardShown = true;
      this.placeCard(this.boxes && this.boxes[def.id]);
      (go.getAttribute('aria-disabled') === 'true' ? c.querySelector('.card-close') : go).focus({ preventScroll: true });
    });
  }
  placeCard(box, initial) {
    const c = this.card;
    if (c.hidden) return;
    const mobile = matchMedia('(max-width:640px),(pointer:coarse) and (max-width:900px)').matches;
    if (mobile) { c.style.transform = `translateY(${this.cardShown || this.reduced ? 0 : 8}px)`; return; }
    if (initial || !this.cardSize) this.cardSize = [c.offsetWidth, c.offsetHeight];
    const [w, h] = this.cardSize;
    let x, y;
    if (box) {
      x = box.x + box.w + 22;
      if (x + w > innerWidth - 16) x = box.x - w - 22;
      if (x < 16) x = clamp(box.x + box.w / 2 - w / 2, 16, innerWidth - w - 16);
      y = clamp(box.y + box.h / 2 - h / 2, 70, innerHeight - h - 90);
    } else { x = (innerWidth - w) / 2; y = (innerHeight - h) / 2; }
    c.style.transform = `translate(${x.toFixed(1)}px, ${(y + (this.cardShown || this.reduced ? 0 : 8)).toFixed(1)}px)`;
  }
  closeCard() {
    const c = this.card;
    if (c.hidden) return;
    c.hidden = true;
    this.cardShown = false;
    this.cardFor = null;
    if (this.cardReturn && document.contains(this.cardReturn)) this.cardReturn.focus({ preventScroll: true });
  }
  bindCard() {
    this.card.querySelector('.card-close').addEventListener('click', () => this.closeCard());
    this.card.querySelector('.card-go').addEventListener('click', e => {
      const href = e.currentTarget.getAttribute('href');
      if (this.onNavigate) { e.preventDefault(); this.onNavigate(href, this.cardFor); }
    });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (!this.viewer.hidden) this.closeViewer();
      else if (!this.card.hidden) this.closeCard();
    });
    document.addEventListener('pointerdown', e => {
      if (!this.card.hidden && !this.card.contains(e.target) && !e.target.closest('.hot,[data-entry]')) this.closeCard();
    });
    this.viewer.querySelector('.viewer-close').addEventListener('click', () => this.closeViewer());
  }
  openViewer(def, el) {
    this.closeCard();
    const v = this.viewer;
    v.querySelector('iframe').src = new URL(def.figure, location.href).href;
    v.querySelector('iframe').title = def.label + '解剖图';
    v.setAttribute('aria-label', def.label + '解剖图');
    v.hidden = false;
    this.viewerReturn = el;
    v.querySelector('.viewer-close').focus();
    this.onViewer && this.onViewer(true);
  }
  closeViewer() {
    const v = this.viewer;
    v.hidden = true;
    v.querySelector('iframe').src = 'about:blank';
    if (this.viewerReturn) this.viewerReturn.focus({ preventScroll: true });
    this.onViewer && this.onViewer(false);
  }

  // 给调试、截图用：某个入口当前在屏幕上的框
  boxOf(id) { return this.boxes ? this.boxes[id] : null; }
}

async function figureExists(url) {
  if (figureCache.has(url)) return figureCache.get(url);
  let ok = false;
  try {
    const res = await fetch(new URL(url, location.href), { method: 'HEAD', cache: 'no-store' });
    ok = res.ok;
  } catch (e) { ok = false; }
  figureCache.set(url, ok);
  setTimeout(() => figureCache.delete(url), 30000);   // 过一会儿再查（补上了不用刷新太久）
  return ok;
}

function domBox(el) {
  const r = el.getBoundingClientRect();
  return r.width ? { x: r.left, y: r.top, w: r.width, h: r.height, z: 0 } : null;
}
function unionBox(a, b) {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y, z: Math.min(a.z, b.z) };
}
function par(text) { const p = document.createElement('p'); p.textContent = text; return p; }
function list(rows) {
  const ul = document.createElement('ul');
  for (const [a, b] of rows) { const li = document.createElement('li'); const s1 = document.createElement('span'); s1.textContent = a; const s2 = document.createElement('span'); s2.textContent = b; li.append(s1, s2); ul.append(li); }
  return ul;
}

// 卡片里的假数据
function cardData(key, m) {
  if (!key) return null;
  const frag = document.createDocumentFragment();
  switch (key) {
    case 'lastPulse': { const d = m.lastPulse; frag.append(par(`上次把脉：${d.title}，${d.when}，录了 ${d.minutes} 分钟，记下 ${d.reqs} 条要求。`)); break; }
    case 'pending': frag.append(par(`${m.pending.length} 张方子等你签：`), list(m.pending.map(p => [p.title, `${p.reqs} 条 · ${p.when}`]))); break;
    case 'recent': frag.append(list(m.recent.map(r => [r.title, `${r.when} · ${r.note}`]))); break;
    case 'cases': frag.append(par(`共 ${m.cases.total} 个病例，本月 ${m.cases.thisMonth} 个。最近一个：${m.cases.latest}。`)); break;
    case 'treating': frag.append(par(`炉上有 ${m.treating.length} 份材料：`), list(m.treating.map(t => [t.title, `${t.type} · ${Math.round(t.progress * 100)}%`]))); break;
    case 'delivered': frag.append(list(m.delivered.map(d => [`「${d.phrase}」`, `${d.title} · ${d.when}`]))); break;
    case 'doctors': frag.append(list(m.doctors.map(d => [`${d.name}（${d.role}）`, d.habit]))); break;
    case 'followups': frag.append(list(m.followups.map(f => [f.title, `${f.due} · ${f.from}`]))); break;
    case 'formulas': frag.append(list(m.formulas.map(f => [f.title, `用过 ${f.uses} 次`]))); break;
    case 'materials': { const c = m.materialCounts; frag.append(par(`Word ${c.Word} 份、PPT ${c.PPT} 份、Excel ${c.Excel} 份。最近的：`), list(m.materials.slice(0, 3).map(f => [f.title, f.type]))); break; }
    case 'admin': { const a = m.admin; frag.append(par(`模型 ${a.models} 个、语音 ${a.voices} 套、方剂 ${a.formulas} 张、模板 ${a.templates} 个。`)); break; }
    case 'almanac': {
      const d = new Date();
      const day = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
      const a = m.almanac[day % m.almanac.length];
      const g = document.createElement('div'); g.className = 'yiji';
      const b1 = document.createElement('b'); b1.textContent = '宜';
      const b2 = document.createElement('b'); b2.textContent = '忌'; b2.className = 'ji';
      const s1 = document.createElement('span'); s1.textContent = a.yi;
      const s2 = document.createElement('span'); s2.textContent = a.ji;
      g.append(b1, s1, b2, s2);
      frag.append(par(`${d.getMonth() + 1}月${d.getDate()}日`), g);
      break;
    }
    case 'user': { const u = m.user; frag.append(par(`${u.name} · ${u.dept}${u.role === 'admin' ? ' · 管理员' : ''}`), par(`${u.since}起在医馆坐诊。`)); break; }
    default: return null;
  }
  return frag;
}
