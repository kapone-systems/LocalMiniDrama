// 批量截图：逐页 × 明暗，调用 shot.js
// 用法: node batch-shot.js <outDir> [tag]
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SHOT = path.join(__dirname, 'shot.js');
const outDir = process.argv[2] || path.join(ROOT, 'docs', 'ui-baseline');
const tag = process.argv[3] || '';

const PAGES = [
  ['list', '/'],
  ['drama', '/drama/1'],
  ['film', '/film/1'],
  ['canvas', '/film/1/canvas'],
  ['ai-config', '/ai-config'],
  ['free-create', '/free-create'],
  ['media-library', '/media-library'],
];

const THEMES = ['light', 'dark'];

fs.mkdirSync(outDir, { recursive: true });
let ok = 0, fail = 0;

for (const [name, route] of PAGES) {
  for (const theme of THEMES) {
    const suffix = tag ? `-${tag}` : '';
    const out = path.join(outDir, `${name}${suffix}-${theme}.png`);
    const url = 'http://localhost:3013' + route;
    const r = spawnSync(process.execPath, [SHOT, url, out, theme], { encoding: 'utf8' });
    const line = (r.stdout || '').trim() || (r.stderr || '').trim();
    if (r.status === 0) { ok++; console.log(`[ok]   ${name}-${theme}`); }
    else { fail++; console.log(`[FAIL] ${name}-${theme}: ${line}`); }
  }
}

console.log(`\ndone: ${ok} ok, ${fail} failed -> ${outDir}`);
process.exitCode = fail ? 1 : 0;
