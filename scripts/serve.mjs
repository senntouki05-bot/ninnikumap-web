/* public/ をそのまま配るだけのローカルサーバ。
   Cloudflare Pages と同じく、ディレクトリは index.html、未一致は 404.html を返す。
   使い方: node scripts/serve.mjs [port]   （既定 8799 ＝ 他プロジェクトのdevと衝突しない番号） */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PUB = path.join(process.cwd(), 'public');
const PORT = Number(process.argv[2] || process.env.PORT || 8799);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  let file = path.join(PUB, path.normalize(p));
  if (!file.startsWith(PUB)) { res.writeHead(403).end('forbidden'); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) {
    const nf = path.join(PUB, '404.html');
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : 'not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
}).listen(PORT, '127.0.0.1', () => console.log(`http://127.0.0.1:${PORT}/`));
