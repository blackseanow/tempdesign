/* ?debug=1：在图上标出四个锚点，拖动（或选中后按方向键）微调，画面实时跟着变；
   面板里能拖时间轴、叠一张参考图，调好以后“复制 JSON”贴回 anchors.json。只在 index.html 里有。 */
function initHeroDebug(stage, motion, anchors, source) {
  const NS = 'http://www.w3.org/2000/svg', W = 1916, H = 821
  const KEYS = ['mouth', 'recorder', 'notebook', 'stack']
  const FOCUS_T = { mouth: 2.6, notebook: 2.6, recorder: 5.3, stack: 8 }
  const NOTE = anchors['说明']
  let a = clone(anchors)
  const round = v => Math.round(v * 100) / 100
  function clone(o) { return JSON.parse(JSON.stringify(o)) }

  stage.classList.add('hero-debug-on')
  const layer = el('div', 'hero-debug')
  const ref = el('img', 'hero-debug-ref')
  ref.alt = ''
  const guides = document.createElementNS(NS, 'svg')
  guides.setAttribute('viewBox', `0 0 ${W} ${H}`)
  guides.setAttribute('class', 'hero-debug-guides')
  layer.append(ref, guides)
  const pins = {}
  for (const k of KEYS) {
    const pin = el('button', 'hero-debug-pin')
    pin.type = 'button'
    pin.dataset.key = k
    pin.innerHTML = '<i></i><span></span>'
    pin.title = '拖动，或选中后按方向键（Shift 加大步长）'
    layer.append(pin)
    pins[k] = pin
    // 点住哪个锚点，就跳到它起作用的那一刻：嘴边、笔记本看把脉前，录音笔看收住，材料看盖好的印章（base-after）
    pin.addEventListener('focus', () => { if (!motion.playing) motion.seek(FOCUS_T[k]) })
    pin.addEventListener('pointerdown', e => {
      if (!motion.playing) motion.seek(FOCUS_T[k])
      pin.setPointerCapture(e.pointerId)
      const move = ev => {
        const r = stage.getBoundingClientRect()
        a[k].x = round(Math.min(100, Math.max(0, (ev.clientX - r.left) / r.width * 100)))
        a[k].y = round(Math.min(100, Math.max(0, (ev.clientY - r.top) / r.height * 100)))
        update()
      }
      const up = () => { pin.removeEventListener('pointermove', move); pin.removeEventListener('pointerup', up) }
      pin.addEventListener('pointermove', move)
      pin.addEventListener('pointerup', up)
      e.preventDefault()
    })
    pin.addEventListener('keydown', e => {
      const step = e.shiftKey ? 0.5 : 0.05
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
      if (!d) return
      a[k].x = round(a[k].x + d[0]); a[k].y = round(a[k].y + d[1])
      update(); e.preventDefault()
    })
  }
  stage.append(layer)

  const panel = el('aside', 'hero-debug-panel')
  panel.innerHTML = `
    <section>
      <h2>锚点调试</h2>
      <div class="hd-row hd-time"><button type="button" data-act="play">播放</button><button type="button" data-act="pause">暂停</button><button type="button" data-act="replay">重播</button>
        <select data-act="speed"><option value="1">1 倍速</option><option value="0.5">0.5 倍速</option><option value="0.25">0.25 倍速</option></select></div>
      <div class="hd-row"><input type="range" min="0" max="8" step="0.01" value="0" data-act="seek"><output>0.00 s</output></div>
      <p class="hd-air"></p>
      <div class="hd-row"><label>参考图 <select data-act="ref"><option value="hero-static">hero-static</option><option value="base-before">base-before</option><option value="base-after">base-after</option></select></label>
        <label>不透明度 <input type="range" min="0" max="100" value="0" data-act="refa"></label></div>
      <div class="hd-row"><label><input type="checkbox" data-act="guides" checked> 显示声浪中线、波纹、印章和重播热区</label></div>
      <p class="hd-src"></p>
    </section>
    <section>
      <table><thead><tr><th>锚点</th><th>x %</th><th>y %</th></tr></thead><tbody>${KEYS.map(k => `
        <tr><td>${anchors[k].label}</td><td><input type="number" step="0.05" data-k="${k}" data-c="x"></td><td><input type="number" step="0.05" data-k="${k}" data-c="y"></td></tr>`).join('')}
      </tbody></table>
      <div class="hd-row"><button type="button" data-act="copy">复制 JSON</button><button type="button" data-act="reset">恢复</button><span class="hd-msg"></span></div>
      <p class="hd-note">拖动图上的圆点（或选中后按方向键，Shift 加大步长），也可以改上面的数字，画面实时更新。调好以后点“复制 JSON”，整段贴回 hero-v2/anchors.json，再运行 python3 tools/build.py 同步页面里的内嵌副本。</p>
    </section>
    <section><textarea readonly rows="9"></textarea></section>`
  document.body.append(panel)
  const $ = s => panel.querySelector(s)
  $('.hd-src').textContent = source === 'anchors.json'
    ? '锚点读自 anchors.json（改了文件刷新页面即可）'
    : 'file:// 打开读不到 anchors.json，用的是页面里的内嵌副本。用 python3 -m http.server 打开，改文件刷新就能看到。'
  if (!motion.animated) $('.hd-src').textContent += ' 现在是静态图（减少动态效果或窗口窄于 768px），动画不播。'
  const range = $('[data-act="seek"]'), out = $('output'), air = $('.hd-air')
  panel.addEventListener('input', e => {
    const t = e.target
    if (t.dataset.k) { const v = parseFloat(t.value); if (!isNaN(v)) { a[t.dataset.k][t.dataset.c] = round(v); update(false) } }
    else if (t.dataset.act === 'seek') motion.seek(parseFloat(t.value))
    else if (t.dataset.act === 'refa') ref.style.opacity = t.value / 100
    else if (t.dataset.act === 'ref') ref.src = `img/${t.value}.webp`
    else if (t.dataset.act === 'speed') motion.setSpeed(parseFloat(t.value))
    else if (t.dataset.act === 'guides') guides.style.display = t.checked ? '' : 'none'
  })
  panel.addEventListener('click', e => {
    const act = e.target.dataset && e.target.dataset.act
    if (act === 'play') motion.play()
    else if (act === 'pause') motion.pause()
    else if (act === 'replay') motion.replay()
    else if (act === 'reset') { a = clone(anchors); update() }
    else if (act === 'copy') copy()
  })
  ref.src = 'img/hero-static.webp'
  ref.style.opacity = 0

  function json() {
    const rows = KEYS.map(k => `  "${k}": { "label": "${a[k].label}", "x": ${round(a[k].x)}, "y": ${round(a[k].y)} }`)
    return `{\n  "说明": ${JSON.stringify(NOTE)},\n${rows.join(',\n')}\n}\n`
  }
  function copy() {
    const text = json(), msg = $('.hd-msg')
    const done = ok => { msg.textContent = ok ? '已复制' : '复制失败，请手动全选下面的文字'; setTimeout(() => { msg.textContent = '' }, 2000) }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(() => done(true), () => done(false))
    else { const ta = $('textarea'); ta.select(); done(document.execCommand('copy')) }
  }

  function update(syncInputs = true) {
    motion.setAnchors(a)
    for (const k of KEYS) {
      pins[k].style.left = a[k].x + '%'
      pins[k].style.top = a[k].y + '%'
      pins[k].querySelector('span').textContent = `${anchors[k].label} ${a[k].x.toFixed(2)}, ${a[k].y.toFixed(2)}`
    }
    if (syncInputs) panel.querySelectorAll('input[data-k]').forEach(i => { i.value = a[i.dataset.k][i.dataset.c] })
    $('textarea').value = json()
    drawGuides()
  }

  function drawGuides() {
    const g = motion.geometry()
    let d = ''
    for (let i = 0; i <= g.n; i += 2) d += (i ? 'L' : 'M') + g.xs[i].toFixed(1) + ' ' + g.ys[i].toFixed(1)
    const rip = [46, 73, 100].map(rx => `<ellipse cx="${g.foot.x}" cy="${g.foot.y}" rx="${rx}" ry="${rx * 0.17}"/>`).join('')
    guides.innerHTML = `<path class="hd-arch" d="${d}"/>${rip}
      <circle class="hd-mic" cx="${g.mic.x}" cy="${g.mic.y}" r="6"/>
      <g transform="translate(${g.S.x} ${g.S.y}) rotate(12) skewX(-30) scale(0.88 0.5)"><rect class="hd-seal" x="-32" y="-32" width="64" height="64"/></g>`
  }

  update()
  return {
    onFrame(t) {
      range.value = Math.max(0, t)
      out.textContent = t.toFixed(2) + ' s'
      const ids = motion.propsInAir(t)
      air.textContent = `空中道具 ${ids.length} 样` + (ids.length ? '：' + ids.join('、') : '')
    },
  }

  function el(tag, cls) { const e = document.createElement(tag); e.className = cls; return e }
}
