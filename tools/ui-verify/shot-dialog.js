// 打开指定页面的弹窗后截图（T-A0 要求含至少一个弹窗）
// 用法: node shot-dialog.js <url> <out.png> <theme> <selector> [width] [height]
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const [url, out, theme = 'light', selector = '.btn-settings', w = '1440', h = '900'] = process.argv.slice(2);
const PORT = 9333 + Math.floor(Math.random() * 500);
const userDir = path.join(require('os').tmpdir(), 'cdp-dlg-' + Date.now());

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDir}`,
  `--window-size=${w},${h}`, 'about:blank',
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
  try {
    for (let i = 0; i < 60; i++) { try { await getJson('/json/version'); break; } catch (_) { await sleep(250); } }
    let target;
    for (let i = 0; i < 30; i++) {
      const list = await getJson('/json/list');
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (target) break;
      await sleep(300);
    }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let id = 0; const pending = new Map();
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const msgId = ++id; pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
    await new Promise((r) => ws.addEventListener('open', r));
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const { resolve, reject } = pending.get(m.id); pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    });

    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.navigate', { url });
    await sleep(2500);
    await send('Runtime.evaluate', { expression: `localStorage.setItem('lmd-theme', ${JSON.stringify(theme)})` });
    await send('Page.reload', { ignoreCache: false });
    await sleep(3800);

    const click = await send('Runtime.evaluate', {
      expression: `(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return 'NOT_FOUND';el.click();return 'CLICKED'})()`,
      returnByValue: true,
    });
    if (click.result.value !== 'CLICKED') throw new Error('选择器未找到: ' + selector);
    await sleep(2200);

    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
    console.log('OK ' + out + ' (theme=' + theme + ', via ' + selector + ')');
    ws.close();
  } catch (e) {
    console.error('FAIL ' + e.message);
    process.exitCode = 1;
  } finally {
    chrome.kill(); await sleep(300);
    try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (_) {}
  }
})();
