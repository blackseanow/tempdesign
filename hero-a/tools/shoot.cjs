// 第三步：Playwright 截图 + 自查数据。node shoot.cjs <工作目录>
// 截图写到 hero-a/screenshots/，检查用的中间图和 report.json 写到工作目录，再由 check.py 逐项判定。
// 沙箱里连不上 jsdelivr 时，设 LXGW_DIR=<lxgw-wenkai-webfont 包目录>，把同一份字体文件本地供给页面；
// 设 LOCAL_SONG=1 时 Noto Serif SC 由系统里的 Noto Serif CJK SC（fonts-noto-cjk）提供。
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WORK = path.resolve(process.argv[2] || 'build');
const SHOTS = path.join(ROOT, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(WORK, { recursive: true });
const PAGE_URL = 'file://' + path.join(ROOT, 'index.html');
const PALETTE = ['#ECEAE1', '#F8F7F2', '#1F3A4D', '#24231F', '#B5382A', '#EDCAB1', '#3B3A37', '#5B5A55', '#DACCB8'];

async function routeFonts(page) {
  if (process.env.LXGW_DIR) {
    await page.route('https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/**', (route) => {
      const rel = decodeURIComponent(new URL(route.request().url()).pathname.split('@1.7.0/')[1]);
      const file = path.join(process.env.LXGW_DIR, rel);
      if (!fs.existsSync(file)) return route.fulfill({ status: 404 });
      const type = file.endsWith('.css') ? 'text/css' : 'font/woff2';
      return route.fulfill({ status: 200, contentType: type, headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(file) });
    });
  }
  if (process.env.LOCAL_SONG) {
    await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({
      status: 200, contentType: 'text/css',
      body: ['400', '600'].map((w) => `@font-face{font-family:"Noto Serif SC";font-weight:${w};src:local("Noto Serif CJK SC")}`).join(''),
    }));
    await page.route('https://fonts.gstatic.com/**', (route) => route.abort());
  }
}

// 页面状态：元素位置、实际用到的字体、计算后的填色、动效
async function inspect(page, cdp) {
  const data = await page.evaluate((PALETTE) => {
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y + scrollY, w: b.width, h: b.height }; };
    const hex = (c) => '#' + c.match(/\d+/g).slice(0, 3).map((v) => (+v).toString(16).padStart(2, '0')).join('').toUpperCase();
    const paths = [...document.querySelectorAll('.hero-art path')];
    const fills = {};
    const red = [];
    for (const p of paths) {
      const f = hex(getComputedStyle(p).fill);
      fills[f] = (fills[f] || 0) + 1;
      if (f === '#B5382A') red.push({ cls: p.getAttribute('class'), rect: r(p) });
    }
    const anim = (sel) => [...document.querySelectorAll(sel)].map((el) => {
      const cs = getComputedStyle(el);
      return `${cs.animationName}/${cs.animationDuration}/${cs.animationIterationCount}/${cs.animationDelay}`;
    });
    return {
      sign: r(document.querySelector('.sign')), plaque: r(document.querySelector('.plaque')),
      motto: r(document.querySelector('.motto')), art: r(document.querySelector('.hero-art')),
      recDot: r(document.querySelector('.rec-dot')), pathCount: paths.length, fills,
      offPalette: Object.keys(fills).filter((f) => !PALETTE.includes(f)), red,
      anim: { dot: anim('.rec-dot'), wave: anim('.wave'), note: anim('.note') },
      fontsOk: ['LXGW WenKai', 'Noto Serif SC'].map((f) => `${f}: ${document.fonts.check(`16px "${f}"`, '咸鱼把脉了领导一字不落对症开方按时交差')}`),
    };
  }, PALETTE);
  // 实际排版用到的字体（排查方块字）
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  data.platformFonts = {};
  for (const sel of ['.plaque span', '.motto span']) {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel });
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    data.platformFonts[sel] = fonts.map((f) => `${f.familyName} ×${f.glyphCount}`);
  }
  return data;
}

(async () => {
  const browser = await chromium.launch();
  const report = {};
  const configs = [
    { name: 'desktop-1440', viewport: { width: 1440, height: 900 }, dpr: 1 },
    { name: 'desktop-1440@2x', viewport: { width: 1440, height: 900 }, dpr: 2 },
    { name: 'mobile-390@3x', viewport: { width: 390, height: 844 }, dpr: 3, mobile: true },
    // 其他宽度只做检查，不进交付截图
    ...[360, 768, 960, 961, 1024, 1280, 1920, 2560].map((w) => ({
      name: `w${w}`, viewport: { width: w, height: 900 }, dpr: 1, mobile: w < 768, scratch: true })),
  ];
  for (const c of configs) {
    const ctx = await browser.newContext({ viewport: c.viewport, deviceScaleFactor: c.dpr, isMobile: !!c.mobile, hasTouch: !!c.mobile });
    const page = await ctx.newPage();
    await routeFonts(page);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    await page.goto(PAGE_URL, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(2800);                       // 纸笺 0.3s–2.4s 漂完停住
    await page.screenshot({ path: path.join(c.scratch ? WORK : SHOTS, `${c.name}.png`), fullPage: true });
    const info = await inspect(page, cdp);
    // 去掉文字再截一张，用来核对文字区域下面是不是空白墙面
    await page.addStyleTag({ content: '.sign *{visibility:hidden!important}' });
    await page.screenshot({ path: path.join(WORK, `${c.name}-notext.png`), fullPage: true });
    report[c.name] = { dpr: c.dpr, scratch: !!c.scratch, ...info };
    if (c.name === 'desktop-1440') {
      // 动效中间帧：暂停所有动画，拨到 0.9s
      await page.addStyleTag({ content: '.sign *{visibility:visible!important}' });
      await page.evaluate(() => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = 900; }));
      await page.screenshot({ path: path.join(SHOTS, 'desktop-1440-anim-0.9s.png'), fullPage: true });
    }
    await ctx.close();
  }
  // 减少动态效果：全部静止
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await routeFonts(page);
  await page.goto(PAGE_URL, { waitUntil: 'load' });
  report.reducedMotion = await page.evaluate(() => ({
    running: document.getAnimations().length,
    names: [...document.querySelectorAll('.rec-dot,.wave,.note')].map((el) => getComputedStyle(el).animationName),
  }));
  await ctx.close();
  await browser.close();
  fs.writeFileSync(path.join(WORK, 'report.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report, null, 1));
})();
