# 煎药中 · 加载动效（LoadingBrew）

一根墨线：左边是起伏的脉搏线，往右逐渐平稳，延伸成素笺上的三行字。写完停顿、淡去、重来；完成时停在写好的画面，右下角盖一枚朱砂印“已成”。

- `index.html`：原型页，组件样式、模板、脚本都在里面，无外部依赖（字体除外）
- `screenshots/`：自查截图，`check.json` 是最后一轮自查的数值结果
- `tools/shoot.py`：截图与自查脚本
- `loading.zip`：`index.html`、`README.md` 和全部截图

## 时间轴

一圈 2400 ms，`requestAnimationFrame` 逐帧计算，循环衔接处无跳帧。缓动 `sine` 即 easeInOutSine：`(1 − cos πx) / 2`，约等于 `cubic-bezier(.37, 0, .63, 1)`，两头慢、中间匀，不回弹。

| 段落 | 起止（ms） | 内容 | 缓动 |
|---|---|---|---|
| 脉搏线、第一行 | 0 – 1000 | 一笔写成：脉搏线起伏渐平，入素笺成第一行 | 沿路径长度 sine |
| 　落笔 / 提笔 | 0 – 100 / 900 – 1000 | 笔头半径 0 → 3 / 3 → 0 | sine |
| 换行 | 1000 – 1100 | 提笔，无笔头 | — |
| 第二行 | 1100 – 1380 | 落笔 1100 – 1200，提笔 1280 – 1380 | sine |
| 换行 | 1380 – 1480 | 提笔，无笔头 | — |
| 第三行（最短） | 1480 – 1680 | 落笔 1480 – 1580，提笔 1580 – 1680 | sine |
| 停顿 | 1680 – 2000 | 整幅画静止 | — |
| 淡出 | 2000 – 2340 | 墨线整组透明度 1 → 0；素笺不动 | sine |
| 留白 | 2340 – 2400 | 只剩素笺，随后从 0 重新落笔 | — |

三笔的书写速度相近：294.5 px / 1000 ms，74 px / 280 ms，48 px / 200 ms。笔头始终在正在画的那根线的线头上（自查实测最大偏差 0.006 px）。

其他动效：

| 动效 | 时长 | 缓动 |
|---|---|---|
| 文案切换 | 先淡出 140 ms，换字，再淡入 180 ms；连续切换只换成最后一次的文案 | 淡出 ease-in，淡入 ease-out |
| 盖印 | 透明度 0 → 1，缩放 1.3 → 1，旋转固定 −6°，200 ms | ease-out |
| 完成时机 | 见下 | — |

调用 `done()` 时：

- 正在画线：按原速写完这一遍再盖印（最长约 1.7 s，实测在 0.6 s 时调用，1088 ms 后盖印）
- 停顿中：立即盖印
- 淡出或留白中：整幅画淡回到不透明（≤ 320 ms，sine），再盖印（实测 128 ms / 320 ms）

印落定（200 ms）后 `done()` 返回的 Promise 才 resolve，调用方可以在这之后再换成结果页。

## 尺寸

组件宽 320 px（`max-width: 100%`，更窄时等比缩小），高 176 px。SVG `viewBox="0 0 320 108"`，320 宽时 1 单位 = 1 px。

| 元素 | 规格 |
|---|---|
| 墨线 | 线宽 2，松烟墨，圆头圆角 |
| 脉搏线 | 起点 (16, 34)，5 段三次贝塞尔，波峰、波谷切线水平：+8、−11、+8.5、−4，波长渐长，到 x = 134 平稳 |
| 第一行 | 脉搏线延续，y = 34，越过素笺左边缘到 x = 288 |
| 第二行 | y = 52，x 184 – 258 |
| 第三行 | y = 70，x 184 – 232（最短） |
| 素笺 | x 168.5，y 12.5，136 × 84，素笺色填充，1 px 墨线边框 |
| 笔头 | 圆点，半径 3，松烟墨 |
| 印章 | 22 × 38，左上角 (270, 51)，朱砂平涂；“已”“成”竖排，霞鹜文楷 14.5 px，素笺色，中心 y 61.5 / 78.5；绕中心旋转 −6° |
| 文案区 | 距画面 14 px；第一行 20 px / 行高 30 px，松烟墨；第二行 14 px / 行高 22 px，淡墨，与第一行间距 2 px |
| 进度 | 跟在步骤文案后，间隔 1em，数字等宽 |

两行文案高度固定、不换行（过长时省略号），切换文案时组件不会上下跳。

## 颜色

| 色名 | 值 | 组件内用途 |
|---|---|---|
| 竹纸 | `#ECEAE1` | 页面底色（组件本身透明） |
| 素笺 | `#F8F7F2` | 素笺填充、印章上的字 |
| 松烟墨 | `#24231F` | 墨线、笔头、素笺边框、第一行文案 |
| 淡墨 | `#4E4C45` | 第二行文案 |
| 函套青 | `#1F3A4D` | 组件内不用；原型页的主按钮 |
| 朱砂 | `#B5382A` | 只用于印章 |

只有印章是红色，加载过程中不出现任何红色（自查逐帧扫描确认）。无渐变、阴影、发光。原型页另用了设计稿里的 `#6B685F`（按钮描边）、`#D6D2C4`（分隔细线）、`#85682F`（键盘焦点框），都不进组件。

字体：`"LXGW WenKai","KaiTi","STKaiti",serif`，网页字体来自 `https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont/style.css`。

## 接口

```js
const brew = LoadingBrew.mount(el, opts)
```

`el` 是容器（组件模板放进去），或者本身就是已经渲染好的 `.brew` 元素（Vue 用这种）。`opts` 都可省：

| 字段 | 默认 | 说明 |
|---|---|---|
| `title` | `'煎药中，请稍候'` | 第一行文案 |
| `doneTitle` | `'药已备好'` | 完成后的第一行 |
| `doneStep` | `''` | 完成后的第二行，原型页主演示用“可以下载” |
| `unit` | `'节'` | 进度单位，显示为“第 2/5 节” |
| `autostart` | `true` | 挂载后立即 `start()` |

| 方法 | 说明 |
|---|---|
| `start()` | 开始循环，`aria-busy="true"`。已在循环中则忽略；完成状态下调用等于先 `reset()` |
| `setStep(text, current, total)` | 更新第二行，淡出淡入切换。`current`、`total` 都给才显示进度。完成后调用会被忽略 |
| `done()` | 进入完成状态（时机见上），返回 Promise，印落定后 resolve。`aria-busy="false"` |
| `reset()` | 回到开始前：清掉印章和文案，画面只剩素笺，停止动画。尚未 resolve 的 `done()` 作废 |
| `destroy()` | 停止动画、移除“减少动态效果”的监听；卸载时调用 |

原型页的两种变体用的是同一个组件，只换文案：

| 场景 | title | doneTitle（建议） | 第二行示例 |
|---|---|---|---|
| 生成文档 | 煎药中，请稍候 | 药已备好 | 正在拟写 责任分工　第 3/5 节 |
| 转写 | 正在整理脉案… | 脉案已整理好 | 正在辨认发言人　第 3/7 段 |
| 开方 | 先生正在开方… | 方子已开好 | 正在拟写 医嘱　第 2/3 步 |

两个变体的完成文案是暂拟的，可再定。

## 减少动态效果

系统开启“减少动态效果”时：不播放循环，静态显示画好的墨线和三行字，不显示笔头；文案照常更新，但直接替换、不淡入淡出；完成时印章直接出现。运行中切换这个设置也会跟着变：关掉后从停顿处接着淡出、循环。

## 无障碍

- 画面 SVG `aria-hidden="true"`，只作装饰
- 文案区 `role="status"`、`aria-live="polite"`，步骤和完成文案会被读出
- 根节点 `.brew` 加载中 `aria-busy="true"`，完成或重置后为 `false`

注意：有的读屏软件在 `aria-busy="true"` 期间会暂缓播报其内部的变化。如果接入后发现步骤不播报，把 `aria-busy` 挪到将要放结果的容器上（例如“治疗”页的 `.sheet`），并让文案区不在这个容器内。

## 接入主程序

1. 全局样式里已有设计稿的色值变量（`--paper`、`--sheet`、`--ink`、`--ink-2`、`--cinnabar`、`--kai`）和霞鹜文楷，组件直接沿用。
2. 把 `index.html` 里 `.brew-*` 那段 CSS 放进组件样式，`LoadingBrew` 那段脚本存成 `loading-brew.js`，末尾改成 `export const mountBrew = LoadingBrew.mount`。
3. 包成 Vue 组件（示意）：

```vue
<!-- LoadingBrew.vue -->
<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { mountBrew } from './loading-brew.js'

const props = defineProps({
  title: String, doneTitle: String, doneStep: String, unit: String,
  step: String, current: Number, total: Number,
  done: Boolean
})
const emit = defineEmits(['stamped'])
const el = ref(null)
let brew

onMounted(() => {
  brew = mountBrew(el.value, props)          // undefined 的字段用默认值
  brew.setStep(props.step, props.current, props.total)
  if (props.done) brew.done()
})
watch(() => [props.step, props.current, props.total], ([s, c, t]) => brew.setStep(s, c, t))
watch(() => props.done, async d => {
  if (d) { await brew.done(); emit('stamped') }
  else { brew.reset(); brew.start() }
})
onBeforeUnmount(() => brew.destroy())
</script>

<template>
  <!-- 把 index.html 里 <template id="tpl-brew"> 的内容原样放这里，根节点加 ref="el" -->
  <div class="brew" ref="el" aria-busy="false">…</div>
</template>
```

4. 用在设计稿“治疗”一步：把 `renderCure()` 里 `boiling` 状态的药炉插画、“煎药中，请稍候”和 `#boil-step` 换成 `<LoadingBrew>`；`boil()` 每推进一节传一次 `step / current / total`（如“正在拟写 责任分工”，3，5）；生成完成时把 `done` 设为 `true`，收到 `stamped` 再切到“药已备好”的结果页。转写、开方的等待用同一个组件，换 `title`、`doneTitle`、`unit` 即可。
5. 组件放在素笺色的 `.sheet` 里时，素笺与底色相同，靠 1 px 墨线边框区分，画面依然成立；放在竹纸底上对比更清楚。

## 自查

```bash
cd loading
python3 -m http.server 8000 --bind 127.0.0.1 &
python3 tools/shoot.py --font-dir <lxgw-wenkai-webfont 包目录>
```

`--font-dir` 可省；本次环境访问不到 jsdelivr，所以从 npm 下载 `lxgw-wenkai-webfont@1.7.0`，在浏览器里拦截 CDN 请求、用本地文件应答，截图里的字体与线上一致。脚本用 Playwright 的假时钟逐帧推进，截图时刻确定。

| 截图 | 内容 |
|---|---|
| `cycle-sheet.png` | 一个循环周期，每 0.2 s 一帧，共 12 帧 |
| `strokes-sheet.png` | 换行衔接（提笔、落笔），0.88 – 1.54 s，每 60 ms |
| `seam-sheet.png` | 淡出与重新开始，1.94 – 2.60 s，每 60 ms |
| `stamp-sheet.png` | 盖印过程 0 – 200 ms |
| `done.png` | 完成状态 |
| `page.png` | 原型页整页（加载中） |
| `reduced-motion.png` / `reduced-motion-done.png` | 减少动态效果：加载中整页 / 完成 |
| `mobile-390.png` | 手机 390 宽整页 |

脚本同时做数值检查（结果在 `screenshots/check.json`）：笔头是否在线头、墨线和透明度是否逐帧连续、各状态有无红色、红色是否只在印章范围内、文案切换时各元素位置是否不变且居中、文字是否被截断、实际渲染字体（经 CDP 读取，应为 LXGW WenKai）、减少动态效果下画面是否静止、`done()` 在画线 / 淡出 / 留白时调用的表现、手机宽度是否溢出、页面有无报错。
