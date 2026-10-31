// 沉浸式首页的主程序：一条主时间线驱动开场，镜头 = 时间线给的位置 + 用户转头 + 呼吸，渲染交给 Worker。
import { Timeline } from './timeline.js';
import * as C from './choreo.js';
import { makePano, makeCamera, panoTo3, DEG, clamp, span, easeInOut } from './geom.js';
import { createHost } from './render/host.js';
import { Look } from './look.js';
import { Door } from './door.js';
import { Hud } from './hud.js';
import { Entries } from './entries.js';
import { AudioScene } from './audio.js';

const qs = new URLSearchParams(location.search);
const $ = s => document.querySelector(s);
const reduced = qs.get('reduced') === '1' || (qs.get('reduced') !== '0' && matchMedia('(prefers-reduced-motion: reduce)').matches);
const base = new URL('.', location.href).href;
const store = {
  get: k => { try { return localStorage.getItem('home-pano:' + k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem('home-pano:' + k, v); } catch (e) { /* 隐私模式 */ } },
};

let resolveReady;
const api = window.__pano = { ready: new Promise(r => { resolveReady = r; }), reduced };

boot().catch(err => { console.error(err); api.error = String(err); });

async function boot() {
  const load = f => fetch(f).then(r => { if (!r.ok) throw new Error(f + ' ' + r.status); return r.json(); });
  const [scene, anchors, mock, manifest] = await Promise.all(['scene.json', 'anchors.json', 'mock.json', 'img/tiles/manifest.json'].map(load));
  const pano = makePano(manifest.pano);
  const cfgCam = scene.camera;
  const Rf = scene.layers.farRadius, Rn = scene.layers.nearRadius;

  // —— 门、界面、时间线 ——
  const door = new Door($('#door'), anchors, scene.text);
  requestAnimationFrame(() => setTimeout(() => door.loadHQ(), 200));
  const hud = new Hud(document);
  const tl = new Timeline(scene.intro.durations);
  const introMode = qs.get('intro') || scene.intro.mode;
  const seen = store.get('seen') === '1';
  const quick = introMode === 'quick' || (introMode === 'first' && seen);
  if (reduced || introMode === 'off') { tl.setStatic(); $('#door').hidden = true; }
  $('.seal-face').textContent = mock.user.seal;

  let muted = store.get('muted') === '1';
  hud.setMuted(muted);

  // —— 三维里几个发声的位置 ——
  const p3 = (pt, layer) => panoTo3(pano, pt.x / 100 * pano.W, pt.y / 100 * pano.H, layer === 'near' ? Rn : Rf);
  const center = (r, layer) => p3({ x: r.x + r.w / 2, y: r.y + r.h / 2 }, layer);
  const audio = new AudioScene({
    base,
    muted,
    positions: {
      leader: p3(anchors.points.mouth, 'near'),
      clock: p3(anchors.points.clock, 'far'),
      soup: center(anchors.fx.soupPot.rect, 'far'),
      stove: center(anchors.fx.medPot.rect, 'far'),
      recorder: p3(anchors.points.recorderTop, 'near'),
    },
  });

  // —— 转头、入口 ——
  const stage = $('#stage');
  const look = new Look(stage, cfgCam, { reduced });
  const entries = new Entries({
    root: stage, hot: $('#hot'), ink: $('#ink'), tags: $('#tags'), card: $('#card'), viewer: $('#viewer'),
    scene, anchors, mock, pano, layers: scene.layers, reduced, look,
    onPressRecorder: () => { if (tl.pressRecorder()) { audio.play('recorder'); } },
    onFocusEntry: id => focusEntry(id),
    onNavigate: (href) => toast(`原型：这里会进入 ${href}`),
    onViewer: open => { viewerOpen = open; if (open) audio.suspend(); else audio.resume(); },
  });
  let viewerOpen = false;

  // 声音开关
  $('#sound').addEventListener('click', () => {
    muted = !muted; store.set('muted', muted ? '1' : '0'); hud.setMuted(muted);
    if (!muted) audio.unlock();
    audio.setMuted(muted);
  });

  // 推门：同时打开声音、申请陀螺仪
  const doorBtn = $('#door .door-btn');
  function pushDoor() {
    if (tl.state().step !== 'door') return;
    if (!muted) audio.unlock();
    audio.play('door');
    look.enableGyro().then(r => { api.gyro = r; });
    tl.pushDoor(quick || flat);
  }
  doorBtn.addEventListener('click', pushDoor);
  // 跳过（按钮或空格）
  function skip() {
    const s = tl.state();
    if (s.step === 'free') return;
    if (s.step === 'door') { if (!muted) audio.unlock(); look.enableGyro(); }
    tl.skip();
  }
  $('#skip').addEventListener('click', skip);
  document.addEventListener('keydown', e => {
    const s = tl.state();
    const inForm = e.target.closest && e.target.closest('input,textarea,select,[contenteditable]');
    if (e.code === 'Space' && s.step !== 'free' && !inForm) { e.preventDefault(); skip(); return; }
    if (s.step === 'door' && e.key === 'Enter' && e.target === document.body) { pushDoor(); return; }
    if (s.step === 'free' && !inForm && $('#card').hidden && $('#viewer').hidden) {
      const step = e.shiftKey ? 30 : 12;
      if (e.key === 'ArrowLeft') { look.nudge(-step, 0); e.preventDefault(); }
      if (e.key === 'ArrowRight') { look.nudge(step, 0); e.preventDefault(); }
      if (e.key === 'ArrowUp') { look.nudge(0, 4); e.preventDefault(); }
      if (e.key === 'ArrowDown') { look.nudge(0, -4); e.preventDefault(); }
    }
  });
  look.on(type => { if (type === 'dragstart' && tl.state().step === 'free') hud.dismissTagline(); });

  // —— 视野 ——
  function fovFor(w, h) {
    const aspect = w / h;
    const v = aspect >= 1 ? cfgCam.fovLandscape : clamp(cfgCam.fovLandscape + (1 - aspect) * 13, cfgCam.fovLandscape, cfgCam.fovPortraitMax);
    const hf = 2 * Math.atan(Math.tan(v * DEG / 2) * aspect) / DEG;
    return { v, h: hf };
  }
  // 坐定时正对领导（全景正中不是领导的位置，他在 +7.8° 左右）
  const neutralYaw = cfgCam.neutralYaw === 'mouth' ? pano.yawOf(anchors.points.mouth.x / 100 * pano.W) / DEG : (+cfgCam.neutralYaw || 0);
  // 伸手那一步：窄屏上录音笔在画面外，镜头自动偏过去一点；反转后回来
  const rec = pano.pctToPx(anchors.entries.recorder.rect);
  const recYaw = pano.yawOf(rec.x + rec.w / 2) / DEG;
  function recorderBias(s, fov) {
    const need = Math.max(0, recYaw - neutralYaw - (fov.h / 2) * 0.55);
    if (!need || s.mode !== 'full') return 0;
    const reach = s.T.reach != null ? s.now - s.T.reach : null;
    const settle = s.T.settle != null ? s.now - s.T.settle : null;
    if (reach == null) return 0;
    const inK = easeInOut(span(reach, 0, 1.2));
    const outK = settle == null ? 0 : easeInOut(span(settle, 0.4, 2.2));
    return need * inK * (1 - outK);
  }
  // 往下最多看多少度不出画（全景补边以后的底边）
  const bottomElev = Math.atan((pano.vh - (pano.H + pano.padBottom)) / pano.k) / DEG;

  // —— 渲染 ——
  let host = null, flat = qs.get('flat') === '1' || !hasWebGL();
  const dpr = Math.min(window.devicePixelRatio || 1, qs.get('dpr') ? +qs.get('dpr') : 2);
  const view = { w: innerWidth, h: innerHeight };
  const fonts = [{ family: 'PanoKai', url: new URL('fonts/pano-kai.woff2', base).href }];
  if (!flat) {
    try {
      host = await createHost($('#gl'), {
        w: view.w, h: view.h, dpr, scene, anchors, manifest, baseUrl: base, reduced, fonts,
        forceMain: qs.get('worker') === '0', preserve: qs.get('preserve') === '1',
      }, {
        onError: e => { console.error(e); goFlat('error'); },
        onLost: () => goFlat('context-lost'),
        onHD: level => { api.hdLevel = level; hdLoadingUntil = performance.now() + 1000; },
      });
      api.renderer = { mode: host.mode, ...host.info };
    } catch (e) {
      console.warn('WebGL 不可用，换平面版', e);
      flat = true;
    }
  }
  if (flat) { await goFlat(qs.get('flat') === '1' ? 'forced' : 'no-webgl'); }
  else rasterizeIcons().then(icons => host && host.setIcons(icons));

  window.addEventListener('resize', () => {
    view.w = innerWidth; view.h = innerHeight;
    if (host) host.resize(view.w, view.h, dpr * renderScale);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) audio.suspend(); else if (!viewerOpen) audio.resume(); });

  // —— 每帧 ——
  let last = performance.now(), hdRequested = false, hdLoadingUntil = 0, pose = null, renderStart = 0, lastStep = null;
  let ambPaused = null;
  const amb = () => (ambPaused ?? performance.now()) / 1000;
  const slow = +qs.get('slow') || 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const s = tl.state();
    if (s.step !== lastStep) onStep(s, lastStep);
    lastStep = s.step;
    const fov = fovFor(view.w, view.h);
    look.view = { hfov: fov.h, vfov: fov.v, w: view.w, h: view.h };
    const cc = C.camera(s);
    const downMax = cfgCam.neutralPitch + cc.pitch - (bottomElev + fov.v / 2 + 0.6);
    const lk = look.update(dt, { free: cc.free, downMax, upMax: cfgCam.pitchUp });
    pose = makePose(s, cc, lk, fov, amb(), neutralYaw + recorderBias(s, fov));
    if (host && !flat) {
      host.frame({ type: 'frame', cam: pose, tl: plainState(s), amb: amb(), w: view.w, h: view.h, yaw0: neutralYaw, slow });
      if (!renderStart && host.acks.length) renderStart = now;
      checkLag(now);
    }
    door.update(s);
    hud.update(s, view);
    const cam = flat ? null : makeCamera(pose, view.w, view.h);
    entries.update(cam, view);
    const cue = C.recorderCue(s);
    entries.cue(cue.ring, cue.breathe);
    hud.showCue('按下录音笔', entries.boxOf('recorder'), cue.hint);
    audio.update(s, { yaw: pose.yaw, pitch: pose.pitch, pos: pose.pos });
    api.frameCount = (api.frameCount || 0) + 1;
  }

  function makePose(s, cc, lk, fov, t, yaw0) {
    const b = cfgCam.breath;
    const breathe = reduced ? 0 : 1;
    const ph = t * Math.PI * 2 / b.period;
    const yawDeg = yaw0 + lk.yaw + breathe * b.yaw * Math.sin(ph / 1.63);
    const rel = cc.pitch + lk.pitch + breathe * b.pitch * Math.sin(ph + 0.7);
    const pitchDeg = cfgCam.neutralPitch + rel;
    // 眼睛不在转头轴上：轴在眼睛后面 neck 米。转头时眼睛绕轴走一小段弧，近层就比远层多移动一点
    // 转头轴在坐定时眼睛的正后方（朝 neutralYaw）；正对领导时眼睛正好在圆柱的圆心，远近两层严丝合缝
    const d = cfgCam.neck, yr = yawDeg * DEG, pr = rel * DEG, y0 = yaw0 * DEG;
    const nx = -d * Math.sin(y0), nz = d * Math.cos(y0);
    const ex = nx + d * Math.sin(yr) * Math.cos(pr), ey = d * Math.sin(pr), ez = nz - d * Math.cos(yr) * Math.cos(pr);
    return { yaw: yr, pitch: pitchDeg * DEG, fov: fov.v, pos: [ex, ey + cc.y + breathe * b.y * Math.sin(ph), ez + cc.z] };
  }

  function onStep(s, prev) {
    // 入口什么时候能点
    entries.setState(s.step === 'free' ? 'free' : s.step === 'reach' ? 'recorder' : 'locked');
    stage.classList.toggle('locked', s.step !== 'free' && s.step !== 'reach');
    if (s.step === 'reach') setTimeout(() => { if (tl.state().step === 'reach') { const b = document.querySelector('.hot[data-id="recorder"]'); b && b.focus({ preventScroll: true }); } }, 3000);
    // 进屋以后换高清
    if (!hdRequested && host && ['sit', 'talk', 'free', 'quick'].includes(s.step)) {
      hdRequested = true;
      hdLoadingUntil = performance.now() + 60000;
      host.loadHD(hdLevel());
    }
    if (s.step === 'free') {
      if (s.mode === 'full' || s.mode === 'skip') store.set('seen', '1');
      if (look.gyro.on) look.recenterGyro();
    }
    if (s.step === 'sit' && look.gyro.on) look.recenterGyro();
    api.step = s.step;
  }

  // 高清级别：电脑 4x，手机或小屏 2x
  function hdLevel() {
    if (qs.get('hd')) return +qs.get('hd');
    const coarse = matchMedia('(pointer:coarse)').matches;
    const need = Math.max(view.w, view.h) * dpr;
    return coarse || need < 1500 || (host.info && host.info.maxTex < 4096) ? 2 : 4;
  }

  // 明显卡顿：渲染两秒以后量最近 40 帧间隔的中位数。先降渲染分辨率（每次 ×0.75，最低 0.5），
  // 降到底还超过 55 毫秒，就退回平面版。加载高清块时不算。
  let renderScale = 1, lagSince = 0;
  function checkLag(now) {
    if (!renderStart || now - renderStart < 2000 || now < hdLoadingUntil || now < lagSince || document.hidden) return;
    const a = host.acks, n = scene.quality.lagWindowFrames;
    if (a.length < n + 1) return;
    const d = [];
    for (let i = a.length - n; i < a.length; i++) d.push(a[i] - a[i - 1]);
    d.sort((x, y) => x - y);
    const med = api.medianFrameMs = d[d.length >> 1];
    api.renderScale = renderScale;
    if (qs.get('nofallback') === '1') return;
    if (host.stalled()) { goFlat('stalled'); return; }
    if (med > 40 && renderScale > 0.5) {
      renderScale = Math.max(0.5, renderScale * 0.75);
      host.resize(view.w, view.h, dpr * renderScale);
      a.length = 0;
      lagSince = now + 800;
    } else if (med > scene.quality.lagMedianMs) goFlat('slow');
  }

  async function goFlat(reason) {
    if (api.flat) return;
    flat = true;
    api.flat = reason;
    if (host) { host.terminate(); host = null; }
    const s = tl.state();
    if (s.step !== 'free' && s.step !== 'door') tl.skip();
    const { startFlat } = await import('./flat.js');
    startFlat({ manifest, entries, anchors, stage });
  }

  // 键盘 Tab 到入口：转过去让它在画面里
  function focusEntry(id) {
    if (tl.state().step !== 'free' || flat) return;
    const a = entries.anchorOf(id);
    if (!a) return;
    const r = pano.pctToPx(a.rect);
    const R = a.layer === 'near' ? Rn : Rf;
    const yaw = pano.yawOf(r.x + r.w / 2) / DEG;
    const elev = Math.atan(pano.heightOf(r.y + r.h / 2, R) / R) / DEG;
    const box = entries.boxOf(id);
    const inView = box && box.x > view.w * 0.12 && box.x + box.w < view.w * 0.88 && box.y > view.h * 0.1 && box.y + box.h < view.h * 0.9;
    if (!inView) look.lookAt(yaw - neutralYaw, clamp(elev - cfgCam.neutralPitch, -cfgCam.pitchDown, cfgCam.pitchUp) * 0.6);
  }

  function toast(text) {
    const el = $('#cue');
    el.textContent = text;
    el.style.transform = `translate(${Math.max(8, (view.w - el.offsetWidth) / 2)}px, ${view.h - 150}px)`;
    el.style.opacity = '1';
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.style.opacity = '0'; }, 1800);
  }

  async function rasterizeIcons() {
    const out = {};
    for (const id of C.PROP_IDS) {
      try {
        const img = new Image();
        img.src = `icons/${id}.svg`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        c.getContext('2d').drawImage(img, 0, 0, 256, 256);
        out[id] = await createImageBitmap(c);
      } catch (e) { console.warn('图标', id, e); }
      await new Promise(r => setTimeout(r, 0));
    }
    return out;
  }

  // —— 调试 / 截图钩子 ——
  Object.assign(api, {
    tl, look, entries, scene, anchors, pano, host: () => host,
    state: () => ({ ...plainState(tl.state()), pose, flat: api.flat || null }),
    seek: (step, t, holds) => tl.seek(step, t, holds),
    pause: () => { tl.pause(); ambPaused = performance.now(); },
    // 录像用：暂停状态下把"环境时间"（呼吸感、眨眼）也摆到指定秒数
    setAmb: sec => { ambPaused = sec * 1000; },
    resume: () => { tl.resume(); ambPaused = null; },
    // yaw：以正对领导为 0（右正）
    lookAt: (yaw, pitch, instant = true) => look.lookAt(yaw, pitch, instant),
    neutralYaw: () => neutralYaw,
    box: id => entries.boxOf(id),
    hover: id => entries.hover(id, true),
    // 截图用：把镜头转到某个入口（立即）
    aim: (id, instant = true) => {
      const a = entries.anchorOf(id);
      if (!a) return null;
      const r = pano.pctToPx(a.rect);
      const R = a.layer === 'near' ? Rn : Rf;
      const yaw = pano.yawOf(r.x + r.w / 2) / DEG;
      const elev = Math.atan(pano.heightOf(r.y + r.h / 2, R) / R) / DEG;
      look.lookAt(yaw - neutralYaw, clamp(elev - cfgCam.neutralPitch, -cfgCam.pitchDown, cfgCam.pitchUp) * 0.7, instant);
      return { yaw, elev };
    },
    rendered: () => new Promise(res => { const n = host ? host.acks.length : 0; const t0 = performance.now(); const chk = () => (!host || host.acks.length > n + 1 || performance.now() - t0 > 4000) ? res() : requestAnimationFrame(chk); chk(); }),
  });
  if (qs.get('debug') === '1') import('./debug.js').then(m => m.startDebug({ api, anchors, pano, scene, host: () => host, entries, door }));
  requestAnimationFrame(frame);
  resolveReady(true);
}

function plainState(s) {
  return { mode: s.mode, step: s.step, t: s.t, now: s.now, T: { ...s.T }, skippedFrom: s.skippedFrom };
}

// 只看接口在不在，不在主线程上真建上下文（建上下文可能要几十毫秒）；真建不起来时 Worker 会报错，再退回平面版
function hasWebGL() {
  if (new URLSearchParams(location.search).get('gl') === '0') return false;
  return 'WebGL2RenderingContext' in window || 'WebGLRenderingContext' in window;
}
