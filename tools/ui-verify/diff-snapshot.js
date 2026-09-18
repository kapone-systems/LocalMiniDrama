// 对比两份 style-snapshot，列出计算样式差异
// 用法: node diff-snapshot.js <before.json> <after.json>
const fs = require('fs');
const [bf, af] = process.argv.slice(2);
const before = JSON.parse(fs.readFileSync(bf, 'utf8'));
const after = JSON.parse(fs.readFileSync(af, 'utf8'));

const IGNORE = new Set(['i']);  // 索引本身不比较
let totalDiff = 0;
const byPage = {};

for (const page of Object.keys(before)) {
  const b = before[page] || [], a = after[page] || [];
  const diffs = [];
  const n = Math.min(b.length, a.length);
  if (b.length !== a.length) {
    diffs.push(`元素数量不同: ${b.length} -> ${a.length}`);
  }
  for (let i = 0; i < n; i++) {
    const be = b[i], ae = a[i];
    // 元素身份变化（类名/标签）说明 DOM 结构变了，单独提示
    if (be.tag !== ae.tag || be.cls !== ae.cls) {
      diffs.push(`#${i} 元素不同: <${be.tag} class="${be.cls}"> -> <${ae.tag} class="${ae.cls}">`);
      continue;
    }
    for (const k of Object.keys(be)) {
      if (IGNORE.has(k)) continue;
      if (be[k] !== ae[k]) {
        diffs.push(`#${i} <${be.tag} class="${be.cls.slice(0, 50)}">  ${k}: ${be[k]}  ->  ${ae[k]}`);
      }
    }
  }
  byPage[page] = diffs;
  totalDiff += diffs.length;
}

console.log(`对比: ${require('path').basename(bf)} -> ${require('path').basename(af)}\n`);
for (const [page, diffs] of Object.entries(byPage)) {
  console.log(`=== ${page} : ${diffs.length === 0 ? '无差异 ✓' : diffs.length + ' 处差异'} ===`);
  diffs.slice(0, 25).forEach((d) => console.log('   ' + d));
  if (diffs.length > 25) console.log(`   ... 另有 ${diffs.length - 25} 处`);
}
console.log(`\n总差异: ${totalDiff}`);
