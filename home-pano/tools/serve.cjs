// 本地静态服务器：以仓库根目录为根（彩蛋要读 ../anatomy/），给截图、录像脚本用，也可以手动预览。
//   node home-pano/tools/serve.cjs [端口]   → 打开 http://localhost:8000/home-pano/
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.webm': 'video/webm', '.mp4': 'video/mp4', '.gif': 'image/gif', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8' };
function start(port = 0, opts = {}) {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(ROOT, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      fs.stat(file, (err, st) => {
        if (err || !st.isFile()) { res.writeHead(404); res.end(); return; }
        const headers = { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-cache' };
        if (opts.delay) setTimeout(go, opts.delay(file)); else go();
        function go() {
          res.writeHead(200, headers);
          if (req.method === 'HEAD') { res.end(); return; }
          fs.createReadStream(file).pipe(res);
        }
      });
    }).listen(port, '127.0.0.1', () => resolve(srv));
  });
}
module.exports = { start, ROOT };
if (require.main === module) {
  const port = +process.argv[2] || 8000;
  start(port).then(() => console.log(`http://127.0.0.1:${port}/home-pano/`));
}
