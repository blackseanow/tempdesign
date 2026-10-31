// 截图和逐项自查。用法：node tools/shoot.cjs
// 需要 Playwright（require('playwright')）和 Chromium。霞鹜文楷：设 FONT_DIR 指到 npm 包 lxgw-wenkai-webfont@1.7.0 的目录，
// 页面里对 jsdelivr 的请求就从本地供给；不设就拦掉，用系统字体。
// 输出：screenshots/*.png（帧是 1440 宽，1x）和 screenshots/check.json；每项检查打印“通过/不通过”。
const { chromium } = require('playwright')
const http = require('http')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'screenshots')
const FONT_DIR = process.env.FONT_DIR
const SCRATCH = process.env.SCRATCH || path.join(require('os').tmpdir(), 'hero-v2-shoot')
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png' }
// 设计系统的颜色（ref/xianyu-demo-v2.html 的 :root）
const PALETTE = { paper: '#ECEAE1', sheet: '#F8F7F2', ink: '#24231F', 'ink-2': '#4E4C45', 'ink-3': '#6B685F', line: '#D6D2C4', 'line-2': '#E4E0D4', indigo: '#1F3A4D', 'indigo-2': '#2B4D65', cinnabar: '#B5382A', brass: '#85682F', velvet: '#A72F24', gold: '#D9B865', wood: '#6B4A2B' }
const rgb = h => `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`
const PAL_RGB = Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [rgb(v), k]))

const results = []
const check = (item, ok, detail) => { results.push({ item, ok, detail }); console.log(`${ok ? '通过' : '不通过'}  ${item}：${detail}`) }

function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname))
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end() }
      res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' })
      fs.createReadStream(p).pipe(res)
    })
    srv.listen(0, '127.0.0.1', () => resolve(srv))
  })
}

async function newPage(browser, opt = {}) {
  const ctx = await browser.newContext({ viewport: opt.viewport || { width: 1440, height: 900 }, deviceScaleFactor: opt.dpr || 1, reducedMotion: opt.reducedMotion || 'no-preference' })
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/lxgw-wenkai-webfont@1\.7\.0\/(.*)/, (route, req) => {
    if (!FONT_DIR) return route.abort()
    const rel = req.url().split('lxgw-wenkai-webfont@1.7.0/')[1].split('?')[0]
    route.fulfill({ path: path.join(FONT_DIR, rel) })
  })
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort())
  const page = await ctx.newPage()
  page.errors = []
  page.requests = []
  page.on('pageerror', e => page.errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|ERR_ABORTED/.test(m.text())) page.errors.push(m.text()) })
  page.on('request', r => page.requests.push(r.url()))
  return page
}

async function open(page, url) {
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForFunction(() => window.heroMotion)
  await page.evaluate(() => document.fonts.ready)
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  fs.mkdirSync(SCRATCH, { recursive: true })
  const srv = await serve()
  const base = `http://127.0.0.1:${srv.address().port}`
  const browser = await chromium.launch()
  const report = {}

  // ---------- 1. 桌面 1440：实时播放一遍 ----------
  let page = await newPage(browser)
  await open(page, `${base}/index.html`)
  const t0 = Date.now()
  const live = []
  while (Date.now() - t0 < 9500) {
    live.push(await page.evaluate(() => ({ t: heroMotion.time, playing: heroMotion.playing, after: +getComputedStyle(document.querySelector('.hero-after')).opacity })))
    await page.waitForTimeout(250)
  }
  const endState = live[live.length - 1]
  check('播放一次后停在“把脉后”', endState.t >= 8 && !endState.playing && endState.after > 0.99,
    `9.5 秒后 t=${endState.t.toFixed(2)}，playing=${endState.playing}，base-after 不透明度 ${endState.after}`)
  const wall = live.find(s => s.t >= 8)
  report.realtime = live
  await page.screenshot({ path: path.join(OUT, 'desktop-1440-end.png') })
  const src = await page.evaluate(() => ({ base: document.querySelector('.hero-base').currentSrc, after: document.querySelector('.hero-after').currentSrc, srcset: document.querySelector('.hero-base').getAttribute('srcset'), source: document.querySelector('picture source').getAttribute('srcset'), anchorsLoaded: performance.getEntriesByType('resource').some(e => e.name.endsWith('/anchors.json')) }))
  check('桌面用两张底图', src.base.endsWith('/img/base-before.webp') && src.after.endsWith('/img/base-after.webp'), `底层 ${path.basename(src.base)}，上层 ${path.basename(src.after)}；srcset “${src.srcset}”，静态图 source “${src.source}”`)
  check('http 打开时读 anchors.json', src.anchorsLoaded, src.anchorsLoaded ? '读到了 anchors.json' : '没有请求 anchors.json')

  // 点录音笔重播
  const btn = await page.$('.hero-replay')
  const box = await btn.boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(200)
  const r1 = await page.evaluate(() => ({ t: heroMotion.time, playing: heroMotion.playing }))
  await page.waitForTimeout(700)
  const r2 = await page.evaluate(() => ({ t: heroMotion.time, after: +getComputedStyle(document.querySelector('.hero-after')).opacity }))
  check('点录音笔重播', r1.playing && r1.t < 0.2 && r2.t > 0 && r2.t < 1 && r2.after < 0.01,
    `点击 0.2 秒后 t=${r1.t.toFixed(2)}（先用 0.45 秒淡回把脉前），0.9 秒后 t=${r2.t.toFixed(2)}，base-after 不透明度 ${r2.after}`)
  // 滚出视口暂停，滚回来接着播
  await page.evaluate(() => { const d = document.createElement('div'); d.style.height = '3000px'; document.body.append(d); window.scrollTo(0, 2500) })
  await page.waitForTimeout(300)
  const off1 = await page.evaluate(() => heroMotion.time)
  await page.waitForTimeout(800)
  const off2 = await page.evaluate(() => heroMotion.time)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(600)
  const back = await page.evaluate(() => heroMotion.time)
  check('滚出视口暂停', off2 === off1 && back > off2, `滚出后 0.8 秒内 t 停在 ${off1.toFixed(2)}，滚回 0.6 秒后 t=${back.toFixed(2)}`)
  check('桌面无报错', page.errors.length === 0, page.errors.length ? page.errors.join(' | ') : '控制台没有错误')

  // ---------- 2. 逐帧取样：道具、嘴、声浪 ----------
  const sampled = await page.evaluate(() => {
    const fx = document.querySelector('.hero-fx')
    const out = []
    for (let i = 0; i <= 160; i++) {
      const t = i * 0.05
      heroMotion.seek(t)
      const props = heroMotion.propStates(t).map(p => ({ id: p.id, phase: p.phase || null, x: p.x, y: p.y, k: p.scale || 0, rot: p.rot || 0, op: p.alpha || 0 }))
      const mouth = [...fx.querySelectorAll('.fx-mouth image')].findIndex(im => im.getAttribute('opacity') === '1')
      const waves = [...fx.querySelectorAll('.fx-waves path')].filter(p => (p.getAttribute('d') || '').length > 0 && +(p.getAttribute('opacity') || 1) > 0.02).length
      const rip = Math.max(...[...fx.querySelectorAll('.fx-ripple')].map(e => +(e.style.opacity || 0)))
      const seal = +fx.querySelector('.fx-seal').getAttribute('opacity')
      const after = +document.querySelector('.hero-after').style.opacity
      out.push({ t: +t.toFixed(2), props, inAir: heroMotion.propsInAir(t), mouth, waves, rip, seal, after })
    }
    const g = heroMotion.geometry()
    return { out, N: g.N, mic: g.mic, mouthFrames: fx.querySelectorAll('.fx-mouth image').length }
  })
  const samples = sampled.out
  const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y)
  report.samples = samples.map(s => ({ t: s.t, inAir: s.inAir, rest: s.props.filter(p => p.phase === 'rest').map(p => p.id), caught: s.props.filter(p => p.phase === 'caught' && p.op > 0.02).map(p => p.id), mouth: s.mouth, waves: s.waves, rip: s.rip, seal: s.seal, after: s.after }))
  const air = samples.filter(s => s.t > 0 && s.t < 4).map(s => s.inAir.length)
  check('同一时刻空中最多三样道具（把脉前）', Math.max(...air) <= 3, `0–4 秒每 0.05 秒取样：最多 ${Math.max(...air)} 样，1–3.6 秒最少 ${Math.min(...samples.filter(s => s.t >= 1 && s.t <= 3.6).map(s => s.inAir.length))} 样（落在桌上的不算）`)
  const order = []
  for (const s of samples) for (const id of s.inAir) if (!order.includes(id)) order.push(id)
  check('六样道具一样一样飘出来', order.length === 6, `出场顺序：${order.join(' → ')}`)
  const track = id => samples.map(s => Object.assign({ t: s.t }, s.props.find(p => p.id === id)))
  const ids = order
  // 每样道具飞的时候（不透明度过半），最大的那一刻比刚出来时离员工更近，大小至少是刚出来时的 2.5 倍
  const grow = ids.map(id => {
    const tr = track(id).filter(p => p.phase === 'air' && p.op > 0.5)
    const peak = tr.reduce((a, p) => (p.k > a.k ? p : a))
    return peak.x > tr[0].x ? peak.k / tr[0].k : 0
  })
  check('越靠近员工越大', grow.every(g => g > 2.5), `每样道具飞到最大时是刚出来时的 ${grow.map(g => g.toFixed(1)).join('、')} 倍`)
  const rocket = track('rocket').filter(p => p.op > 0.02)
  const others = ids.filter(id => id !== 'rocket').map(id => {
    const r = track(id).filter(p => p.phase === 'air' && p.op > 0.02).map(p => p.rot)
    return Math.max(...r) - Math.min(...r)
  })
  check('火箭机头朝上，其他道具翻滚', Math.max(...rocket.map(p => Math.abs(p.rot))) <= 5 && others.every(r => r >= 150),
    `火箭最大倾角 ${Math.max(...rocket.map(p => Math.abs(p.rot))).toFixed(1)}°；其他五样飞的时候转过 ${others.map(r => r.toFixed(0) + '°').join('、')}`)
  // 每一样都走同一条路：先落在笔记本旁边，收住时再被吸进录音笔（收住阶段每 0.01 秒取一次样，看每样最后出现在哪）
  const ends = await page.evaluate(() => {
    const last = {}
    for (let i = 400; i <= 600; i++) {
      const t = i / 100
      for (const p of heroMotion.propStates(t)) if (p.phase && p.alpha > 0.02 && p.scale > 0.005) last[p.id] = { t, x: p.x, y: p.y, phase: p.phase }
    }
    return last
  })
  const route = ids.map(id => {
    const firstRest = track(id).find(p => p.phase === 'rest')
    const end = ends[id]
    return { id, landT: firstRest ? firstRest.t : null, landD: firstRest ? dist(firstRest, sampled.N) : null, endPhase: end.phase, endD: dist(end, sampled.mic), goneT: end.t + 0.01 }
  })
  check('六样道具都先落到笔记本旁边', route.every(r => r.landT !== null && r.landT <= 4.2 && r.landD < 200),
    route.map(r => `${r.id} ${r.landT}s 落定（离笔记本 ${Math.round(r.landD)} px）`).join('；'))
  check('六样道具最后都被吸进录音笔', route.every(r => r.endPhase === 'caught' && r.endD < 25),
    route.map(r => `${r.id} ${r.goneT.toFixed(2)}s 消失在离机头 ${Math.round(r.endD)} px 处`).join('；'))
  const talk = samples.filter(s => s.t > 0 && s.t < 4)
  const flips = talk.reduce((n, s, i) => n + (i && s.mouth !== talk[i - 1].mouth ? 1 : 0), 0)
  const quiet = samples.filter(s => s.t >= 4).every(s => s.mouth === -1)
  check('领导说话时动嘴', sampled.mouthFrames === 3 && flips >= 20 && quiet,
    `嘴形 ${sampled.mouthFrames} 帧；0–4 秒取样里换了 ${flips} 次；4 秒以后${quiet ? '停在底图张嘴笑的样子' : '还在动'}`)
  const w04 = samples.find(s => s.t === 0.4).waves, w30 = samples.find(s => s.t === 3).waves
  check('声浪出嘴时两三道，越往后越多', w04 <= 3 && w30 >= 10, `0.4 秒 ${w04} 道，3 秒 ${w30} 道`)
  const gone = samples.find(s => s.t === 6)
  const ripMax = Math.max(...samples.filter(s => s.t >= 4 && s.t <= 6.5).map(s => s.rip))
  const left = gone.props.filter(p => p.phase).length
  check('收住：声浪吸进录音笔、道具消失、波纹亮一下', gone.waves === 0 && left === 0 && ripMax > 0.8,
    `6 秒时声浪 ${gone.waves} 道、道具 ${left} 样；波纹最亮 ${ripMax.toFixed(2)}`)
  const s68 = samples.find(s => s.t === 6.8), s8 = samples.find(s => s.t === 8)
  check('把脉后：交叉淡入 base-after，印章盖在材料上', s68.after > 0.99 && samples.find(s => s.t === 6).after < 0.01 && s8.seal > 0.9,
    `6 秒 → 6.8 秒 base-after 不透明度 0 → ${s68.after}；8 秒印章不透明度 ${s8.seal}`)

  // 颜色：动效层和录音笔铭牌里每个元素的 fill、stroke 都得是设计系统的颜色，朱砂只在印章里（嘴形是底图像素，不算）
  const colors = await page.evaluate(() => {
    heroMotion.seek(3)
    const used = []
    for (const el of document.querySelectorAll('.hero-fx *, .hero-decal *')) {
      if (['g', 'svg', 'image'].includes(el.tagName)) continue
      const cs = getComputedStyle(el)
      const inSeal = !!el.closest('.fx-seal'), inDecal = !!el.closest('.hero-decal')
      for (const prop of ['fill', 'stroke']) {
        const v = cs[prop]
        if (v && v !== 'none') used.push({ v, inSeal, inDecal, tag: el.tagName, cls: el.getAttribute('class') || '' })
      }
    }
    return used
  })
  const bad = colors.filter(c => !PAL_RGB[c.v])
  const redOut = colors.filter(c => PAL_RGB[c.v] === 'cinnabar' && !c.inSeal)
  const sealCols = [...new Set(colors.filter(c => c.inSeal).map(c => PAL_RGB[c.v]))]
  const decalCols = [...new Set(colors.filter(c => c.inDecal).map(c => PAL_RGB[c.v] || c.v))]
  const usedNames = [...new Set(colors.filter(c => !c.inSeal && !c.inDecal).map(c => PAL_RGB[c.v] || c.v))]
  check('声浪和道具只用设计系统的颜色', bad.length === 0, bad.length ? `不在色板里：${[...new Set(bad.map(b => b.v))].join('、')}` : `声浪和道具用到 ${usedNames.join('、')}；录音笔铭牌用 ${decalCols.join('、')}`)
  check('朱砂只出现在印章上', redOut.length === 0 && sealCols.includes('cinnabar') && sealCols.every(c => ['cinnabar', 'sheet'].includes(c)),
    `印章用 ${sealCols.join('、')}（朱砂印面、素笺图形）；印章以外的朱砂元素 ${redOut.length} 个`)

  // 帧：联系表
  const times = [0.5, 1.2, 1.9, 2.6, 3.3, 4.15, 4.5, 4.9, 5.5, 6.4, 7.1, 8.0]
  const stage = await page.$('.hero-stage')
  for (const t of times) {
    await page.evaluate(t => heroMotion.seek(t), t)
    await stage.screenshot({ path: path.join(SCRATCH, `frame-${t.toFixed(1)}.png`) })
  }
  await page.evaluate(() => heroMotion.seek(2.6))
  await page.screenshot({ path: path.join(OUT, 'desktop-1440-2.6s.png') })
  await page.evaluate(() => heroMotion.seek(8))
  const sb = await page.evaluate(() => { const g = heroMotion.geometry(), r = document.querySelector('.hero-stage').getBoundingClientRect(); return { x: r.x + g.S.x / 1916 * r.width, y: r.y + g.S.y / 821 * r.height, k: r.width / 1916 } })
  await page.screenshot({ path: path.join(SCRATCH, 'seal-1x.png'), clip: { x: sb.x - 110, y: sb.y - 55, width: 220, height: 110 } })
  report.frames = times
  await page.context().close()

  // 2x 屏的印章特写
  page = await newPage(browser, { dpr: 2 })
  await open(page, `${base}/index.html`)
  await page.evaluate(() => heroMotion.seek(8))
  const sb2 = await page.evaluate(() => { const g = heroMotion.geometry(), r = document.querySelector('.hero-stage').getBoundingClientRect(); return { x: r.x + g.S.x / 1916 * r.width, y: r.y + g.S.y / 821 * r.height } })
  await page.screenshot({ path: path.join(OUT, 'seal-close@2x.png'), clip: { x: sb2.x - 120, y: sb2.y - 60, width: 240, height: 120 } })
  // 嘴形特写：张嘴（底图）、大半张、半张、闭嘴各一帧；录音笔铭牌特写：把脉前、把脉后
  const mt = await page.evaluate(() => {
    const want = [-1, 2, 1, 0], got = {}
    for (let t = 0.1; t < 3.9 && Object.keys(got).length < 4; t += 0.01) {
      heroMotion.seek(t)
      const f = [...document.querySelectorAll('.fx-mouth image')].findIndex(im => im.getAttribute('opacity') === '1')
      if (want.includes(f) && !(f in got)) got[f] = t
    }
    const g = heroMotion.geometry(), r = document.querySelector('.hero-stage').getBoundingClientRect()
    return { times: want.map(f => got[f]), m: { x: r.x + (g.M.x - 22) / 1916 * r.width, y: r.y + g.M.y / 821 * r.height }, rec: { x: r.x + g.R.x / 1916 * r.width, y: r.y + g.R.y / 821 * r.height } }
  })
  for (const [i, t] of mt.times.entries()) {
    await page.evaluate(t => heroMotion.seek(t), t)
    await page.screenshot({ path: path.join(SCRATCH, `mouth-${i}.png`), clip: { x: mt.m.x - 60, y: mt.m.y - 34, width: 120, height: 68 } })
  }
  for (const [i, t] of [2.6, 8].entries()) {
    await page.evaluate(t => heroMotion.seek(t), t)
    await page.screenshot({ path: path.join(SCRATCH, `rec-${i}.png`), clip: { x: mt.rec.x - 45, y: mt.rec.y - 60, width: 90, height: 120 } })
  }
  await page.context().close()

  // ---------- 3. 减少动态效果 ----------
  page = await newPage(browser, { reducedMotion: 'reduce' })
  await open(page, `${base}/index.html`)
  await page.waitForTimeout(1500)
  const rm = await page.evaluate(() => ({ decal: getComputedStyle(document.querySelector('.hero-decal')).display, src: document.querySelector('.hero-base').currentSrc, fx: getComputedStyle(document.querySelector('.hero-fx')).display, after: getComputedStyle(document.querySelector('.hero-after')).display, btn: getComputedStyle(document.querySelector('.hero-replay')).display, animated: heroMotion.animated, t: heroMotion.time, playing: heroMotion.playing }))
  const rmReq = page.requests.filter(u => /base-(before|after)/.test(u)).map(u => path.basename(u))
  check('减少动态效果：直接显示 hero-static', rm.src.endsWith('/img/hero-static.webp') && rm.fx === 'none' && rm.after === 'none' && rm.btn === 'none' && !rm.animated && rm.t === 0 && !rm.playing,
    `显示 ${path.basename(rm.src)}；动效层 display:${rm.fx}；1.5 秒后 t=${rm.t}；下载过的底图：${rmReq.length ? rmReq.join('、') : '无'}`)
  await page.screenshot({ path: path.join(OUT, 'reduced-motion-1440.png') })
  check('静态图上也印着录音笔 logo', rm.decal !== 'none', `减少动态效果时铭牌 display:${rm.decal}`)
  check('减少动态效果无报错', page.errors.length === 0, page.errors.join(' | ') || '控制台没有错误')
  await page.context().close()

  // ---------- 4. 手机 390 ----------
  page = await newPage(browser, { viewport: { width: 390, height: 844 }, dpr: 3 })
  await open(page, `${base}/index.html`)
  await page.waitForTimeout(1000)
  const mo = await page.evaluate(() => ({ src: document.querySelector('.hero-base').currentSrc, fx: getComputedStyle(document.querySelector('.hero-fx')).display, animated: heroMotion.animated, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
  const moReq = page.requests.filter(u => /\.webp$/.test(u)).map(u => path.basename(u))
  check('不宽于 820px：直接显示 hero-static', mo.src.endsWith('/img/hero-static.webp') && mo.fx === 'none' && !mo.animated, `显示 ${path.basename(mo.src)}；下载的图：${moReq.join('、')}`)
  check('手机不横向滚动', mo.sw <= mo.cw, `scrollWidth ${mo.sw}，clientWidth ${mo.cw}`)
  await page.screenshot({ path: path.join(OUT, 'mobile-390@3x.png') })
  await page.context().close()

  // 820 / 821 分界（bamai10 的手机断点）
  for (const w of [820, 821]) {
    page = await newPage(browser, { viewport: { width: w, height: 800 } })
    await open(page, `${base}/index.html`)
    const v = await page.evaluate(() => ({ src: document.querySelector('.hero-base').currentSrc, animated: heroMotion.animated }))
    check(`${w} 宽`, (w <= 820) === !v.animated && v.src.endsWith(w <= 820 ? 'hero-static.webp' : 'base-before.webp'), `${path.basename(v.src)}，${v.animated ? '播动画' : '静态'}`)
    await page.context().close()
  }

  // 运行中把窗口拉窄再拉宽
  page = await newPage(browser)
  await open(page, `${base}/index.html`)
  await page.waitForTimeout(1000)
  await page.setViewportSize({ width: 700, height: 900 })
  await page.waitForTimeout(400)
  const narrow = await page.evaluate(() => ({ src: document.querySelector('.hero-base').currentSrc, playing: heroMotion.playing }))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForTimeout(400)
  const wide = await page.evaluate(() => ({ t: heroMotion.time, after: document.querySelector('.hero-after').style.opacity }))
  check('播放中拉窄到 700 再拉回', narrow.src.endsWith('hero-static.webp') && !narrow.playing && wide.t === 8 && wide.after === '1',
    `拉窄后显示 ${path.basename(narrow.src)}、动画停；拉回后停在把脉后（t=${wide.t}）`)
  await page.context().close()

  // ---------- 5. 调试模式 ----------
  page = await newPage(browser, { viewport: { width: 1440, height: 1000 } })
  await open(page, `${base}/index.html?debug=1`)
  await page.waitForSelector('.hero-debug-pin')
  await page.evaluate(() => heroMotion.seek(3))
  const pins = await page.$$eval('.hero-debug-pin span', s => s.map(x => x.textContent))
  check('?debug=1 标出锚点', pins.length === 4, pins.join('；'))
  // 拖动“录音笔”往右 20px，JSON 跟着变
  const pin = await page.$('.hero-debug-pin[data-key="recorder"]')
  const pb = await pin.boundingBox()
  await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2)
  await page.mouse.down()
  await page.mouse.move(pb.x + pb.width / 2 + 20, pb.y + pb.height / 2, { steps: 4 })
  await page.mouse.up()
  const json = await page.$eval('.hero-debug-panel textarea', t => JSON.parse(t.value))
  const dx = json.recorder.x - 48.17
  check('拖动锚点，JSON 跟着变', Math.abs(dx - 20 / 1440 * 100) < 0.2, `录音笔 x 从 48.17 变成 ${json.recorder.x}（拖了 20px ≈ ${(20 / 1440 * 100).toFixed(2)}%）`)
  await page.click('.hero-debug-panel [data-act="reset"]')
  await page.screenshot({ path: path.join(OUT, 'debug-1440.png') })
  check('调试模式无报错', page.errors.length === 0, page.errors.join(' | ') || '控制台没有错误')
  await page.context().close()

  // file:// 打开：读不到 anchors.json，用内嵌副本
  page = await newPage(browser)
  await page.goto('file://' + path.join(ROOT, 'index.html') + '?debug=1')
  await page.waitForSelector('.hero-debug-pin')
  const fileSrc = await page.$eval('.hd-src', e => e.textContent)
  check('file:// 打开用内嵌锚点', /内嵌副本/.test(fileSrc), fileSrc)
  await page.context().close()

  await browser.close()
  srv.close()
  fs.writeFileSync(path.join(OUT, 'check.json'), JSON.stringify({ results, samples: report.samples }, null, 1) + '\n')
  // 联系表交给 Python 拼（带时间标注）
  execFileSync('python3', [path.join(__dirname, 'sheet.py'), SCRATCH, OUT, times.join(',')], { stdio: 'inherit' })
  const fail = results.filter(r => !r.ok)
  console.log(fail.length ? `\n${fail.length} 项不通过` : '\n全部通过')
  process.exit(fail.length ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
