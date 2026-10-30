// logo 候选对比图：把仓库里 12 款候选（logo-b/ 六款、logo/ 六款）逐一放进招牌里，
// 截录音笔铭牌和盖在材料上的印章特写，拼成 screenshots/logo-options.png。不改任何交付文件。
// 用法：node tools/logo_options.cjs    （需要 Playwright、Chromium；FONT_DIR 同 shoot.cjs，可不设）
const { chromium } = require('playwright')
const http = require('http')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const REPO = path.resolve(ROOT, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hero-v2-logos-'))
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml' }
const logos = JSON.parse(execFileSync('python3', [path.join(__dirname, 'build.py'), '--logo-markup'], { encoding: 'utf8' }))

// 仓库根目录整个供出来：页面在 /hero-v2/，候选原图在 /logo-b/、/logo/
const srv = http.createServer((req, res) => {
  const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname))
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end() }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' })
  fs.createReadStream(p).pipe(res)
})

srv.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${srv.address().port}`
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await ctx.route(/cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/, (route, req) => {
    const m = /lxgw-wenkai-webfont@1\.7\.0\/([^?]*)/.exec(req.url())
    return process.env.FONT_DIR && m ? route.fulfill({ path: path.join(process.env.FONT_DIR, m[1]) }) : route.abort()
  })
  const page = await ctx.newPage()
  await page.goto(`${base}/hero-v2/index.html`)
  await page.waitForFunction(() => window.heroMotion)
  await page.evaluate(() => heroMotion.seek(8))
  const box = await page.evaluate(() => {
    const g = heroMotion.geometry(), r = document.querySelector('.hero-stage').getBoundingClientRect()
    const at = p => ({ x: r.x + p.x / 1916 * r.width, y: r.y + p.y / 821 * r.height })
    return { rec: at(g.R), stack: at(g.S) }
  })
  const rows = []
  for (const [spec, v] of Object.entries(logos)) {
    await page.evaluate(v => {
      document.querySelector('.fx-seal').innerHTML = v.stamp
      document.querySelector('.hero-decal .decal-mark').innerHTML = v.mark
      document.querySelector('.hero-decal .decal-word').innerHTML = v.word[0]
    }, v)
    const id = spec.replace('/', '-')
    await page.screenshot({ path: path.join(TMP, `${id}-rec.png`), clip: { x: box.rec.x - 40, y: box.rec.y - 58, width: 80, height: 112 } })
    await page.screenshot({ path: path.join(TMP, `${id}-stamp.png`), clip: { x: box.stack.x - 105, y: box.stack.y - 48, width: 210, height: 96 } })
    rows.push({ spec, name: v.name, id })
  }
  // 候选原稿（全彩印章），按原文件渲染
  const ref = await browser.newPage({ viewport: { width: 200, height: 200 }, deviceScaleFactor: 2 })
  for (const r of rows) {
    const [group, key] = r.spec.split('/')
    const file = group === 'logo-b' ? `/logo-b/svg/${key}/${key}-seal-color.svg` : `/logo/candidates/${key}/mark-color.svg`
    await ref.setContent(`<body style="margin:0;background:#ECEAE1"><img src="${base}${file}" style="display:block;width:96px;height:96px;margin:8px"></body>`)
    await ref.waitForTimeout(150)
    await ref.screenshot({ path: path.join(TMP, `${r.id}-ref.png`), clip: { x: 0, y: 0, width: 112, height: 112 } })
  }
  await browser.close()
  srv.close()
  fs.writeFileSync(path.join(TMP, 'rows.json'), JSON.stringify(rows))
  execFileSync('python3', [path.join(__dirname, 'sheet.py'), 'logos', TMP, path.join(ROOT, 'screenshots')], { stdio: 'inherit' })
  fs.rmSync(TMP, { recursive: true })
})
