# home-pano 进度记录（交接用）

沉浸式首页：第一人称坐在诊桌前，前方约 180° 的半全景。需求原文见对话；这里记录做到哪一步、怎么接着做。
每完成一小步就提交并推送到 main（推送前 `git pull --rebase`，不 force push）。

## 素材对照

`img/src/` 里的原图是剪贴板文件名，按画面内容认出来，对照表在 `img/sources.json`：

| 素材名 | 原图尺寸 | 内容 |
|---|---|---|
| pano.png | 2106 × 747 | 半全景长卷：领导张嘴说话、睁眼，"我"右手食指离录音笔一指远 |
| pano-room.png | 2106 × 747 | 空房间（没有领导、椅子、诊桌、桌上物件、手臂） |
| pano-mouth.png | 2105 × 747 | 差分：闭嘴（微笑） |
| pano-blink.png | 2105 × 747 | 差分：闭眼 |
| pano-press.png | 2105 × 747 | 差分：食指按在录音笔上 |
| door.png | 1672 × 941 | 门外，合页在门右边，铭牌空白 |

三张差分图比 pano.png 窄 1 列，需要配准（第 1 步）。

## 第一阶段（能转、能点、开场能走完）

- [x] 1 对齐：五张全景图配准到 pano.png（`tools/align.py` → `work/aligned/`，报告 `checks/align-report.json`、热图 `checks/align-diff.webp`）
  - 方法：SIFT+RANSAC 仿射初值，再在"不该变"的有纹理像素上用稠密光流迭代拟合仿射，Lanczos 重采样到 2106 × 747。ECC 试过，差分图整张重画过、线条处处有细小差别，ECC 相关只有 0.3，结果更差，没用。
  - 结果（残余位移 = 12 × 4 格子里光流中位数）：
    | 图 | 变换（相对 pano.png） | 不该变区域平均差（对齐前 → 后，0–255） | 残余位移 中位 / 最大 |
    |---|---|---|---|
    | pano-room | 竖向放大 0.44%，下移 0.68 px | 8.9 → 5.6 | 0.07 / 0.69 px |
    | pano-mouth | 横 0.08%、竖 0.38%，上移 0.78 px | 10.9 → 5.0 | 0.11 / 0.52 px |
    | pano-blink | 横 0.08%、竖 0.56%，上移 1.37 px | 12.7 → 5.1 | 0.09 / 0.30 px |
    | pano-press | 整体放大 1.4%，上移 2.3 px | 28.5 → 7.1 | 0.33 / 3.0 px |
  - 对不齐的地方：三张差分图不是在 pano.png 上局部改的，整张重画过，线条到处有 0.2–1 px 的细小差别（热图里满屏细红线）。pano-press 最明显：除了手，书架、月洞窗竹子、屋梁、桌沿也重画了，右上角残余 2–3 px。第二阶段只从差分图里取嘴、眼睛、手这几小块做贴片，贴片会在小范围内再单独配准，不受影响。
- [x] 2 放大：Real-ESRGAN anime_6B ×4（`tools/upscale.py`，参数和耗时 `checks/upscale.json`）
  - 权重从 GitHub release 下载（SHA-256 f872d837…99da，脚本里会核对）；网络结构照抄 basicsr 的 RRDBNet（6 块），分块照抄 RealESRGANer.tile_process：块 512、边 32、pre_pad 0，CPU 4 线程。
  - 五张全景图（第 1 步对齐后的 1x 图）→ `img/pano*.png` 8424 × 2988，每张约 2.5 分钟；door.png → 4x 后 Lanczos 到 3344 × 1882（`img/door.png`）。
  - 放大后再量一次对齐（`tools/check_upscaled.py` → `checks/upscale-align.json`）：格子中位残差换算成 1x 是 room 0.07、mouth 0.10、blink 0.09、press 0.25 px，和放大前一致。逐像素的 p95 大一些（约 3 px@1x），是两次放大各自生成的细纹理不同，不是错位。
- [x] 3 抠层：`tools/matte.py` → `img/pano-near.png`（8424 × 2988 RGBA），报告 `checks/matte-report.json`
  - 遮罩在 1x 上求：双向 ±2 px 容错差值（pano 里新出现的线 + 房间里被挡住的线），闭运算、只留最大块、画面底边封口补洞（白袖子靠这个补满），边界带清理，去掉边上的细凸起和柜子五金件碎块；再放到 4x，σ=0.8 羽化（1～2 px）。
  - 检查：缺块 0（近层附近、远处都没有差值大却没抠的块）；`checks/matte-on-indigo.webp`（函套青底上的近层）、`matte-shift-left/right.webp`（错开 16 px 叠回房间）里没有残边。
  - 试过、没用的：普通差值（柜子竖线、护墙板横线被带进来）；单向容错差值（领导的脸和白衬衫丢了）。
- [ ] 4 切图：≤ 2048 px 的 webp 小块，先小图后高清
- [x] 5 道具图标：`icons/` 六个 SVG（juben、hongtu、dabing、jitang、daqi、huojian），200 × 200 正方形、透明底、不带文字、只用五色。
  - 对比图 `checks/icons-compare.png`（上排图标，下排 pano.png 里的锅、药罐、盖碗、锦旗、脉案本、录音笔），规格自查 `checks/icons-check.json`，脚本 `tools/icons_sheet.cjs`。
  - 改过一轮：描边从 3 改到 2.5（和 pano.png 的细线一致），鸡腿、盘山路放大，棋墩居中。
- [ ] 6 半全景（Three.js）
- [ ] 7 开场主时间线
- [ ] 8 入口、卡片、mock.json、彩蛋规则
- [ ] 9 anchors.json + ?debug=1
- [ ] 10 可靠性：本地库和字体、平面版退路、减少动态效果、键盘和读屏
- [ ] 11 Playwright 截图、intro.webm、长任务和门出现时间

## 第二阶段（让场景活起来）

- [ ] 12 差分贴片：嘴、眨眼、按下
- [ ] 13 代码画的细节：文字、热气、阳光、鸡汤、录音笔指示灯
- [ ] 14 空间声音
- [ ] 15 霞鹜文楷子集
- [ ] 16 重做检查 + look-around.webm
- [ ] 17 README

## 日志

- 2026-10-31：第 2、3 步完成（放大、抠层）。下一步：第 4 步切图，然后写页面。

- 2026-10-31：第 5 步完成（六个道具图标）。第 2 步放大在跑。

- 2026-10-31：第 1 步完成，配准结果见上。

- 2026-10-31：认出六张原图，写 `img/sources.json` 和本文件。
