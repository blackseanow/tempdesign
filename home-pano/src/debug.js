// ?debug=1：把 anchors.json 里的锚点都画在画面上，方便手动微调。
// 点选一个框 → 拖动它，或按方向键（每次 0.05%，按住 Shift 是 0.5%），右下角面板里是数值；
// 改完点「复制 JSON」，整段贴回 anchors.json。画面上的字、热区、挂钟会跟着变。
import { makeCamera, screenBox, rectSamples, panoTo3, screenToPano } from './geom.js';

export function startDebug({ api, anchors, pano, scene, host, entries }) {
  const layer = document.createElement('div');
  layer.style.cssText = 'position:fixed;inset:0;z-index:25;pointer-events:none';
  document.body.appendChild(layer);
  const panel = document.createElement('div');
  panel.className = 'dbg-panel';
  panel.innerHTML = '<b>锚点调试</b>（点框选中，拖动或方向键微调）<div class="dbg-read"></div><div class="dbg-sel">没选中</div><button type="button" data-copy>复制 JSON</button><button type="button" data-hide>隐藏框</button><pre class="dbg-out" hidden></pre>';
  document.body.appendChild(panel);
  const read = panel.querySelector('.dbg-read'), selEl = panel.querySelector('.dbg-sel'), out = panel.querySelector('.dbg-out');

  // 收集所有锚点：[路径, 对象, 层, 类型]
  const items = [];
  const add = (path, obj, lay, kind) => items.push({ path, obj, layer: lay || 'far', kind });
  for (const [k, v] of Object.entries(anchors.entries)) { add(`entries.${k}.rect`, v.rect, v.layer, 'rect'); (v.parts || []).forEach((p, i) => add(`entries.${k}.parts[${i}]`, p, v.layer, 'rect')); }
  for (const [k, v] of Object.entries(anchors.drawers)) { add(`drawers.${k}.rect`, v.rect, 'far', 'rect'); add(`drawers.${k}.label`, v.label, 'far', 'rect'); }
  for (const [k, v] of Object.entries(anchors.texts)) { if (Array.isArray(v)) v.forEach((x, i) => add(`texts.${k}[${i}]`, x.rect, x.layer, 'rect')); else add(`texts.${k}`, v.rect, v.layer, 'rect'); }
  for (const [k, v] of Object.entries(anchors.points)) add(`points.${k}`, v, v.layer, 'point');
  for (const [k, v] of Object.entries(anchors.fx)) { add(`fx.${k}.rect`, v.rect, v.layer, 'rect'); if (v.steam) add(`fx.${k}.steam`, v.steam, v.layer, 'point'); }

  let sel = null, visible = true, drag = null, dirty = 0;
  for (const it of items) {
    const el = document.createElement('div');
    el.className = it.kind === 'point' ? 'dbg-box dbg-dot' : 'dbg-box';
    if (it.layer === 'near') el.classList.add('near');
    if (it.kind !== 'point') { const s = document.createElement('span'); s.textContent = it.path.replace(/\.rect$/, ''); el.appendChild(s); }
    el.title = it.path;
    el.addEventListener('pointerdown', e => {
      e.stopPropagation(); e.preventDefault();
      select(it);
      const cam = currentCam();
      const p0 = screenToPano(pano, cam, e.clientX, e.clientY, radius(it));
      drag = { it, p0, x: it.obj.x, y: it.obj.y };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', e => {
      if (!drag || drag.it !== it) return;
      const p = screenToPano(pano, currentCam(), e.clientX, e.clientY, radius(it));
      if (!p || !drag.p0) return;
      it.obj.x = round(drag.x + (p.u - drag.p0.u) / pano.W * 100);
      it.obj.y = round(drag.y + (p.v - drag.p0.v) / pano.H * 100);
      changed();
    });
    el.addEventListener('pointerup', () => { drag = null; });
    it.el = el;
    layer.appendChild(el);
  }
  function radius(it) { return it.layer === 'near' ? scene.layers.nearRadius : scene.layers.farRadius; }
  function round(v) { return Math.round(v * 1000) / 1000; }
  function currentCam() { return makeCamera(api.state().pose, innerWidth, innerHeight); }
  function select(it) {
    if (sel) sel.el.classList.remove('sel');
    sel = it; it.el.classList.add('sel');
    selEl.textContent = `${it.path}\n${JSON.stringify(it.obj)}`;
  }
  function changed() {
    selEl.textContent = `${sel.path}\n${JSON.stringify(sel.obj)}`;
    entries.resample();
    dirty = performance.now();
  }
  addEventListener('keydown', e => {
    if (!sel || !e.key.startsWith('Arrow')) return;
    e.preventDefault(); e.stopPropagation();
    const d = e.shiftKey ? 0.5 : 0.05;
    if (e.key === 'ArrowLeft') sel.obj.x = round(sel.obj.x - d);
    if (e.key === 'ArrowRight') sel.obj.x = round(sel.obj.x + d);
    if (e.key === 'ArrowUp') sel.obj.y = round(sel.obj.y - d);
    if (e.key === 'ArrowDown') sel.obj.y = round(sel.obj.y + d);
    changed();
  }, true);
  panel.querySelector('[data-copy]').addEventListener('click', async () => {
    const text = JSON.stringify(anchors, null, 2);
    try { await navigator.clipboard.writeText(text); panel.querySelector('[data-copy]').textContent = '已复制'; }
    catch (e) { out.hidden = false; out.textContent = text; }
  });
  panel.querySelector('[data-hide]').addEventListener('click', e => { visible = !visible; layer.style.display = visible ? '' : 'none'; e.target.textContent = visible ? '隐藏框' : '显示框'; });
  addEventListener('pointermove', e => {
    const cam = currentCam();
    const f = screenToPano(pano, cam, e.clientX, e.clientY, scene.layers.farRadius);
    const n = screenToPano(pano, cam, e.clientX, e.clientY, scene.layers.nearRadius);
    const fmt = p => p ? `${(p.u / pano.W * 100).toFixed(2)}%, ${(p.v / pano.H * 100).toFixed(2)}%` : '—';
    read.textContent = `指针：远层 ${fmt(f)}　近层 ${fmt(n)}`;
  });
  function tick() {
    requestAnimationFrame(tick);
    if (!visible) return;
    const cam = currentCam();
    for (const it of items) {
      const R = radius(it);
      let b;
      if (it.kind === 'point') {
        const s = cam.project(panoTo3(pano, it.obj.x / 100 * pano.W, it.obj.y / 100 * pano.H, R));
        b = s ? { x: s[0], y: s[1], w: 0, h: 0 } : null;
      } else b = screenBox(cam, rectSamples(pano, pano.pctToPx(it.obj), R, 3));
      if (!b) { it.el.style.display = 'none'; continue; }
      it.el.style.display = '';
      it.el.style.transform = `translate(${b.x.toFixed(1)}px,${b.y.toFixed(1)}px)`;
      if (it.kind !== 'point') { it.el.style.width = b.w.toFixed(1) + 'px'; it.el.style.height = b.h.toFixed(1) + 'px'; }
    }
    if (dirty && performance.now() - dirty > 150) { dirty = 0; const h = host(); if (h) h.setAnchors(anchors); }
  }
  tick();
  api.debug = { items };
}
