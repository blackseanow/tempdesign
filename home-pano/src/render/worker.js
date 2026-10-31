// 渲染 Worker：收主线程的帧消息（时间线状态 + 镜头），在 OffscreenCanvas 上画。
import { createCore } from './core.js';

let core = null;
const env = {
  fetch: (...a) => fetch(...a),
  createImageBitmap: (...a) => createImageBitmap(...a),
  OffscreenCanvas,
  idle: () => new Promise(r => setTimeout(r, 0)),
};

async function loadFonts(list) {
  if (typeof FontFace === 'undefined' || !self.fonts) return false;
  await Promise.all((list || []).map(async f => {
    try { const ff = new FontFace(f.family, `url(${f.url})`, f.descriptors || {}); await ff.load(); self.fonts.add(ff); } catch (e) { /* 字体没加载上就用后备字体 */ }
  }));
  return true;
}

self.onmessage = async e => {
  const m = e.data;
  try {
    switch (m.type) {
      case 'init': {
        m.canvas.addEventListener('webglcontextlost', ev => { ev.preventDefault(); postMessage({ type: 'lost' }); });
        await loadFonts(m.fonts);
        core = await createCore(m.canvas, m, env);
        postMessage({ type: 'ready', info: core.info });
        break;
      }
      case 'frame': {
        if (!core) { postMessage({ type: 'rendered', id: m.id, skipped: true }); return; }
        const t0 = performance.now();
        if (m.slow) { const until = t0 + m.slow; while (performance.now() < until) { /* ?slow=… 模拟慢设备 */ } }
        core.frame(m);
        postMessage({ type: 'rendered', id: m.id, ms: performance.now() - t0 });
        break;
      }
      case 'resize': core && core.resize(m.w, m.h, m.dpr); break;
      case 'icons': core && core.setIcons(m.icons); break;
      case 'hd': if (core) { await core.loadHD(m.level); postMessage({ type: 'hd-done', level: m.level }); } break;
      case 'anchors': core && core.setAnchors(m.anchors); break;
      case 'stats': postMessage({ type: 'stats', id: m.id, stats: core ? core.stats() : null }); break;
    }
  } catch (err) {
    postMessage({ type: 'error', message: String((err && err.stack) || err) });
  }
};
