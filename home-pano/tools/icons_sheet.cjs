// 第 5 步：把六个道具图标和 pano.png 的局部放在一起渲染成对比图，并检查图标规格。
//   - checks/icons-compare.png：上排六个图标（竹纸底），下排 pano.png 里同类的东西（鸡汤锅、药罐、盖碗、锦旗、脉案本、录音笔）
//   - 检查：透明背景、正方形画布、不带文字、颜色只在五色里（竹纸、素笺、松烟墨、函套青、古铜金），道具居中（不透明像素的包围盒中心离画布中心 ≤ 6%）
// 用法：node tools/icons_sheet.cjs   （需要 Playwright；pano 局部从第 1 步的 work/aligned/pano.png 取，没有就用原图）
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const HERE = path.resolve(__dirname, '..');
const NAMES = ['juben', 'hongtu', 'dabing', 'jitang', 'daqi', 'huojian'];
const PALETTE = ['#ECEAE1', '#F8F7F2', '#24231F', '#1F3A4D', '#C9A86A'];
// pano.png（2106 宽）里的参照物，坐标是 1x 像素
const CROPS = [
  ['鸡汤锅', 1440, 300, 140, 120],
  ['药罐', 1770, 325, 150, 100],
  ['盖碗', 1325, 405, 110, 95],
  ['锦旗', 1340, 85, 230, 215],
  ['脉案本', 995, 445, 300, 100],
  ['录音笔', 1300, 488, 120, 135],
];

(async () => {
  const report = { icons: {}, ok: true };
  // 对比用 1x 的 pano（风格看得清，加载也快）；没有对齐结果时用 src 原图
  const aligned = path.join(HERE, 'work', 'aligned', 'pano.png');
  const panoPath = fs.existsSync(aligned) ? aligned : path.join(HERE, JSON.parse(fs.readFileSync(path.join(HERE, 'img', 'sources.json'), 'utf8'))['pano.png']);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });

  // 1) 规格检查
  for (const n of NAMES) {
    const svg = fs.readFileSync(path.join(HERE, 'icons', n + '.svg'), 'utf8');
    const colors = [...new Set((svg.match(/#[0-9a-fA-F]{6}\b/g) || []).map(c => c.toUpperCase()))];
    const bad = colors.filter(c => !PALETTE.includes(c));
    const hasText = /<text\b/.test(svg);
    const vb = (svg.match(/viewBox="([^"]+)"/) || [])[1];
    const [, , vw, vh] = vb.split(/\s+/).map(Number);
    await page.setContent(`<html><body style="margin:0;background:transparent"><img id="i" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="400" height="400"></body></html>`);
    const box = await page.evaluate(async () => {
      const img = document.getElementById('i');
      await img.decode();
      const c = document.createElement('canvas'); c.width = 400; c.height = 400;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0, 400, 400);
      const d = g.getImageData(0, 0, 400, 400).data;
      let x0 = 400, y0 = 400, x1 = -1, y1 = -1, corner = 0;
      for (let y = 0; y < 400; y++) for (let x = 0; x < 400; x++) {
        const a = d[(y * 400 + x) * 4 + 3];
        if (a > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      for (const [x, y] of [[0, 0], [399, 0], [0, 399], [399, 399]]) corner += d[(y * 400 + x) * 4 + 3];
      return { x0, y0, x1, y1, corner };
    });
    const cx = (box.x0 + box.x1) / 2 / 400, cy = (box.y0 + box.y1) / 2 / 400;
    const centered = Math.abs(cx - 0.5) <= 0.06 && Math.abs(cy - 0.5) <= 0.06;
    const item = {
      square: vw === vh, transparentCorners: box.corner === 0, noText: !hasText, colors, offPalette: bad,
      bbox: [box.x0, box.y0, box.x1, box.y1].map(v => +(v / 4).toFixed(1)), center: [+(cx * 100).toFixed(1), +(cy * 100).toFixed(1)], centered,
    };
    item.pass = item.square && item.transparentCorners && item.noText && bad.length === 0 && centered;
    if (!item.pass) report.ok = false;
    report.icons[n] = item;
  }

  // 2) 对比图
  const icons = NAMES.map(n => `<figure><div class="tile"><img src="file://${path.join(HERE, 'icons', n + '.svg')}" width="200" height="200"></div><figcaption>${n}.svg</figcaption></figure>`).join('');
  const crops = CROPS.map(([label, x, y, w, h]) => {
    const s = 200 / h;
    return `<figure><div class="crop" style="width:${Math.round(w * s)}px;height:200px;background-image:url('file://${panoPath}');background-size:${Math.round(2106 * s)}px auto;background-position:${-Math.round(x * s)}px ${-Math.round(y * s)}px"></div><figcaption>pano.png · ${label}</figcaption></figure>`;
  }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;padding:24px;background:#ECEAE1;font:14px/1.4 "LXGW WenKai","WenQuanYi Zen Hei",sans-serif;color:#24231F}
    h2{font-size:15px;font-weight:400;margin:0 0 10px}
    .row{display:flex;gap:18px;align-items:flex-end;margin-bottom:22px;flex-wrap:nowrap}
    figure{margin:0;text-align:center}
    .tile{width:200px;height:200px;background:#ECEAE1;outline:1px dashed #D6D2C4}
    .crop{background-repeat:no-repeat;image-rendering:auto}
    figcaption{margin-top:6px;color:#4E4C45}
  </style></head><body>
  <h2>道具图标（icons/*.svg，竹纸底，200 px）</h2><div class="row">${icons}</div>
  <h2>pano.png 局部（同样 200 px 高）</h2><div class="row">${crops}</div>
  </body></html>`;
  // 写成 work/ 里的临时页面再用 file:// 打开，页面里才能引用本地图片
  fs.mkdirSync(path.join(HERE, 'work'), { recursive: true });
  const tmp = path.join(HERE, 'work', 'icons-compare.html');
  fs.writeFileSync(tmp, html);
  await page.goto('file://' + tmp);
  await page.evaluate(async () => { await Promise.all([...document.images].map(i => i.decode().catch(() => {}))); });
  await page.waitForTimeout(600);
  const size = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
  await page.setViewportSize({ width: size.w, height: size.h });
  fs.mkdirSync(path.join(HERE, 'checks'), { recursive: true });
  await page.screenshot({ path: path.join(HERE, 'checks', 'icons-compare.png'), fullPage: true });
  await browser.close();
  fs.writeFileSync(path.join(HERE, 'checks', 'icons-check.json'), JSON.stringify(report, null, 2));
  for (const [n, r] of Object.entries(report.icons)) console.log(n, r.pass ? 'ok' : 'FAIL', 'center', r.center, 'colors', r.colors.join(' '), r.offPalette.length ? 'OFF:' + r.offPalette : '');
  console.log(report.ok ? '全部通过' : '有不通过的');
})();
