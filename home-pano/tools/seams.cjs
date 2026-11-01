// 接缝自查：全景两头（±90°）接着一段渐暗的"肩"，墙上的横线（护墙板上沿、踢脚线、地面线、屋梁）要在接缝处接上。
// 把镜头转到最左、最右，算出全景边缘在屏幕上的那一列，取它左右各 8 px 的两列像素，找出墨线的高度，两边比较。
// 结果写进 checks/seams.json；每条线两边的高度差都不超过 2 px 算通过。
// 用法：node tools/seams.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { start } = require('./serve.cjs');
const HERE = path.resolve(__dirname, '..');

function linesIn(col) {
  // col：一列像素的亮度；连在一起的暗像素算一条线，取中心
  const out = [];
  let start = -1;
  for (let y = 0; y <= col.length; y++) {
    const dark = y < col.length && col[y] < 150;
    if (dark && start < 0) start = y;
    if (!dark && start >= 0) { out.push((start + y - 1) / 2); start = -1; }
  }
  return out.filter(v => v > 60 && v < col.length - 60);
}

(async () => {
  const srv = await start(0);
  const port = srv.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`http://127.0.0.1:${port}/home-pano/?intro=off&nofallback=1&hd=4`);
  await page.waitForFunction(() => window.__pano && window.__pano.frameCount > 2);
  await page.evaluate(() => window.__pano.pause());
  // 只量画面：字幕、按钮、名章这些界面层先藏起来（字幕里的字会被当成墨线）
  await page.addStyleTag({ content: '#hud,.hud-tr,#start,#skip,#tags,#ink{visibility:hidden!important}' });
  await page.waitForFunction(() => window.__pano.hdLevel, null, { timeout: 120000 });
  await page.waitForTimeout(3000);
  const report = { sides: {}, pass: true };
  for (const [side, yaw] of [['left', -80], ['right', 80]]) {
    await page.evaluate(y => window.__pano.lookAt(y, 0, true), yaw);
    for (let i = 0; i < 3; i++) await page.evaluate(() => window.__pano.rendered());
    const xj = await page.evaluate(async sd => {
      const g = await import(new URL('src/geom.js', location.href).href);
      const api = window.__pano;
      const cam = g.makeCamera(api.state().pose, innerWidth, innerHeight);
      const u = sd === 'left' ? 0 : api.pano.W;
      const s = cam.project(g.panoTo3(api.pano, u, api.pano.vh + 60, api.scene.layers.farRadius));
      return s ? s[0] : null;
    }, side);
    const png = await page.screenshot();
    // 在页面里解码截图，取两列像素的亮度
    const cols = await page.evaluate(async ([b64, xs]) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      return xs.map(x => {
        const d = g.getImageData(Math.round(x), 0, 1, img.height).data;
        const out = [];
        for (let i = 0; i < d.length; i += 4) out.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
        return out;
      });
    }, [png.toString('base64'), [xj - 8, xj + 8]]);
    const [a, b] = cols.map(linesIn);
    const pano = side === 'left' ? b : a, shoulder = side === 'left' ? a : b;
    // 每条全景里的线，在肩那边找最近的一条
    const pairs = pano.map(y => {
      const near = shoulder.reduce((best, v) => (Math.abs(v - y) < Math.abs(best - y) ? v : best), Infinity);
      return { pano: y, shoulder: near, diff: Math.abs(near - y) };
    });
    const ok = pairs.length > 0 && pairs.every(p => p.diff <= 2);
    if (!ok) report.pass = false;
    report.sides[side] = { junctionX: +xj.toFixed(1), lines: pairs, pass: ok };
    fs.writeFileSync(path.join(HERE, 'checks', `seams-${side}.jpg`), await page.screenshot({ type: 'jpeg', quality: 88 }));
    console.log(side, ok ? '接上了' : '没接上', JSON.stringify(pairs));
  }
  await browser.close();
  srv.close();
  fs.writeFileSync(path.join(HERE, 'checks', 'seams.json'), JSON.stringify(report, null, 2));
})();
