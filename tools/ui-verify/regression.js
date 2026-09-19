// B 层功能回归：逐页点击 header 按钮，验证弹窗/路由/主题切换仍生效（计划 §5.3）
// 用法: node regression.js [theme]
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const theme = process.argv[2] || 'dark';
const PORT = 9333 + Math.floor(Math.random() * 500);
const userDir = path.join(require('os').tmpdir(), 'cdp-reg-' + Date.now());

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

let pass = 0, fail = 0;
function check(name, ok, extra = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
}

(async () => {
  let ws, send, evalJs;
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
      if (m.id && pending.has(m.id)) {
        const { resolve, reject } = pending.get(m.id); pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    });
    evalJs = async (expr) => {
      const r = await send('Runtime.evaluate', {
        expression: `(async()=>{try{return JSON.stringify(await (${expr}))}catch(e){return JSON.stringify({__err:e.message})}})()`,
        returnByValue: true, awaitPromise: true,
      });
      return JSON.parse(r.result.value);
    };

    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.navigate', { url: 'http://localhost:3013/' });
    await sleep(2500);
    await send('Runtime.evaluate', { expression: `localStorage.setItem('lmd-theme', ${JSON.stringify(theme)})` });

    const goto = async (route, ms = 3600) => {
      await send('Page.navigate', { url: 'http://localhost:3013' + route });
      await sleep(ms);
    };
    const closeDialogs = async () => {
      await evalJs(`(()=>{document.querySelectorAll('.el-overlay').forEach(o=>o.style.display='none');return 1})()`);
    };

    // ── FilmList ──
    console.log('\nFilmList:');
    await goto('/');
    const fl = await evalJs(`(()=>{const t=s=>{const e=document.querySelector(s);return e?e.textContent.trim():null};
      return {theme:document.querySelector('.app-btn-theme')?.textContent.trim(),
      lib:[...document.querySelectorAll('.header-library button')].map(b=>b.textContent.trim()),
      acts:[...document.querySelectorAll('.app-header__actions button')].map(b=>b.textContent.trim()),
      cards:document.querySelectorAll('.project-card').length,
      hasImport:!!document.querySelector('input[accept=".zip"]')}})()`);
    check('3 个素材库按钮', fl.lib.length === 3, JSON.stringify(fl.lib));
    check('微信我按钮(vendorLock 条件)', fl.acts.includes('微信我'), JSON.stringify(fl.acts));
    check('AI配置按钮', fl.acts.includes('AI配置'));
    check('导入项目按钮', fl.acts.includes('导入项目'));
    check('新建项目按钮', fl.acts.includes('新建项目'));
    check('主题切换按钮', !!fl.theme, String(fl.theme));
    check('导入 zip input 保留', fl.hasImport);
    check('项目卡片已渲染', fl.cards > 0, 'cards=' + fl.cards);

    // 打开素材角色弹窗
    await evalJs(`(()=>{document.querySelectorAll('.header-library button')[0].click();return 1})()`);
    await sleep(1500);
    check('素材角色弹窗可打开', await evalJs(`!!document.querySelector('.el-dialog')`));
    await closeDialogs();
    // 打开微信弹窗
    await evalJs(`(()=>{const b=[...document.querySelectorAll('.app-header__actions button')].find(x=>x.textContent.includes('微信我'));b&&b.click();return 1})()`);
    await sleep(1500);
    check('微信弹窗可打开', await evalJs(`!!document.querySelector('.el-dialog')`));
    await closeDialogs();
    // 打开 AI 配置弹窗
    await evalJs(`(()=>{const b=[...document.querySelectorAll('.app-header__actions button')].find(x=>x.textContent.includes('AI配置'));b&&b.click();return 1})()`);
    await sleep(1800);
    check('AI配置弹窗可打开', await evalJs(`!!document.querySelector('.el-dialog')`));
    await closeDialogs();

    // 主题切换
    const t0 = await evalJs(`document.documentElement.className`);
    await evalJs(`(()=>{document.querySelector('.app-btn-theme').click();return 1})()`);
    await sleep(900);
    const t1 = await evalJs(`document.documentElement.className`);
    check('主题切换生效', t0 !== t1, `${t0} -> ${t1}`);
    await evalJs(`(()=>{document.querySelector('.app-btn-theme').click();return 1})()`);
    await sleep(900);

    // ── DramaDetail ──
    console.log('\nDramaDetail:');
    await goto('/drama/1');
    const dd = await evalJs(`(()=>({logoSub:document.querySelector('.logo-sub')?.textContent,
      title:document.querySelector('.page-title')?.textContent,
      center:[...document.querySelectorAll('.header-inner > button')].map(b=>b.textContent.trim()),
      acts:[...document.querySelectorAll('.app-header__actions button')].map(b=>b.textContent.trim()),
      theme:!!document.querySelector('.app-btn-theme')}))()`);
    check('logo 副标题', dd.logoSub === 'LocalMiniDrama', String(dd.logoSub));
    check('动态标题', !!dd.title, String(dd.title));
    check('返回列表按钮', dd.center.includes('返回列表'), JSON.stringify(dd.center));
    check('进入制作按钮', dd.acts.includes('进入制作'));
    check('画布模式按钮', dd.acts.includes('画布模式'));
    check('主题切换按钮', dd.theme);
    check('episode 卡片渲染', (await evalJs(`document.querySelectorAll('.episode-card').length`)) > 0);

    // ── FilmCreate ──
    console.log('\nFilmCreate:');
    await goto('/film/1', 5000);
    const fc = await evalJs(`(()=>{const h=document.querySelector('header');const nav=document.querySelector('.quick-nav');
      return {z:getComputedStyle(h).zIndex, ml:getComputedStyle(h).marginLeft,
      episode:!!document.querySelector('.header-episode-select'),
      center:[...document.querySelectorAll('.header-inner > button')].map(b=>b.textContent.trim()),
      acts:[...document.querySelectorAll('.app-header__actions button')].map(b=>b.textContent.trim()),
      navW:nav.getBoundingClientRect().width}})()`);
    check('z-index 200', fc.z === '200', fc.z);
    check('margin-left 180px', fc.ml === '180px', fc.ml);
    check('集数选择器保留', fc.episode);
    check('返回剧集按钮', fc.center.includes('返回剧集'), JSON.stringify(fc.center));
    check('画布模式按钮', fc.center.includes('画布模式'));
    check('AI配置按钮', fc.acts.includes('AI配置'));
    check('主题切换按钮', fc.acts.some((x) => x.includes('浅色') || x.includes('暗色')));
    // 侧栏折叠联动
    await evalJs(`(()=>{document.querySelector('.nav-toggle').click();return 1})()`);
    await sleep(800);
    const collapsed = await evalJs(`(()=>{const h=document.querySelector('header');const nav=document.querySelector('.quick-nav');
      const hb=h.getBoundingClientRect();const nb=nav.getBoundingClientRect();
      return {ml:getComputedStyle(h).marginLeft, overlap:hb.left<nb.right, root:document.querySelector('.film-create').className}})()`);
    check('侧栏折叠 header 跟随 48px', collapsed.ml === '48px', collapsed.ml);
    check('折叠后无重叠', collapsed.overlap === false);
    await evalJs(`(()=>{document.querySelector('.nav-toggle').click();return 1})()`);
    await sleep(800);
    // AI 配置弹窗
    await evalJs(`(()=>{const b=[...document.querySelectorAll('.app-header__actions button')].find(x=>x.textContent.includes('AI配置'));b&&b.click();return 1})()`);
    await sleep(1800);
    check('AI配置弹窗可打开', await evalJs(`!!document.querySelector('.el-dialog')`));
    await closeDialogs();

    // ── DramaCanvas ──
    console.log('\nDramaCanvas:');
    await goto('/film/1/canvas', 6000);
    const dc = await evalJs(`(()=>{const h=document.querySelector('header');
      return {pos:getComputedStyle(h).position, sticky:h.classList.contains('is-sticky'),
      sub:document.querySelector('.logo-sub')?.textContent,
      wf:!!document.querySelector('.workflow-bar'), gen:!!document.querySelector('.generate-bar'),
      ep:!!document.querySelector('.episode-select'),
      drawer:!!document.querySelector('.canvas-tools-drawer'),
      acts:[...document.querySelectorAll('.app-header__actions button')].map(b=>b.textContent.trim())}})()`);
    check('非 sticky（flex-shrink 参与布局）', dc.pos === 'relative' && !dc.sticky, dc.pos + '/sticky=' + dc.sticky);
    check('副标题=画布模式', dc.sub === '画布模式', String(dc.sub));
    check('workflow-bar 保留', dc.wf);
    check('generate-bar 保留', dc.gen);
    check('生成/工作流抽屉', dc.drawer);
    check('集数筛选保留', dc.ep);
    check('剧本按钮', dc.acts.includes('剧本'));
    check('新建入口', dc.acts.some((x) => x.includes('新建')), JSON.stringify(dc.acts));
    check('对齐节点按钮', dc.acts.includes('对齐节点'));
    check('列表模式按钮', dc.acts.includes('列表模式'));
    check('主题切换按钮', dc.acts.some((x) => x.includes('浅色') || x.includes('暗色')));
    await evalJs(`(()=>{const b=[...document.querySelectorAll('.app-header__actions button')].find(x=>x.textContent.includes('新建'));b&&b.click();return 1})()`);
    await sleep(600);
    const createItems = await evalJs(`[...document.querySelectorAll('.el-dropdown-menu__item')].map(x=>x.textContent.trim())`);
    check('新建菜单含分镜角色场景道具集', ['分镜', '角色', '场景', '道具', '集'].every((x) => createItems.includes(x)), JSON.stringify(createItems));

    // ── AiConfig ──
    console.log('\nAiConfig:');
    await goto('/ai-config');
    const ac = await evalJs(`(()=>({center:[...document.querySelectorAll('.header-inner > button')].map(b=>b.textContent.trim()),
      acts:[...document.querySelectorAll('.app-header__actions button')].map(b=>b.textContent.trim()),
      title:document.querySelector('.page-title')?.textContent, content:!!document.querySelector('.ai-config')}))()`);
    check('返回按钮保留', ac.acts.includes('返回') || ac.center.includes('返回'), JSON.stringify(ac.acts.concat(ac.center)));
    check('主题切换按钮(新增)', ac.acts.some((x) => x.includes('浅色') || x.includes('暗色')));
    check('页面标题', ac.title === 'AI 配置', String(ac.title));
    // 返回按钮可用
    await evalJs(`(()=>{const b=[...document.querySelectorAll('.app-header__actions button')].find(x=>x.textContent.includes('返回'));b&&b.click();return 1})()`);
    await sleep(2200);
    check('返回按钮跳转到列表', (await evalJs(`location.pathname`)) === '/');

    console.log(`\n=== ${pass} passed, ${fail} failed ===`);
    process.exitCode = fail ? 1 : 0;
  } catch (e) {
    console.error('FAIL ' + e.message);
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    chrome.kill(); await sleep(300);
    try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (_) {}
  }
})();
