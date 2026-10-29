# 霞鹜文楷字形来源

- npm 包：[`lxgw-wenkai-webfont@1.7.0`](https://www.npmjs.com/package/lxgw-wenkai-webfont/v/1.7.0)
- 原始下载包：[lxgw-wenkai-webfont-1.7.0.tgz](https://registry.npmjs.org/lxgw-wenkai-webfont/-/lxgw-wenkai-webfont-1.7.0.tgz)
- 包内字体版本：`v1.250`（原始 `VERSION` 文件）。字重：Regular。
- 包项目：[chawyehsu/lxgw-wenkai-webfont](https://github.com/chawyehsu/lxgw-wenkai-webfont)
- 字体项目：[lxgw/LxgwWenKai](https://github.com/lxgw/LxgwWenKai)
- 原始 npm tarball SHA-256：`5294aaeb3bc6f3949d8c209103eab696c9ce3e606a14f8e6b87bba3b7287c8a2`
- 提取工具：fontTools 4.60.2（`TTFont`、`SVGPathPen`、`BoundsPen`），brotli 1.2.1。

本目录保留的是包内五份**未经修改的原始 WOFF2 子集**，包含 Logo 所需的「咸鱼把脉了」。字形输出到 `glyphs.json`，Logo SVG 将这些轮廓直接写入 `<path>`，无需用户安装字体，无需网络或运行时字体加载。没有描摹、替换或重绘字体轮廓。

字体软件适用 SIL Open Font License 1.1，完整许可见 [OFL.txt](OFL.txt)。Webfont 包装代码适用 MIT，完整许可见 [LICENSE](LICENSE)。这两份许可均从 npm 包原样复制。OFL 允许字体用于商业或非商业作品；使用该字体制作的 Logo/文档不因字体许可而要求采用 OFL。此处没有修改字体或使用保留字体名称另行发布衍生字体。

| 字 | 原始文件 | SHA-256 |
|---|---|---|
| 咸 | `lxgwwenkai-regular-subset-107.woff2` | `c3b3fadf6f4379d0d2a7eef2c7701f8f45604f16a2c3c6677f408cbcf71dbb26` |
| 脉 | `lxgwwenkai-regular-subset-109.woff2` | `4a73982b82d950f4bd99bc43e927d5aaf2bd92c2d152d3e168b4ffe745ba40b6` |
| 鱼 | `lxgwwenkai-regular-subset-114.woff2` | `bf95ee002643919e46a7b578b99b9d74142b2899b383a1de70a7c3e3cf9ef682` |
| 把 | `lxgwwenkai-regular-subset-116.woff2` | `a48d699b33c5c94dda699ddda56800a5d96a7acce49f6b9586b0373e29a8b5a8` |
| 了 | `lxgwwenkai-regular-subset-118.woff2` | `f29c89cd7420937450ecf9ba3c2f23268673a107dfe84c63243769cc0a12c418` |

所有字形均为 1000 units/em，前进宽度 1000。JSON 的坐标保留字体坐标系（Y 向上）；SVG 排版使用 `scale(s, -s)` 翻转 Y 轴。

在仓库根目录重建字形：

```sh
python3 -m pip install --target logo/work/python fonttools==4.60.2 brotli==1.2.1
PYTHONPATH=logo/work/python python3 logo/scripts/extract_glyphs.py
```

提取脚本只读本目录的 WOFF2 子集，重建不再依赖 npm 下载包。字体下载缓存和完整解压包位于 `logo/work/`，不作为交付内容提交。
