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
      const cs = getComputedStyle(p);
      const f = hex(cs.fill === 'none' ? cs.stroke : cs.fill);
      fills[f] = (fills[f] || 0) + 1;
      if (f === '#B5382A') red.push({ cls: p.getAttribute('class'), rect: r(p) });
    }
    const anim = (sel) => [...document.querySelectorAll(sel)].map((el) => {
      const cs = getComputedStyle(el);
      return `${cs.animationName}/${cs.animationDuration}/${cs.animationIterationCount}/${cs.animationDelay}`;
    });
    return {
      sign: r(document.querySelector('.hero-sign')), plaque: r(document.querySelector('.hero-plaque')),
      motto: r(document.querySelector('.hero-motto')), art: r(document.querySelector('.hero-art')),
      recDot: r(document.querySelector('.rec-dot')), pathCount: paths.length, fills,
      offPalette: Object.keys(fills).filter((f) => !PALETTE.includes(f)), red,
      anim: { dot: anim('.rec-dot'), wave: anim('.wave'), note: anim('.note'), dash: anim('.dash'),
              talk: anim('.talk'), scrib: anim('.scrib') },
      fontsOk: ['LXGW WenKai', 'Noto Serif SC'].map((f) => `${f}: ${document.fonts.check(`16px "${f}"`, '咸鱼把脉了领导一字不落对症开方按时交差')}`),
    };
  }, PALETTE);
  // 实际排版用到的字体（排查方块字）
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  data.platformFonts = {};
  for (const sel of ['.hero-plaque span', '.hero-motto span']) {
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
    // 动效一直循环：定格在 0s，三张纸笺正好在设计位置（之后每 1.6s 重合一次）
    await page.evaluate(() => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = 0; }));
    await page.screenshot({ path: path.join(c.scratch ? WORK : SHOTS, `${c.name}.png`), fullPage: true });
    const info = await inspect(page, cdp);
    // 去掉文字再截一张，用来核对文字区域下面是不是空白墙面
    await page.addStyleTag({ content: '.hero-sign *{visibility:hidden!important}' });
    await page.screenshot({ path: path.join(WORK, `${c.name}-notext.png`), fullPage: true });
    await page.addStyleTag({ content: '.hero-sign *{visibility:visible!important}' });
    // 整个循环里，会动的部件都不碰文字框（外扩 8px）：每 0.1s 量一次
    info.motion = await page.evaluate(() => {
      const box = (el) => el.getBoundingClientRect();
      const s = box(document.querySelector('.hero-sign'));
      const movers = [...document.querySelectorAll('.note,.dash,.talk,.scrib')];
      let hits = 0, worst = Infinity;
      for (let t = 0; t < 4800; t += 100) {
        document.getAnimations().forEach((a) => { a.currentTime = t; });
        for (const m of movers) {
          const r = box(m);
          if (getComputedStyle(m).opacity === '0') continue;
          worst = Math.min(worst, r.top - s.bottom);
          if (r.right > s.left - 8 && r.left < s.right + 8 && r.bottom > s.top - 8 && r.top < s.bottom + 8) hits++;
        }
      }
      return { hits, gapPx: Math.round(worst * 10) / 10 };
    });
    report[c.name] = { dpr: c.dpr, scratch: !!c.scratch, ...info };
    if (c.name === 'desktop-1440') {
      // 一个循环 4.8s，每 0.4s 一帧，存进工作目录，由 check.py 拼成联系表、逐帧查红色
      const art = await page.locator('.hero-art').boundingBox();
      const k = art.width / 1916;
      const clip = { x: art.x + 520 * k, y: art.y + 230 * k, width: 780 * k, height: 290 * k };
      for (let i = 0; i < 12; i++) {
        await page.evaluate((t) => document.getAnimations().forEach((a) => { a.currentTime = t; }), i * 400);
        await page.screenshot({ path: path.join(WORK, `loop-${i}.png`), clip });
      }
      report[c.name].loopClip = clip;
      report[c.name].recDotLoop = await page.evaluate(() => {
        const b = document.querySelector('.rec-dot').getBoundingClientRect(); return { x: b.x, y: b.y + scrollY, w: b.width, h: b.height };
      });
    }
    await ctx.close();
  }
  // 滚出视口暂停、滚回来接着播
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await routeFonts(page);
    await page.goto(PAGE_URL, { waitUntil: 'load' });
    await page.evaluate(() => { const d = document.createElement('div'); d.style.height = '3000px'; document.body.append(d); });
    const state = () => page.evaluate(() => {
      const fly = document.getAnimations().find((a) => a.animationName === 'hero-fly');
      return { paused: document.querySelector('.hero-art').classList.contains('hero-paused'),
        states: [...new Set(document.getAnimations().map((a) => a.playState))], t: fly.currentTime };
    });
    await page.waitForTimeout(400);
    const before = await state();
    await page.evaluate(() => scrollTo(0, 2500));
    await page.waitForTimeout(300);
    const out1 = await state();
    await page.waitForTimeout(600);
    const out2 = await state();
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(300);
    const back1 = await state();
    await page.waitForTimeout(400);
    const back2 = await state();
    report.pause = { before, out1, out2, back1, back2 };
    await ctx.close();
  }
  // 减少动态效果：全部静止
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await routeFonts(page);
  await page.goto(PAGE_URL, { waitUntil: 'load' });
  report.reducedMotion = await page.evaluate(() => ({
    running: document.getAnimations().length,
    names: [...document.querySelectorAll('.rec-dot,.wave,.note,.dash,.talk,.scrib')].map((el) => getComputedStyle(el).animationName),
    hidden: [...document.querySelectorAll('.pre,.talk,.scrib')].map((el) => getComputedStyle(el).opacity),
  }));
  await page.screenshot({ path: path.join(WORK, 'reduced.png') });
  await ctx.close();
  await browser.close();
  fs.writeFileSync(path.join(WORK, 'report.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report, null, 1));
})();
