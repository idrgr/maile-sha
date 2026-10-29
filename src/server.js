/**
 * 买了啥 · 纯静态文件服务器（本地预览 / 自托管用）
 * 数据不在服务器上：全部保存在手机浏览器的 IndexedDB 里。
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const PORT = Number(process.env.PORT) || 5188;
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    ...headers,
  });
  res.end(body);
}

function serveStatic(req, res, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return send(res, 400, '路径不正确', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  if (pathname === '/') pathname = '/index.html';
  if (pathname.includes('\0')) {
    return send(res, 400, '路径不正确', { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  const filePath = path.resolve(PUBLIC_DIR, `.${pathname}`);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    return send(res, 403, '禁止访问', { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const noCache = ['.html', '.js', '.css', '.webmanifest'].includes(ext);
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': noCache ? 'no-cache' : 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // SPA 兜底：没有扩展名的路径交给前端
    if (!path.extname(pathname)) {
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
      fs.createReadStream(path.join(PUBLIC_DIR, 'index.html')).pipe(res);
      return;
    }

    send(res, 404, '文件不存在', { 'Content-Type': 'text/plain; charset=utf-8' });
  });
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, '不支持的请求方式', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  serveStatic(req, res, url);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  端口 ${PORT} 已被占用。\n  可以关掉占用它的程序，或用 PORT=5199 换一个端口启动。\n`);
  } else {
    console.error('\n  服务启动失败：', err.message, '\n');
  }
  process.exit(1);
});

function localAddresses() {
  const list = [];
  for (const [name, infos] of Object.entries(os.networkInterfaces())) {
    for (const info of infos || []) {
      if (info.family === 'IPv4' && !info.internal) list.push({ name, address: info.address });
    }
  }
  return list;
}

function preferredLanAddress() {
  const score = (a) => {
    let s = 0;
    if (a.address.startsWith('192.168.')) s += 30;
    else if (a.address.startsWith('10.')) s += 20;
    else if (/^172\.(1[6-9]|2\d|3[01])\./.test(a.address)) s += 5;
    if (a.address.endsWith('.1')) s -= 10;
    if (/vEthernet|VirtualBox|VMware|Loopback|VPN/i.test(a.name)) s -= 8;
    return s;
  };
  return [...localAddresses()].sort((a, b) => score(b) - score(a))[0]?.address || '';
}

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  买了啥 · 跨平台购物账本（静态预览）');
  console.log('  ─────────────────────────────────────');
  console.log(`  本机访问   http://localhost:${PORT}`);
  const lan = preferredLanAddress();
  if (lan) console.log(`  手机访问   http://${lan}:${PORT}   （仅调试，正式使用请用 HTTPS 地址）`);
  console.log('  数据位置   手机浏览器的 IndexedDB（不在这台电脑上）');
  console.log('  按 Ctrl+C 停止');
  console.log('');
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
