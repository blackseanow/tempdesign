// 半全景的 Three.js 渲染核心。默认跑在 Worker 里（OffscreenCanvas），主线程不碰 WebGL：
// 建上下文、编译着色器、解码和上传贴图都不会在主线程上形成长任务。浏览器不支持时，同一份代码在主线程上跑。
//
// 场景（都以眼睛为圆心）
//   远层：空房间，贴在半径 farRadius 的圆柱面上；±90° 以外接两段渐暗的"肩"，顶上一块天花板
//   近层：领导、椅子、诊桌、桌上物件、两只手，贴在半径 nearRadius 的圆柱面上（转头时比远层多移动一点）
//   贴字：五个抽屉标签、横匾（"今天把脉了吗？"）……用霞鹜文楷画在小块圆柱面上
//   特效：挂钟指针、声浪、六个道具、飘过的三句话
import * as THREE from '../../vendor/three.pano.min.js';
import { makePano, panoTo3, DEG, span, easeIn, easeOut, easeInOut, lerp, hash } from '../geom.js';
import * as C from '../choreo.js';
import { textCanvas, FONT_KAI } from './text.js';
import * as details from './details.js';

const INK = '#24231F', SHEET = '#F8F7F2', PAPER = '#ECEAE1', INDIGO = '#1F3A4D', GOLD = '#C9A86A';

export async function createCore(canvas, init, env) {
  const { scene: cfg, anchors, manifest } = init;
  const pano = makePano(manifest.pano);
  const Rf = cfg.layers.farRadius, Rn = cfg.layers.nearRadius;
  const base = init.baseUrl;
  const reduced = !!init.reduced;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!init.preserve });
  renderer.setPixelRatio(init.dpr);
  renderer.setSize(init.w, init.h, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(new THREE.Color(manifest.far.ceilingColor || PAPER), 1);
  const gl = renderer.getContext();
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, init.w / init.h, 0.03, 40);
  camera.rotation.order = 'YXZ';

  const groups = { far: new THREE.Group(), near: new THREE.Group(), decal: new THREE.Group(), fx: new THREE.Group() };
  for (const g of Object.values(groups)) scene.add(g);

  // —— 工具 ——
  const px = p => pano.pctToPx(p);
  function cylGeometry(R, u0, u1, v0, v1, segPerDeg = 0.5) {
    const deg = Math.abs(pano.yawOf(u1) - pano.yawOf(u0)) / DEG;
    const n = Math.max(1, Math.ceil(deg * segPerDeg));
    const pos = new Float32Array((n + 1) * 2 * 3), uv = new Float32Array((n + 1) * 2 * 2), idx = [];
    for (let i = 0; i <= n; i++) {
      const u = u0 + (u1 - u0) * i / n;
      const a = panoTo3(pano, u, v0, R), b = panoTo3(pano, u, v1, R);
      pos.set(a, i * 6); pos.set(b, i * 6 + 3);
      uv.set([i / n, 0, i / n, 1], i * 4);
      if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 3, k, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }
  // 所有贴图都不翻转（ImageBitmap 在 WebGL 里本来就不认 flipY），几何体那边把 v 翻过来：uv.y = 0 是图的第一行
  function texFrom(source, opts = {}) {
    const t = new THREE.Texture(source);
    t.flipY = false;
    t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = opts.mip !== false;
    t.minFilter = t.generateMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
    return t;
  }
  function material(map, opts = {}) {
    return new THREE.MeshBasicMaterial({ map, transparent: true, opacity: opts.opacity ?? 1, depthWrite: opts.depthWrite ?? false, depthTest: opts.depthTest ?? true, side: THREE.DoubleSide, blending: opts.blending ?? THREE.NormalBlending, toneMapped: false });
  }
  // 1 × 1 的四边形，中心在原点，uv 按"第一行在上"
  function quad(w = 1, h = 1) {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    return g;
  }
  async function bitmap(url) {
    const res = await env.fetch(new URL(url, base));
    if (!res.ok) throw new Error(url + ' ' + res.status);
    const blob = await res.blob();
    return env.createImageBitmap(blob, { premultiplyAlpha: 'premultiply', colorSpaceConversion: 'none' });
  }

  // —— 远层、近层的贴图块 ——
  const tileMeshes = { far: new Map(), near: new Map() };
  async function loadLevel(level, fade) {
    const jobs = [];
    for (const layer of ['far', 'near']) {
      const L = manifest[layer][String(level)];
      if (!L) continue;
      const R = layer === 'far' ? Rf : Rn;
      L.tiles.forEach((row, r) => row.forEach((tile, c) => {
        if (!tile) return;
        jobs.push(async () => {
          const bmp = await bitmap('img/tiles/' + tile.file);
          const tex = texFrom(bmp, { mip: level > 1 });
          renderer.initTexture(tex);
          const [x0, y0, x1, y1] = tile.box;
          const g = cylGeometry(R, x0 / level, x1 / level, y0 / level, y1 / level, level > 1 ? 0.6 : 0.5);
          const m = new THREE.Mesh(g, material(tex, { opacity: fade ? 0 : 1, depthWrite: layer === 'far' }));
          m.renderOrder = (layer === 'far' ? 0 : 10) + (fade ? 1 : 0);
          m.userData = { level, born: fade ? clock.now : -99, key: `${c}-${r}` };
          groups[layer].add(m);
          const key = `${c}:${r}:${level}`;
          tileMeshes[layer].set(key, m);
        });
      }));
    }
    // 一块一块来，中间让出事件循环（Worker 里也不霸占，主线程的帧消息能插进来）
    for (const job of jobs) { await job(); await env.idle(); }
  }
  // 高清块全部淡入完以后，把小图块拿掉（省显存）
  function retireOld() {
    for (const layer of ['far', 'near']) {
      const g = groups[layer];
      for (const m of [...g.children]) {
        if (m.userData.level === 1) { g.remove(m); m.geometry.dispose(); m.material.map.dispose(); m.material.dispose(); }
      }
    }
  }

  // —— 身后两段"肩"：画面最外几列往外拉，渐暗 ——
  async function loadShoulders() {
    const H = manifest.far['1'].size[1];
    const shoulderDeg = cfg.layers.shoulderDeg ?? 45;
    for (const side of ['l', 'r']) {
      const bmp = await bitmap('img/tiles/' + manifest.far['shoulder-' + side].file);
      const tex = texFrom(bmp, { mip: false });
      const du = shoulderDeg * DEG * pano.k;
      const g = side === 'l' ? cylGeometry(Rf, -du, 0, 0, H, 0.3) : cylGeometry(Rf, pano.W, pano.W + du, 0, H, 0.3);
      const m = new THREE.Mesh(g, material(tex, { depthWrite: true }));
      m.renderOrder = -1;
      groups.far.add(m);
    }
  }

  // —— 天花板：画面顶边以上，一块平的天花板，几根椽子 ——
  function buildCeiling() {
    const y = pano.heightOf(0, Rf) - 0.002;
    const size = 1024;
    const cv = new env.OffscreenCanvas(size, size);
    const g = cv.getContext('2d');
    g.fillStyle = manifest.far.ceilingColor || '#e1cfba';
    g.fillRect(0, 0, size, size);
    // 椽子：前后方向，等距；颜色用松烟墨压淡
    g.globalAlpha = 0.22;
    g.fillStyle = INK;
    const half = Rf * 1.05, toPx = v => (v + half) / (2 * half) * size;
    for (let x = -half; x <= half; x += 0.62) g.fillRect(toPx(x) - 6, 0, 12, size);
    g.globalAlpha = 0.12;
    for (let z = -half; z <= half; z += 1.9) g.fillRect(0, toPx(z) - 10, size, 20);
    g.globalAlpha = 1;
    const tex = texFrom(cv, { mip: true });
    const geo = quad(2 * half, 2 * half);
    geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, material(tex, { depthWrite: true }));
    m.position.y = y;
    m.renderOrder = -2;
    groups.far.add(m);
  }

  // —— 贴在圆柱面上的字（横匾、抽屉标签……）——
  const decals = {};
  function addDecal(id, rect, layer, drawFn, opts = {}) {
    const r = px(rect);
    const R = (layer === 'near' ? Rn : Rf) - (opts.lift ?? 0.004);
    const scale = opts.res ?? 4;
    const cw = Math.max(8, Math.round(r.w * scale)), ch = Math.max(8, Math.round(r.h * scale));
    const cv = new env.OffscreenCanvas(cw, ch);
    drawFn(cv.getContext('2d'), cw, ch);
    const tex = texFrom(cv, { mip: true });
    const m = new THREE.Mesh(cylGeometry(R, r.x, r.x + r.w, r.y, r.y + r.h, 2), material(tex, { opacity: opts.opacity ?? 1 }));
    m.renderOrder = layer === 'near' ? 15 : 5;
    groups.decal.add(m);
    decals[id] = { mesh: m, rect, layer, drawFn, opts };
    return m;
  }

  function buildDecals() {
    for (const d of Object.values(decals)) { groups.decal.remove(d.mesh); d.mesh.geometry.dispose(); d.mesh.material.map.dispose(); }
    for (const k of Object.keys(decals)) delete decals[k];
    // 五个彩蛋抽屉的标签
    for (const [id, d] of Object.entries(anchors.drawers)) {
      addDecal('drawer-' + id, d.label, 'far', (g, w, h) => {
        textCanvas(g, w, h, d.text, { family: FONT_KAI, color: INK, size: h * 0.66, weight: 400 });
      }, { res: 5 });
    }
    // 横匾：落定时浮现
    addDecal('plaque', anchors.texts.plaque, 'far', (g, w, h) => {
      textCanvas(g, w, h, cfg.text.plaque, { family: FONT_KAI, color: INK, size: h * 0.72, weight: 400, tracking: 0.12 });
    }, { res: 5, opacity: 0 });
    details.build({ addDecal, anchors, cfg, textCanvas, FONT_KAI });
  }

  // —— 挂钟指针 ——
  const clockGroup = new THREE.Group();
  const hands = {};
  function buildClock() {
    const c = anchors.points.clock;
    const u = c.x / 100 * pano.W, v = c.y / 100 * pano.H;
    const rpx = c.r / 100 * pano.W;
    const rM = rpx / pano.k * Rf;                          // 钟面半径（米）
    const p = panoTo3(pano, u, v, Rf - 0.006);
    clockGroup.position.set(...p);
    clockGroup.rotation.y = -pano.yawOf(u);
    groups.decal.add(clockGroup);
    const mk = (len, width, key) => {
      const cv = new env.OffscreenCanvas(32, 256);
      const g = cv.getContext('2d');
      g.fillStyle = INK;
      g.beginPath();                                       // 头尖、根粗的指针，根部留一小截过中心
      g.moveTo(16, 4); g.lineTo(26, 220); g.lineTo(16, 252); g.lineTo(6, 220); g.closePath(); g.fill();
      const geo = quad(width, len);
      geo.translate(0, len / 2 - len * 0.12, 0);
      const m = new THREE.Mesh(geo, material(texFrom(cv, { mip: true })));
      m.renderOrder = 6;
      clockGroup.add(m);
      hands[key] = m;
    };
    mk(rM * 0.56, rM * 0.13, 'hour');
    mk(rM * 0.82, rM * 0.09, 'minute');
    // 中心的钉
    const cv = new env.OffscreenCanvas(32, 32);
    const g = cv.getContext('2d');
    g.fillStyle = INK; g.beginPath(); g.arc(16, 16, 14, 0, Math.PI * 2); g.fill();
    const cap = new THREE.Mesh(quad(rM * 0.12, rM * 0.12), material(texFrom(cv, { mip: false })));
    cap.position.z = 0.001; cap.renderOrder = 7;
    clockGroup.add(cap);
  }

  // —— 特效：声浪、道具、飘字 ——
  const fx = { waves: [], props: {}, phrases: [] };
  function ringTexture() {
    const s = 256, cv = new env.OffscreenCanvas(s, s), g = cv.getContext('2d');
    g.strokeStyle = INK; g.lineCap = 'round';
    // 一圈带笔触粗细变化的墨线：分 48 段，线宽沿圆周起伏，像毛笔转一圈
    for (let i = 0; i < 48; i++) {
      const a0 = i / 48 * Math.PI * 2, a1 = (i + 1.15) / 48 * Math.PI * 2;
      g.lineWidth = 3 + 4.5 * (0.5 + 0.5 * Math.sin(i / 48 * Math.PI * 2 * 2 + 1));
      g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 10, a0, a1); g.stroke();
    }
    return texFrom(cv, { mip: true });
  }
  function buildFx(icons) {
    const ring = ringTexture();
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(quad(), material(ring, { opacity: 0, depthTest: false }));
      m.renderOrder = 30; m.visible = false;
      groups.fx.add(m); fx.waves.push(m);
    }
    for (const id of C.PROP_IDS) {
      const src = icons[id];
      const tex = src ? texFrom(src, { mip: true }) : null;
      const m = new THREE.Mesh(quad(), material(tex, { opacity: 0, depthTest: false }));
      m.renderOrder = 40; m.visible = false;
      groups.fx.add(m); fx.props[id] = m;
    }
    const phraseTex = C.PHRASES.map(text => {
      const w = 1024, h = 192, cv = new env.OffscreenCanvas(w, h), g = cv.getContext('2d');
      g.font = `400 ${Math.round(h * 0.42)}px ${FONT_KAI}`;
      const tw = Math.min(w - 40, g.measureText(text).width + 90);
      g.fillStyle = SHEET; g.globalAlpha = 0.9;
      roundRect(g, (w - tw) / 2, h * 0.16, tw, h * 0.68, h * 0.12); g.fill();
      g.globalAlpha = 1; g.strokeStyle = INK; g.lineWidth = 3;
      roundRect(g, (w - tw) / 2, h * 0.16, tw, h * 0.68, h * 0.12); g.stroke();
      textCanvas(g, w, h, text, { family: FONT_KAI, color: INK, size: h * 0.42, clear: false });
      return { tex: texFrom(cv, { mip: true }), aspect: w / h };
    });
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(quad(), material(null, { opacity: 0, depthTest: false }));
      m.renderOrder = 35; m.visible = false;
      groups.fx.add(m); fx.phrases.push(m);
    }
    fx.phraseTex = phraseTex;
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  // 几个三维位置
  function anchor3(p, layer, lift = 0) {
    const R = (layer === 'near' ? Rn : Rf) - lift;
    return new THREE.Vector3(...panoTo3(pano, p.x / 100 * pano.W, p.y / 100 * pano.H, R));
  }
  const mouth3 = () => anchor3(anchors.points.mouth, 'near', 0.03);
  const recTop3 = () => anchor3(anchors.points.recorderTop, 'near', 0.02);
  // 道具停的位置：按坐定时的视野（正前方、俯 neutralPitch）取屏幕上的相对位置，再放到 0.8 米左右的深度
  const SLOTS = [[-0.62, 0.46, 0.92], [0.6, 0.5, 0.92], [-0.8, -0.02, 0.82], [0.8, 0.04, 0.82], [-0.36, 0.78, 0.98], [0.34, 0.8, 0.98]];
  function viewPoint(nx, ny, dist) {
    const fov = state.fov * DEG, asp = state.aspect;
    const t = Math.tan(fov / 2);
    const dir = new THREE.Vector3(nx * t * asp * 0.92, ny * t * 0.9, -1).normalize();
    dir.applyEuler(new THREE.Euler(cfg.camera.neutralPitch * DEG, 0, 0, 'YXZ'));
    return dir.multiplyScalar(dist);
  }
  function slot3(k) {
    const [nx, ny, dist] = SLOTS[k];
    const fov = state.fov * DEG, asp = state.aspect;
    const t = Math.tan(fov / 2);
    const dir = new THREE.Vector3(nx * t * asp * 0.92, ny * t * 0.9, -1).normalize();
    dir.applyEuler(new THREE.Euler(cfg.camera.neutralPitch * DEG, 0, 0, 'YXZ'));
    return dir.multiplyScalar(dist);
  }
  const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, 1);
  function billboard(m, pos, size, aspect = 1, spin = 0, flip = 1) {
    m.position.copy(pos);
    m.quaternion.copy(camera.quaternion);
    if (spin) m.quaternion.multiply(_q.setFromAxisAngle(_z, spin));
    m.scale.set(size * aspect * flip, size, 1);
  }
  function bez(a, c, b, t, out) {
    const u = 1 - t;
    return out.set(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y, u * u * a.z + 2 * u * t * c.z + t * t * b.z);
  }

  function updateFx(s, amb) {
    const M = mouth3(), Rt = recTop3();
    // 声浪：从嘴边朝镜头飞来、变大、变淡；反转时掉头吸进录音笔
    const ws = C.waves(s);
    const eye = new THREE.Vector3(0, -0.04, -0.38);
    fx.waves.forEach((m, i) => {
      const w = ws[i];
      if (!w) { m.visible = false; return; }
      const pOut = t => _v.copy(M).lerp(eye, easeOut(t * 0.92));
      const sizeOut = t => lerp(0.05, 0.42, easeOut(t));
      const alphaOut = t => span(t, 0, 0.12) * (1 - span(t, 0.55, 1)) * 0.5;
      if (w.phase === 'out') {
        billboard(m, pOut(w.p), sizeOut(w.p));
        m.material.opacity = alphaOut(w.p);
      } else {
        const start = pOut(w.p).clone();
        const ctrl = start.clone().lerp(Rt, 0.4).add(new THREE.Vector3(0, 0.18, 0));
        const q = easeIn(w.q);
        billboard(m, bez(start, ctrl, Rt, q, _v), lerp(sizeOut(w.p), 0.015, q), 1, (1 - q) * Math.PI * 0.6);
        m.material.opacity = Math.max(alphaOut(w.p), 0.28) * (1 - span(w.q, 0.75, 1));
      }
      m.visible = m.material.opacity > 0.003;
    });
    // 道具
    for (const st of C.props(s)) {
      const m = fx.props[st.id];
      if (st.phase === 'hidden' || st.phase === 'gone' || !m.material.map) { m.visible = false; continue; }
      const k = st.k;
      const S = slot3(k);
      const ctrl = M.clone().lerp(S, 0.5).add(new THREE.Vector3((k % 2 ? 1 : -1) * 0.12, 0.22, 0.1));
      const rocket = st.id === 'huojian';
      const size = 0.115;
      let pos, sz, spin, op = 1, flip = 1;
      const bob = (t) => new THREE.Vector3(0, 0.008 * Math.sin(t * 2.6 + k), 0);
      if (st.phase === 'out' || st.phase === 'hover') {
        const p = easeInOut(st.p);
        pos = bez(M, ctrl, S, p, new THREE.Vector3());
        if (st.phase === 'hover') pos.add(bob(st.age - C.PROP_FLIGHT));
        sz = size * lerp(0.28, 1, easeOut(st.p));
        spin = rocket ? 0.07 * Math.sin(st.age * 5) : (1 - p) * Math.PI * 2 * (k % 2 ? 1 : -1) + (st.phase === 'hover' ? 0.06 * Math.sin(st.age * 1.7 + k) : 0);
        op = span(st.p, 0, 0.12);
      } else {
        const from = bez(M, ctrl, S, easeInOut(st.p), new THREE.Vector3()).add(bob(st.age - C.PROP_FLIGHT));
        const turn = span(st.q, 0, 0.25);                   // 掉头：先水平翻个面
        flip = Math.cos(turn * Math.PI);
        const q = easeIn(span(st.q, 0.2, 1));
        const c2 = from.clone().lerp(Rt, 0.35).add(new THREE.Vector3(0, 0.16, 0.05));
        pos = bez(from, c2, Rt, q, new THREE.Vector3());
        sz = size * lerp(1, 0.08, q);
        spin = q * Math.PI * 3 * (k % 2 ? 1 : -1);
        op = 1 - span(st.q, 0.85, 1);
      }
      billboard(m, pos, sz, 1, spin, Math.abs(flip) < 0.05 ? 0.05 : flip);
      m.material.opacity = op;
      m.visible = op > 0.003;
    }
    // 飘过的三句话
    const ps = C.phrases(s);
    fx.phrases.forEach((m, i) => {
      const ph = ps[i];
      if (!ph) { m.visible = false; return; }
      const tx = fx.phraseTex[ph.j % 3];
      if (m.material.map !== tx.tex) { m.material.map = tx.tex; m.material.needsUpdate = true; }
      const side = ph.j % 2 ? 1 : -1;
      const to = viewPoint(side * 0.5, 0.5 + 0.1 * (ph.j % 3), 1.05);
      const ctrl = M.clone().lerp(to, 0.5).add(new THREE.Vector3(side * 0.1, 0.12, 0));
      const out = t => bez(M, ctrl, to, easeOut(t), new THREE.Vector3());
      const h = 0.085;
      if (ph.phase === 'out') {
        billboard(m, out(ph.p), h * lerp(0.6, 1, easeOut(ph.p)), tx.aspect);
        m.material.opacity = span(ph.p, 0, 0.12) * (1 - span(ph.p, 0.76, 1));
      } else {
        const q = easeIn(ph.q);
        const from = out(ph.p);
        billboard(m, from.lerp(Rt, q), h * lerp(1, 0.06, q), tx.aspect, q * 0.8);
        m.material.opacity = (1 - span(ph.p, 0.76, 1)) * (1 - span(ph.q, 0.8, 1));
      }
      m.visible = m.material.opacity > 0.003;
    });
  }

  function updateClock(s) {
    const minutes = C.clockMinutes(s);
    const minA = minutes / 60 * Math.PI * 2;
    const hourA = (9 + minutes / 60) / 12 * Math.PI * 2;
    hands.minute.rotation.z = -minA;
    hands.hour.rotation.z = -hourA;
  }

  function updateDecals(s) {
    const pl = C.plaque(s);
    const d = decals.plaque;
    if (d) {
      d.mesh.material.opacity = pl.opacity;
      d.mesh.visible = pl.opacity > 0.003;
      // 缩放：以匾心为中心（圆柱面上的小块，近似在切平面里缩放）
      const r = px(d.rect);
      const c = new THREE.Vector3(...panoTo3(pano, r.x + r.w / 2, r.y + r.h / 2, Rf - 0.004));
      d.mesh.position.copy(c).multiplyScalar(1 - pl.scale);
      d.mesh.scale.setScalar(pl.scale);
    }
    details.update({ s, decals, state });
  }

  // —— 状态和每帧 ——
  const clock = { now: 0 };
  const state = { fov: 50, aspect: init.w / init.h, hdLevel: 0, hdDone: false, frames: 0 };

  buildCeiling();
  await loadShoulders();
  await loadLevel(1, false);
  buildDecals();
  buildClock();
  buildFx(init.icons || {});

  function frame(f) {
    clock.now = f.amb;
    state.fov = f.cam.fov; state.aspect = f.w / f.h;
    camera.position.set(f.cam.pos[0], f.cam.pos[1], f.cam.pos[2]);
    camera.rotation.set(f.cam.pitch, -f.cam.yaw, f.cam.roll || 0, 'YXZ');
    if (camera.fov !== f.cam.fov || camera.aspect !== state.aspect) {
      camera.fov = f.cam.fov; camera.aspect = state.aspect; camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
    // 高清块淡入（0.45 秒，按时间算）
    for (const layer of ['far', 'near']) for (const m of groups[layer].children) {
      if (m.userData.level > 1 && m.material.opacity < 1) m.material.opacity = span(clock.now - m.userData.born, 0, 0.45);
    }
    if (state.hdDone && !state.retired) {
      const allIn = [...groups.far.children, ...groups.near.children].filter(m => m.userData.level > 1).every(m => m.material.opacity >= 1);
      if (allIn) { retireOld(); state.retired = true; }
    }
    updateClock(f.tl);
    updateDecals(f.tl);
    updateFx(f.tl, f.amb);
    renderer.render(scene, camera);
    state.frames++;
  }

  return {
    info: { renderer: 'three r' + THREE.REVISION, maxTex, webgl2: renderer.capabilities.isWebGL2 },
    frame,
    resize(w, h, dpr) { renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); state.aspect = w / h; },
    async loadHD(level) {
      if (state.hdLevel) return;
      state.hdLevel = level;
      await loadLevel(level, true);
      state.hdDone = true;
    },
    setIcons(icons) {
      for (const [id, bmp] of Object.entries(icons)) {
        const m = fx.props[id];
        if (!m) continue;
        if (m.material.map) m.material.map.dispose();
        m.material.map = texFrom(bmp, { mip: true });
        m.material.needsUpdate = true;
      }
    },
    setAnchors(a) { Object.assign(anchors, a); buildDecals(); groups.decal.remove(clockGroup); clockGroup.clear(); buildClock(); },
    stats() { return { frames: state.frames, hd: state.hdLevel, hdDone: state.hdDone, meshes: scene.children.reduce((n, g) => n + g.children.length, 0) }; },
    // 平面版用的整幅图：用细竖条一条条拍（每条 1°），拼成圆柱展开图；只在工具里用
    renderStrip(yawDeg, widthDeg, w, h, vTop, vBottom) {
      const yaw = yawDeg * DEG;
      camera.position.set(0, 0, 0);
      camera.rotation.set(0, -yaw, 0, 'YXZ');
      const top = pano.heightOf(vTop, 1), bottom = pano.heightOf(vBottom, 1);
      camera.fov = 2 * Math.atan(Math.max(Math.abs(top), Math.abs(bottom))) / DEG;
      camera.aspect = Math.tan(widthDeg * DEG / 2) / Math.tan(camera.fov * DEG / 2);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      renderer.render(scene, camera);
    },
  };
}

