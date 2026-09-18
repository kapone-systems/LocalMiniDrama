// 决定性验证：拦截并阻断 JS bundle（main.js 不执行），但内联脚本仍运行。
// 这精确模拟"CSS 已加载、应用 JS 未执行"的首帧窗口 —— 若此时主题已正确，则无 FOUC。
// 用法: node check-fouc2.js <url> <theme> <out.png>
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const [url, theme = 'light', out] = process.argv.slice(2);
const PORT = 9333 + Math.floor(Math.random() * 500);
const userDir = path.join(require('os').tmpdir(), 'cdp-fouc2-' + Date.now());

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
  let ws;
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
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const msgId = ++id; pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
    await new Promise((r) => ws.addEventListener('open', r));
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.method === 'Fetch.requestPaused') {
        const p = m.params;
        const isJs = /\.js(\?|$)/.test(p.request.url);
        const isCss = /\.css(\?|$)/.test(p.request.url);
        // 阻断所有 JS bundle；放行 HTML/CSS/其他
        if (isJs && !isCss) {
          send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Aborted' }).catch(() => {});
        } else {
          send('Fetch.continueRequest', { requestId: p.requestId }).catch(() => {});
        }
      }
      if (m.id && pending.has(m.id)) {
        const { resolve, reject } = pending.get(m.id); pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    });

    await send('Page.enable'); await send('Runtime.enable');
    await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });

    // 先正常加载一次以取得同源上下文，写入主题偏好
    await send('Page.navigate', { url });
    await sleep(2500);
    await send('Runtime.evaluate', {
      expression: `localStorage.setItem('lmd-theme', ${JSON.stringify(theme)})`,
    });

    // 再加载：此次 JS bundle 被阻断，只有内联脚本生效
    await send('Page.navigate', { url });
    await sleep(3000);

    const info = await send('Runtime.evaluate', {
      expression: `JSON.stringify({
        htmlClass: document.documentElement.className,
        stored: localStorage.getItem('lmd-theme'),
        bg: getComputedStyle(document.documentElement).backgroundColor,
        bodyBg: document.body ? getComputedStyle(document.body).backgroundColor : null,
        appEmpty: document.getElementById('app') ? document.getElementById('app').children.length === 0 : null,
      })`,
      returnByValue: true,
    });
    const r = JSON.parse(info.result.value);
    console.log(`目标主题=${theme}`);
    console.log(`  html.class="${r.htmlClass}"  localStorage="${r.stored}"`);
    console.log(`  html.bg=${r.bg}  body.bg=${r.bodyBg}  #app 空(JS未跑)=${r.appEmpty}`);

    if (out) {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
      console.log('  截图: ' + out);
    }

    const want = theme === 'dark' ? 'dark' : 'light';
    console.log(r.htmlClass.includes(want)
      ? `  ✓ 首帧主题正确（${want}），无 FOUC`
      : `  ✗ 首帧主题错误：期望 ${want}，实得 "${r.htmlClass}"`);
    ws.close();
  } catch (e) {
    console.error('FAIL ' + e.message);
    process.exitCode = 1;
  } finally {
    chrome.kill(); await sleep(300);
    try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (_) {}
  }
})();
