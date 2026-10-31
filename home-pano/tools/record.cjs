// 录像：开场（shots/intro.webm）、落定后从最左转到最右（shots/look-around.webm）。
// 逐帧来：暂停时间线 → 摆到这一帧的时刻 → 等 Worker 画完 → 截图；最后用 ffmpeg 拼成 VP9 的 webm（30 帧/秒）。
// 这样录出来的节奏和真实播放一样，不受这台机器渲染快慢影响。录像里没有声音（声音是网页实时合成的）。
// 用法：node tools/record.cjs [intro|look] [--fps=30] [--size=1280x720]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { start } = require('./serve.cjs');
const HERE = path.resolve(__dirname, '..');
const which = process.argv[2] || 'intro';
const fps = +((process.argv.find(a => a.startsWith('--fps=')) || '--fps=30').slice(6));
const [W, H] = (process.argv.find(a => a.startsWith('--size=')) || '--size=1280x720').slice(7).split('x').map(Number);
const scene = JSON.parse(fs.readFileSync(path.join(HERE, 'scene.json'), 'utf8'));
const D = scene.intro.durations;
// 开场的剧本：门外等 1.5 秒推门；伸手那一步等 3.8 秒（3 秒时出现提示）再按录音笔；落定后再停 1.5 秒
const HOLD = { door: 1.5, reach: 3.8 };
const STEPS = [['door', HOLD.door], ['push', D.push], ['sit', D.sit], ['talk', D.talk], ['reach', HOLD.reach], ['reverse', D.reverse], ['settle', D.settle], ['free', 1.5]];

async function rendered(page, n = 2) {
  await page.evaluate(k => new Promise(res => { let left = k; const step = () => window.__pano.rendered().then(() => (--left > 0 ? step() : res())); step(); }), n);
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'pano-rec-'));
  const srv = await start(0);
  const port = srv.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}/home-pano/?intro=always&nofallback=1`);
  await page.mouse.move(W / 2, H - 2);
  await page.waitForFunction(() => window.__pano && window.__pano.frameCount > 2);
  await page.evaluate(() => { window.__pano.pause(); window.__pano.seek('free', 1); });
  await page.waitForFunction(() => window.__pano.hdLevel, null, { timeout: 120000 });
  await rendered(page, 3);
  let frames = 0;
  const snap = async () => { await page.screenshot({ path: path.join(tmp, String(frames++).padStart(5, '0') + '.png') }); };
  if (which === 'intro') {
    const total = STEPS.reduce((a, [, d]) => a + d, 0);
    const n = Math.round(total * fps);
    for (let i = 0; i < n; i++) {
      const t = i / fps;
      let acc = 0, step = 'free', local = 0;
      for (const [s, d] of STEPS) { if (t < acc + d) { step = s; local = t - acc; break; } acc += d; }
      if (step === 'free' && t >= acc) local = t - (total - 1.5);
      await page.evaluate(([s, lt, holds, amb]) => { window.__pano.seek(s, lt, holds); window.__pano.setAmb(amb); }, [step, local, HOLD, t]);
      await rendered(page, 2);
      await snap();
      if (i % 60 === 0) console.log(`${i}/${n} ${step} ${local.toFixed(2)}`);
    }
  } else {
    // 落定后：从正前方慢慢转到最左，再一路转到最右，再回正前方。转头用的是真实的限位（到边柔和减速）
    await page.evaluate(() => window.__pano.seek('free', 5));
    const L = scene.camera.yawLimit;
    const keys = [[0, 0], [2.5, -L * 0.99], [3.3, -L * 0.99], [8.8, L * 0.99], [9.6, L * 0.99], [12, 0]];
    const total = 12;
    const ease = x => (1 - Math.cos(Math.PI * x)) / 2;
    for (let i = 0; i < total * fps; i++) {
      const t = i / fps;
      let k = 0; while (k < keys.length - 2 && t > keys[k + 1][0]) k++;
      const [t0, y0] = keys[k], [t1, y1] = keys[k + 1];
      const yaw = y0 + (y1 - y0) * ease(Math.min(1, (t - t0) / (t1 - t0)));
      await page.evaluate(([y, amb]) => { window.__pano.lookAt(y, 0, true); window.__pano.setAmb(amb); }, [yaw, 100 + t]);
      await rendered(page, 2);
      await snap();
      if (i % 60 === 0) console.log(`${i}/${total * fps} yaw ${yaw.toFixed(1)}`);
    }
  }
  await browser.close();
  srv.close();
  const out = path.join(HERE, 'shots', which === 'intro' ? 'intro.webm' : 'look-around.webm');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(tmp, '%05d.png'), '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34', '-row-mt', '1', '-pix_fmt', 'yuv420p', out]);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('写好了', out, (fs.statSync(out).size / 1e6).toFixed(2) + ' MB', frames + ' 帧');
})();
