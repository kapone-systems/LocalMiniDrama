// 在指定视口宽度下用 CDP 检查布局（验证 @media 响应式规则）
// 用法: node probe-width.js <url> <theme> <width> <jsExpression>
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const [url, theme = 'dark', width = '700', expr = 'document.documentElement.className', height = '900'] = process.argv.slice(2);
const PORT = 9333 + Math.floor(Math.random() * 500);
const userDir = path.join(require('os').tmpdir(), 'cdp-pw-' + Date.now());

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDir}`,
  `--window-size=${width},${height}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJson(p) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: p }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('非 JSON: ' + d.slice(0, 80))); } });
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  try {
    for (let i = 0; i < 60; i++) { try { await getJson('/json/version'); break; } catch (_) { await sleep(250); } }
    let target;
    for (let i = 0; i < 30; i++) {
      const list = await getJson('/json/list');
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (target) break;
      await sleep(300);
    }
    if (!target) throw new Error('找不到页面 target');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let id = 0;
    const pending = new Map();
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const msgId = ++id;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
    await new Promise((r) => ws.addEventListener('open', r));
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const { resolve, reject } = pending.get(m.id);
        pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    });

    await send('Page.enable');
    await send('Runtime.enable');
    // 强制视口尺寸（headless 下 window-size 不一定生效，用 emulation 兜底）
    await send('Emulation.setDeviceMetricsOverride', {
      width: Number(width), height: Number(height), deviceScaleFactor: 1, mobile: false,
    });
    await send('Page.navigate', { url });
    await sleep(2500);
    await send('Runtime.evaluate', { expression: `localStorage.setItem('lmd-theme', ${JSON.stringify(theme)})` });
    await send('Page.reload', { ignoreCache: false });
    await sleep(4000);

    const r = await send('Runtime.evaluate', {
      expression: `(() => { try { return JSON.stringify(${expr}, null, 2); } catch(e) { return 'EXPR_ERR: ' + e.message; } })()`,
      returnByValue: true,
    });
    console.log(r.result.value);
    ws.close();
  } catch (e) {
    console.error('FAIL ' + e.message);
    process.exitCode = 1;
  } finally {
    chrome.kill();
    await sleep(300);
    try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (_) {}
  }
})();
