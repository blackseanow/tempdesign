# 招牌插画 A（hero-a）

首页招牌区的 SVG 设计原型。处理流程：source.png（扁平插画）→ 归色前处理 → vtracer 矢量化 → 归并到设计系统色板（CSS 变量）→ 循环动效 → 原型页。

| 文件 | 说明 |
|---|---|
| `hero.svg` | 最终插画：160.2 KB（164,086 字节，gzip 后 53.5 KB），viewBox `0 0 1916 821`，无背景。颜色全部用 CSS 变量，动效写在内部 `<style>` 里 |
| `index.html` | 原型页，内联同一份 hero.svg（`<!-- hero.svg:start/end -->` 之间的内容由 `tools/build.py` 同步），末尾有滚出视口暂停的小脚本 |
| `HeroSignboard.vue` | Vue 3 单文件组件：牌匾、标语和插画合在一起，内置滚出视口暂停。由 `tools/build.py` 从 index.html 和 hero.svg 生成，见“接入主程序” |
| `screenshots/` | 自查截图：桌面 1440（1x、2x）、手机 390（3x），都定格在 0s；`loop-sheet.png` 是一个循环 4.8s 的 12 帧联系表 |
| `hero-a.zip` | 交付包：hero.svg、index.html、HeroSignboard.vue、README.md、screenshots/ |
| `tools/` | 生成和自查脚本（不打进交付包）。动效的路线、时刻表和关键帧在 `tools/motion.py` |

## 配色

插画只用 9 种颜色，每条路径一个 class，填色写成 `var(--变量, 兜底色)`。页面没定义变量时用兜底色。

| 色名 | 变量 | 色值 | class | 插画里用在 |
|---|---|---|---|---|
| 竹纸 | `--paper` | `#ECEAE1` | `f-paper` | 页面底色；插画里被物体围住的墙面小块，如椅架圈内 |
| 素笺 | `--sheet` | `#F8F7F2` | `f-sheet` | 衬衫、纸笺、桌子、笔记本纸页、立轴画心、工牌 |
| 函套青 | `--indigo` | `#1F3A4D` | `f-indigo` | 西装、年轻人的裤子、椅子、水杯、盆栽、纸笺书脊 |
| 松烟墨 | `--ink` | `#24231F` | `f-ink`（描边 `k-ink`） | 轮廓线、虚线、声波、录音笔机身、笔、字幅墨迹；说话和落笔的短弧用同色描边 |
| 朱砂 | `--cinnabar` | `#B5382A` | `f-red` | 只用在录音笔红点（`.rec-dot`） |
| 肤色 | `--skin` | `#EDCAB1` | `f-skin` | 脸、脖子、手 |
| 发色 | `--hair` | `#3B3A37` | `f-hair` | 两人的头发 |
| 中性灰 | `--gray` | `#5B5A55` | `f-gray` | 领导的西裤、两把椅子的椅架、鞋、年轻人的袜子 |
| 浅褐 | `--mount` | `#DACCB8` | `f-mount` | 立轴装裱 |

前五种沿用 `ref/` 设计稿的变量名和色值，后四种是这张插画新增的，取自原图实测色。原图的整块背景已经删掉，插画直接浮在页面的 `--paper` 底色上。

## 动效时间轴

一直循环，全部是 CSS 动画，选择器限定在 `.hero-art` 下；参数和关键帧由 `tools/motion.py` 生成。主节拍 1.6s：每 1.6s 领导说一句，一张纸笺从手边飞出，前面一张落到笔记本上，下属落笔。三张纸笺错开 1.6s，各飞一趟 4.8s。

全局第 0s 以及之后每隔 1.6s，三个纸笺位上正好各有一张纸笺，所以首帧和静止画面就是设计稿的构图。

| 部件 | 动作 | 时长、节奏 | 缓动 |
|---|---|---|---|
| 纸笺 `g.note.n1–n3` | 沿飞行路线从领导手边 (712, 352) 飞到笔记本左页 (1197, 488)，路线是过三个纸笺位中心的向心 Catmull-Rom 曲线，全长约 526 单位。时刻表：0s 出手 → 0.7s 第一个纸笺位 → 2.3s 第二个 → 3.9s 第三个 → 4.45s 落到本子上 → 4.8s 淡入纸面 | 一趟 4.8s，三张错开 1.6s（延迟 -0.7s / -2.3s / -3.9s） | 弧长随时间用 PCHIP 插值：出手快（约 176 单位/秒），之后匀速（约 110），落地前减速停住。关键帧每 0.1s 一个（出手、落地处 0.05s），之间线性 |
| 　出手 | 0–0.5s 从 0.3 倍长到原大，0–0.2s 淡入；带 -18° 甩出，0.6s 内回正 | | ease-out |
| 　飞行 | 以 1.6s 为周期摆动 ±5°，经过三个纸笺位时正好回正；过了第三个纸笺位摆动收住 | | sine |
| 　落地 | 3.9–4.45s 边落边缩小、放平（宽到 0.75，高到 0.6）；4.45–4.8s 压扁（宽约 0.5，高约 0.2）并淡出 | | smoothstep |
| 虚线 `.dash.k1–k58` | 沿飞行路线重画的 58 节圆头短线（5.2×1.9，间距 8.8）。纸笺经过时最亮，之后 0.7s 内淡到 0.3，像纸笺拖出的一道墨痕；下一张到来前，在纸笺底下亮回来 | 1.6s 一轮，每节的延迟按纸笺经过它的时刻算 | 分段线性 |
| 说话短弧 `.talk.t1–t3` | 领导嘴边三道弧由内向外依次亮起又隐去，随后纸笺出手 | 1.6s 一轮，相邻错开 0.1s | ease-in-out |
| 声波 `.wave.w1–w3` | 透明度 0.2 → 1 → 0.2，纸笺出手时由内向外依次最亮，左右同步 | 1.6s 一轮，相邻错开 0.1s（原来 2.4s，改成和纸笺同拍） | ease-in-out |
| 红点 `.rec-dot` | 呼吸：透明度 1 → 0.5 → 1，以中心缩放 1 → 0.85 → 1 | 2.4s 一轮（不变） | ease-in-out |
| 落笔短线 `.scrib.s1–s4` | 纸笺落到本子上之后，笔帽四周四道短线依次闪现，表示正在记 | 1.6s 一轮，相邻错开 0.06s | ease-in-out |

- 只有 `.rec-dot` 是朱砂色；循环中任何一帧，红点之外都没有红色。
- 会动的部件离标语最近 16.9px（961 宽），整个循环都不碰牌匾和标语。
- **滚出视口暂停**：插画完全离开视口时加上 class `hero-paused`，所有动画停在当前帧，回到视口后接着播，不跳帧。原型页和 Vue 组件都内置了这段逻辑（IntersectionObserver）。
- **减少动态效果**（`prefers-reduced-motion: reduce`）：所有动画 `animation: none`。纸笺停在设计位置，声波全亮，红点不动。说话短弧、落笔短线，以及手边到第一张纸笺之间新增的 9 节虚线（`.pre`）都隐藏。画面就是设计稿，只是虚线按飞行路线重画过。
- **性能**：动画只改 `transform` 和 `opacity`，不触发布局，共 75 个。纸笺在整条中段移动，每帧要重绘的区域比原来（只有录音笔附近）大得多：无头 Chromium 软件渲染下，合成绘制约 205 ms/s（原来约 13 ms/s），帧率仍是 60。有 GPU 的浏览器里压力小得多；滚出视口即暂停。

## 接入主程序

### Vue 3 项目：用 HeroSignboard.vue

把 `HeroSignboard.vue` 拷进组件目录即可，没有 props：

```vue
<script setup>
import HeroSignboard from './HeroSignboard.vue'
</script>

<template>
  <HeroSignboard />
</template>
```

- 组件根节点是 `<header class="hero-signboard">`，里面是牌匾 `<h1>`、标语和内联的插画。传给组件的 `class` 和 `style` 会落在根节点上。
- 样式没加 `scoped`。插画有 260 多个元素，加了会给每个元素都打上属性。所有选择器都带 `hero-` 前缀，不会影响别处，全站已有的 `.plaque` 规则也影响不到它。
- 不要手改这个文件：它由 `tools/build.py` 生成，每次重新生成插画或改了 index.html 的版式都会覆盖。
- 体积：插画的路径数据会编进 JS，约 160 KB（gzip 后约 54 KB）。建议放在首页路由的分包里。
- 动效全靠 CSS。组件里唯一的脚本是 IntersectionObserver：招牌滚出视口时给插画加 `hero-paused`，滚回来去掉；卸载时断开。

### 其他项目：内联 hero.svg

1. **内联 SVG**：把 hero.svg 的内容原样放进页面，可以构建时内联（例如 Vite 的 `import heroSvg from './hero.svg?raw'` 再插入），也可以用服务端模板 include。只有内联时，页面的 CSS 变量才能传进插画。用 `<img src="hero.svg">` 也能正常显示和播放动效，但只会用兜底色。
2. **布局**：照抄 index.html 里 `hero-signboard:start` 到 `hero-signboard:end` 之间的 CSS（`.hero-signboard / .hero-sign / .hero-plaque / .hero-motto`，以及暂停规则 `.hero-art.hero-paused *`）和 `<header class="hero-signboard">` 那段结构。
3. **暂停**：照抄 index.html 末尾那段小脚本。不加也能播，只是滚出视口后动画仍在跑。用 `<img>` 引用时没法暂停。

### 两种方式都适用

- **变量**：全站 `:root` 里已有 `--paper --sheet --indigo --ink --cinnabar`，再补上 `--skin --hair --gray --mount`，值见上表；不补时用兜底色，画面一样。换主题（比如暗色）只需重新定义这些变量。注意 `--paper` 也是插画里墙面小块的颜色，必须和招牌区背景一致。
- **布局规则**：招牌容器设了 `container-type: inline-size`，牌匾和标语的字号用 `cqi`，随插画等比缩放，始终落在横向约 37%–58%、纵向约 6.5%–33% 的空白墙面上。宽度 ≤ 960px 时改为文字在上、插画在下，插画等比缩小。这个断点比设计稿 H5 的 820px 大，因为 820–960px 之间标语字号已经到下限，会碰到第一张纸笺。
- **class 约定**：插画根节点 `.hero-art`（暂停时加 `hero-paused`）；红点 `.rec-dot`；声波 `.wave.w1–w3`；纸笺组 `g.note.n1–n3`（路径以纸笺自身中心为原点，位置由 CSS `transform` 给出）；虚线 `.dash.k1–k58`（`.pre` 是只在动效里出现的那 9 节）；说话短弧 `.talk.t1–t3`；落笔短线 `.scrib.s1–s4`。关键帧：`hero-fly / hero-trail / hero-blip / hero-wave / hero-breathe`。
- **字体**：牌匾和标语用设计稿的 `--kai`（霞鹜文楷，jsdelivr 上的 `lxgw-wenkai-webfont@1.7.0`，原型里固定了版本），需要全站已经加载。正文字体 `--song` 用 Noto Serif SC。

## 生成过程和调参

重新生成的命令：

```bash
pip install vtracer numpy scipy scikit-image pillow svgelements
python3 tools/quantize.py source.png build                 # 归色前处理，输出 build/labels.png
python3 tools/build.py build                               # vtracer + 色板 class + 动效（motion.py）+ svgo → hero.svg，同步 index.html，生成 HeroSignboard.vue
node tools/shoot.cjs build && python3 tools/check.py build # 截图 + 逐项自查（需要 Playwright 和 fonts-noto-cjk）
```

**直接对原图调 vtracer：效果不可用。**

| filter_speckle / color_precision / layer_difference | 体积 | 颜色数 | 问题 |
|---|---|---|---|
| 4 / 6 / 16（默认） | 492 KB | 785 | 渐变色块、锐化白边全部保留 |
| 8 / 5 / 24 | 338 KB | 244 | 声波、虚线、红点和细轮廓丢失，头发上出现灰色补丁 |
| 12 / 4 / 32 | 221 KB | 115 | 同上，人物轮廓线基本消失 |
| 16 / 3 / 48 | 163 KB | 58 | 头发和西装并成同一种深蓝 |

斑点过滤一调大，原图里 1–2px 的细线和 2×3px 的红点会最先被吞掉；颜色精度降低后，相近的深色（头发、西装、裤子）还会并到一起。所以改成先归色、再描边。

**归色前处理 `tools/quantize.py`（在 3 倍放大图上处理）**

- 墨线层：用 black-hat 找出比周围暗的细线（闭运算半径 1.8px，阈值 ΔL* 14，声波附近 9），按半高宽取线宽。深色衣物和椅子内部的褶线另用阈值 7，否则西装会和椅背连成一片。
- 填色层：每个像素找最近的色板锚点，锚点取原图实测色。肤色、发色、中性灰、浅褐、朱砂限定在各自区域，比如头发和西裤原图都是 `#4A4A4A` 左右，只能按位置区分。只有把握大的像素（ΔE < 9，与次近锚点的差 > 2.5，梯度 < 3）当种子，其余按颜色梯度做分水岭，这样边界落在原图边缘上，不会在两色之间多出第三色细边。
- 清理：素笺色做半径 2px 的开运算，去掉原图的锐化白边；其他颜色的细缝用 0.7px。小于 6–10px² 的色块（素笺 40px²）并入邻色。墨线碎片小于 3.5px²（脸、手等细节区）或 16px²（衣物、桌椅）的去掉。细线保底半宽 0.4px，免得被平滑断成虚点。最后用高斯投票平滑边界（σ 0.8px）。
- 按原位重画：红点在 (937, 445.5)，半径 2.2px，比原图的 2×3px 略大，否则桌面上看不出呼吸；三段虚线共 26 节，每节 5.2×1.9px，圆头等距；录音笔机身、盆栽各用一块剪影；字幅只留墨块，去掉飞白的灰。

**vtracer 最终参数（作用在 3 倍标签图上）**

`colormode=color, hierarchical=stacked, mode=spline, filter_speckle=8, color_precision=6, layer_difference=4, corner_threshold=75, length_threshold=6, splice_threshold=60, max_iterations=10, path_precision=2`

- `filter_speckle=8`：3 倍图上 64 像素²，约等于原图 7 像素²，放大后的红点（约 137 像素²）能保住。
- `color_precision=6`：输入已经只有 9 色，降到 4 时竹纸和素笺会被平均成 `#F2F1EA` 一类的中间色。
- `layer_difference=4`：取 8 或以上时，第 2、3 张纸笺的素笺底色会被并进竹纸。取 4 时渲染与标签图的像素差为 0.80%。
- `corner_threshold / length_threshold / splice_threshold` 从默认的 60 / 4 / 45 调到 75 / 6 / 60，曲线段更少、更顺；再调到 90 / 8，误差会上升。

**svgo 3.3.5**：multipass，`floatPrecision 1`，保留 class、`<style>`、viewBox、role 和 aria，开启 mergePaths。体积从约 620 KB 降到 160.2 KB（其中动效样式约 8 KB）。压缩器会删掉静态透明度为 0 的元素和文档里没出现的 class 的规则，所以短弧只在“减少动态效果”里设透明度 0，暂停规则放在页面版式 CSS 里。

**动效 `tools/motion.py`**：build.py 先把描出来的虚线按 quantize.py 重画的点位挑出来删掉（26 节里有 2 节贴着纸笺边，描成了纸笺轮廓的一部分，留在纸笺上），再把三个纸笺组的路径平移到以自身中心为原点，然后由 motion.py 生成飞行路线、重画的虚线、说话和落笔的短弧以及全部动效 CSS。

## 自查结果（`tools/check.py`）

截图环境：Chromium（Playwright）+ fonts-noto-cjk。沙箱连不上 jsdelivr，截图时用 Playwright 把同一份 `lxgw-wenkai-webfont@1.7.0`（从 npm 安装）在本地供给页面；Noto Serif SC 映射到系统的 Noto Serif CJK SC。除交付的截图外，还在 360、768、960、961、1024、1280、1920、2560 宽度下跑了同样的检查。

| 检查项 | 结果 |
|---|---|
| 斑点 | 416 个子路径（不含描边短弧），最小 7.6px²，没有小于 4px² 的。小于 10px² 的 65 个：58 节重画的虚线（每节约 9px²），另有杯口 2 个、纸笺字行 1 个、3 处衣褶或鞋的短笔触、1 处手部肤色小块 |
| 锯齿 | 2x、3x 截图逐区看过，边缘为样条曲线，无台阶 |
| 颜色 | 计算后的 fill（描边短弧按描边色）正好是上表 9 种，没有第 10 种 |
| 红色 | 朱砂色元素只有 `.rec-dot`；定格的首帧和循环 12 帧里，红点之外的红色像素都是 0 |
| 文字和画面不重叠 | 把文字隐藏后，文字框外扩 8px 范围内全是墙面底色（所有宽度）。桌面端牌匾在横向 37.2%–57.8%，标语在 40.5%–54.5%；手机端文字在插画上方 |
| 中文 | 牌匾 5 字、标语 10 字实际都用霞鹜文楷排版（CDP `getPlatformFontsForNode`），没有方块 |
| 动效不碰文字 | 每 0.1s 量一次纸笺、虚线、短弧的外框，整个循环都不进文字框外扩 8px 的范围（所有宽度），最近 16.9px（961 宽） |
| 滚出视口暂停 | 滚出后全部动画 paused，0.6s 内纸笺时间不变；滚回后 running，继续往前走 |
| 减少动态效果 | 运行中的动画为 0 个；只在动效里出现的 16 个元素（短弧 7 道、`.pre` 虚线 9 节）都隐藏 |

**HeroSignboard.vue 的验证**（Vue 3.5.13，测试工具不进仓库）：

- 用 `@vue/compiler-sfc` 编译了客户端版和服务端版，没有错误和警告。服务端用 `renderToString` 渲染，3 组纸笺、58 节虚线、3 道说话短弧都在，没有警告。
- 在 Chromium 里挂载组件：75 个动画在跑；定格在 0s 与 index.html 逐像素比对，差异为 0 个像素；滚出视口时插画加上 `hero-paused`、全部动画 paused，滚回后恢复 running；卸载后不留动画；开发版 Vue 没有任何警告。“减少动态效果”下为 0 个。

和原图相比的简化：老领导的灰白发丝并成单一发色；字幅去掉了飞白；盆栽是整块剪影；录音笔的按钮细节并进了机身；红点按原位重画成规整圆点，虚线沿飞行路线重画成等距圆头短线（与原稿位置相差几个单位以内）。
