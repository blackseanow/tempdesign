# 沉浸式首页（home-pano）

第一人称坐在诊桌前，前方约 180° 的半全景。开场：门外 → 推门 → 坐下 → 领导开讲 → 伸手按录音笔 → 反转 → 落定，之后可以自由转头看整间屋子，点屋里的东西进各个入口。

先看效果：`shots/intro.webm`（开场录像）、`shots/look-around.webm`（落定后从最左转到最右），`shots/desktop/`、`shots/mobile/`（截图）。进度和交接记录在 `PROGRESS.md`。

## 本地打开

页面要从**仓库根目录**起服务（彩蛋抽屉要读 `../anatomy/`）：

```bash
node home-pano/tools/serve.cjs 8000
```

然后打开 `http://127.0.0.1:8000/home-pano/`。也可以用 `python3 -m http.server 8000`（在仓库根目录）。直接双击 index.html（file://）不行：模块、Worker、JSON 都要走 http。

常用参数：

| 参数 | 作用 |
|---|---|
| `?intro=always` / `first` / `quick` / `off` | 开场：每次完整播放 / 第一次完整、之后推门一秒到落定（默认）/ 每次推门一秒到落定 / 不要门和开场 |
| `?debug=1` | 把所有锚点画在画面上，可以拖动、微调、复制 JSON（见"调锚点"） |
| `?flat=1` | 强制平面版（一张图加点击区域） |
| `?reduced=1` | 模拟系统"减少动态效果"：不播开场、不做呼吸感 |
| `?role=staff` | 模拟非管理员：门帘（后堂）入口不出现 |
| `?nofallback=1` | 卡顿时不降分辨率、不退平面版（截图、录像用） |
| `?hd=2` / `?hd=4` | 指定高清级别（默认电脑 4x、手机 2x） |
| `?worker=0` | 不用 Worker，在主线程渲染（调试用） |

第一次进入完整播放开场，之后推门一秒直接到落定：记在 localStorage 的 `home-pano:seen`，清掉它或用 `?intro=always` 再看一遍。

## 怎么关掉开场

`scene.json` 里 `intro.mode` 改成 `"off"`：不要门、不要开场，进来直接坐在诊桌前（和"减少动态效果"一样）。改成 `"quick"`：每次推门一秒直接到落定。临时看效果可以用 URL 参数 `?intro=off`。各步的时长也在 `intro.durations` 里（秒）。

## 文件

| 路径 | 说明 |
|---|---|
| `index.html` | 页面。门外那一幕（首屏）直接写在 HTML 和内联样式里，不等脚本 |
| `css/pano.css` | 样式。颜色只用竹纸、素笺、松烟墨、函套青、古铜金；朱砂只在右上角的名章上 |
| `scene.json` | 场景参数：两层圆柱的半径、相机（正前方、俯仰、转头范围、景深、呼吸）、开场模式和时长、入口文案（标签、卡片文字、去处） |
| `anchors.json` | 锚点：所有入口、横匾、挂钟中心、日历、锦旗、木牌、五个彩蛋抽屉的标签、档案盒标签、领导嘴边、录音笔、盖碗、鸡汤锅、药罐、门扇、铭牌……都是百分比坐标 |
| `mock.json` | 假数据：账号、待签方、脉案、病例、正在治疗、锦旗、先生档案、随访、方剂、材料、每日宜忌 |
| `src/main.js` | 主程序：时间线 → 镜头 → 渲染；门、字幕、入口、声音；平面版、减少动态效果、第二次进来；截图钩子 `window.__pano` |
| `src/timeline.js` | 开场的主时间线（步骤、两个"等用户点"、跳过、seek） |
| `src/choreo.js` | 开场编排：每个会动的东西在某一刻的样子，都是时间的纯函数（主线程和 Worker 共用） |
| `src/geom.js` | 全景坐标 ⇄ 圆柱面 ⇄ 屏幕的换算（共用） |
| `src/look.js` | 转头：鼠标、手指、陀螺仪、方向键、Tab 自动转头；到边界柔和减速 |
| `src/door.js`、`src/hud.js` | 门外（CSS 3D 门扇）；字幕、脉搏线、跳过、声音开关、提示 |
| `src/entries.js` | 入口：热区按钮、松烟墨线圈、毛笔字标签、卡片、彩蛋检查、解剖图查看器 |
| `src/audio.js` | 空间声音（HRTF），没有声音文件时用合成音 |
| `src/flat.js`、`src/debug.js` | 平面版；?debug=1 的锚点叠加 |
| `src/render/` | Three.js 渲染（默认在 Worker 里）：`core.js` 场景、开场特效、横匾和抽屉标签；`details.js` 差分贴片（嘴、眨眼、按下）、日历锦旗木牌档案盒上的字、热气、阳光、录音笔指示灯；`text.js` 画字；`worker.js`、`host.js` |
| `vendor/three.pano.min.js` | Three.js r187 精简包（只含用到的类，0.5 MB）。`tools/build-three.mjs` 生成 |
| `fonts/` | 霞鹜文楷（938 字，192 KB）、马善政毛笔楷书（79 字，30 KB）的子集，只有页面用到的字；许可证和来源见 `fonts/SOURCE.md` |
| `icons/*.svg` | 六个道具图标（剧本、宏图、大饼、鸡汤、大棋、火箭） |
| `img/src/` | 原图（剪贴板文件名，对应关系见 `img/sources.json`），没动 |
| `img/pano*.png`、`img/door.png` | 配准、放大以后的全景图（8424 × 2988）和门外（3344 × 1882）；`pano-near.png` 是抠出来的近层 |
| `img/tiles/` | 切好的 webp 小块（三级：1x、2x、4x）和清单 `manifest.json`；`flat/` 是平面版用的整图 |
| `img/patches/` | 差分贴片：闭嘴、闭眼、按下（RGBA webp）和位置 `patches.json`；`desk-mask.webp` 是桌面木头的遮罩（阳光只照在桌面上） |
| `img/door/` | 门外的墙（门扇处挖空）和门扇，各有小图和高清 |
| `audio/` | 放声音文件的地方（见"声音"） |
| `checks/` | 素材处理的检查：配准报告和热图、放大参数、抠层检查、图标对比图、贴片检查 |
| `shots/` | 截图、录像、性能检查结果 |
| `tools/` | 处理素材和自查的脚本（见"重新生成"） |

## 画面是怎么搭的

- **两层圆柱**：远层是空房间（`pano-room.png`），贴在半径 4 m 的圆柱面上；近层是领导、椅子、诊桌、桌上物件、两只手（`pano-near.png`），贴在半径 1.6 m 的圆柱面上。全景图横向铺满 180°，竖直方向按圆柱展开，第 300 行（1x）是视平线。从圆心看过去，两层叠起来就是原画。
- **景深**：眼睛不在转头的轴上，而是在轴前 7 cm（`scene.json` 的 `camera.neck`）。转头时眼睛绕轴走一小段弧，近层就比远层多移动一点；正对领导时眼睛正好在圆心，两层严丝合缝。
- **转头**：以正对领导为正前方（领导在全景里偏右 7.8°），左右各 80°、往上 10°、往下 5°（窄屏往下看不出画，会少一点）。离边界还剩 20% 起往外拖会逐渐变慢，惯性也一样，所以是慢慢停住。身后（±90° 以外）渐暗，顶上补了一块天花板。
- **渲染在 Worker 里**：画布交给 Worker（OffscreenCanvas），建 WebGL 上下文、编译着色器、解码上传贴图都不在主线程，开场期间主线程没有长任务。浏览器不支持时自动在主线程上跑同一份代码。
- **先小图后高清**：进门前只加载 1x 小图（远+近 0.19 MB），坐下以后在后台加载高清（电脑 4x、手机 2x），一块块淡入。
- **卡顿时**：先降渲染分辨率（每次 ×0.75，最低 0.5），还卡（最近 40 帧间隔中位数超过 55 ms）才退回平面版。
- **动画**：全部是时间的函数（开场由 `timeline.js` 的一条主时间线驱动），只动位移、旋转、缩放、透明度。
- **差分贴片**：闭嘴、闭眼、按下三块小贴片贴在近层同一个圆柱面上，只切换显示（不会抖）。说话时嘴跟着说话声的音节张合，每 3–5 秒眨一次眼，按下录音笔时切成按下。
- **代码画的细节**：横匾、日历、锦旗、木牌、抽屉标签、档案盒标签上的字（霞鹜文楷），盖碗、鸡汤锅、药罐的热气，开讲时桌上跟着挂钟从右往左移的阳光，录音笔指示灯。颜色只用竹纸 #ECEAE1、素笺 #F8F7F2、松烟墨 #24231F、函套青 #1F3A4D、古铜金 #C9A86A；朱砂 #B5382A 只在右上角的名章上。
- **颜色管线**：贴图都是预乘 alpha，颜色不做 sRGB ⇄ 线性换算（和浏览器合成一样），半透明的边不会有亮边、暗边。

## 怎么调锚点

`anchors.json` 里的坐标都是百分比，相对 `pano.png` 整幅画面（左上角是 0,0；2106 × 747 的原图和放大后的 8424 × 2988 一样）：`x`、`y` 是左上角（点锚点是中心），`w`、`h` 是宽高。`layer` 是 `far`（远层，房间）或 `near`（近层，领导、桌子、手）。门外的 `door` 一节相对 `door.png`。

1. 起服务，打开 `http://127.0.0.1:8000/home-pano/?debug=1&intro=off`。
2. 画面上的虚线框、圆点就是锚点（近层的是函套青色）。点一个框选中，拖动它，或按方向键微调（每次 0.05%，按住 Shift 是 0.5%）。左下角面板里有选中锚点的数值和鼠标指着的位置（远层、近层各一组百分比）。
3. 画面上的字（抽屉标签、横匾……）、热区、挂钟指针会跟着变。
4. 调好点「复制 JSON」，整段贴回 `anchors.json`。

几个要注意的锚点：

| 锚点 | 用在哪里 |
|---|---|
| `entries.*` | 入口的热区（悬停描墨线、点开卡片）。`pad` 是额外的外扩（百分比），给录音笔这种小东西用。`cabinet.parts` 是百子柜被领导挡住以后露出来的左右两块 |
| `drawers.*` | 五个彩蛋抽屉：`label` 是抽屉上写字的小框，`rect` 是整格抽屉（热区） |
| `texts.plaque` | 横匾上写"今天把脉了吗？"的地方。只用白底的上半截：领导的头发从第 107 行起挡住下半截 |
| `points.mouth` | 领导嘴边：声浪、道具、飘字都从这里出发，说话声也从这里来 |
| `points.clock` | 挂钟中心和半径：指针绕这里转 |
| `points.recorderTop` | 道具、声浪被吸进录音笔的位置 |
| `fx.*.steam` | 热气冒出来的位置（盖碗、鸡汤锅、药罐） |
| `door.leaf`、`door.nameplate` | 门扇（推门时绕它的右边转）、铭牌（写"领导办公室"） |

`img/tiles/` 是按 `anchors.json` 里的门扇位置切的；改了 `door.leaf` 要重跑 `python3 tools/tiles.py`。

## 怎么替换道具图标

六个道具在 `icons/`：`juben.svg`（剧本）、`hongtu.svg`（宏图）、`dabing.svg`（大饼）、`jitang.svg`（鸡汤）、`daqi.svg`（大棋）、`huojian.svg`（火箭）。用同名文件覆盖就行，页面会把 SVG 栅格化成 256 × 256 的贴图。要求：正方形画布、透明背景、道具居中、不带文字；配色只用竹纸 #ECEAE1、素笺 #F8F7F2、松烟墨 #24231F、函套青 #1F3A4D、古铜金 #C9A86A，不用朱砂。

换完跑一遍 `node tools/icons_sheet.cjs`：会检查上面几条，并把六个图标和 pano.png 的局部放在一起渲染成 `checks/icons-compare.png`，看看像不像一家。图标在镜头前停的位置、大小在 `src/render/core.js` 的 `SLOTS` 和 `size`。

## 声音

现在都是合成音。把下面这些文件放进 `audio/` 就会自动用上（不用改代码；没有的继续用合成音）。都是 mp3：

| 文件名 | 内容 | 位置 / 用法 |
|---|---|---|
| `audio/leader.mp3` | 领导说话（循环） | 正前方（领导嘴边）。开讲和伸手时出声，反转时收住。嘴的开合跟着这个文件的音量走 |
| `audio/clock.mp3` | 挂钟滴答（一秒一下的循环） | 左边（挂钟）。反转时停 |
| `audio/soup.mp3` | 鸡汤咕嘟（循环） | 右边（小几上的鸡汤炉）。开讲时越来越大，反转后慢慢变小 |
| `audio/stove.mp3` | 药炉小火（循环） | 更右边（窗下的药炉），更小声 |
| `audio/recorder.mp3` | 按下录音笔（一次） | 录音笔 |
| `audio/door.mp3` | 推门（一次） | 不定位 |

声音是空间化的（HRTF）：转头时方向跟着变。音量默认偏低（总音量 0.32），右上角的喇叭可以关（记在 localStorage）。推门那一下才打开声音（浏览器要求声音由用户的点击开启）。还没放文件时，浏览器控制台会有这几个文件的 404，属于正常。

## 彩蛋

五个抽屉（大饼、宏图、剧本、大棋、火箭）和鸡汤炉：点开时检查 `anatomy/<名字>/<名字>.html` 在不在（大棋是 `anatomy/daqi/daqi.html`，火箭 `anatomy/huojian/huojian.html`，鸡汤 `anatomy/jitang/jitang.html`），在就在页面里打开解剖图，不在就弹一张小卡片"这味药还在炮制中"。以后解剖图补上了，不用改代码。现在仓库里有大饼、宏图、剧本三张（剧本也在，所以剧本抽屉能打开），大棋、火箭、鸡汤会弹"还在炮制中"。检查用的是 HEAD 请求，没做好的那几张会在控制台留下 404，属于正常。

## 素材处理（第 1–4 步）

### 1. 对齐

`img/src/` 里六张原图按内容认出来（`img/sources.json`）。五张全景图不一样大（三张差分图比 pano.png 窄 1 列），而且整体有轻微的缩放和平移，所以先配准到 pano.png：SIFT 特征点 + RANSAC 给仿射初值，再在"不该变"的有纹理像素上用稠密光流迭代拟合仿射，Lanczos 重采样到 2106 × 747（`tools/align.py`，报告 `checks/align-report.json`，热图 `checks/align-diff.webp`）。

| 图 | 变换（相对 pano.png） | 残余错位（格子中位 / 最大） |
|---|---|---|
| pano-room | 竖向放大 0.44%，下移 0.68 px | 0.07 / 0.69 px |
| pano-mouth | 横 0.08%、竖 0.38%，上移 0.78 px | 0.11 / 0.52 px |
| pano-blink | 横 0.08%、竖 0.56%，上移 1.37 px | 0.09 / 0.30 px |
| pano-press | 整体放大 1.4%，上移 2.3 px | 0.33 / 3.0 px |

**配准后仍对不齐的地方**：三张差分图不是在 pano.png 上局部改的，而是整张重画过，线条到处有 0.2–1 px 的细小差别（热图里满屏细红线），整体仿射消不掉。pano-press 最明显：除了手，书架、月洞窗里的竹子、屋梁、桌沿也都重画了，右上角残余 2–3 px。差分图只用来做嘴、眼睛、手这几块小贴片，贴片在小范围内单独再配准（第 12 步），不受影响。空房间图 pano-room 对得很好（0.07 px），直接用作远层。

### 2. 放大

Real-ESRGAN 的插画模型 RealESRGAN_x4plus_anime_6B，CPU 分块（块 512、边 32，照抄 RealESRGANer.tile_process），五张全景图同一个模型、同一套分块设置，统一放大 4 倍到 8424 × 2988；door.png 放大 4 倍后 Lanczos 缩到 3344 × 1882（`tools/upscale.py`，参数和耗时 `checks/upscale.json`）。权重从 Real-ESRGAN 的 GitHub release 下载（v0.2.2.4，SHA-256 `f872d837…99da`，脚本会核对），不用另外上传。放大后再量一次对齐（`tools/check_upscaled.py` → `checks/upscale-align.json`）：格子中位残差换算成 1x 是 0.07–0.25 px，和放大前一样。

### 3. 抠层

近层 = pano.png 里和空房间不一样的地方（`tools/matte.py` → `img/pano-near.png`）。遮罩在 1x 上求（双向 ±2 px 容错差值，房间里被挡住的线也算近层的证据；闭运算、只留最大块、画面底边封口补洞；边界带清理；去掉边上的细凸起和柜子拉手碎块），再放到 4x、羽化 1–2 px。检查（`checks/matte-*.webp`、`matte-report.json`）：没有缺块；错开 16 px 叠回房间也没有残边。

### 4. 切图

`tools/tiles.py`：远层、近层各三级（1x 两块、2x 三块、4x 六 × 二块），每块不超过 1404 × 1590 的 webp；近层整块透明的不出文件。门外拆成墙（门扇处挖空）和门扇两层。先加载 1x，进屋后换高清。

### 12. 差分贴片

`tools/patches.py` → `img/patches/`。每块先在小范围内用 ECC 再配准，范围取一整块实心区域（嘴、眼睛：变化区域填满取凸包；按下的手：两张图里不是桌面木头的部分取并集，旧手新手都盖住），再用泊松融合贴进 pano.png：里面是差分图的笔画，边界和底图一致。差分图整张重画过、肤色和线条深浅不一样，直接贴会有一圈亮边、旧手会留残影，泊松融合以后没有。检查图 `checks/patches-*.webp`（从左到右：原图、差分图、贴好的、alpha），数字 `checks/patches.json`。锚点改了 `fx.mouthPatch`、`fx.eyes`、`fx.pressHand` 要重跑这个脚本。

## 自查

- `node tools/shoot.cjs`：电脑（1440 × 900）和手机（390 × 844，2 倍）各拍：开场 7 个镜头（`intro-1-door` … `intro-7-settle`）、落定后左中右（`view-*`）、每个入口的悬停状态（`hover-*`，手机上是点按的样子）、几张卡片和彩蛋、平面版、减少动态效果、调试叠加。
- `node tools/perf.cjs`：实时跑一遍完整开场，量门出现的时间和主线程长任务，结果在 `shots/perf-*.json`。
- `node tools/record.cjs intro`：逐帧录开场（`shots/intro.webm`，1280 × 720，30 帧/秒，约 32 秒，没有声音）。
- `node tools/record.cjs look`：落定后从正前方转到最左、再一路转到最右、再回来（`shots/look-around.webm`，12 秒），看分层、贴片、文字有没有穿帮。

最近一次结果：门 116 ms（电脑）/ 104 ms（手机）画出来；整个开场主线程没有超过 50 ms 的长任务（最长 0 / 0 ms）；没有退平面版。

这台机器没有 GPU（Chromium 用 SwiftShader 软件渲染）：页面认出软件渲染后用一半分辨率、30 帧封顶，帧间隔中位约 33 ms。截图和录像都是"暂停时间线 → 摆到某一刻 → 等 Worker 画完"逐帧拍的，画面和节奏不受影响。有 GPU 的设备上不会降分辨率。

## 已知问题

- 三张差分图是整张重画的，和 pano.png 有 0.2–3 px 的细小错位（见"对齐"）。只从里面取嘴、眼睛、手三小块（泊松融合），其余地方没用差分图，所以看不出来。
- 还没放声音文件时，控制台会有 `audio/*.mp3` 的 404；点没做好的彩蛋抽屉时，会有对应解剖图的 404（检查它在不在）。都是预期的。
- 开场录像里没有声音（声音是页面实时合成的）。
- 陀螺仪只在触屏设备上启用；iOS 要在推门时授权，不授权就用手指拖。

## 重新生成

需要 Python（opencv-python-headless、numpy、Pillow、fonttools、brotli；放大还要 torch）、Node 和 Playwright、ffmpeg。

```bash
python3 tools/align.py
python3 tools/upscale.py --weights RealESRGAN_x4plus_anime_6B.pth
python3 tools/check_upscaled.py
python3 tools/matte.py
python3 tools/tiles.py
python3 tools/patches.py
node tools/icons_sheet.cjs
python3 tools/subset.py --kai <lxgw-wenkai-webfont 包目录> --brush <@fontsource/ma-shan-zheng 包目录>
node tools/shoot.cjs
node tools/perf.cjs
node tools/record.cjs intro
node tools/record.cjs look
```
