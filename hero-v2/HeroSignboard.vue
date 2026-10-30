<!--
  HeroSignboard：首页招牌 v2（牌匾“咸鱼把脉了”、标语、插画和约 8 秒的动效），规格见 hero-v2/README.md。
  由 hero-v2/tools/build.py 从 src/ 生成，不要手改；改了动效、道具或版式后重新运行 build.py。

  用法：把 HeroSignboard.vue、anchors.json 和 img/ 一起拷进同一个组件目录，然后 <HeroSignboard />。
  锚点直接 import anchors.json，调好锚点只要替换 anchors.json，不用重新生成组件。

  动效播一次停在“把脉后”，点录音笔重播；招牌滚出视口时暂停，滚回来接着播。
  系统设置了减少动态效果，或屏幕窄于 768px：直接显示 hero-static，不播动画（<picture> 按媒体查询换图）。
  依赖：全局已加载霞鹜文楷；颜色读 --paper --sheet --line --ink --ink-2 --ink-3 --indigo --indigo-2 --gold --brass --wood --cinnabar 和 --kai，
  未定义时用设计稿的值。样式不加 scoped：选择器都带 hero- / fx- 前缀。
-->
<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import anchors from './anchors.json'
import heroStatic from './img/hero-static.webp'
import baseBefore from './img/base-before.webp'
import baseAfter from './img/base-after.webp'
// srcset 按屏幕清晰度挑图；原图到 3000 宽 build.py 才会出 @2x
const img = {
  static: heroStatic + ' 1x',
  before: baseBefore,
  beforeSet: baseBefore + ' 1x',
  after: baseAfter,
  afterSet: baseAfter + ' 1x',
}

const stage = ref(null)
let motion = null
onMounted(() => { motion = createHeroMotion(stage.value, anchors) })
onBeforeUnmount(() => { if (motion) motion.destroy() })

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
  // 六样道具：出场顺序、离中线的偏移、翻滚圈数，落到笔记本旁边的位置（相对笔记本锚点，px）和落定的角度。
  // 每一样走同一条路：嘴边 → 笔记本旁边堆起来 → 收住时被吸进录音笔。火箭不翻滚，机头一直朝上
  const PROPS = [
    { id: 'mask-book', lane: -16, spin: 0.55, tilt: -14, slot: [-120, -4], rest: -10 },
    { id: 'scroll', lane: 14, spin: -0.5, tilt: 8, slot: [-48, -16], rest: 7 },
    { id: 'pie', lane: -10, spin: 0.65, tilt: -6, slot: [-168, -40], rest: -5 },
    { id: 'soup', lane: 16, spin: -0.55, tilt: 10, slot: [-92, -52], rest: 6 },
    { id: 'go-board', lane: -14, spin: 0.7, tilt: -8, slot: [-142, -86], rest: -4 },
    { id: 'rocket', lane: 10, upright: true, slot: [-60, -100], rest: 0 },
  ]
  const LAUNCH0 = 0.25, LAUNCH_GAP = 0.5, FLIGHT = 1.42  // 每 0.5 秒放一样，一样飞 1.42 秒：空中最多三样，最后一样 4.17 秒落定
  const REST_SCALE = 0.5                                 // 堆在桌上的大小
  const CATCH0 = 4.2, CATCH_GAP = 0.12, CATCH_DUR = 0.8  // 收住：按落下的先后，每 0.12 秒吸走一样，一样 0.8 秒进录音笔

  const fx = stage.querySelector('.hero-fx')
  const base = stage.querySelector('.hero-base')
  const after = stage.querySelector('.hero-after')
  const btn = stage.querySelector('.hero-replay')
  const wavesG = fx.querySelector('.fx-waves')
  const ripples = [...fx.querySelectorAll('.fx-ripple')]
  const sealG = fx.querySelector('.fx-seal')
  const props = PROPS.map((p, i) => Object.assign({ i, el: fx.querySelector(`.fx-prop[data-prop="${p.id}"]`) }, p)).filter(p => p.el)
  const flame = fx.querySelector('.fx-prop[data-prop="rocket"] .flame')
  // 领导的嘴：build.py 从底图生成的闭嘴、半张、大半张三帧，data-o 是张开的程度（原图 = 1）
  const mouths = [...fx.querySelectorAll('.fx-mouth image')].map(el => ({ el, o: parseFloat(el.dataset.o) }))
  const decal = stage.querySelector('.hero-decal .decal')

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
      mic: { x: R.x, y: R.y - 0.040 * H },        // 声浪和道具吸进机头
      foot: { x: R.x, y: R.y + 0.047 * H },       // 波纹画在机身底部的桌面上
      slots: PROPS.map(p => ({ x: N.x + p.slot[0], y: N.y + p.slot[1] })) }  // 道具落在笔记本旁边的位置
    OFF = LINES.map(() => new Float32Array(n + 1))
    PX = new Float32Array(n + 1); PY = new Float32Array(n + 1)
    // 波纹：三圈椭圆，和底图上录音笔脚下的波纹同心
    ripples.forEach((el, i) => {
      const rx = 46 + 27 * i
      el.setAttribute('cx', G.foot.x.toFixed(1)); el.setAttribute('cy', G.foot.y.toFixed(1))
      el.setAttribute('rx', rx); el.setAttribute('ry', (rx * 0.17).toFixed(1))
    })
    // 点录音笔重播：按钮盖住录音笔；录音笔正面的铭牌（logo 和“把脉了”）跟着锚点走
    if (btn) Object.assign(btn.style, { left: (a.recorder.x - 2.4) + '%', top: (a.recorder.y - 7.6) + '%', width: '4.8%', height: '15.2%' })
    if (decal) decal.setAttribute('transform', `translate(${R.x.toFixed(1)} ${R.y.toFixed(1)})`)
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

  const quad = (a, c, b, e) => (1 - e) * (1 - e) * a + 2 * (1 - e) * e * c + e * e * b
  const turnTo = (from, to) => ((to - from) % 360 + 540) % 360 - 180  // 转到目标角度走近的那一边

  // 把脉前：道具沿声浪的中线从嘴边飘向笔记本，越近越大；最后一段落到笔记本旁边那一堆上，缩到桌面上的大小，停住
  function flight(p, t) {
    const t0 = LAUNCH0 + LAUNCH_GAP * p.i
    const tt = (t - t0) / FLIGHT
    if (tt <= 0) return null
    const slot = G.slots[p.i]
    if (tt >= 1) {
      const since = t - t0 - FLIGHT
      const bounce = 1 + 0.08 * Math.exp(-since / 0.12) * Math.sin(since * 30)   // 落下时轻轻一弹
      return { x: slot.x, y: slot.y, scale: REST_SCALE * bounce, alpha: 1, sx: 1, phase: 'rest',
        rot: p.rest + (p.upright ? 0 : 1.2 * Math.sin(TAU * 1.3 * t + p.i)) }
    }
    const s = 0.05 + 0.88 * sine(Math.min(1, tt / 0.82))
    const c = sample(s)
    const lat = p.lane * smooth(0, 0.2, s) * (1 - smooth(0.85, 1, s)) + 7 * Math.sin(TAU * 1.1 * tt + p.i)
    let x = c.x + c.nx * lat, y = c.y + c.ny * lat
    let scale = 0.32 + 0.93 * smooth(0.02, 0.8, s)
    let rot = p.upright ? 4 * Math.sin(TAU * 1.4 * tt) : p.tilt + 360 * p.spin * tt + 9 * Math.sin(TAU * 0.9 * tt)
    let sx = p.upright ? 1 : 0.9 + 0.1 * Math.cos(TAU * 1.3 * p.spin * tt)  // 轻微压扁，像在空中翻面
    if (tt > 0.82) {
      const v = 1 - Math.pow(1 - (tt - 0.82) / 0.18, 3)
      x = lerp(x, slot.x, v); y = lerp(y, slot.y, v)
      scale = lerp(scale, REST_SCALE, v)
      rot += turnTo(rot, p.rest) * v
      sx = lerp(sx, 1, v)
    }
    return { x, y, scale, alpha: smooth(0, 0.08, tt), rot, sx, phase: 'air' }
  }

  // 收住：笔记本旁边那一堆，按落下的先后一样一样被吸进录音笔，边转边缩小
  function propState(p, t) {
    if (t <= 0 || t >= AFTER) return null
    const c0 = CATCH0 + CATCH_GAP * p.i
    if (t < c0) return flight(p, t)
    const s0 = flight(p, c0)
    const e = Math.pow(clamp((t - c0) / CATCH_DUR, 0, 1), 2)
    if (!s0 || e >= 1) return null
    const mic = G.mic, cx = lerp(s0.x, mic.x, 0.5), cy = Math.min(s0.y, mic.y) - 70
    return {
      x: quad(s0.x, cx, mic.x, e), y: quad(s0.y, cy, mic.y, e),
      scale: s0.scale * Math.pow(1 - e, 1.2), alpha: 1 - smooth(0.8, 1, e), sx: 1, phase: 'caught',
      rot: p.upright ? 0 : s0.rot + 420 * e * Math.sign(p.spin),
    }
  }

  function drawProps(t) {
    let rocket = null
    for (const p of props) {
      const st = propState(p, t)
      if (p.id === 'rocket') rocket = st
      if (!st || st.alpha <= 0.001 || st.scale <= 0.005) { p.el.setAttribute('opacity', '0'); p.el.removeAttribute('transform'); continue }
      const k = st.scale * PROP_PX / 160
      p.el.setAttribute('transform', `translate(${st.x.toFixed(1)} ${st.y.toFixed(1)}) rotate(${st.rot.toFixed(1)}) scale(${(k * st.sx).toFixed(4)} ${k.toFixed(4)})`)
      p.el.setAttribute('opacity', st.alpha.toFixed(3))
    }
    if (flame) {
      // 飞的时候尾焰一闪一闪；落在桌上就熄了
      const fy = rocket && rocket.phase === 'rest' ? 0.001 : 0.85 + 0.2 * Math.sin(TAU * 8 * t) + 0.08 * Math.sin(TAU * 13 * t + 1)
      flame.setAttribute('transform', `translate(0 42) scale(1 ${fy.toFixed(3)}) translate(0 -42)`)
    }
  }

  // 领导说话时嘴一张一合：一秒四五个字，有的字张得大、有的小；4 秒以后停下，回到底图上张嘴笑的样子
  function mouthOpen(t) {
    if (t <= 0.05 || t >= GATHER - 0.1) return 1
    const env = smooth(0.05, 0.2, t) * (1 - smooth(GATHER - 0.4, GATHER - 0.1, t))
    const syl = 0.5 + 0.5 * Math.sin(TAU * 4.6 * t + 1.3 * Math.sin(TAU * 0.7 * t))
    const stress = 0.55 + 0.45 * Math.abs(Math.sin(TAU * 0.9 * t + 0.4))
    return 1 - env * (1 - syl * stress)
  }

  function drawMouth(t) {
    if (!mouths.length) return
    const o = mouthOpen(t)
    const pick = o >= 0.88 ? null : mouths.reduce((a, m) => (Math.abs(m.o - o) < Math.abs(a.o - o) ? m : a))
    mouths.forEach(m => m.el.setAttribute('opacity', m === pick ? '1' : '0'))
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
    drawWaves(time); drawMouth(time); drawProps(time); drawRipples(time); drawAfter(time)
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
    // 某一时刻空中有哪几样道具（不算已经落在桌上的）、每样道具的状态、嘴张开的程度（调试和自查用）
    propsInAir(time) { return props.filter(p => { const st = propState(p, time); return st && st.phase === 'air' && st.alpha > 0.02 && st.scale > 0.05 }).map(p => p.id) },
    propStates(time) { return props.map(p => Object.assign({ id: p.id }, propState(p, time))) },
    mouthOpen,
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
</script>

<template>
  <header class="hero-signboard">
    <div class="hero-sign">
      <h1 class="hero-plaque"><span>咸鱼把脉了</span></h1>
      <p class="hero-motto"><span>领导把脉，一字不落；</span><span>对症开方，按时交差。</span></p>
    </div>
    <div ref="stage" class="hero-stage">
      <picture>
        <source media="(prefers-reduced-motion: reduce), (max-width: 767.98px)" :srcset="img.static" type="image/webp">
        <img class="hero-base" :src="img.before" :srcset="img.beforeSet" width="1916" height="821" alt="插画：领导靠在椅背上侃侃而谈，脸谱、宏图、大饼、鸡汤、棋盘和火箭顺着声浪飘向对面埋头狂记的员工，会议桌中间的录音笔正在收音。" fetchpriority="high">
      </picture>
      <img class="hero-after" :data-src="img.after" :data-srcset="img.afterSet" width="1916" height="821" alt="" aria-hidden="true" decoding="async">
      <svg class="hero-decal" viewBox="0 0 1916 821" aria-hidden="true" focusable="false"><g class="decal" transform="translate(922.9 612.0)"><rect class="f-ink decal-plate" x="-16" y="-1" width="32" height="35" rx="3"/><g class="decal-mark" transform="translate(0 10.5)"><g class="logo" transform="scale(0.203125) translate(-32 -32)"><path class="lg-face" d="M2 0L62 0C63.1 0 64 0.9 64 2L64 62C64 63.1 63.1 64 62 64L2 64C0.9 64 0 63.1 0 62L0 2C0 0.9 0.9 0 2 0Z"/><path class="lg-figure" d="M21.22 37.51C21.43 37.6 21.64 37.69 21.85 37.78C22.64 38.14 23.47 38.55 24.34 38.64C25.35 38.74 26.37 38.27 27.3 37.85C27.42 37.79 27.54 37.74 27.66 37.68C28.01 37.94 28.37 38.17 28.75 38.37C31.01 39.56 33.68 39.79 35.87 38.3C36.23 38.05 36.53 37.8 36.8 37.55C37.8 37.99 38.95 38.59 40 38.65C40.92 38.69 41.81 38.29 42.64 37.92C42.73 37.88 42.81 37.84 42.9 37.8C43.34 38.19 43.83 38.51 44.36 38.78C45.12 39.17 45.98 39.43 46.83 39.56C47.49 39.67 48.2 39.68 48.87 39.57C49.44 39.47 50.01 39.32 50.54 39.07C51.01 38.85 51.44 38.57 51.83 38.24C52.5 38.67 53.14 39.12 53.83 39.5C54.33 39.76 54.86 39.98 55.43 40.05C55.59 40.07 55.77 40.07 55.95 40.07L55.95 40.07C56.3 40.06 56.66 40.06 56.95 40.22C57.6 40.58 57.76 41.47 57.27 42.02C56.93 42.41 56.53 42.42 56.07 42.42C56.02 42.42 55.98 42.42 55.93 42.42C55.85 42.42 55.76 42.43 55.67 42.43L55.67 42.43L55.67 42.43L55.67 42.43C55.48 42.44 55.28 42.44 55.08 42.43C54.08 42.38 53.11 42.2 52.14 41.94C51.19 41.69 50.24 41.39 49.26 41.31C47.98 41.2 47 41.65 45.91 42.15C45.75 42.22 45.58 42.3 45.41 42.38C43.73 43.12 42.09 43.83 40.21 43.85C38.55 43.86 37 43.32 35.5 42.66C35.37 42.6 35.24 42.54 35.1 42.47C34.06 42 32.95 41.49 31.79 41.71C30.63 41.93 29.54 42.58 28.44 43.01C27 43.59 25.58 43.93 24.01 43.83C22.57 43.73 21.21 43.2 19.91 42.62C19.79 42.56 19.67 42.51 19.54 42.45C18.68 42.05 17.72 41.62 16.78 41.65C15.72 41.69 14.73 42.26 13.76 42.65C12.79 43.03 11.73 43.22 10.69 43.28C10.14 43.31 9.6 43.27 9.06 43.23L9.06 43.23C8.95 43.23 8.85 43.22 8.75 43.21C8.51 43.2 8.28 43.21 8.05 43.17C7.83 43.13 7.63 43.06 7.44 42.95C6.19 42.25 6.1 40.47 7.28 39.65C7.72 39.34 8.07 39.32 8.47 39.31C8.64 39.3 8.81 39.29 9.01 39.26C9.25 39.23 9.49 39.14 9.71 39.03C10.45 38.67 11.12 38.19 11.85 37.83C12.01 37.75 12.17 37.67 12.33 37.6C12.55 37.78 12.78 37.94 13.02 38.1C14.92 39.34 17.14 39.78 19.28 38.85C20.08 38.5 20.7 38.05 21.22 37.51ZM41.17 26.08L36.96 34.54L36.96 34.54C36.92 34.61 36.89 34.68 36.85 34.75C36.36 35.75 35.66 36.6 34.67 37.15C34.43 37.29 34.17 37.41 33.9 37.5C32.48 37.97 31.16 37.74 29.83 37.12C28.65 36.57 27.64 35.76 27.08 34.55C26.58 33.49 26.53 32.31 26.82 31.19C26.93 30.78 27.09 30.4 27.26 30.02L27.26 30.02L31.03 21.35C31.48 20.32 32.69 19.86 33.71 20.34L40.23 23.38C41.25 23.85 41.67 25.08 41.17 26.08ZM54.87 27.32L52.47 34.36L52.47 34.36C52.45 34.44 52.42 34.51 52.4 34.59C52.06 35.6 51.51 36.49 50.65 37.14C50.44 37.3 50.21 37.45 49.97 37.57C48.94 38.07 47.83 38.16 46.71 37.91C46.5 37.87 46.29 37.81 46.09 37.74C44.89 37.38 43.87 36.76 43.16 35.7C42.54 34.77 42.34 33.65 42.46 32.55C42.5 32.15 42.6 31.77 42.72 31.38L42.72 31.38L44.67 24.2C44.96 23.11 46.1 22.48 47.18 22.81L53.56 24.76C54.64 25.09 55.23 26.25 54.87 27.32ZM24.95 29.6L20.98 35.29L20.98 35.29C20.94 35.35 20.9 35.42 20.85 35.48C20.25 36.36 19.47 37.06 18.47 37.46C18.22 37.55 17.96 37.63 17.7 37.68C16.57 37.88 15.48 37.65 14.47 37.11C14.28 37.01 14.1 36.89 13.92 36.78C12.87 36.09 12.05 35.22 11.66 34.01C11.32 32.94 11.44 31.81 11.86 30.79C12.01 30.41 12.22 30.07 12.43 29.73L12.43 29.73L16.01 23.79C16.6 22.82 17.87 22.53 18.81 23.15L24.4 26.78C25.35 27.39 25.6 28.67 24.95 29.6Z"/></g></g><g class="decal-word" transform="translate(-14.78 21.5)"><path class="f-sheet" transform="scale(0.0096)" d="M87 830Q87 819 100 819Q109 819 142.5 840.5Q176 862 220 880L221 630L204 639Q187 649 145.0 670.0Q103 691 92 691Q68 691 39 658Q26 642 26 633Q26 620 45 619Q82 616 222 557L223 374Q132 381 121.0 382.0Q110 383 99 383Q86 383 72.5 369.5Q59 356 53.5 341.5Q48 327 48 322Q48 312 63 312Q80 315 98 315L223 307L224 143Q224 116 208 92Q204 86 204 81Q204 68 220 68Q230 68 247 72Q299 84 299 116L298 302Q308 301 323.0 300.0Q338 299 352.0 293.0Q366 287 373 287Q381 287 395 296Q432 319 432 340Q432 358 401 360L297 368L296 524Q317 514 361.0 491.5Q405 469 414 469Q428 469 428 483Q428 506 296 586L294 870L296 911Q296 940 276.5 957.0Q257 974 241.0 974.0Q225 974 197.5 956.5Q170 939 128.5 891.5Q87 844 87 830ZM698 935Q609 935 526 928Q484 924 461.0 896.5Q438 869 438 824L443 248Q443 218 435.5 200.0Q428 182 428 176Q428 162 447 162Q461 162 513 186L843 165Q858 165 872.0 177.5Q886 190 886 203Q886 215 882.0 221.5Q878 228 853 487Q879 515 879 527Q879 541 868.5 544.5Q858 548 515 565L513 810Q513 825 516.0 834.5Q519 844 537.5 853.0Q556 862 665 862Q853 862 879 833Q897 814 915 705Q925 646 944 646Q964 646 965 700Q965 789 961.5 829.5Q958 870 939 893Q905 935 698 935ZM687 490 780 485 798 235 691 242ZM515 498 615 493 619 246 517 253Z M1806 235Q1797 235 1778 226Q1706 186 1605 150Q1582 142 1582 125Q1582 119 1589.0 100.5Q1596 82 1613 82Q1619 82 1628 84Q1836 147 1836 179Q1827 235 1806 235ZM1075 958Q1063 958 1063 944Q1063 935 1074 914Q1152 761 1166 584Q1173 494 1173 392Q1173 291 1171.0 233.5Q1169 176 1156 141Q1154 136 1154 132Q1154 118 1173 118Q1186 118 1242 144L1371 132Q1408 132 1419 158Q1424 168 1424 172L1419 198L1415 865L1417 894Q1417 912 1399.0 930.0Q1381 948 1365 948Q1337 948 1281.0 895.5Q1225 843 1225 823Q1225 811 1240 811Q1250 811 1274.5 826.0Q1299 841 1342 859L1344 599L1234 605Q1205 838 1105 936Q1082 958 1075 958ZM1244 340 1347 333 1348 202 1243 210ZM1701 982Q1680 982 1651 956Q1545 863 1545 842Q1545 830 1560 830Q1571 830 1603.5 849.5Q1636 869 1685 889L1686 331Q1584 339 1575 339Q1555 339 1543 331Q1510 297 1510 282Q1510 264 1521 264Q1526 264 1537.0 267.0Q1548 270 1565 270L1696 262Q1735 262 1748.5 273.5Q1762 285 1766 306L1761 338V413L1788 469Q1842 427 1876 379Q1891 359 1894.5 341.5Q1898 324 1909 324Q1918 324 1930 338Q1962 371 1962 391Q1962 412 1884 477Q1850 504 1818 525Q1862 604 1914.0 668.0Q1966 732 2004.5 769.5Q2043 807 2043 814Q2043 822 2024.0 839.5Q2005 857 1988 857Q1969 857 1960 846Q1827 684 1761 546L1760 882L1762 918Q1762 948 1741.5 965.0Q1721 982 1701 982ZM1239 539 1345 533 1346 398 1243 403Q1243 479 1239 539ZM1432 875Q1417 875 1417 858Q1417 846 1447.0 804.5Q1477 763 1516.0 681.0Q1555 599 1576 503L1508 507Q1473 507 1462.0 497.5Q1451 488 1442.5 473.0Q1434 458 1434 449Q1434 437 1446 437Q1471 442 1483 442L1598 435Q1630 435 1649.0 448.5Q1668 462 1668 476Q1668 489 1661.5 497.0Q1655 505 1654 511Q1615 656 1531 773Q1497 822 1469.5 848.5Q1442 875 1432 875Z M2586 990Q2537 990 2412 891Q2341 832 2341 810Q2341 798 2356 798Q2367 798 2421.5 830.0Q2476 862 2559 893H2561Q2572 819 2572 740Q2572 490 2517 395Q2507 379 2507.0 368.0Q2507 357 2521.0 346.0Q2535 335 2553 335Q2572 335 2583 358Q2681 286 2758 194L2306 223Q2290 223 2278 212Q2248 184 2248 159Q2248 147 2260 147Q2266 147 2275.0 149.5Q2284 152 2302 152Q2819 119 2831 119Q2851 119 2869.5 134.0Q2888 149 2888.0 163.0Q2888 177 2878.5 184.0Q2869 191 2864 195Q2734 334 2611 423Q2649 545 2649 771L2648 820Q2648 990 2586 990Z"/></g></g></svg>
      <svg class="hero-fx" viewBox="0 0 1916 821" aria-hidden="true" focusable="false">
        <g class="fx-ripples"><ellipse class="fx-ripple"/><ellipse class="fx-ripple"/><ellipse class="fx-ripple"/></g>
        <g class="fx-mouth"><image data-o="0" x="230" y="347" width="47" height="25" href="data:image/png;base64,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" opacity="0"/><image data-o="0.4" x="230" y="347" width="47" height="25" href="data:image/png;base64,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" opacity="0"/><image data-o="0.75" x="230" y="347" width="47" height="25" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC8AAAAZCAIAAAAuZuBLAAAIdUlEQVR42rWX329cxRXHzzkzc3/srndtx3idYMe/Qu1AEkr40VRKAkVV2weoQH1qq/4PvPSlj5Wqti9URWorVYBUUSFVlZAoQQFaCrQiNAFMSOI4sY3t2I5/YXv9Y9d779yZc/qwGycFWlGqHp2r0b0zo/O58+t8B2XkdwAgLLBryCK3vN4wEQYARLrZEBERgTQwAwAQNdp9umcjhIiIcOPRSjvvBIgRBBkAgjhHn0QBACEE1fR/MdpFaXIAiEgTBQCY4bN+o9GhUTrvASBJEucdISqtmVlpba1FRPokyv9oIjf9xhdhYWY0CgiDMCSto1ycZpa0RkVExN4rrRUpDf9XExEWD6LDcGt7a2xsbGNj4+4jRzo6OtjZuaUFESyXy0hAjJ49feFAKICfXiG3ODQXiSCzszaKova2tr7e3jCXt57DKO+Yzp+/kCQ2MIFn9j4jICVITkSQUBskjYT/ZupvMUAABEAEhCYTA4mopjOxIAMyICMwuUy5rK+7p39/f6hCb8Fa3r//QFtp78h7l4hMmqYAoHfqdUUUBAERgWfnMqU+34A1mak5JkjCQAaZ2bqUmTURsyALsIAHZvAMGSKTieKiY1lYq03Pzs1MTRz76tEwDBFRm8AEYVipVBRgEARRFDG7W2J+igz5JgkQMO1OEiJwwh58oz7xVsSzOBQMqWDCQhznIMgBmY9XKzPzi0/88MeR3+woCiAjICLqIAynp6eXl5b6+vuLpZLsbtfPBmKQxgmBAARARLfW0VZtSwVGx7EylCvEAiLihFW6xVNzK1fG3525vvTOuQ+mZhcykVzrnp/86ImV2atam+1qEsVKj09OXLly9dDhQ+Vy2VrrvA/D0FrLzEZrJAJpHi1ICI0TCCBJrAkDAKhmKQCEkQHCqKW1rdwNgtublesrqxff+nD62rXJyamVj9dq1Wxrq7pvf9/dRx84+dj3uyYmn37294/de/8Dx+63wz0uSwMTmTDWIyMjhw8fGRgcTOsJg0RRxMxaawBAUAAgICKCiMLiAQHEsYDOOdBRvlDqKgGCS+pLK6tj50cujk1eunxleno289ze1tHS2ta7f/jO+3r29w0MDx9qaW0rlNpy+cI/3jnzzHN/yAWqtlEJwKEAIooT3VHuHLpz2LMAKQGwzhttmJnZZ1kaR7ndDabDUAcRhGEYRFBzqfVXP1q4OH7mvQ9GL1wZ39qxt/cP9PQPPPCN735vcKCvvz8f5QQgjqJcPi9I2hgAqNVqL7z4p1dffimrp+l2PciFdmMtDvKpZSSte3p6dBRWKputxdLli5dGL40dP3FyX08vhFEEwNY21o0AzS0sz86OjY5enp1fnJpfWq3Uuvq+VNpTHhw++tDjPyh3d3eWy2EUB0EQBCFwRkTsGAAY8OO19ZHzIx9eeP/UqZdmZma3V9cAIEkTIlGK2Pt8scSCeu/eciM1YZxzjufnFxYW10/9+czFiZmhuw5lLvPOV6s7l8cm09QfuOPgbeWuzjv6T3zn7mJb28Bdh8M4h0gmNFoDsqAo9Fyr7WxsrG9tbc5MzVwavXRtdnbm+vy7I+fWVlaVRh2EgkTAia0j6yjMpXWbZdbkWzQRZWkaKJPVdgb6+guPtrTu6Rqfnj/92tvPv/B2kAcd0E6N29vbjp98WBX3dPYPxfnCi6++EcS5uad+nctHA4ODURRYn02MTawuLm9WKq2traOjozbLMmtrtVoKAAAmpGJsCMEDgtaZdegTzgSa6Z8y53Hjnd/Gudg5DkhrbUCIRTzq0amZnz75q1f+NukAcrHOMg5ymoWCKPasOE1CjXvykUFZ26xqRFSqo9QSKxWSSm0y2NvT0tKilV5fX/tofmk5SWrJDnJSqQFrpY2yVfvK8z+/564Doa8556KW1h1ntE3SlnyeUMCxt3VSCglNSF8+MvSbX/7s5b+ee/a5P549P32wNxq/ligCnwl7efi+oW9/8+vdt7W254LFuRnFrDXldRgBBWSMMVorETHGZDZb3dleSuvrqd3T1fXW2Q+fef40Z/7E0d6jB27zzCJCiEA6cw6XXn+ys9wpqUOhRhYUBEFg5IzI5EurGzunTr/+4PFjZ85ePP3aW+fev7C1xY98bWhm/jo77rm9++SxY93lcldHe6x00QS6IScQEcF5L8yZwopL1qq1sbGJv7z59826fezxRx791vF9ReNVgbKqUUpF+W1ncPmNX5RKrQYEmQB2gViIGcEBmriQiQlqaw3tNzazfvb98yce/MrVqbnLVz4aH5+YnJhKk7oRKMRBW5zPB1GhUIiiyForItbamt2xKIzQva9neOjg8Yce7BvocdVFFPAQgk80kY7ylQRx7c2n4lxojCIhEEIhABIEAAcASWaDKNZBBKiA9PpqpRRYACJEBBFAABidXdisbCwvL61XKusrG+whcxl7DsMwDMNisRgXos7Ozr379h3s3SsKxLMHdMIqytlajZ0zpHWUX60z1t99WmsCYBIA0Y3sA8AAfEM7NpMoKdRag4AXIp/t0twiokkAiJSAB2zqYCBCAGJgEAK9S8MmzOpV8cLMGklFheVtqwNFINCcI4GbHMiNSPqG3BFmb21zP0Zx6jjJXOZ9++fWjzXWCnUYhT5N69Wteq1aWVsb6B8AFgAIgkDvCrlPaIb/JGwIwKWKOQBHyBjnEQmIgJStc+bBg2bnSSlSZAwprVEpylzsHDNvba6FYRAF4dL1xUplQ92h2PnGZUH/VxxNecHsAYRZAQJRvZogotYaFSlUSkOAiIFiJGER75x31lp149rQVmoBgI2NSprsDA8PG21S53NxXGP/BVU6MmPjckUKiERYvBfvEZ0iRYoElTK0O+ZG5YE9M4vI0sLC3OzcdnX7nnuPFluKmcuiKAJUIu6fcbDE1VBIQK0AAAAASUVORK5CYII=" opacity="0"/></g>
        <g class="fx-waves"></g>
        <g class="fx-props">
          <g class="fx-prop" data-prop="mask-book" opacity="0"><g transform="scale(1) translate(-0 -0)">
          <path class="f-sheet o" d="M-38-56H48a4 4 0 0 1 4 4V62a4 4 0 0 1-4 4H-38z"/>
          <path class="k-ink3" stroke-width="1.1" d="M45-50V60M48.5-49V61M-30 62.5H44"/>
          <path class="k-brass" stroke-width="3" d="M26 64l3 12"/>
          <circle class="f-brass" cx="29.6" cy="77" r="2.6"/>
          <rect class="f-indigo o" x="-48" y="-62" width="90" height="122" rx="3"/>
          <path class="k-indigo2" stroke-width="4" d="M37-55V52"/>
          <path class="k-sheet" stroke-width="1.6" d="M-37-58V56M-48-46h11M-48-24h11M-48-2h11M-48 20h11M-48 42h11"/>
          <rect class="f-sheet" x="-31" y="-54" width="9" height="40" rx="1"/>
          <path class="k-ink" stroke-width="1.6" d="M-26.5-49v6M-26.5-38v6M-26.5-27v7"/>
          <path class="f-gold o" d="M6-42C27-42 36-31 36-14 36 3 31 19 21 31 15 39 10 44 6 44 2 44-3 39-9 31-19 19-24 3-24-14-24-31-15-42 6-42z"/>
          <path class="f-ink" d="M6-39C9.5-31 9.5-22 6-14 2.5-22 2.5-31 6-39z"/>
          <path class="f-ink" d="M-19-17C-13-27-3-26 2-15-5-20-12-20-19-17zM31-17C25-27 15-26 10-15 17-20 24-20 31-17z"/>
          <path class="f-ink" d="M0-9C-7-13-16-11-19-1-12-5-5-5 0-9zM12-9C19-13 28-11 31-1 24-5 17-5 12-9z"/>
          <ellipse class="f-sheet" cx="-8.5" cy="-7.2" rx="3.6" ry="2.2" transform="rotate(-14 -8.5 -7.2)"/>
          <ellipse class="f-sheet" cx="20.5" cy="-7.2" rx="3.6" ry="2.2" transform="rotate(14 20.5 -7.2)"/>
          <circle class="f-ink" cx="-8" cy="-7.2" r="1.3"/>
          <circle class="f-ink" cx="20" cy="-7.2" r="1.3"/>
          <path class="k-ink" stroke-width="2" d="M2 6q4 4 8 0"/>
          <path class="k-brass" stroke-width="1.8" d="M-17 8c3 7 8 8 12 4M29 8c-3 7-8 8-12 4"/>
          <path class="f-ink" d="M-9 22C-2 17 14 17 21 22 15 30-3 30-9 22z"/>
          </g></g>
          <g class="fx-prop" data-prop="scroll" opacity="0"><g transform="scale(1) translate(-0 -0)">
          <path class="f-sheet o" d="M-62-33C-30-38 30-29 62-35V31C30 37-30 28-62 33z"/>
          <path class="k-brass" stroke-width="1.3" d="M-55-26C-26-30 26-22 55-28V24C26 30-26 22-55 26z"/>
          <path class="f-indigo2" d="M-50 20-33-5-24 4-7-21 9-1 17-9 35 19C12 23-27 16-50 20z"/>
          <path class="f-indigo" d="M7 21 26 1 43 20C33 22 18 22 7 21z"/>
          <path class="k-sheet" stroke-width="1.6" d="M-7-21-12-11M-33-5-36 0M26 1 22 7"/>
          <path class="k-ink" stroke-width="1.6" d="M-7-21V-35"/>
          <path class="f-gold" d="M-7-35 4-31.5-7-28z"/>
          <path class="k-ink" stroke-width="1.8" stroke-dasharray="4 4.5" d="M-50 26C-34 30-28 12-12 14S16 26 27 11 42-12 52-20"/>
          <rect class="f-wood o" x="-71" y="-42" width="10" height="84" rx="3"/>
          <rect class="f-wood o" x="61" y="-44" width="10" height="84" rx="3"/>
          <path class="f-gold o" d="M-69-50h6v8h-6zM-69 42h6v8h-6zM63-52h6v8h-6zM63 40h6v8h-6z"/>
          </g></g>
          <g class="fx-prop" data-prop="pie" opacity="0"><g transform="scale(1) translate(-0 -0)">
          <path class="f-brass o" d="M-64-6A64 32 0 0 0 64-6V9A64 32 0 0 1-64 9z"/>
          <path class="k-gold" stroke-width="1.2" opacity=".7" d="M-63.5-1A64 32 0 0 0 63.5-1M-63.5 4A64 32 0 0 0 63.5 4"/>
          <ellipse class="f-gold o" cx="0" cy="-6" rx="64" ry="32"/>
          <ellipse class="k-brass" stroke-width="1.4" opacity=".55" cx="0" cy="-6.5" rx="55" ry="26"/>
          <g class="f-brass" opacity=".5">
          <ellipse cx="-24" cy="-12" rx="7" ry="3.2"/><ellipse cx="17" cy="-22" rx="6" ry="2.6"/><ellipse cx="30" cy="1" rx="8" ry="3.2"/><ellipse cx="-8" cy="8" rx="6" ry="2.6"/><ellipse cx="-42" cy="4" rx="4.5" ry="2.2"/>
          </g>
          <g class="f-sheet">
          <ellipse cx="-20.4" cy="-26.9" rx="2.3" ry="1.15" transform="rotate(18 -20.4 -26.9)"/><ellipse cx="-49.6" cy="-3.8" rx="2.3" ry="1.15" transform="rotate(-16 -49.6 -3.8)"/><ellipse cx="-8.8" cy="13.6" rx="2.3" ry="1.15" transform="rotate(-45 -8.8 13.6)"/><ellipse cx="-32.1" cy="1.6" rx="2.3" ry="1.15" transform="rotate(54 -32.1 1.6)"/><ellipse cx="8.9" cy="-12.2" rx="2.3" ry="1.15" transform="rotate(57 8.9 -12.2)"/><ellipse cx="-44.3" cy="-17.5" rx="2.3" ry="1.15" transform="rotate(38 -44.3 -17.5)"/><ellipse cx="5.5" cy="-32.2" rx="2.3" ry="1.15" transform="rotate(-53 5.5 -32.2)"/><ellipse cx="-8.4" cy="-17.2" rx="2.3" ry="1.15" transform="rotate(10 -8.4 -17.2)"/><ellipse cx="34.1" cy="5.9" rx="2.3" ry="1.15" transform="rotate(-31 34.1 5.9)"/><ellipse cx="43.5" cy="7.8" rx="2.3" ry="1.15" transform="rotate(-25 43.5 7.8)"/><ellipse cx="-40.4" cy="-6.7" rx="2.3" ry="1.15" transform="rotate(-55 -40.4 -6.7)"/><ellipse cx="19.5" cy="9.9" rx="2.3" ry="1.15" transform="rotate(9 19.5 9.9)"/><ellipse cx="43.6" cy="-17.2" rx="2.3" ry="1.15" transform="rotate(23 43.6 -17.2)"/><ellipse cx="10.9" cy="-1.2" rx="2.3" ry="1.15" transform="rotate(-5 10.9 -1.2)"/><ellipse cx="-3" cy="3.8" rx="2.3" ry="1.15" transform="rotate(-53 -3 3.8)"/><ellipse cx="23.4" cy="2.8" rx="2.3" ry="1.15" transform="rotate(59 23.4 2.8)"/><ellipse cx="-13.2" cy="4.1" rx="2.3" ry="1.15" transform="rotate(-57 -13.2 4.1)"/><ellipse cx="-4.4" cy="-25.9" rx="2.3" ry="1.15" transform="rotate(-46 -4.4 -25.9)"/><ellipse cx="5.7" cy="17" rx="2.3" ry="1.15" transform="rotate(38 5.7 17)"/><ellipse cx="-31.1" cy="-22" rx="2.3" ry="1.15" transform="rotate(-2 -31.1 -22)"/><ellipse cx="10.3" cy="-20.2" rx="2.3" ry="1.15" transform="rotate(-60 10.3 -20.2)"/><ellipse cx="22.1" cy="-5.1" rx="2.3" ry="1.15" transform="rotate(14 22.1 -5.1)"/><ellipse cx="-3.9" cy="-7" rx="2.3" ry="1.15" transform="rotate(-50 -3.9 -7)"/><ellipse cx="-27.3" cy="13.7" rx="2.3" ry="1.15" transform="rotate(-41 -27.3 13.7)"/><ellipse cx="-27.7" cy="-14" rx="2.3" ry="1.15" transform="rotate(-40 -27.7 -14)"/><ellipse cx="31.5" cy="-4" rx="2.3" ry="1.15" transform="rotate(33 31.5 -4)"/><ellipse cx="53" cy="-9.2" rx="2.3" ry="1.15" transform="rotate(52 53 -9.2)"/><ellipse cx="18.6" cy="18.6" rx="2.3" ry="1.15" transform="rotate(34 18.6 18.6)"/><ellipse cx="-37.3" cy="11.3" rx="2.3" ry="1.15" transform="rotate(-20 -37.3 11.3)"/><ellipse cx="18.2" cy="-15" rx="2.3" ry="1.15" transform="rotate(6 18.2 -15)"/><ellipse cx="37.8" cy="-23.3" rx="2.3" ry="1.15" transform="rotate(-30 37.8 -23.3)"/><ellipse cx="3.7" cy="-4.6" rx="2.3" ry="1.15" transform="rotate(-58 3.7 -4.6)"/><ellipse cx="-20.2" cy="-4.9" rx="2.3" ry="1.15" transform="rotate(7 -20.2 -4.9)"/><ellipse cx="-21.1" cy="7.3" rx="2.3" ry="1.15" transform="rotate(-58 -21.1 7.3)"/><ellipse cx="30.1" cy="-18.6" rx="2.3" ry="1.15"/><ellipse cx="-2.9" cy="20.1" rx="2.3" ry="1.15" transform="rotate(-47 -2.9 20.1)"/><ellipse cx="37" cy="-10.1" rx="2.3" ry="1.15" transform="rotate(-1 37 -10.1)"/><ellipse cx="3.4" cy="9" rx="2.3" ry="1.15" transform="rotate(19 3.4 9)"/><ellipse cx="27.1" cy="12.7" rx="2.3" ry="1.15" transform="rotate(-43 27.1 12.7)"/><ellipse cx="22.4" cy="-22.2" rx="2.3" ry="1.15" transform="rotate(-56 22.4 -22.2)"/><ellipse cx="16.6" cy="-31.4" rx="2.3" ry="1.15" transform="rotate(-42 16.6 -31.4)"/><ellipse cx="-18.1" cy="-17" rx="2.3" ry="1.15" transform="rotate(41 -18.1 -17)"/><ellipse cx="-11.6" cy="-9.2" rx="2.3" ry="1.15" transform="rotate(54 -11.6 -9.2)"/><ellipse cx="37.3" cy="13.3" rx="2.3" ry="1.15" transform="rotate(-8 37.3 13.3)"/><ellipse cx="-14.8" cy="19.2" rx="2.3" ry="1.15" transform="rotate(-37 -14.8 19.2)"/><ellipse cx="-54.5" cy="-11.4" rx="2.3" ry="1.15" transform="rotate(37 -54.5 -11.4)"/>
          </g>
          </g></g>
          <g class="fx-prop" data-prop="soup" opacity="0"><g transform="scale(1) translate(-0 -0)">
          <path class="k-ink3" stroke-width="2.2" opacity=".75" d="M-4-36c-7-9 5-14-1-24M10-34c-6-8 5-13 0-22M24-38c-5-7 4-11 0-18"/>
          <rect class="f-indigo o" x="-63" y="-8" width="16" height="12" rx="5"/>
          <rect class="f-indigo o" x="47" y="-8" width="16" height="12" rx="5"/>
          <path class="f-indigo o" d="M-51-10C-51 26-41 45 0 47 41 45 51 26 51-10z"/>
          <path class="k-indigo2" stroke-width="4.5" d="M-41 2c0 17 6 28 16 34"/>
          <ellipse class="f-indigo2 o" cx="0" cy="-10" rx="53" ry="12.5"/>
          <ellipse class="f-gold" cx="0" cy="-9" rx="45" ry="8.5"/>
          <path class="k-brass" stroke-width="1.3" opacity=".7" d="M-30-8q8 3 16 0M6-5q8 3 16 0"/>
          <g class="k-ink" stroke-width="14"><path d="M14-11 32-37"/></g>
          <circle class="f-ink" cx="28.4" cy="-42.4" r="8.4"/>
          <circle class="f-ink" cx="37.6" cy="-35.4" r="8.4"/>
          <g class="k-sheet" stroke-width="8"><path d="M14-11 32-37"/></g>
          <circle class="f-sheet" cx="28.4" cy="-42.4" r="5.4"/>
          <circle class="f-sheet" cx="37.6" cy="-35.4" r="5.4"/>
          <ellipse class="f-gold" cx="13.5" cy="-8.8" rx="9" ry="3"/>
          <g transform="rotate(-24 -26 -24)">
          <ellipse class="f-indigo o" cx="-26" cy="-24" rx="31" ry="9"/>
          <path class="k-indigo2" stroke-width="3" d="M-48-26q22-7 44 0"/>
          <rect class="f-brass o" x="-31" y="-38" width="10" height="7" rx="3"/>
          </g>
          </g></g>
          <g class="fx-prop" data-prop="go-board" opacity="0"><g transform="scale(1) translate(-0 -0)">
          <path class="f-wood o" d="M-60 6h9v15h-9zM-5 38h10v15H-5zM51 6h9v15h-9z"/>
          <path class="f-brass o" d="M-66-6 0 28V44L-66 10z"/>
          <path class="f-wood o" d="M0 28 66-6V10L0 44z"/>
          <path class="f-gold o" d="M-66-6 0-40 66-6 0 28z"/>
          <path class="k-wood" stroke-width="1.1" d="M-52.8-6 0-33.2M-46.2-2.6 6.6-29.8M-39.6.8 13.2-26.4M-33 4.2 19.8-23M-26.4 7.6 26.4-19.6M-19.8 11 33-16.2M-13.2 14.4 39.6-12.8M-6.6 17.8 46.2-9.4M0 21.2 52.8-6M-52.8-6 0 21.2M-46.2-9.4 6.6 17.8M-39.6-12.8 13.2 14.4M-33-16.2 19.8 11M-26.4-19.6 26.4 7.6M-19.8-23 33 4.2M-13.2-26.4 39.6.8M-6.6-29.8 46.2-2.6M0-33.2 52.8-6"/>
          <g class="f-ink">
          <ellipse cx="-13.2" cy="-12.8" rx="5.4" ry="3.1"/><ellipse cx="6.6" cy="-9.4" rx="5.4" ry="3.1"/><ellipse cx="0" cy="-6" rx="5.4" ry="3.1"/><ellipse cx="19.8" cy="-2.6" rx="5.4" ry="3.1"/><ellipse cx="-19.8" cy="4.2" rx="5.4" ry="3.1"/><ellipse cx="26.4" cy="-12.8" rx="5.4" ry="3.1"/>
          </g>
          <g class="f-sheet">
          <ellipse cx="-6.6" cy="-2.6" rx="5.4" ry="3.1"/><ellipse cx="13.2" cy="-19.6" rx="5.4" ry="3.1"/><ellipse cx="-26.4" cy="-6" rx="5.4" ry="3.1"/><ellipse cx="13.2" cy="7.6" rx="5.4" ry="3.1"/><ellipse cx="-6.6" cy="-23" rx="5.4" ry="3.1"/>
          </g>
          <g class="k-ink" stroke-width="1">
          <ellipse cx="-6.6" cy="-2.6" rx="5.4" ry="3.1"/><ellipse cx="13.2" cy="-19.6" rx="5.4" ry="3.1"/><ellipse cx="-26.4" cy="-6" rx="5.4" ry="3.1"/><ellipse cx="13.2" cy="7.6" rx="5.4" ry="3.1"/><ellipse cx="-6.6" cy="-23" rx="5.4" ry="3.1"/>
          </g>
          <g class="f-ink3" opacity=".9">
          <ellipse cx="-14.6" cy="-13.8" rx="1.8" ry=".9"/><ellipse cx="5.2" cy="-10.4" rx="1.8" ry=".9"/><ellipse cx="-1.4" cy="-7" rx="1.8" ry=".9"/><ellipse cx="18.4" cy="-3.6" rx="1.8" ry=".9"/><ellipse cx="-21.2" cy="3.2" rx="1.8" ry=".9"/><ellipse cx="25" cy="-13.8" rx="1.8" ry=".9"/>
          </g>
          </g></g>
          <g class="fx-prop" data-prop="rocket" opacity="0"><g transform="scale(1) translate(-0 -0)">
          <g class="flame">
          <path class="f-gold" d="M-12 42C-15 56-4 64 0 78 4 64 15 56 12 42z"/>
          <path class="f-sheet" d="M-6 42C-7 51-2 56 0 66 2 56 7 51 6 42z"/>
          </g>
          <path class="f-indigo o" d="M-17 12C-31 21-35 34-33 46L-15 37zM17 12C31 21 35 34 33 46L15 37z"/>
          <path class="f-sheet o" d="M0-68C16-52 22-26 20 4 19 20 16 33 14 41H-14C-16 33-19 20-20 4-22-26-16-52 0-68z"/>
          <path class="f-line" d="M10-50C18-30 19 0 17 20 16 30 14.5 36 13 40H8C10 30 12 10 11-12 10-28 8.5-40 4-55z"/>
          <path class="f-brass o" d="M0-68C8-60 12.5-53 15.5-45H-15.5C-12.5-53-8-60 0-68z"/>
          <circle class="f-sheet o" cx="0" cy="-17" r="12"/>
          <circle class="f-indigo" cx="0" cy="-17" r="8.2"/>
          <path class="k-sheet" stroke-width="2" opacity=".8" d="M-4.5-20.5a5.6 5.6 0 0 1 5-2.4"/>
          <path class="k-indigo2" stroke-width="3" d="M-19 13H19"/>
          <path class="f-indigo o" d="M-3.5 26h7v20h-7z"/>
          <path class="f-ink2 o" d="M-11 40h22l-3 5h-16z"/>
          </g></g>
        </g>
        <g class="fx-seal" opacity="0"><g class="logo" transform="scale(1) translate(-32 -32)"><path class="lg-face" d="M2 0L62 0C63.1 0 64 0.9 64 2L64 62C64 63.1 63.1 64 62 64L2 64C0.9 64 0 63.1 0 62L0 2C0 0.9 0.9 0 2 0Z"/><path class="lg-figure" d="M21.22 37.51C21.43 37.6 21.64 37.69 21.85 37.78C22.64 38.14 23.47 38.55 24.34 38.64C25.35 38.74 26.37 38.27 27.3 37.85C27.42 37.79 27.54 37.74 27.66 37.68C28.01 37.94 28.37 38.17 28.75 38.37C31.01 39.56 33.68 39.79 35.87 38.3C36.23 38.05 36.53 37.8 36.8 37.55C37.8 37.99 38.95 38.59 40 38.65C40.92 38.69 41.81 38.29 42.64 37.92C42.73 37.88 42.81 37.84 42.9 37.8C43.34 38.19 43.83 38.51 44.36 38.78C45.12 39.17 45.98 39.43 46.83 39.56C47.49 39.67 48.2 39.68 48.87 39.57C49.44 39.47 50.01 39.32 50.54 39.07C51.01 38.85 51.44 38.57 51.83 38.24C52.5 38.67 53.14 39.12 53.83 39.5C54.33 39.76 54.86 39.98 55.43 40.05C55.59 40.07 55.77 40.07 55.95 40.07L55.95 40.07C56.3 40.06 56.66 40.06 56.95 40.22C57.6 40.58 57.76 41.47 57.27 42.02C56.93 42.41 56.53 42.42 56.07 42.42C56.02 42.42 55.98 42.42 55.93 42.42C55.85 42.42 55.76 42.43 55.67 42.43L55.67 42.43L55.67 42.43L55.67 42.43C55.48 42.44 55.28 42.44 55.08 42.43C54.08 42.38 53.11 42.2 52.14 41.94C51.19 41.69 50.24 41.39 49.26 41.31C47.98 41.2 47 41.65 45.91 42.15C45.75 42.22 45.58 42.3 45.41 42.38C43.73 43.12 42.09 43.83 40.21 43.85C38.55 43.86 37 43.32 35.5 42.66C35.37 42.6 35.24 42.54 35.1 42.47C34.06 42 32.95 41.49 31.79 41.71C30.63 41.93 29.54 42.58 28.44 43.01C27 43.59 25.58 43.93 24.01 43.83C22.57 43.73 21.21 43.2 19.91 42.62C19.79 42.56 19.67 42.51 19.54 42.45C18.68 42.05 17.72 41.62 16.78 41.65C15.72 41.69 14.73 42.26 13.76 42.65C12.79 43.03 11.73 43.22 10.69 43.28C10.14 43.31 9.6 43.27 9.06 43.23L9.06 43.23C8.95 43.23 8.85 43.22 8.75 43.21C8.51 43.2 8.28 43.21 8.05 43.17C7.83 43.13 7.63 43.06 7.44 42.95C6.19 42.25 6.1 40.47 7.28 39.65C7.72 39.34 8.07 39.32 8.47 39.31C8.64 39.3 8.81 39.29 9.01 39.26C9.25 39.23 9.49 39.14 9.71 39.03C10.45 38.67 11.12 38.19 11.85 37.83C12.01 37.75 12.17 37.67 12.33 37.6C12.55 37.78 12.78 37.94 13.02 38.1C14.92 39.34 17.14 39.78 19.28 38.85C20.08 38.5 20.7 38.05 21.22 37.51ZM41.17 26.08L36.96 34.54L36.96 34.54C36.92 34.61 36.89 34.68 36.85 34.75C36.36 35.75 35.66 36.6 34.67 37.15C34.43 37.29 34.17 37.41 33.9 37.5C32.48 37.97 31.16 37.74 29.83 37.12C28.65 36.57 27.64 35.76 27.08 34.55C26.58 33.49 26.53 32.31 26.82 31.19C26.93 30.78 27.09 30.4 27.26 30.02L27.26 30.02L31.03 21.35C31.48 20.32 32.69 19.86 33.71 20.34L40.23 23.38C41.25 23.85 41.67 25.08 41.17 26.08ZM54.87 27.32L52.47 34.36L52.47 34.36C52.45 34.44 52.42 34.51 52.4 34.59C52.06 35.6 51.51 36.49 50.65 37.14C50.44 37.3 50.21 37.45 49.97 37.57C48.94 38.07 47.83 38.16 46.71 37.91C46.5 37.87 46.29 37.81 46.09 37.74C44.89 37.38 43.87 36.76 43.16 35.7C42.54 34.77 42.34 33.65 42.46 32.55C42.5 32.15 42.6 31.77 42.72 31.38L42.72 31.38L44.67 24.2C44.96 23.11 46.1 22.48 47.18 22.81L53.56 24.76C54.64 25.09 55.23 26.25 54.87 27.32ZM24.95 29.6L20.98 35.29L20.98 35.29C20.94 35.35 20.9 35.42 20.85 35.48C20.25 36.36 19.47 37.06 18.47 37.46C18.22 37.55 17.96 37.63 17.7 37.68C16.57 37.88 15.48 37.65 14.47 37.11C14.28 37.01 14.1 36.89 13.92 36.78C12.87 36.09 12.05 35.22 11.66 34.01C11.32 32.94 11.44 31.81 11.86 30.79C12.01 30.41 12.22 30.07 12.43 29.73L12.43 29.73L16.01 23.79C16.6 22.82 17.87 22.53 18.81 23.15L24.4 26.78C25.35 27.39 25.6 28.67 24.95 29.6Z"/></g></g>
      </svg>
      <button class="hero-replay" type="button" aria-label="再看一遍：点录音笔重播动画" title="再看一遍"></button>
    </div>
  </header>
</template>

<style>
/* ---------- 招牌：牌匾和标语在上，插画在下 ----------
   新图中间上方是道具飞过的路线，牌匾不再压在画上。类名都带 hero- 前缀，不和全站的 .plaque 冲突。 */
.hero-signboard{max-width:1920px;margin:0 auto;container-type:inline-size}
.hero-sign{display:flex;flex-direction:column;align-items:center;text-align:center;padding:clamp(22px,2.4cqi,44px) 16px clamp(14px,1.5cqi,26px)}
.hero-plaque{display:inline-block;margin:0;padding:.41em 1.18em;background:var(--indigo,#1F3A4D);color:#F4F2EA;font-family:var(--kai,"LXGW WenKai","KaiTi","STKaiti","BiauKai",serif);font-weight:400;font-size:clamp(24px,2.1cqi,40px);line-height:1.7;white-space:nowrap;box-shadow:inset 0 0 0 5px var(--indigo,#1F3A4D),inset 0 0 0 6px #C9A86A}
.hero-plaque span{letter-spacing:.35em;margin-right:-.35em}
.hero-motto{margin:.8em 0 0;font-family:var(--kai,"LXGW WenKai","KaiTi","STKaiti","BiauKai",serif);font-size:clamp(15px,1.1cqi,21px);line-height:1.8;letter-spacing:.12em;color:var(--ink-2,#4E4C45)}
.hero-motto span{display:inline-block;margin:0 .4em}

/* ---------- 插画：三层叠在同一个 1916 × 821 的框里 ---------- */
.hero-stage{position:relative;aspect-ratio:1916/821;overflow:hidden;background:var(--paper,#ECEAE1)}
.hero-stage picture,.hero-stage img{position:absolute;inset:0;display:block;width:100%;height:100%}
.hero-after{opacity:0}
.hero-fx{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
/* 录音笔正面的铭牌（logo 和“把脉了”）：画在底图上面、动效下面，静态图上也显示 */
.hero-decal{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.hero-decal .decal-plate{stroke:var(--ink-2,#4E4C45);stroke-width:.8;stroke-opacity:.7}
/* logo 印在两处：盖在材料上的印章是朱砂印面、素笺图形；录音笔铭牌上是反白版，素笺印面、松烟墨图形 */
.hero-fx .fx-seal .lg-face{fill:var(--cinnabar,#B5382A)}
.hero-fx .fx-seal .lg-figure{fill:var(--sheet,#F8F7F2);color:var(--sheet,#F8F7F2)}
.hero-decal .lg-face{fill:var(--sheet,#F8F7F2)}
.hero-decal .lg-figure{fill:var(--ink,#24231F);color:var(--ink,#24231F)}
.hero-replay{position:absolute;padding:0;border:0;border-radius:14px;background:none;cursor:pointer;-webkit-tap-highlight-color:transparent}
.hero-replay:focus-visible{outline:2px solid var(--brass,#85682F);outline-offset:2px}

/* 声浪：只用设计系统的颜色 */
.hero-fx .fx-waves path{fill:none;stroke-linecap:round;stroke-linejoin:round}
.hero-fx .w-ink2{stroke:var(--ink-2,#4E4C45)}
.hero-fx .w-ink3{stroke:var(--ink-3,#6B685F)}
.hero-fx .w-brass{stroke:var(--brass,#85682F)}
.hero-fx .w-gold{stroke:var(--gold,#D9B865)}
/* 录音笔周围的波纹：平时不显示，收住时亮一下；鼠标移到录音笔上时淡淡亮起，提示可以点 */
.hero-fx .fx-ripple{fill:none;stroke:var(--gold,#D9B865);stroke-width:2.6;opacity:0;transform-box:fill-box;transform-origin:center}
.hero-stage.is-hot .fx-ripple{opacity:.55;transition:opacity .25s}
.hero-fx .fx-seal{mix-blend-mode:multiply}

/* 减少动态效果、或者屏幕窄于 768px：<picture> 换成 hero-static，这几层都不要 */
@media (prefers-reduced-motion:reduce),(max-width:767.98px){
  .hero-stage .hero-after,.hero-stage .hero-fx,.hero-stage .hero-replay{display:none}
}
@media (max-width:600px){
  .hero-motto span{display:block}
}

/* 道具和印章的配色（props/_style.css） */
.hero-fx .f-sheet,.hero-decal .f-sheet{fill:var(--sheet,#F8F7F2)}
.hero-fx .f-paper,.hero-decal .f-paper{fill:var(--paper,#ECEAE1)}
.hero-fx .f-line,.hero-decal .f-line{fill:var(--line,#D6D2C4)}
.hero-fx .f-ink,.hero-decal .f-ink{fill:var(--ink,#24231F)}
.hero-fx .f-ink2,.hero-decal .f-ink2{fill:var(--ink-2,#4E4C45)}
.hero-fx .f-ink3,.hero-decal .f-ink3{fill:var(--ink-3,#6B685F)}
.hero-fx .f-indigo,.hero-decal .f-indigo{fill:var(--indigo,#1F3A4D)}
.hero-fx .f-indigo2,.hero-decal .f-indigo2{fill:var(--indigo-2,#2B4D65)}
.hero-fx .f-gold,.hero-decal .f-gold{fill:var(--gold,#D9B865)}
.hero-fx .f-brass,.hero-decal .f-brass{fill:var(--brass,#85682F)}
.hero-fx .f-wood,.hero-decal .f-wood{fill:var(--wood,#6B4A2B)}
.hero-fx .f-cinnabar,.hero-decal .f-cinnabar{fill:var(--cinnabar,#B5382A)}
.hero-fx .o,.hero-decal .o{stroke:var(--ink,#24231F);stroke-width:3;stroke-linejoin:round;stroke-linecap:round}
.hero-fx .k-ink,.hero-fx .k-ink3,.hero-fx .k-line,.hero-fx .k-sheet,.hero-fx .k-gold,.hero-fx .k-brass,.hero-fx .k-wood,.hero-fx .k-indigo2,.hero-decal .k-ink,.hero-decal .k-ink3,.hero-decal .k-line,.hero-decal .k-sheet,.hero-decal .k-gold,.hero-decal .k-brass,.hero-decal .k-wood,.hero-decal .k-indigo2{fill:none;stroke-linecap:round;stroke-linejoin:round}
.hero-fx .k-ink,.hero-decal .k-ink{stroke:var(--ink,#24231F)}
.hero-fx .k-ink3,.hero-decal .k-ink3{stroke:var(--ink-3,#6B685F)}
.hero-fx .k-line,.hero-decal .k-line{stroke:var(--line,#D6D2C4)}
.hero-fx .k-sheet,.hero-decal .k-sheet{stroke:var(--sheet,#F8F7F2)}
.hero-fx .k-gold,.hero-decal .k-gold{stroke:var(--gold,#D9B865)}
.hero-fx .k-brass,.hero-decal .k-brass{stroke:var(--brass,#85682F)}
.hero-fx .k-wood,.hero-decal .k-wood{stroke:var(--wood,#6B4A2B)}
.hero-fx .k-indigo2,.hero-decal .k-indigo2{stroke:var(--indigo-2,#2B4D65)}
</style>
