// 录一段动效视频：screenshots/hero-v2.mp4（1440 宽，25 帧/秒，8 秒动画 + 结尾停 1 秒）。
// 每帧用 heroMotion.seek(t) 定格再截图，截得再慢也不掉帧、不变速。需要 Playwright、Chromium 和 ffmpeg。
// 用法：node tools/record.cjs    （FONT_DIR 同 shoot.cjs）
const { chromium } = require('playwright')
const http = require('http')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const FONT_DIR = process.env.FONT_DIR
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'hero-v2-rec-'))
const FPS = 25, END = 8, HOLD = 1
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp' }

const srv = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname))
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end() }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' })
  fs.createReadStream(p).pipe(res)
})

srv.listen(0, '127.0.0.1', async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.route(/cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/, (route, req) => {
    const m = /lxgw-wenkai-webfont@1\.7\.0\/([^?]*)/.exec(req.url())
    return FONT_DIR && m ? route.fulfill({ path: path.join(FONT_DIR, m[1]) }) : route.abort()
  })
  const page = await ctx.newPage()
  await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`)
  await page.waitForFunction(() => window.heroMotion)
  const stage = await page.$('.hero-stage')
  const n = Math.round(END * FPS)
  for (let i = 0; i <= n + HOLD * FPS; i++) {
    await page.evaluate(t => heroMotion.seek(t), Math.min(i / FPS, END))
    await stage.screenshot({ path: path.join(TMP, `f${String(i).padStart(4, '0')}.png`) })
  }
  await browser.close()
  srv.close()
  const out = path.join(ROOT, 'screenshots', 'hero-v2.mp4')
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(TMP, 'f%04d.png'),
    '-vf', 'scale=1440:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-movflags', '+faststart', out])
  fs.rmSync(TMP, { recursive: true })
  console.log(out, (fs.statSync(out).size / 1024).toFixed(0) + ' KB')
})
