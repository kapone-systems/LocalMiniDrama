// 逐页收集浏览器控制台错误 / 页面异常（回归验证）
// 用法: node check-errors.js [theme]
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const theme = process.argv[2] || 'dark';
const PORT = 9333 + Math.floor(Math.random() * 500);
const userDir = path.join(require('os').tmpdir(), 'cdp-err-' + Date.now());

const PAGES = [
  ['/', 'list'], ['/drama/1', 'drama'], ['/film/1', 'film'],
  ['/film/1/canvas', 'canvas'], ['/ai-config', 'ai-config'],
  ['/free-create', 'free-create'], ['/media-library', 'media-library'],
];

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDir}`,
  '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function getJson(p) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: p }, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('非 JSON')); } });
    });
    req.on('error', reject); req.end();
  });
}

(async () => {
  let ws, send;
  const errors = [];
  try {
    for (let i = 0; i < 60; i++) { try { await getJson('/json/version'); break; } catch (_) { await sleep(250); } }
    let target;
    for (let i = 0; i < 30; i++) {
      const list = await getJson('/json/list');
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (target) break;
      await sleep(300);
    }
    ws = new WebSocket(target.webSocketDebuggerUrl);
    let id = 0; const pending = new Map();
    send = (method, params = {}) => new Promise((resolve, reject) => {
      const msgId = ++id; pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
    await new Promise((r) => ws.addEventListener('open', r));
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        errors.push('console.error: ' + m.params.args.map((a) => a.value || a.description || a.type).join(' ').slice(0, 300));
      }
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        errors.push('exception: ' + (d.exception?.description || d.text || '').split('\n')[0].slice(0, 300));
      }
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
        errors.push('log: ' + m.params.entry.text.slice(0, 300));
      }
      if (m.id && pending.has(m.id)) {
        const { resolve, reject } = pending.get(m.id); pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    });

    await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
    await send('Page.navigate', { url: 'http://localhost:3013/' });
    await sleep(2500);
    await send('Runtime.evaluate', { expression: `localStorage.setItem('lmd-theme', ${JSON.stringify(theme)})` });

    for (const [route, name] of PAGES) {
      errors.length = 0;
      await send('Page.navigate', { url: 'http://localhost:3013' + route });
      await sleep(3800);
      // 过滤开发环境常见的无关噪声
      const real = errors.filter((e) =>
        !/favicon|DevTools|Download the Vue Devtools|sourcemap|\[vite\]/i.test(e)
      );
      console.log(`${name.padEnd(14)} ${real.length === 0 ? 'OK' : 'ERRORS(' + real.length + ')'}`);
      real.slice(0, 4).forEach((e) => console.log('    ' + e));
    }
  } catch (e) {
    console.error('FAIL ' + e.message);
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    chrome.kill(); await sleep(300);
    try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (_) {}
  }
})();
