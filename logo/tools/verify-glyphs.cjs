// 核对：fonttools 转出的字形路径，和浏览器直接用霞鹜文楷 webfont 排出来的字是否一致。
// node tools/verify-glyphs.cjs  （先跑 python3 tools/build.py 生成 build/glyph-test.svg 所需的路径数据）
// 做法：同一字号、同一基线，一边用 <text>（webfont），一边用路径，各自栅格化后逐像素比较。
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const FONT_DIR = process.env.LXGW_DIR || path.join(ROOT, 'node_modules', 'lxgw-wenkai-webfont');
const EM = 200;

(async () => {
  // 用 build.py 里同一个函数取路径：em=200、字距 0、横排、第一个字 em 框左上角在 (0,0)
  const d = execFileSync('python3', ['-c', `
import sys; sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'tools'))})
import build, geom
p = build.text_paths(build.WEIGHT, ${EM}, 0, 0, 0, vertical=False)
print(geom.to_d(p, 3)); print(build.WEIGHT)`]).toString().trim().split('\n');
  const [pathD, weight] = d;
  const W = EM * 5, H = EM;
  const fontWeight = weight === 'bold' ? 700 : weight === 'light' ? 300 : 400;
  const base = EM * 0.88; // em 框顶对齐 sTypoAscender（880/1000）
  const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><text x="0" y="${base}" font-family="LXGW WenKai" font-weight="${fontWeight}" font-size="${EM}" fill="#000">咸鱼把脉了</text></svg>`;
  const svgPath = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><path fill="#000" d="${pathD}"/></svg>`;

  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: W + 20, height: H * 2 + 40 } });
  await page.route('https://fonts.local/**', (route) => {
    const file = path.join(FONT_DIR, decodeURIComponent(new URL(route.request().url()).pathname.slice(1)));
    if (!fs.existsSync(file)) return route.fulfill({ status: 404 });
    route.fulfill({ status: 200, contentType: file.endsWith('.css') ? 'text/css' : 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(file) });
  });
  await page.setContent(`<html><head><link rel="stylesheet" href="https://fonts.local/lxgwwenkai-${weight}.css"></head>
    <body style="margin:0;background:#fff"><div id="a" style="width:${W}px;height:${H}px">${svgText}</div><div id="b" style="width:${W}px;height:${H}px">${svgPath}</div></body></html>`);
  await page.evaluate(async () => { await document.fonts.load('700 200px "LXGW WenKai"', '咸鱼把脉了'); await document.fonts.ready; });
  const result = await page.evaluate(async ({ W, H }) => {
    const grab = async (sel) => {
      const svg = document.querySelector(sel + ' svg');
      // 直接比较两段 DOM 的渲染：把各自截图读回像素
      return svg.getBoundingClientRect();
    };
    return { a: await grab('#a'), b: await grab('#b') };
  }, { W, H });
  const a = await page.locator('#a').screenshot();
  const b = await page.locator('#b').screenshot();
  // 用一个页面内的 canvas 比较两张 PNG
  const cmp = await page.evaluate(async ({ a, b, W, H }) => {
    const load = (src) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = src; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, W, H).data;
    g.clearRect(0, 0, W, H); g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, W, H).data;
    let max = 0, sum = 0, over8 = 0, ink = 0;
    for (let i = 0; i < da.length; i += 4) {
      const va = da[i], vb = db[i];
      const diff = Math.abs(va - vb);
      max = Math.max(max, diff); sum += diff; if (diff > 8) over8++; if (va < 128) ink++;
    }
    return { pixels: W * H, inkPixels: ink, maxDiff: max, meanDiff: sum / (W * H), pixelsOver8: over8 };
  }, { a: 'data:image/png;base64,' + a.toString('base64'), b: 'data:image/png;base64,' + b.toString('base64'), W, H });
  const fonts = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family + ' ' + f.weight));
  await browser.close();
  const out = { weight, em: EM, loadedFonts: [...new Set(fonts)], ...cmp };
  fs.writeFileSync(path.join(ROOT, 'screenshots', 'glyph-check.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(out);
})();
