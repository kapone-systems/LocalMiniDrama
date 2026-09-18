// 用 CDP 截取页面（支持设置 localStorage 以切换明暗主题）
// 用法: node shot.js <url> <out.png> [dark|light] [width] [height]
// 依赖：Node 22+ 内置 WebSocket，无需 npm 安装
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const [url, out, theme = 'light', w = '1440', h = '900'] = process.argv.slice(2);
const PORT = 9333 + Math.floor(Math.random() * 500);
const userDir = path.join(require('os').tmpdir(), 'cdp-shot-' + Date.now());

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDir}`,
  `--window-size=${w},${h}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJson(p, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('非 JSON 响应: ' + d.slice(0, 80))); } });
    });
    req.on('error', reject);
    req.end();
  });
}

/** 取一个可用的页面 target（Chrome 启动时的 about:blank 即是） */
async function getPageTarget() {
  for (let i = 0; i < 30; i++) {
    try {
      const list = await getJson('/json/list');
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch (_) {}
    await sleep(300);
  }
  throw new Error('找不到可用的页面 target');
}

async function waitForChrome() {
  for (let i = 0; i < 60; i++) {
    try { return await getJson('/json/version'); } catch (_) { await sleep(250); }
  }
  throw new Error('Chrome 未在超时内就绪');
}

(async () => {
  try {
    await waitForChrome();
    const target = await getPageTarget();
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

    // 先访问同源页面，才能写 localStorage
    await send('Page.navigate', { url });
    await sleep(2500);

    await send('Runtime.evaluate', {
      expression: `localStorage.setItem('lmd-theme', ${JSON.stringify(theme)})`,
    });
    // 重新加载让主题生效
    await send('Page.reload', { ignoreCache: false });
    await sleep(3500);

    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
    console.log('OK ' + out + ' (' + Math.round(shot.data.length * 0.75 / 1024) + ' KB, theme=' + theme + ')');
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
