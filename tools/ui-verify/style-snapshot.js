// 快照页面上一批元素的"计算样式"，用于改动前后精确对比
// 比像素比对更灵敏：能捕捉 hover 之外的任何样式变化，且不受渲染噪声影响
// 用法: node style-snapshot.js <out.json> [theme]
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const [outFile, theme = 'light'] = process.argv.slice(2);
const PORT = 9333 + Math.floor(Math.random() * 500);
const userDir = path.join(require('os').tmpdir(), 'cdp-snap-' + Date.now());

const PAGES = [
  ['/', 'list'], ['/drama/1', 'drama'], ['/film/1', 'film'],
  ['/film/1/canvas', 'canvas'], ['/ai-config', 'ai-config'],
  ['/free-create', 'free-create'], ['/media-library', 'media-library'],
];

// 需要抓取的关键属性（覆盖本次改动涉及的全部维度）
const PROPS = [
  'borderRadius', 'backgroundColor', 'color', 'borderColor', 'borderTopColor', 'borderBottomColor',
  'backgroundImage', 'boxShadow', 'paddingTop', 'paddingLeft', 'marginLeft', 'fontSize',
  'fontWeight', 'minWidth', 'maxWidth', 'zIndex', 'position', 'overflow', 'borderWidth',
  'webkitTextFillColor', 'display', 'gap', 'opacity',
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
  let ws;
  const result = {};
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
      if (m.id && pending.has(m.id)) {
        const { resolve, reject } = pending.get(m.id); pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    });
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.navigate', { url: 'http://localhost:3013/' });
    await sleep(2500);
    await send('Runtime.evaluate', { expression: `localStorage.setItem('lmd-theme', ${JSON.stringify(theme)})` });

    for (const [route, name] of PAGES) {
      await send('Page.navigate', { url: 'http://localhost:3013' + route });
      await sleep(route.includes('film/1/canvas') ? 6000 : 4000);
      const expr = `(() => {
        const PROPS = ${JSON.stringify(PROPS)};
        const out = [];
        // 按 DOM 顺序取前 400 个有类名的元素，记录 选择器路径 + 关键属性
        const all = [...document.querySelectorAll('*')].slice(0, 1500);
        let idx = 0;
        for (const el of all) {
          const cls = (el.className || '').toString().trim();
          if (!cls || typeof el.className !== 'string') continue;
          const cs = getComputedStyle(el);
          const rec = { i: idx++, tag: el.tagName, cls: cls.slice(0, 90) };
          for (const p of PROPS) rec[p] = cs[p];
          out.push(rec);
        }
        return JSON.stringify(out);
      })()`;
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
      result[name] = JSON.parse(r.result.value);
    }
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(result, null, 1), 'utf8');
    const total = Object.values(result).reduce((a, v) => a + v.length, 0);
    console.log(`OK ${outFile}  (${Object.keys(result).length} 页, ${total} 个元素, theme=${theme})`);
    ws.close();
  } catch (e) {
    console.error('FAIL ' + e.message);
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    chrome.kill(); await sleep(300);
    try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (_) {}
  }
})();
