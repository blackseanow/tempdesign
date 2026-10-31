// 开场性能自查：门在 1 秒内出现、开场期间主线程没有超过 50 毫秒的长任务。
// 实时跑一遍完整开场（不暂停）：1.2 秒时推门，等到"伸手"那一步，1 秒后按录音笔，等落定。
// 用法：node tools/perf.cjs [--device=desktop|mobile]   结果写进 shots/perf-<设备>.json
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { start } = require('./serve.cjs');
const HERE = path.resolve(__dirname, '..');
const devArg = (process.argv.find(a => a.startsWith('--device=')) || '').slice(9);
const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
(async () => {
  const srv = await start(0);
  const port = srv.address().port;
  const browser = await chromium.launch();
  for (const [dev, opts] of Object.entries(DEVICES)) {
    if (devArg && devArg !== dev) continue;
    const ctx = await browser.newContext(opts);
    await ctx.addInitScript(() => {
      window.__perf = { longtasks: [], door: null, fcp: null };
      new PerformanceObserver(l => { for (const e of l.getEntries()) window.__perf.longtasks.push({ start: Math.round(e.startTime), dur: Math.round(e.duration) }); }).observe({ type: 'longtask', buffered: true });
      new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.identifier === 'door') window.__perf.door = Math.round(e.renderTime || e.loadTime); }).observe({ type: 'element', buffered: true });
      new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__perf.fcp = Math.round(e.startTime); }).observe({ type: 'paint', buffered: true });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const t0 = Date.now();
    await page.goto(`http://127.0.0.1:${port}/home-pano/?intro=always`);
    await page.waitForTimeout(1200);
    const box = await page.locator('#door .door-btn').boundingBox();
    if (opts.hasTouch) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const pushedAt = await page.evaluate(() => performance.now());
    await page.waitForFunction(() => window.__pano.step === 'reach' || window.__pano.flat, null, { timeout: 60000 });
    await page.waitForTimeout(1000);
    const rb = await page.evaluate(() => { const b = document.querySelector('.hot[data-id="recorder"]').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
    if (opts.hasTouch) await page.touchscreen.tap(rb.x, rb.y); else await page.mouse.click(rb.x, rb.y);
    await page.waitForFunction(() => window.__pano.step === 'free' || window.__pano.flat, null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => ({ perf: window.__perf, flat: window.__pano.flat || null, renderScale: window.__pano.renderScale, median: window.__pano.medianFrameMs, renderer: window.__pano.renderer, end: performance.now() }));
    const lts = r.perf.longtasks;
    const out = {
      device: dev,
      doorRenderMs: r.perf.door, fcpMs: r.perf.fcp,
      doorWithin1s: r.perf.door != null && r.perf.door <= 1000,
      longTasks: lts, longTasksOver50: lts.filter(x => x.dur > 50), maxLongTaskMs: lts.reduce((m, x) => Math.max(m, x.dur), 0),
      introFromMs: 0, introToMs: Math.round(r.end), pushedAtMs: Math.round(pushedAt),
      fellBackToFlat: r.flat, renderScale: r.renderScale, medianFrameMs: r.median && Math.round(r.median), renderer: r.renderer, pageErrors: errors,
    };
    out.pass = out.doorWithin1s && out.longTasksOver50.length === 0 && !errors.length;
    fs.writeFileSync(path.join(HERE, 'shots', `perf-${dev}.json`), JSON.stringify(out, null, 2));
    console.log(dev, JSON.stringify({ door: out.doorRenderMs, fcp: out.fcpMs, maxLongTask: out.maxLongTaskMs, over50: out.longTasksOver50.length, flat: out.fellBackToFlat, scale: out.renderScale, med: out.medianFrameMs, pass: out.pass }));
    await ctx.close();
  }
  await browser.close();
  srv.close();
})();
