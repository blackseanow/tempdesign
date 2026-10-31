// 截图自查（第 11 步）：电脑（1440 × 900）和手机（390 × 844，2 倍）两种尺寸
//   - 开场 7 个镜头：门外、推门、坐下、开讲、伸手、反转、落定
//   - 落定后左、中、右三个方向
//   - 每个入口的悬停状态（手机上是点按：墨线圈 + 毛笔字标签）
//   - 另外：几张卡片、彩蛋（有解剖图 / 还没做）、平面版、减少动态效果、调试叠加
// 用 seek + 暂停把时间线摆到某一刻，等 Worker 真画完那一帧再拍，结果可复现。
// 用法：node tools/shoot.cjs [--only intro,views,hover,extra] [--device desktop|mobile]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { start } = require('./serve.cjs');

const HERE = path.resolve(__dirname, '..');
const OUT = path.join(HERE, 'shots');
const args = process.argv.slice(2);
const only = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const devArg = (args.find(a => a.startsWith('--device=')) || '').slice(9);
const want = k => !only.length || only.includes(k);
const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
// 开场 7 个镜头：步骤、这一步里的时刻（秒）
const INTRO = [
  ['1-door', 'door', 0.6],
  ['2-push', 'push', 1.15],
  ['3-sit', 'sit', 2.6],
  ['4-talk', 'talk', 8.7],
  ['5-reach', 'reach', 3.7],
  ['6-reverse', 'reverse', 1.45],
  ['7-settle', 'settle', 2.7],
];
const HOLDS = { door: 1.2, reach: 3.7 };

async function settle(page, frames = 2) {
  await page.evaluate(n => new Promise(res => {
    const api = window.__pano;
    let left = n;
    const step = () => api.rendered().then(() => (--left > 0 ? step() : res()));
    step();
  }), frames);
}
async function waitHD(page) {
  await page.waitForFunction(() => window.__pano.hdLevel || window.__pano.flat, null, { timeout: 120000 });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await start(0);
  const port = srv.address().port;
  const browser = await chromium.launch();
  const report = { when: new Date().toISOString(), devices: {}, console: [] };
  for (const [dev, opts] of Object.entries(DEVICES)) {
    if (devArg && devArg !== dev) continue;
    const dir = path.join(OUT, dev);
    fs.mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') report.console.push(`${dev} ${m.type()}: ${m.text()}`); });
    page.on('pageerror', e => report.console.push(`${dev} pageerror: ${e.message}`));
    const base = `http://127.0.0.1:${port}/home-pano/`;
    const shots = [];
    const shot = async (name) => { const f = path.join(dir, name + '.png'); await page.screenshot({ path: f }); shots.push(name); };
    // —— 开场 ——
    await page.goto(base + '?intro=always&nofallback=1');
    await page.mouse.move(opts.viewport.width / 2, opts.viewport.height - 4);
    await page.waitForFunction(() => window.__pano && window.__pano.frameCount > 2);
    await page.evaluate(() => { window.__pano.pause(); window.__pano.seek('free', 0.5); });
    await waitHD(page);
    await settle(page, 3);
    if (want('intro')) {
      for (const [name, step, t] of INTRO) {
        await page.evaluate(([s, tt, h]) => { window.__pano.seek(s, tt, h); }, [step, t, HOLDS]);
        await settle(page, 3);
        await page.waitForTimeout(120);
        await shot('intro-' + name);
      }
    }
    // —— 落定后左中右 ——
    await page.evaluate(() => window.__pano.seek('free', 4));
    await settle(page, 2);
    if (want('views')) {
      for (const [name, yaw] of [['left', -70], ['center', 0], ['right', 70]]) {
        await page.evaluate(y => window.__pano.lookAt(y, 0, true), yaw);
        await settle(page, 3);
        await page.waitForTimeout(100);
        await shot('view-' + name);
      }
    }
    // —— 每个入口的悬停 ——
    if (want('hover')) {
      const ids = await page.evaluate(() => [...window.__pano.entries.items.keys()]);
      for (const id of ids) {
        if (id === 'start') continue;
        await page.mouse.move(2, 2);
        await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); window.__pano.entries.hover(window.__pano.entries.active, false); });
        await page.evaluate(i => window.__pano.aim(i), id);
        await settle(page, 3);
        const box = await page.evaluate(i => { const b = document.querySelector(`.hot[data-id="${i}"]`); if (!b) return window.__pano.box(i); const r = b.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, id);
        if (dev === 'desktop' && box) {
          // 百子柜的中间是抽屉（抽屉是单独的入口），悬停在它左下角的空白抽屉上
          const fx = id === 'cabinet' ? 0.2 : 0.5, fy = id === 'cabinet' ? 0.85 : 0.5;
          await page.mouse.move(box.x + box.w * fx, box.y + box.h * fy);
        } else {
          await page.evaluate(i => window.__pano.hover(i), id);
        }
        await page.waitForTimeout(650);
        await shot('hover-' + id);
      }
      await page.mouse.move(2, 2);
    }
    // —— 卡片、彩蛋、其他状态 ——
    if (want('extra')) {
      const click = async id => {
        await page.evaluate(i => window.__pano.aim(i), id);
        await settle(page, 2);
        const box = await page.evaluate(i => window.__pano.box(i), id);
        await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
        await page.waitForTimeout(700);
      };
      for (const id of ['recorder', 'calendar', 'daqi']) { await click(id); await shot('card-' + id); await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
      await click('dabing'); await page.waitForTimeout(1500); await shot('egg-dabing-viewer'); await page.keyboard.press('Escape');
      await page.goto(base + '?flat=1&intro=off'); await page.waitForTimeout(1500); await shot('flat');
      await page.goto(base + '?reduced=1'); await page.waitForFunction(() => window.__pano && window.__pano.frameCount > 2); await waitHD(page); await settle(page, 3); await shot('reduced-motion');
      await page.goto(base + '?debug=1&intro=off&nofallback=1'); await page.waitForFunction(() => window.__pano && window.__pano.frameCount > 2); await page.evaluate(() => window.__pano.pause()); await waitHD(page); await settle(page, 3); await page.waitForTimeout(300); await shot('debug');
    }
    report.devices[dev] = { shots };
    await ctx.close();
  }
  await browser.close();
  srv.close();
  fs.writeFileSync(path.join(OUT, 'shoot.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 1).slice(0, 3000));
})();
