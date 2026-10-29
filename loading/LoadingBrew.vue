<!--
  LoadingBrew：煎药中加载组件，由 loading/index.html 的原型移植，动效、尺寸、颜色与原型一致，规格见 loading/README.md。

  <LoadingBrew step="正在拟写 责任分工" :current="3" :total="5" :finished="ready" done-step="可以下载" @stamped="showResult" />

  依赖：全局已加载霞鹜文楷；色值读 --sheet、--ink、--ink-2、--cinnabar、--kai，未定义时用设计稿的值。
-->
<script setup>
import { reactive, ref, watch, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  title: { type: String, default: '煎药中，请稍候' },
  doneTitle: { type: String, default: '药已备好' },
  doneStep: { type: String, default: '' },
  unit: { type: String, default: '节' },
  step: { type: String, default: '' },
  current: Number,
  total: Number,
  finished: { type: Boolean, default: false },
  autostart: { type: Boolean, default: true }
})
const emit = defineEmits(['stamped'])

// 时间轴（毫秒），一圈 2400，细节见 README
const CYCLE = 2400
const STROKES = [[0, 1000], [1100, 1380], [1480, 1680]]  // 脉搏线连第一行、第二行、第三行
const WRITTEN = 1680                                     // 字行写完，停顿到 FADE[0]
const FADE = [2000, 2340]                                // 淡出，之后留白到 CYCLE
const PEN_R = 3, PEN_EASE = 100                          // 笔头半径；落笔、提笔各 100
const RECOVER = 320                                      // 淡出中途完成时，淡回的最长时长
const SWAP_OUT = 140                                     // 文案先淡出，再换字淡入
const LINES = [
  'M16 34C20.5 34 23.5 26 28 26C35.4 26 41.1 45 48.5 45C57.3 45 64.2 25.5 73 25.5C82.7 25.5 90.3 38 100 38C112 38 122 34 134 34H288',
  'M184 52H258',
  'M184 70H232'
]
const sine = x => (1 - Math.cos(Math.PI * x)) / 2
const clamp = x => Math.min(1, Math.max(0, x))
const alphaAt = t => (t < FADE[0] ? 1 : 1 - sine(clamp((t - FADE[0]) / (FADE[1] - FADE[0]))))
const stepOf = (text, current, total) => ({ text: text || '', n: current && total ? `第 ${current}/${total} ${props.unit}` : '' })

const busy = ref(false)
const stamped = ref(false)
const reduced = ref(false)
const inkEl = ref(null)
const penEl = ref(null)
const lineEls = []
let lens = []

// 文案淡出、换字、淡入；连续调用时只换成最后一次的文案
function fader(state, key) {
  let next = state.shown, timer = 0
  const set = (v, instant) => {
    next = v
    if (instant || reduced.value) {
      clearTimeout(timer); timer = 0
      state.out = false
      state.shown = v
      return
    }
    if (timer || key(v) === key(state.shown)) return
    state.out = true
    timer = setTimeout(() => { timer = 0; state.shown = next; state.out = false }, SWAP_OUT)
  }
  set.stop = () => clearTimeout(timer)
  return set
}
const titleLine = reactive({ shown: props.finished ? props.doneTitle : props.title, out: false })
const stepLine = reactive({ shown: props.finished ? stepOf(props.doneStep) : stepOf(props.step, props.current, props.total), out: false })
const setTitle = fader(titleLine, v => v)
const setStepLine = fader(stepLine, v => v.text + '\n' + v.n)

let phase = 'idle', t = 0, last = 0, raf = 0, recover = null, waiters = [], stampTimer = 0

function paintLine(i, q) {
  const s = lineEls[i].style, len = lens[i]
  s.visibility = q > 0 ? 'visible' : 'hidden'
  if (q >= 1) { s.strokeDasharray = 'none'; return }
  s.strokeDasharray = `${len} ${len + 4}`
  s.strokeDashoffset = len * (1 - q)
}
// 画出第 time 毫秒的样子；alpha 不传时按时间轴取
function draw(time, alpha = alphaAt(time)) {
  inkEl.value.style.opacity = alpha
  let tip = null, r = 0
  STROKES.forEach(([s, e], i) => {
    const q = sine(clamp((time - s) / (e - s)))
    paintLine(i, q)
    if (time > s && time < e) {
      tip = lineEls[i].getPointAtLength(lens[i] * q)
      r = PEN_R * Math.min(sine(clamp((time - s) / PEN_EASE)), sine(clamp((e - time) / PEN_EASE)))
    }
  })
  const pen = penEl.value
  if (tip) { pen.setAttribute('cx', tip.x.toFixed(2)); pen.setAttribute('cy', tip.y.toFixed(2)) }
  pen.setAttribute('r', r.toFixed(2))
}
function tick() {
  const now = performance.now()
  const dt = Math.min(now - last, 64)
  last = now
  if (phase === 'loop') {
    t = (t + dt) % CYCLE
    draw(t)
  } else if (recover) {
    recover.k = Math.min(1, recover.k + dt / recover.dur)
    draw(WRITTEN, recover.from + (1 - recover.from) * sine(recover.k))
    if (recover.k >= 1) return stamp()
  } else {
    t = Math.min(t + dt, WRITTEN)
    draw(t)
    if (t >= WRITTEN) return stamp()
  }
  raf = requestAnimationFrame(tick)
}
function run() {
  cancelAnimationFrame(raf); raf = 0
  if (reduced.value) {
    draw(WRITTEN)
    if (phase === 'finishing') stamp()
    return
  }
  last = performance.now()
  raf = requestAnimationFrame(tick)
}
function stamp() {
  cancelAnimationFrame(raf); raf = 0
  phase = 'done'; t = WRITTEN; recover = null
  draw(WRITTEN)
  stamped.value = true
  busy.value = false
  setTitle(props.doneTitle)
  setStepLine(stepOf(props.doneStep))
  const list = waiters; waiters = []
  stampTimer = setTimeout(() => { list.forEach(f => f()); emit('stamped') }, reduced.value ? 0 : 200)
}

// 开始循环；完成状态下调用等于先 reset()
function start() {
  if (phase === 'loop' || phase === 'finishing') return
  if (phase === 'done') reset()
  phase = 'loop'; t = 0
  busy.value = true
  draw(reduced.value ? WRITTEN : 0)
  run()
}
// 第二行文案；current、total 都给才显示进度。完成后忽略
function setStep(text, current, total) {
  if (phase === 'done') return
  setStepLine(stepOf(text, current, total))
}
// 写完这一遍后停住、盖印；印落定后 resolve
function done() {
  return new Promise(resolve => {
    if (phase === 'done') return resolve()
    waiters.push(resolve)
    if (phase === 'finishing') return
    if (phase === 'idle' || reduced.value || (t >= WRITTEN && t < FADE[0])) return stamp()
    if (t >= FADE[0]) {
      const from = alphaAt(t)
      recover = { from, k: 0, dur: Math.max(120, RECOVER * (1 - from)) }
    }
    phase = 'finishing'
  })
}
// 回到开始前：清掉印章和文案，停止动画；尚未 resolve 的 done() 作废
function reset() {
  cancelAnimationFrame(raf); raf = 0
  clearTimeout(stampTimer)
  phase = 'idle'; t = 0; recover = null; waiters = []
  stamped.value = false
  busy.value = false
  setTitle(props.title, true)
  setStepLine(stepOf(), true)
  draw(0)
}
defineExpose({ start, setStep, done, reset })

watch(() => [props.step, props.current, props.total, props.unit], () => setStep(props.step, props.current, props.total))
watch(() => props.title, v => { if (phase !== 'done') setTitle(v) })
watch(() => [props.doneTitle, props.doneStep], () => {
  if (phase !== 'done') return
  setTitle(props.doneTitle)
  setStepLine(stepOf(props.doneStep))
})
watch(() => props.finished, f => {
  if (f) return done()
  reset()
  start()
  setStep(props.step, props.current, props.total)
})

let mq = null
function onMotionPref() {
  reduced.value = mq.matches
  if (phase !== 'loop' && phase !== 'finishing') return
  if (!reduced.value && phase === 'loop') t = WRITTEN  // 从静止的整幅画接着停顿、淡出
  run()
}
onMounted(() => {
  mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  reduced.value = mq.matches
  mq.addEventListener('change', onMotionPref)
  lens = lineEls.map(el => el.getTotalLength())
  draw(0)
  if (props.finished) done()
  else if (props.autostart) start()
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf); raf = 0
  clearTimeout(stampTimer)
  setTitle.stop()
  setStepLine.stop()
  mq.removeEventListener('change', onMotionPref)
})
</script>

<template>
  <div class="brew" :class="{ 'is-done': stamped }" :aria-busy="busy ? 'true' : 'false'">
    <svg class="brew-art" viewBox="0 0 320 108" aria-hidden="true" focusable="false">
      <rect class="brew-sheet" x="168.5" y="12.5" width="136" height="84" />
      <g ref="inkEl" class="brew-ink">
        <path v-for="(d, i) in LINES" :key="i" :ref="el => { lineEls[i] = el }" class="brew-line" :d="d" />
        <circle ref="penEl" class="brew-pen" cx="16" cy="34" r="0" />
      </g>
      <g class="brew-seal">
        <rect x="270" y="51" width="22" height="38" />
        <text x="281" y="61.5">已</text>
        <text x="281" y="78.5">成</text>
      </g>
    </svg>
    <div class="brew-text" role="status" aria-live="polite">
      <p class="brew-title" :class="{ 'is-out': titleLine.out }">{{ titleLine.shown }}</p>
      <p class="brew-step" :class="{ 'is-out': stepLine.out }"><span class="brew-step-t">{{ stepLine.shown.text }}</span><span class="brew-step-n" :class="{ gap: stepLine.shown.text && stepLine.shown.n }">{{ stepLine.shown.n }}</span></p>
    </div>
  </div>
</template>

<style scoped>
.brew{width:320px;max-width:100%;margin:0 auto}
.brew-art{display:block;width:100%;height:auto;overflow:visible}
.brew-sheet{fill:var(--sheet,#F8F7F2);stroke:var(--ink,#24231F);stroke-width:1}
.brew-line{fill:none;stroke:var(--ink,#24231F);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.brew-pen{fill:var(--ink,#24231F)}
.brew-seal{opacity:0;transform:rotate(-6deg) scale(1.3);transform-box:fill-box;transform-origin:center}
.brew.is-done .brew-seal{opacity:1;transform:rotate(-6deg) scale(1);transition:opacity .2s ease-out,transform .2s ease-out}
.brew-seal rect{fill:var(--cinnabar,#B5382A)}
.brew-seal text{fill:var(--sheet,#F8F7F2);font-family:var(--kai,"LXGW WenKai","KaiTi","STKaiti",serif);font-size:14.5px;text-anchor:middle;dominant-baseline:central}
.brew-text{margin-top:14px;text-align:center;font-family:var(--kai,"LXGW WenKai","KaiTi","STKaiti",serif)}
.brew-title,.brew-step{margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:opacity .18s ease-out}
.brew-title{height:30px;font-size:20px;line-height:30px;color:var(--ink,#24231F)}
.brew-step{height:22px;margin-top:2px;font-size:14px;line-height:22px;color:var(--ink-2,#4E4C45)}
.brew-step-n{font-variant-numeric:tabular-nums}
.brew-step-n.gap{margin-left:1em}
.brew .is-out{opacity:0;transition:opacity .14s ease-in}
@media (prefers-reduced-motion:reduce){.brew *{transition:none!important}}
</style>
