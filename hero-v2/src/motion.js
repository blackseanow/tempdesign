/* 招牌动效：把脉前（0–4 秒）→ 收住（4–6 秒）→ 把脉后（6–8 秒），播一次停在“把脉后”，点录音笔重播。
   画面只由时间 t（秒）决定：render(t) 不依赖上一帧，所以调试面板能拖时间轴，截图能定格在任意一刻。
   坐标是插画的 viewBox（1916 × 821），锚点从 anchors.json 的百分比换算过来。 */
function createHeroMotion(stage, anchors, opts = {}) {
  const W = 1916, H = 821, NS = 'http://www.w3.org/2000/svg'
  const END = 8, GATHER = 4, AFTER = 6, PREROLL = 0.45
  const STATIC_QUERY = '(prefers-reduced-motion: reduce), (max-width: 767.98px)'
  // 声浪中线的形状：从嘴边到笔记本的拱。每个点是 [沿“嘴边 → 笔记本”的比例, 往上抬多少（占图高）]
  const ARCH = [[0, 0], [0.227, 0.197], [0.533, 0.415], [0.797, 0.447], [0.921, 0.289], [0.963, 0.084], [1, 0]]
  const STEP = 9            // 声浪采样间距
  const PROP_PX = 150       // 道具放大到 1 倍时的边长（道具 SVG 统一成 160 单位见方）
  // 六样道具：出场顺序、离中线的偏移、翻滚圈数；火箭不翻滚，机头一直朝上
  const PROPS = [
    { id: 'mask-book', lane: -16, spin: 0.55, tilt: -14 },
    { id: 'scroll', lane: 14, spin: -0.5, tilt: 8 },
    { id: 'pie', lane: -10, spin: 0.65, tilt: -6 },
    { id: 'soup', lane: 16, spin: -0.55, tilt: 10 },
    { id: 'go-board', lane: -14, spin: 0.5, tilt: -8 },
    { id: 'rocket', lane: 10, upright: true },
  ]
  const LAUNCH0 = 0.35, LAUNCH_GAP = 0.6, FLIGHT = 1.65  // 每 0.6 秒放一样，一样飞 1.65 秒：空中同时两三个

  const fx = stage.querySelector('.hero-fx')
  const base = stage.querySelector('.hero-base')
  const after = stage.querySelector('.hero-after')
  const btn = stage.querySelector('.hero-replay')
  const wavesG = fx.querySelector('.fx-waves')
  const ripples = [...fx.querySelectorAll('.fx-ripple')]
  const sealG = fx.querySelector('.fx-seal')
  const props = PROPS.map((p, i) => Object.assign({ i, el: fx.querySelector(`.fx-prop[data-prop="${p.id}"]`) }, p)).filter(p => p.el)
  const flame = fx.querySelector('.fx-prop[data-prop="rocket"] .flame')

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
  const lerp = (a, b, f) => a + (b - a) * f
  const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u) }
  const sine = u => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1))
  const TAU = Math.PI * 2

  // 声浪：12 道线。前三道从嘴边出来，又细又缓；其余的一路从已有的线上分出来，越往员工那边越多、越乱
  const rnd = (seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296 })(20261030)
  const COLORS = ['ink3', 'brass', 'ink2', 'gold', 'brass', 'ink3', 'ink2', 'gold', 'brass']
  const LINES = []
  for (let k = 0; k < 12; k++) {
    const first = k < 3
    LINES.push({
      born: first ? 0 : 0.15 + 0.06 * (k - 3) + (rnd() - 0.5) * 0.04,  // 前 15% 只有三道
      parent: first ? -1 : Math.floor(rnd() * k),
      lane: first ? (k - 1) * 0.7 : rnd() * 2 - 1,
      color: first ? ['ink3', 'brass', 'ink3'][k] : COLORS[k - 3],
      width: first ? 1.5 : 1.1 + rnd() * 0.9,
      alpha: first ? 0.85 : 0.5 + rnd() * 0.4,
      ph: [rnd() * TAU, rnd() * TAU, rnd() * TAU],
      sp: 0.85 + rnd() * 0.3,
    })
  }
  const paths = LINES.map(L => {
    const p = document.createElementNS(NS, 'path')
    p.setAttribute('class', 'w-' + L.color)
    p.setAttribute('stroke-width', L.width.toFixed(2))
    wavesG.appendChild(p)
    return p
  })

  let G = null   // 由锚点算出来的几何
  let OFF = []   // 每道线在每个采样点上离中线的偏移
  let PX = new Float32Array(0), PY = new Float32Array(0)

  function catmull(pts, seg) {
    const out = []
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)]
      for (let j = 0; j < seg; j++) {
        const u = j / seg, u2 = u * u, u3 = u2 * u
        out.push({
          x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * u + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3),
          y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * u + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3),
        })
      }
    }
    out.push(pts[pts.length - 1])
    return out
  }

  function build(a) {
    const pt = k => ({ x: a[k].x / 100 * W, y: a[k].y / 100 * H })
    const M = pt('mouth'), N = pt('notebook'), R = pt('recorder'), S = pt('stack')
    const way = ARCH.map(([f, h]) => ({ x: lerp(M.x, N.x, f), y: lerp(M.y, N.y, f) - h * H }))
    const dense = catmull(way, 48)
    const cum = [0]
    for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].y - dense[i - 1].y))
    const len = cum[cum.length - 1]
    const n = Math.max(8, Math.round(len / STEP))
    const xs = new Float32Array(n + 1), ys = new Float32Array(n + 1), nx = new Float32Array(n + 1), ny = new Float32Array(n + 1), phase = new Float32Array(n + 1)
    for (let i = 0, j = 0; i <= n; i++) {
      const d = len * i / n
      while (j < cum.length - 2 && cum[j + 1] < d) j++
      const f = (d - cum[j]) / ((cum[j + 1] - cum[j]) || 1)
      xs[i] = lerp(dense[j].x, dense[j + 1].x, f)
      ys[i] = lerp(dense[j].y, dense[j + 1].y, f)
    }
    for (let i = 0; i <= n; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(n, i + 1)
      const tx = xs[i1] - xs[i0], ty = ys[i1] - ys[i0], l = Math.hypot(tx, ty) || 1
      nx[i] = -ty / l; ny[i] = tx / l
      // 波长从嘴边的 190 缩到笔记本前的 75：越往后起伏越密
      if (i > 0) phase[i] = phase[i - 1] + (len / n) / (190 - 115 * (i / n))
    }
    G = { M, N, R, S, n, len, xs, ys, nx, ny, phase,
      mic: { x: R.x, y: R.y - 0.040 * H },        // 声浪吸进机头
      foot: { x: R.x, y: R.y + 0.047 * H } }      // 波纹画在机身底部的桌面上
    OFF = LINES.map(() => new Float32Array(n + 1))
    PX = new Float32Array(n + 1); PY = new Float32Array(n + 1)
    // 波纹：三圈椭圆，和底图上录音笔脚下的波纹同心
    ripples.forEach((el, i) => {
      const rx = 46 + 27 * i
      el.setAttribute('cx', G.foot.x.toFixed(1)); el.setAttribute('cy', G.foot.y.toFixed(1))
      el.setAttribute('rx', rx); el.setAttribute('ry', (rx * 0.17).toFixed(1))
    })
    // 点录音笔重播：按钮盖住录音笔
    if (btn) Object.assign(btn.style, { left: (a.recorder.x - 2.4) + '%', top: (a.recorder.y - 7.6) + '%', width: '4.8%', height: '15.2%' })
  }

  function sample(s) {
    const f = clamp(s, 0, 1) * G.n, i = Math.min(G.n - 1, Math.floor(f)), u = f - i
    return { x: lerp(G.xs[i], G.xs[i + 1], u), y: lerp(G.ys[i], G.ys[i + 1], u), nx: lerp(G.nx[i], G.nx[i + 1], u), ny: lerp(G.ny[i], G.ny[i + 1], u) }
  }

  function offsets(t) {
    const n = G.n
    const grow = 0.8 + 0.2 * smooth(1, 3.5, t)
    for (let i = 0; i <= n; i++) {
      const s = i / n
      // 越往员工那边散得越开、起伏越大，最后 10% 收进笔记本
      const spread = 4 + (30 + 30 * smooth(0.55, 0.85, s)) * smooth(0, 0.5, s) * (1 - smooth(0.9, 1, s))
      const amp = (2 + 14 * Math.pow(smooth(0.12, 0.8, s), 1.2)) * (1 - smooth(0.92, 1, s)) * grow
      const c2 = 0.55 * smooth(0.25, 0.75, s), c3 = 0.35 * smooth(0.45, 0.9, s)
      const P = G.phase[i] * TAU
      for (let k = 0; k < LINES.length; k++) {
        const L = LINES[k]
        const own = L.lane * spread + amp * (Math.sin(P - TAU * 1.6 * L.sp * t + L.ph[0])
          + c2 * Math.sin(2.3 * P - TAU * 2.1 * L.sp * t + L.ph[1])
          + c3 * Math.sin(3.7 * P - TAU * 2.9 * t + L.ph[2]))
        if (L.parent < 0) OFF[k][i] = own
        else { const p = OFF[L.parent][i]; OFF[k][i] = p + (own - p) * smooth(L.born, L.born + 0.1, s) }
      }
    }
  }

  function pathD(m) {
    let d = 'M' + PX[0].toFixed(1) + ' ' + PY[0].toFixed(1)
    for (let i = 1; i < m - 1; i++) d += 'Q' + PX[i].toFixed(1) + ' ' + PY[i].toFixed(1) + ' ' + ((PX[i] + PX[i + 1]) / 2).toFixed(1) + ' ' + ((PY[i] + PY[i + 1]) / 2).toFixed(1)
    return d + 'L' + PX[m - 1].toFixed(1) + ' ' + PY[m - 1].toFixed(1)
  }

  function drawWaves(t) {
    if (t <= 0 || t >= AFTER) { paths.forEach(p => p.setAttribute('d', '')); return }
    offsets(t)
    const n = G.n, mic = G.mic
    const head = t < 1.8 ? sine(t / 1.8) : 1            // 声浪从嘴边往外走，1.8 秒到笔记本
    const u = (t - GATHER) / (AFTER - GATHER)              // 收住阶段的进度
    for (let k = 0; k < LINES.length; k++) {
      const L = LINES[k], path = paths[k]
      const i0 = Math.ceil(L.born * n), i1 = Math.floor(head * n)
      if (i1 - i0 < 2) { path.setAttribute('d', ''); continue }
      let m = 0
      for (let i = i0; i <= i1; i++) {
        const s = i / n
        const off = OFF[k][i] * smooth(0, 0.05, s)
        let x = G.xs[i] + G.nx[i] * off, y = G.ys[i] + G.ny[i] * off
        if (u > 0) {
          // 掉头：笔记本那头先被拽回来，嘴边那头最后；每一点沿弧线加速吸进机头，起伏一路收平
          const v = clamp((u - 0.04 - 0.52 * (1 - s)) / 0.38, 0, 1), e = v * v
          if (e > 0) {
            const bx = G.xs[i] + G.nx[i] * off * (1 - e), by = G.ys[i] + G.ny[i] * off * (1 - e)
            const cx = mic.x + (bx - mic.x) * 0.55, cy = by + (mic.y - by) * 0.15 - 40
            x = (1 - e) * (1 - e) * bx + 2 * (1 - e) * e * cx + e * e * mic.x
            y = (1 - e) * (1 - e) * by + 2 * (1 - e) * e * cy + e * e * mic.y
          }
        }
        PX[m] = x; PY[m] = y; m++
      }
      path.setAttribute('d', pathD(m))
      path.setAttribute('opacity', (L.alpha * (u > 0 ? 1 - smooth(0.8, 1, u) : 1)).toFixed(3))
    }
  }

  // 道具在把脉前的位置：沿声浪的中线从嘴边飘到笔记本，越近越大，到了笔记本缩进去
  function flight(p, t) {
    const tt = (t - (LAUNCH0 + LAUNCH_GAP * p.i)) / FLIGHT
    if (tt <= 0 || tt >= 1) return null
    const s = 0.05 + 0.935 * sine(tt)
    const c = sample(s)
    const lat = p.lane * smooth(0, 0.2, s) * (1 - smooth(0.9, 1, s)) + 7 * Math.sin(TAU * 1.1 * tt + p.i)
    const scale = (0.32 + 0.93 * smooth(0.02, 0.8, s)) * (1 - 0.85 * smooth(0.86, 1, tt))
    return {
      x: c.x + c.nx * lat, y: c.y + c.ny * lat, scale, tt,
      alpha: smooth(0, 0.08, tt) * (1 - smooth(0.9, 1, tt)),
      rot: p.upright ? 4 * Math.sin(TAU * 1.4 * tt) : p.tilt + 360 * p.spin * tt + 9 * Math.sin(TAU * 0.9 * tt),
      sx: p.upright ? 1 : 0.9 + 0.1 * Math.cos(TAU * 1.3 * p.spin * tt),  // 轻微压扁，像在空中翻面
    }
  }

  // 收住：4 秒时还在空中的道具，依次被吸进录音笔，边转边缩小
  const caught = props.filter(p => { const t0 = LAUNCH0 + LAUNCH_GAP * p.i; return t0 < GATHER && GATHER < t0 + FLIGHT })
  function propState(p, t) {
    if (t <= 0 || t >= AFTER) return null
    if (t < GATHER) return flight(p, t)
    const rank = caught.indexOf(p)
    if (rank < 0) return null
    const c0 = GATHER + 0.12 * rank
    const s0 = flight(p, Math.min(t, c0)) || flight(p, GATHER)
    if (!s0) return null
    const e = Math.pow(clamp((t - c0) / 0.9, 0, 1), 2)
    const mic = G.mic, cx = mic.x + (s0.x - mic.x) * 0.5, cy = s0.y + (mic.y - s0.y) * 0.1 - 60
    return {
      x: (1 - e) * (1 - e) * s0.x + 2 * (1 - e) * e * cx + e * e * mic.x,
      y: (1 - e) * (1 - e) * s0.y + 2 * (1 - e) * e * cy + e * e * mic.y,
      scale: s0.scale * Math.pow(1 - e, 1.3), alpha: s0.alpha * (1 - smooth(0.8, 1, e)),
      rot: p.upright ? s0.rot * (1 - e) : s0.rot + 420 * e * Math.sign(p.spin), sx: s0.sx,
    }
  }

  function drawProps(t) {
    for (const p of props) {
      const st = propState(p, t)
      if (!st || st.alpha <= 0.001 || st.scale <= 0.005) { p.el.setAttribute('opacity', '0'); p.el.removeAttribute('transform'); continue }
      const k = st.scale * PROP_PX / 160
      p.el.setAttribute('transform', `translate(${st.x.toFixed(1)} ${st.y.toFixed(1)}) rotate(${st.rot.toFixed(1)}) scale(${(k * st.sx).toFixed(4)} ${k.toFixed(4)})`)
      p.el.setAttribute('opacity', st.alpha.toFixed(3))
    }
    if (flame) {
      const fy = 0.85 + 0.2 * Math.sin(TAU * 8 * t) + 0.08 * Math.sin(TAU * 13 * t + 1)
      flame.setAttribute('transform', `translate(0 42) scale(1 ${fy.toFixed(3)}) translate(0 -42)`)
    }
  }

  function drawRipples(t) {
    ripples.forEach((el, i) => {
      const x = t - (5.15 + 0.12 * i)
      if (x <= 0 || t >= END) { el.style.opacity = ''; el.style.transform = ''; return }
      const a = x < 0.18 ? x / 0.18 : Math.exp(-(x - 0.18) / 0.35)
      el.style.opacity = (0.95 * a).toFixed(3)
      el.style.transform = `scale(${(0.94 + 0.12 * smooth(0, 0.6, x)).toFixed(3)})`
    })
  }

  // 把脉后：交叉淡入 base-after，朱砂印章盖到那摞材料上（印章贴着纸面，按纸的透视压扁、斜切）
  function drawAfter(t) {
    let a, sealA = 0, k = 1
    if (t < 0) a = rewindFrom * (-t / PREROLL)
    else a = smooth(AFTER, AFTER + 0.8, t)
    const x = t - 6.85
    if (t < 0) { sealA = a; k = 1 }
    else if (x >= 0) {
      if (x < 0.28) { k = 1.75 - 0.75 * Math.pow(x / 0.28, 3); sealA = smooth(0, 0.1, x) }
      else { k = 1 - 0.05 * Math.sin(Math.PI * clamp((x - 0.28) / 0.22, 0, 1)); sealA = 1 }
    }
    after.style.opacity = a.toFixed(3)
    curAfter = a
    sealG.setAttribute('opacity', (0.92 * sealA).toFixed(3))
    sealG.setAttribute('transform', `translate(${G.S.x.toFixed(1)} ${G.S.y.toFixed(1)}) rotate(12) skewX(-30) scale(${(0.88 * k).toFixed(4)} ${(0.5 * k).toFixed(4)})`)
  }

  let t = 0, curAfter = 0, rewindFrom = 0, running = false, raf = 0, last = 0, speed = 1
  let visible = true, played = false, afterReady = false, baseReady = false
  let animated = false, modeSet = false, mq = null, io = null, destroyed = false

  function render(time) {
    t = time
    drawWaves(time); drawProps(time); drawRipples(time); drawAfter(time)
    if (opts.onFrame) opts.onFrame(time)
  }

  function frame(now) {
    raf = 0
    if (!running) return
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    t += dt * speed
    if (t >= AFTER && !afterReady) t = AFTER  // base-after 还没下载完就停在这里等
    render(Math.min(t, END))
    if (t >= END) { running = false; stage.classList.remove('is-playing'); if (opts.onEnd) opts.onEnd(); return }
    raf = requestAnimationFrame(frame)
  }

  function play() {
    if (!animated || destroyed) return
    if (t >= END) t = 0
    running = true; played = true
    stage.classList.add('is-playing'); stage.classList.remove('is-hot')
    last = performance.now()
    if (!raf && visible) raf = requestAnimationFrame(frame)
  }
  function pause() { running = false; stage.classList.remove('is-playing'); if (raf) cancelAnimationFrame(raf); raf = 0 }
  function replay() {
    if (!animated) return
    rewindFrom = curAfter
    t = rewindFrom > 0.01 ? -PREROLL : 0
    play()
  }
  // 手动定格或暂停以后，就不再自动开播（比如底图还没下载完时先拖了时间轴）
  function seek(time) { played = true; pause(); render(clamp(time, -PREROLL, END)) }

  function loadAfter() {
    if (!after.getAttribute('src') && after.dataset.src) {
      if (after.dataset.srcset) after.setAttribute('srcset', after.dataset.srcset)
      after.setAttribute('src', after.dataset.src)
    }
    const ok = () => { afterReady = true }  // 下载失败也放行，不让动画卡在 6 秒
    if (after.complete && after.naturalWidth) ok()
    else { after.addEventListener('load', ok, { once: true }); after.addEventListener('error', ok, { once: true }) }
  }

  function tryStart() {
    if (!animated || played || !baseReady || !visible || opts.autoplay === false) return
    play()
  }

  function applyMode() {
    const next = !mq.matches || !!opts.force
    if (next === animated && modeSet) return  // 媒体查询没真变（有的浏览器会多发 change），什么都不做
    animated = next; modeSet = true
    if (animated) {
      loadAfter()
      if (played) { pause(); render(END) } else tryStart()
    } else pause()
  }

  build(anchors)
  render(0)
  mq = window.matchMedia(STATIC_QUERY)
  mq.addEventListener('change', applyMode)
  const onBase = () => { baseReady = !!base.naturalWidth; tryStart() }
  if (base.complete && base.naturalWidth) baseReady = true
  base.addEventListener('load', onBase)
  if ('IntersectionObserver' in window) {
    // 滚出视口：停掉帧循环，时间不走；滚回来接着播
    io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      if (!visible && raf) { cancelAnimationFrame(raf); raf = 0 }
      if (visible && running && !raf) { last = performance.now(); raf = requestAnimationFrame(frame) }
      tryStart()
    })
    io.observe(stage)
  }
  const hotOn = () => { if (!running) stage.classList.add('is-hot') }
  const hotOff = () => stage.classList.remove('is-hot')
  if (btn) {
    btn.addEventListener('click', replay)
    btn.addEventListener('pointerenter', hotOn)
    btn.addEventListener('pointerleave', hotOff)
    btn.addEventListener('focus', hotOn)
    btn.addEventListener('blur', hotOff)
  }
  applyMode()

  return {
    play, replay, seek,
    pause() { played = true; pause() },
    setAnchors(a) { build(a); render(t) },
    setSpeed(v) { speed = v },
    get time() { return t },
    get playing() { return running },
    get animated() { return animated },
    geometry() { return G },
    // 某一时刻空中有哪几样道具（调试和自查用）
    propsInAir(time) { return props.filter(p => { const st = propState(p, time); return st && st.alpha > 0.02 && st.scale > 0.05 }).map(p => p.id) },
    destroy() {
      destroyed = true; pause()
      mq.removeEventListener('change', applyMode)
      base.removeEventListener('load', onBase)
      if (io) io.disconnect()
      if (btn) {
        btn.removeEventListener('click', replay)
        btn.removeEventListener('pointerenter', hotOn); btn.removeEventListener('pointerleave', hotOff)
        btn.removeEventListener('focus', hotOn); btn.removeEventListener('blur', hotOff)
      }
      paths.forEach(p => p.remove())
    },
  }
}
