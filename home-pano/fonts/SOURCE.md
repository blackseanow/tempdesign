# 字体来源

| 文件 | 字体 | 用在哪 | 来源 | 许可 |
|---|---|---|---|---|
| `pano-kai.woff2` | 霞鹜文楷 Regular（LXGW WenKai v1.250） | 页面上所有的字：界面、卡片、门牌、横匾、抽屉和档案盒标签、字幕、飘过的话 | npm `lxgw-wenkai-webfont@1.7.0`（`files/lxgwwenkai-regular-subset-*.woff2` 里取字后合并） | SIL OFL 1.1，见 `OFL-LXGW-WenKai.txt` |
| `pano-brush.woff2` | 马善政毛笔楷书（Ma Shan Zheng） | 悬停时浮出的毛笔字标签、卡片标题、"按下录音笔" | npm `@fontsource/ma-shan-zheng@5.3.1`（`files/ma-shan-zheng-*-400-normal.woff2` 里取字后合并） | SIL OFL 1.1，见 `OFL-Ma-Shan-Zheng.txt` |

只保留页面用到的字（清单在 `chars-kai.txt`、`chars-brush.txt`）。改了文案（index.html、scene.json、mock.json、src/ 里的字符串）要重做子集：

```bash
python3 tools/subset.py --kai <lxgw-wenkai-webfont 包目录> --brush <@fontsource/ma-shan-zheng 包目录>
```

子集里没有的字会落到后备字体（楷体、宋体），不会显示成方框，但字形会不一样。
