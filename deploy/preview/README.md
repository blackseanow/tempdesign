# home-pano 静态预览部署

预览：**https://xianyu.182.61.30.47.sslip.io/home-pano/**

这是公开预览，任何拿到网址的人都能打开，无登录或访问密码。内容是 main 的运行时静态文件，home-pano 源码没有改动，也没有引入其他项目的构建或后端。

## 打开方法

电脑、手机浏览器都打开同一网址，推门进入。手机横屏可看更宽的画面；iOS 若提示方向传感器权限，允许后才可用陀螺仪，也可以直接手指拖动。

- 默认：第一次完整开场，之后推门约一秒到落定；记录保存在当前浏览器的 localStorage。
- 再看完整开场：https://xianyu.182.61.30.47.sslip.io/home-pano/?intro=always
- 显示锚点：https://xianyu.182.61.30.47.sslip.io/home-pano/?debug=1
- 无痕窗口、新浏览器或清除站点数据会重新算第一次。
- 404 白名单：`home-pano/audio/*.mp3`、`anatomy/{daqi,huojian,jitang}/…`。这些素材尚未制作。

## 发布包

在仓库根目录执行：

```bash
./scripts/build-site.sh
```

生成被 .gitignore 排除的 `site/`。没有构建过程，也不需要 npm install。

- `site/home-pano/`：index.html、css、src、vendor、fonts、icons、audio、scene.json、anchors.json、mock.json、img/{tiles,door,patches}。
- `site/anatomy/`：完整 anatomy 目录，保留彩蛋相对路径。
- `site/index.html`：跳转 `/home-pano/`。
- 不包含 home-pano 的 img/src、pano*.png、door.png、checks、shots、tools、work。

当前包约 18.36 MiB、226 个文件；未上传整个私有仓库、Git 元数据或原始全景图片。anatomy 按要求完整保留，包含它自己的预览媒体和辅助文件。

## 服务器与 HTTPS

- 主机：182.61.30.47，独立发布根 `/var/www/tempdesign-preview/`。
- 每次上传到 `releases/<时间>-<Git短SHA>/`，完成后原子切换 `current` 符号链接。
- Nginx 直接服务静态文件；不需要 Node、npm 或常驻页面服务器。
- 主入口使用独立域名证书 `/etc/letsencrypt/live/tempdesign-preview/`，浏览器不需要忽略证书错误。原 IP 地址入口保留其既有证书。
- 既有 `xianyu-cert-renew.timer` 定期续期；其 deploy hook `xianyu-nginx` 会检查并重载 Nginx，因此 IP 和域名预览一起获得新证书。IP 证书为短周期，域名证书约 90 天，应保持这个定时器正常运行。
- 没有加 COOP / COEP。ES 模块和 Worker 返回 `text/javascript`，JSON 返回 `application/json`。

### 8000 与公网入口

`127.0.0.1:8000` 已有 Uvicorn 后端，未停止或改动它。独立预览配置 `nginx.conf` 只监听服务器网卡 `192.168.0.2:8000`（公网 IP 经 NAT 映射到此地址），TLS 在服务器内部验证正常。

部署时公网 8000 连接超时，服务器本机 INPUT 默认允许，推测是云安全组/上游规则限制。因此现可用网址走已开放的 443：只为现有 HTTPS 虚拟主机新增 `/home-pano/` 和 `/anatomy/` 两个路径映射，读取独立静态发布目录。既有站点其他路径和现有后端保持原路由。**没有把源码合并到其他项目。**

以后在云控制台放行 TCP 8000 后，`https://182.61.30.47:8000/home-pano/` 也可直接访问；这不是当前对外可用入口。

### 首次安装配置（当前已完成）

1. 把 `nginx.conf` 放到 `/etc/nginx/sites-available/tempdesign-preview`，链接到 sites-enabled。
2. 把 `nginx-types.conf` 放到 `/etc/nginx/snippets/tempdesign-preview-types.conf`。
3. 把 `nginx-paths.conf` 放到 `/etc/nginx/snippets/tempdesign-preview-paths.conf`。
4. 在主机现有 IP 地址 HTTPS server 内添加一行 `include /etc/nginx/snippets/tempdesign-preview-paths.conf;`。原配置备份为 `/etc/nginx/sites-available/xianyu-bamai.before-tempdesign-preview`。
5. `nginx -t && systemctl reload nginx`。

这些配置包含当前服务器的网卡地址和证书路径，换服务器时先核对再安装；不要把 8000 监听改成 `0.0.0.0`，那会与回环地址上的既有后端冲突。

## tempdesign 更新后重新部署

PR 合并后，在 main 上拉取并执行：

```bash
git switch main
git pull --ff-only origin main
./scripts/deploy-preview.sh
```

PR 未合并时，可在 deploy-preview 分支用 `git merge origin/main` 更新静态内容，再执行部署脚本。脚本使用本机 SSH agent/密钥或交互式密码认证，不保存服务器密码或 GitHub token。`PREVIEW_SSH_TARGET` 可覆盖 SSH 目标；`PREVIEW_SSH_CONTROL_PATH` 可复用已认证的 SSH 连接。每次只上传生成的 site/ 压缩包，传输压缩不改变文件内容。不会压缩或重新编码图片。

一般更新只切换发布目录，无需重载 Nginx。保留旧 release，可用 `ln -s releases/<旧版本> current.next && mv -Tf current.next current` 回退（在发布根执行）。

## 验证

`check.cjs` 是针对公网入口的 Playwright 冒烟检查，需要已有 Playwright 和 Chromium；它不属于发布包。可通过 `PLAYWRIGHT_MODULE`、`CHROMIUM_PATH` 指定已有安装，通过 `TEST_OUTPUT_DIR` 指定报告和截图输出目录。

```bash
PREVIEW_URL=https://xianyu.182.61.30.47.sslip.io node deploy/preview/check.cjs
```

检查可信 HTTPS、安全上下文、各关键 URL 状态及 MIME、电脑 1440×900 / 手机 390×844、首次开场和录音笔、再次快速入室、大饼 iframe、JS 错误、非预期 HTTP 错误，以及原图路径没有被发布。门图 Element Timing 单独记录 `doorWithin1s`；它是含实际网络等待的冷启动结果，不用本地测试数据替代。

### 本次公网实测（源码 main `0ee15c7`）

- 所列五个关键 URL 均 200，MIME 正确；226 个远端文件与本地发布包 SHA-256 汇总一致。
- 电脑 1440×900、手机 390×844 均可推门，完整开场后点录音笔到落定；没有退平面版，大饼解剖图 iframe 能正常打开。
- 再次打开推门到自由状态约 1050ms / 1051ms。JS 异常 0、非预期 HTTP 错误 0、非预期控制台错误 0。音频缺失 404 属于白名单。
- **门图冷启动未达到 1 秒目标**：Element Timing 电脑 1892ms、手机 1844ms。文档/子资源请求存在网络等待；这是实际公网测试结果。保持源码不变，未用本地结果冒充公网指标，也未调整页面来绕过测试。
- `check.cjs` 将功能结果与门图时延分开记录；门图超时会让总 `pass` 为 false 并返回非零退出码。

## 手机连接问题后的独立域名入口

用户反馈手机在加载页面前就无法连接；服务器日志未看到真实手机的页面请求，新增域名后，用户在同一手机确认已经能打开；原 IP 入口的具体网络原因未进一步确定。

新增 `xianyu.182.61.30.47.sslip.io`：使用公共 DNS 将域名解析到同一服务器，并复用已有 ACME 账户签发独立的可信域名证书，没有注册托管账号。`nginx-domain.conf` 是其独立 80/443 虚拟主机，直接服务原发布目录，不修改页面。域名方式也方便 IPv6-only 网络通过运营商 DNS64 进行地址合成；本次已由用户在真实手机上确认可访问。

把 `nginx-domain.conf` 安装为 `/etc/nginx/sites-available/tempdesign-preview-domain` 并启用 sites-enabled，执行 `nginx -t && systemctl reload nginx`。首次证书通过 webroot `/opt/xianyu-bamai/shared/acme` 验证；原有定时续期覆盖新证书。该域名依赖 sslip.io 的公共 DNS 服务，正式长期使用建议替换为自有域名。

原 `https://182.61.30.47/home-pano/` 保留作备用。后续部署脚本输出及检查默认 URL 已更新为域名。

域名入口已验证五个关键 URL 均 200、MIME 正确，可信 HTTPS 下 `isSecureContext=true`，390×844 Chrome 模拟可推门到自由状态且无 JS 异常。用户同时确认真实手机现在能打开。
