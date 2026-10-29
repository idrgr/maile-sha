/**
 * 用已启动的 Edge 远程调试端口截图（移动端视口）。
 * 用法：node tools/shot.mjs <url> <out.png> [width] [height]
 * 需要先启动：msedge --headless=new --remote-debugging-port=9222 about:blank
 */
import fs from 'node:fs';
import path from 'node:path';

const [url = 'http://localhost:5188/', out = 'shots/home.png', width = '390', height = '844', evalAfter = '', full = '', offline = ''] = process.argv.slice(2);
const CDP = 'http://127.0.0.1:9222';

async function createTarget() {
  const res = await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' });
  if (!res.ok) throw new Error(`cannot create target: ${res.status}`);
  return res.json();
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', reject, { once: true });
  });
}

const target = await createTarget();
const ws = await connect(target.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
const events = [];

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    events.push(`EXC ${msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text}`);
  } else if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
    events.push(`CONSOLE[${msg.params.type}] ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    events.push(`LOG ${msg.params.entry.text}`);
  }
});

function send(method, params = {}) {
  seq += 1;
  const id = seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: Number(width),
  height: Number(height),
  deviceScaleFactor: 2,
  mobile: true,
  screenWidth: Number(width),
  screenHeight: Number(height),
});

const loaded = new Promise((resolve) => {
  const timer = setTimeout(resolve, 4000);
  const listener = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Page.loadEventFired') {
      clearTimeout(timer);
      ws.removeEventListener('message', listener);
      resolve();
    }
  };
  ws.addEventListener('message', listener);
});

await send('Page.navigate', { url });
await loaded;
await new Promise((r) => setTimeout(r, 900));

if (offline === 'offline') {
  await new Promise((r) => setTimeout(r, 1200));
  await send('Network.enable');
  await send('Network.emulateNetworkConditions', {
    offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0,
  });
  await send('Page.reload', { ignoreCache: false });
  await new Promise((r) => setTimeout(r, 1800));
}

if (evalAfter) {
  const result = await send('Runtime.evaluate', { expression: evalAfter, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) events.push(`EVAL ${result.exceptionDetails.text}`);
  else if (result.result?.value !== undefined) events.push(`EVAL_RESULT ${JSON.stringify(result.result.value)}`);
  await new Promise((r) => setTimeout(r, 700));
}

const metrics = await send('Runtime.evaluate', {
  expression: `(() => {
    const app = document.querySelector('.app');
    const wide = [...document.querySelectorAll('body *')]
      .filter(el => el.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 8)
      .map(el => el.tagName + '.' + (el.className || '') + ':' + Math.round(el.getBoundingClientRect().right));
    return { innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth, app: app && Math.round(app.getBoundingClientRect().width), wide };
  })()`,
  returnByValue: true,
});

const shot = await send('Page.captureScreenshot', {
  format: 'png',
  fromSurface: true,
  captureBeyondViewport: full === 'full',
});
const file = path.resolve(out);
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
console.log(JSON.stringify({ file, metrics: metrics.result?.value, events }, null, 2));
ws.close();
await fetch(`${CDP}/json/close/${target.id}`);
