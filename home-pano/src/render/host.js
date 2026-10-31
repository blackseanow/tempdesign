// 主线程这边的渲染宿主：优先把画布交给 Worker（OffscreenCanvas），不支持就在主线程上跑同一份核心。
// 帧消息有背压：上一帧没画完就不发下一帧，Worker 慢时不会越积越多；画完的回执也用来量帧率（明显卡顿时退回平面版）。

class MainCanvas {
  constructor(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
}

export async function createHost(canvas, init, cb) {
  const useWorker = !init.forceMain && typeof Worker !== 'undefined' && 'transferControlToOffscreen' in canvas && typeof OffscreenCanvas !== 'undefined';
  let inFlight = false, lastSent = 0, nextId = 1;
  const acks = [];
  const host = { mode: useWorker ? 'worker' : 'main', info: null, acks, ackCount: 0, busy: () => inFlight };

  if (useWorker) {
    const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    const off = canvas.transferControlToOffscreen();
    const ready = new Promise((resolve, reject) => {
      worker.onmessage = e => {
        const m = e.data;
        if (m.type === 'ready') { host.info = m.info; resolve(); }
        else if (m.type === 'rendered') { inFlight = false; if (!m.skipped) { host.ackCount++; acks.push(performance.now()); if (acks.length > 120) acks.shift(); } cb.onRendered && cb.onRendered(m); }
        else if (m.type === 'hd-done') cb.onHD && cb.onHD(m.level);
        else if (m.type === 'error') { (host.info ? cb.onError : reject)(new Error(m.message)); }
        else if (m.type === 'lost') cb.onLost && cb.onLost();
        else if (m.type === 'stats') cb.onStats && cb.onStats(m);
      };
      worker.onerror = e => reject(new Error(e.message || 'worker error'));
    });
    worker.postMessage({ ...init, type: 'init', canvas: off }, [off]);
    await ready;
    host.frame = f => { if (inFlight) return false; inFlight = true; lastSent = performance.now(); f.id = nextId++; worker.postMessage(f); return true; };
    host.resize = (w, h, dpr) => worker.postMessage({ type: 'resize', w, h, dpr });
    host.setIcons = icons => worker.postMessage({ type: 'icons', icons }, Object.values(icons));
    host.loadHD = level => worker.postMessage({ type: 'hd', level });
    host.setAnchors = anchors => worker.postMessage({ type: 'anchors', anchors });
    host.stats = () => worker.postMessage({ type: 'stats' });
    host.stalled = () => inFlight && performance.now() - lastSent > 1500;
    host.terminate = () => worker.terminate();
    return host;
  }

  // 主线程：动态加载核心，初始化分几步，中间让出主线程
  const { createCore } = await import('./core.js');
  const env = {
    fetch: (...a) => fetch(...a),
    createImageBitmap: (...a) => createImageBitmap(...a),
    OffscreenCanvas: typeof OffscreenCanvas !== 'undefined' ? OffscreenCanvas : MainCanvas,
    idle: () => new Promise(r => setTimeout(r, 0)),
  };
  if (document.fonts && init.fonts) await Promise.all(init.fonts.map(f => document.fonts.load(`20px ${f.family}`).catch(() => {})));
  const core = await createCore(canvas, init, env);
  host.info = core.info;
  host.frame = f => {
    const t0 = performance.now();
    core.frame(f);
    host.ackCount++; acks.push(performance.now()); if (acks.length > 120) acks.shift();
    cb.onRendered && cb.onRendered({ id: nextId++, ms: performance.now() - t0 });
    return true;
  };
  host.resize = (w, h, dpr) => core.resize(w, h, dpr);
  host.setIcons = icons => core.setIcons(icons);
  host.loadHD = level => core.loadHD(level).then(() => cb.onHD && cb.onHD(level));
  host.setAnchors = anchors => core.setAnchors(anchors);
  host.stats = () => cb.onStats && cb.onStats({ stats: core.stats() });
  host.stalled = () => false;
  host.terminate = () => {};
  host.core = core;
  return host;
}
