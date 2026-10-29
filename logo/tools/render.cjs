// 渲染与拼图：node tools/render.cjs（在 logo/ 下，先跑 python3 tools/build.py）
//
// 1. 每个候选的印章 × 三个版本 × 16/32/64/180 px → png/<候选>/
// 2. 三个场景模拟（浏览器标签页、左侧导航顶部、登录页标题）→ screenshots/scenes/
// 3. 联系表 → screenshots/sheet.png；文字组合总览 → screenshots/lockups.png
//
// 全部用 deviceScaleFactor 1 栅格化：16 px 就是 16 个设备像素，与浏览器在普通屏幕上画 favicon 一致。
// 放大图用最近邻（image-rendering: pixelated），看到的是真实像素，不是重新插值的结果。
// 场景里的界面文字（导航、表单）用霞鹜文楷 webfont（从本地 npm 包供给），浏览器标签栏用文泉驿正黑代替系统界面字体；
// 这些界面文字只是示意，不属于 Logo。
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FONT_DIR = process.env.LXGW_DIR || path.join(ROOT, 'node_modules', 'lxgw-wenkai-webfont');
const SVG = path.join(ROOT, 'svg');
const PNG = path.join(ROOT, 'png');
const SHOTS = path.join(ROOT, 'screenshots');
const SCENES = path.join(SHOTS, 'scenes');
const SIZES = [16, 32, 64, 180];
const VERSIONS = ['color', 'mono', 'reverse'];
const VLABEL = { color: '全彩', mono: '单色墨', reverse: '反白（函套青底）' };
const C = { cinnabar: '#B5382A', sheet: '#F8F7F2', ink: '#24231F', indigo: '#1F3A4D', paper: '#ECEAE1', ink2: '#4E4C45', ink3: '#6B685F', line: '#D6D2C4', gold: '#C9A86A' };

const manifest = JSON.parse(fs.readFileSync(path.join(SVG, 'manifest.json'), 'utf8'));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel));
const svgUri = (rel) => 'data:image/svg+xml;base64,' + read(rel).toString('base64');
const pngUri = (buf) => 'data:image/png;base64,' + buf.toString('base64');

async function routeFonts(page) {
  await page.route('https://fonts.local/**', (route) => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
    const file = path.join(FONT_DIR, rel);
    if (!fs.existsSync(file)) return route.fulfill({ status: 404 });
    route.fulfill({
      status: 200,
      contentType: file.endsWith('.css') ? 'text/css' : 'font/woff2',
      headers: { 'access-control-allow-origin': '*' },
      body: fs.readFileSync(file),
    });
  });
}

const FONT_CSS = '<link rel="stylesheet" href="https://fonts.local/lxgwwenkai-regular.css"><link rel="stylesheet" href="https://fonts.local/lxgwwenkai-bold.css">';

async function load(page, html) {
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
}

async function shoot(page, html, selector, opts = {}) {
  await load(page, html);
  return page.locator(selector).screenshot({ omitBackground: !!opts.transparent });
}

// ---------------------------------------------------------------- 1. 各尺寸 PNG

async function renderSizes(page) {
  const out = {};
  for (const c of manifest.candidates) {
    fs.mkdirSync(path.join(PNG, c.key), { recursive: true });
    out[c.key] = {};
    for (const v of VERSIONS) {
      out[c.key][v] = {};
      for (const s of SIZES) {
        const html = `<html><body style="margin:0"><img id="i" src="${svgUri(c.files['seal-' + v])}" width="${s}" height="${s}" style="display:block"></body></html>`;
        const buf = await shoot(page, html, '#i', { transparent: true });
        fs.writeFileSync(path.join(PNG, c.key, `${c.key}-seal-${v}-${s}.png`), buf);
        out[c.key][v][s] = buf;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- 2. 场景

function tabScene(c, theme) {
  const dark = theme === 'dark';
  const t = dark
    ? { strip: '#202124', active: '#35363A', text: '#E8EAED', dim: '#9AA0A6', bar: '#35363A', box: '#202124' }
    : { strip: '#DEE1E6', active: '#FFFFFF', text: '#202124', dim: '#5F6368', bar: '#FFFFFF', box: '#F1F3F4' };
  return `<html><head><style>
    body{margin:0}
    #s{width:300px;background:${t.strip};font:12px/1 "WenQuanYi Zen Hei",sans-serif;color:${t.text}}
    .tabs{display:flex;align-items:flex-end;height:34px;padding:0 0 0 8px}
    .tab{display:flex;align-items:center;gap:8px;height:28px;padding:0 10px 0 12px;width:150px;box-sizing:border-box;border-radius:8px 8px 0 0}
    .tab.on{background:${t.active}}
    .tab span{flex:1;white-space:nowrap;overflow:hidden}
    .tab i{font-style:normal;color:${t.dim}}
    .tab.off span{color:${t.dim}}
    .ph{width:16px;height:16px;border-radius:50%;background:${t.dim};opacity:.5}
    .bar{background:${t.bar};padding:6px 8px 8px}
    .box{height:22px;border-radius:11px;background:${t.box}}
  </style></head><body><div id="s">
    <div class="tabs"><div class="tab on"><img src="${svgUri(c.files['seal-color'])}" width="16" height="16"><span>咸鱼把脉了</span><i>×</i></div>
      <div class="tab off"><div class="ph"></div><span>新标签页</span></div></div>
    <div class="bar"><div class="box"></div></div></div></body></html>`;
}

function navScene(c) {
  // 尺寸照 ref/xianyu-demo-v2.html 的左侧导航：78 px 宽的函套青竖栏，顶部题签，下面是竖排导航
  return `<html><head>${FONT_CSS}<style>
    body{margin:0}
    #s{width:78px;height:300px;overflow:hidden;background:${C.indigo};display:flex;flex-direction:column;align-items:center;gap:18px;padding-top:18px;box-sizing:border-box}
    #s img{width:38px;display:block}
    nav{display:flex;flex-direction:column;align-items:center;gap:2px}
    nav b{position:relative;writing-mode:vertical-rl;font:400 17px/1 "LXGW WenKai";letter-spacing:.2em;color:rgba(236,234,225,.62);padding:12px 14px}
    nav b.on{color:#fff}
    nav b.on::before{content:"";position:absolute;left:0;top:12px;bottom:12px;width:2px;background:${C.gold}}
  </style></head><body><div id="s"><img src="${svgUri(c.files['v-color'])}">
    <nav><b class="on">医馆</b><b>病历</b><b>先生</b></nav></div></body></html>`;
}

function loginScene(c) {
  return `<html><head>${FONT_CSS}<style>
    body{margin:0}
    #s{width:360px;height:236px;background:${C.paper};display:grid;place-items:center;font:14px/1.4 "LXGW WenKai",serif;color:${C.ink}}
    .card{width:300px;padding:22px 26px 20px;box-sizing:border-box;background:${C.sheet};border:1px solid ${C.line};border-radius:2px}
    .card img{display:block;height:44px;margin:0 auto 18px}
    .f{height:32px;border:1px solid ${C.line};border-radius:2px;margin-bottom:10px;padding:0 10px;display:flex;align-items:center;color:${C.ink3};background:#fff;font-size:13px}
    .b{height:34px;border-radius:2px;background:${C.indigo};color:${C.sheet};display:grid;place-items:center;letter-spacing:.3em;margin-top:4px}
  </style></head><body><div id="s"><div class="card"><img src="${svgUri(c.files['h-color'])}">
    <div class="f">账号</div><div class="f">密码</div><div class="b">登录</div></div></div></body></html>`;
}

async function renderScenes(page) {
  fs.mkdirSync(SCENES, { recursive: true });
  const out = {};
  for (const c of manifest.candidates) {
    const s = {};
    s.tabLight = await shoot(page, tabScene(c, 'light'), '#s');
    s.tabActive = await page.locator('.tab.on').screenshot();
    s.tabDark = await shoot(page, tabScene(c, 'dark'), '#s');
    s.nav = await shoot(page, navScene(c), '#s');
    s.login = await shoot(page, loginScene(c), '#s');
    for (const [k, buf] of Object.entries(s)) fs.writeFileSync(path.join(SCENES, `${c.key}-${k}.png`), buf);
    out[c.key] = s;
  }
  return out;
}

// ---------------------------------------------------------------- 3. 联系表

function sheetHtml(sizes, scenes) {
  const font = manifest.font;
  const row = (c) => {
    const z = sizes[c.key];
    const sc = scenes[c.key];
    const tile = (v) => `<div class="t ${v}"><img src="${pngUri(z[v][180])}" width="180" height="180"><span>${VLABEL[v]} 180</span></div>`;
    const small = VERSIONS.map((v) => `<div class="sm ${v}">${[64, 32, 16].map((s) => `<img src="${pngUri(z[v][s])}" width="${s}" height="${s}">`).join('')}</div>`).join('');
    return `<section class="row">
      <div class="lab"><b>${c.key}</b><em>${c.name}</em><span>${c.direction}</span></div>
      ${VERSIONS.map(tile).join('')}
      <div class="col"><div class="smg">${small}</div><span>64 / 32 / 16 实际像素</span></div>
      <div class="col"><div class="zoom"><img class="px" src="${pngUri(z.color[16])}" width="96" height="96"><img class="px" src="${pngUri(z.mono[16])}" width="96" height="96"></div><span>16 px 放大 6 倍<br>（全彩 / 单色墨）</span></div>
      <div class="col tabs"><img src="${pngUri(sc.tabLight)}" width="300"><img src="${pngUri(sc.tabDark)}" width="300">
        <img class="px" src="${pngUri(sc.tabActive)}" width="300" height="56">
        <span>浏览器标签页（上：浅色、深色，1 倍；下：当前标签放大 2 倍）</span></div>
      <div class="col"><img src="${pngUri(sc.nav)}" width="78" height="300"><span>左侧导航顶部</span></div>
      <div class="col"><img src="${pngUri(sc.login)}" width="360" height="236"><span>登录页标题</span></div>
    </section>`;
  };
  return `<html><head><style>
    body{margin:0;padding:24px 28px 18px;background:${C.paper};font:13px/1.45 "WenQuanYi Zen Hei",sans-serif;color:${C.ink};width:max-content}
    h1{font-size:22px;margin:0 0 4px}
    .sub{color:${C.ink2};margin:0 0 14px}
    .row{display:flex;align-items:flex-start;gap:14px;padding:14px 0;border-top:1px solid ${C.line}}
    .lab{width:96px;display:flex;flex-direction:column;gap:2px}
    .lab b{font-size:28px;line-height:1}
    .lab em{font-style:normal;font-size:15px}
    .lab span{color:${C.ink3};font-size:12px}
    .t{display:flex;flex-direction:column;gap:4px;font-size:12px;color:${C.ink3}}
    .t.color img,.t.mono img{background:${C.sheet}}
    .col{display:flex;flex-direction:column;gap:6px;font-size:12px;color:${C.ink3}}
    .smg{display:flex;flex-direction:column;gap:8px}
    .sm{display:flex;align-items:flex-end;gap:8px;padding:6px;background:${C.sheet}}
    .sm.reverse{background:${C.indigo}}
    .zoom{display:flex;flex-direction:column;gap:8px}
    .px{image-rendering:pixelated}
    .tabs img{display:block}
    .foot{margin-top:10px;color:${C.ink3};font-size:12px;border-top:1px solid ${C.line};padding-top:8px}
  </style></head><body>
    <h1>咸鱼把脉了 · Logo 候选联系表</h1>
    <p class="sub">主标志：朱砂方印，印里表现“三指搭脉”。A 三指按脉 · B 寸关尺 · C 一笔搭脉，每个方向两个变体。180 / 64 / 32 / 16 均为 Chromium 按 1 倍像素栅格化的结果。</p>
    ${manifest.candidates.map(row).join('')}
    <div class="foot">文字：${font.family} ${font.style}（${font.version}），fonttools 取字形转路径。场景里的界面文字只是示意：标签栏用文泉驿正黑代替系统字体，导航和表单用霞鹜文楷 webfont。全彩、单色墨两列放在素笺底上，反白版自带函套青底。</div>
  </body></html>`;
}

function checkHtml(sizes) {
  const cell = (buf, s, z, v) => `<div class="k ${v}"><img class="px" src="${pngUri(buf)}" width="${s * z}" height="${s * z}"></div>`;
  const row = (c) => `<section class="row"><div class="lab"><b>${c.key}</b><em>${c.name}</em></div>
    ${VERSIONS.map((v) => cell(sizes[c.key][v][16], 16, 8, v) + cell(sizes[c.key][v][32], 32, 4, v)).join('')}</section>`;
  return `<html><head><style>
    body{margin:0;padding:24px 28px;background:${C.paper};font:13px/1.45 "WenQuanYi Zen Hei",sans-serif;color:${C.ink};width:max-content}
    h1{font-size:20px;margin:0 0 4px} .sub{margin:0 0 12px;color:${C.ink2}}
    .row{display:flex;gap:12px;align-items:center;padding:10px 0;border-top:1px solid ${C.line}}
    .lab{width:90px;display:flex;flex-direction:column}.lab b{font-size:26px;line-height:1}.lab em{font-style:normal}
    .k{padding:8px;background:${C.sheet}} .k.reverse{background:${C.indigo}}
    .px{image-rendering:pixelated;display:block}
    .head{display:flex;gap:12px;margin-left:102px;color:${C.ink3};font-size:12px}
    .head span{width:144px} .head span:nth-child(2n){width:144px}
  </style></head><body><h1>16 / 32 px 自查（真实像素放大）</h1>
  <p class="sub">每格先按 1 倍像素栅格化，再最近邻放大：16 px 放大 8 倍，32 px 放大 4 倍。顺序：全彩 16、全彩 32、单色墨 16、单色墨 32、反白 16、反白 32。</p>
  ${manifest.candidates.map(row).join('')}</body></html>`;
}

function lockupsHtml() {
  const row = (c) => `<section class="row"><div class="lab"><b>${c.key}</b><em>${c.name}</em></div>
    <div class="h">${VERSIONS.map((v) => `<div class="hb ${v}"><img src="${svgUri(c.files['h-' + v])}" style="height:${v === 'reverse' ? 72 : 48}px"><span>横排 · ${VLABEL[v]}</span></div>`).join('')}</div>
    <div class="v">${VERSIONS.map((v) => `<div class="vb ${v}"><img src="${svgUri(c.files['v-' + v])}" width="60"><span>${VLABEL[v]}</span></div>`).join('')}</div></section>`;
  return `<html><head><style>
    body{margin:0;padding:24px 28px;background:${C.paper};font:13px/1.45 "WenQuanYi Zen Hei",sans-serif;color:${C.ink};width:max-content}
    h1{font-size:22px;margin:0 0 12px}
    .row{display:flex;gap:28px;align-items:flex-start;padding:16px 0;border-top:1px solid ${C.line}}
    .lab{width:90px;display:flex;flex-direction:column}
    .lab b{font-size:26px;line-height:1}
    .lab em{font-style:normal}
    .h{display:flex;flex-direction:column;gap:12px;width:360px}
    .hb{display:flex;flex-direction:column;gap:4px;font-size:12px;color:${C.ink3}}
    .hb img{align-self:flex-start}
    .hb.color img,.hb.mono img{background:${C.sheet};padding:6px}
    .v{display:flex;gap:18px;align-items:flex-start}
    .vb{display:flex;flex-direction:column;gap:4px;font-size:12px;color:${C.ink3};align-items:center}
    .vb.color{background:${C.indigo};padding:10px 14px}
    .vb.color span{color:${C.sheet}}
    .vb.mono{background:${C.sheet};padding:10px 14px}
  </style></head><body><h1>文字组合：横排版、竖排题签版（每个候选三个版本）</h1>${manifest.candidates.map(row).join('')}</body></html>`;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await routeFonts(page);
  const sizes = await renderSizes(page);
  const scenes = await renderScenes(page);

  const sheet = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1200, height: 800 } });
  await routeFonts(sheet);
  await sheet.setContent(sheetHtml(sizes, scenes), { waitUntil: 'load' });
  await sheet.evaluate(() => document.fonts.ready);
  await sheet.screenshot({ path: path.join(SHOTS, 'sheet.png'), fullPage: true });

  await sheet.setContent(lockupsHtml(), { waitUntil: 'load' });
  await sheet.screenshot({ path: path.join(SHOTS, 'lockups.png'), fullPage: true });

  await sheet.setContent(checkHtml(sizes), { waitUntil: 'load' });
  await sheet.screenshot({ path: path.join(SHOTS, 'check-16-32.png'), fullPage: true });

  // 渲染环境，写进 README
  const env = { chromium: browser.version(), deviceScaleFactor: 1 };
  fs.writeFileSync(path.join(SHOTS, 'render-env.json'), JSON.stringify(env, null, 2) + '\n');
  await browser.close();
  console.log('ok', env);
})();
