// 裁剪 PNG 指定区域并统计颜色（用于对比局部区域的改动）
// 用法: node crop-analyze.js <png> <x> <y> <w> <h> [label]
const fs = require('fs');
const zlib = require('zlib');

function decodePNG(buf) {
  let pos = 8, idat = [], w = 0, h = 0, colorType = 0;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.slice(pos + 4, pos + 8).toString('ascii');
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = Buffer.alloc(w * h * channels);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const cur = Buffer.from(raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = cur[i];
      if (ft === 1) v += a; else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[i] = v & 0xff;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { w, h, channels, data: out };
}

/** 相对亮度（WCAG） */
function relLum(r, g, b) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(r1, g1, b1, r2, g2, b2) {
  const L1 = relLum(r1, g1, b1), L2 = relLum(r2, g2, b2);
  const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

const [file, X, Y, W, H, label = ''] = process.argv.slice(2);
const img = decodePNG(fs.readFileSync(file));
const x0 = Number(X), y0 = Number(Y), cw = Number(W), ch = Number(H);
const { w, channels, data } = img;

// 收集区域内所有像素，按亮度排序，取最暗/最亮代表色
const px = [];
for (let y = y0; y < Math.min(y0 + ch, img.h); y++) {
  for (let x = x0; x < Math.min(x0 + cw, w); x++) {
    const o = (y * w + x) * channels;
    px.push([data[o], data[o + 1], data[o + 2]]);
  }
}
const lum = px.map((p) => relLum(p[0], p[1], p[2]));
const sorted = px.map((p, i) => [lum[i], p]).sort((a, b) => a[0] - b[0]);
const darkest = sorted[0][1];
const lightest = sorted[sorted.length - 1][1];
// 文本像素 ≈ 最暗的 15% 的中位数；背景 ≈ 最亮的 15%
const textBand = sorted.slice(0, Math.max(1, Math.floor(sorted.length * 0.15)));
const bgBand = sorted.slice(-Math.max(1, Math.floor(sorted.length * 0.15)));
const med = (band, idx) => {
  const vals = band.map((e) => e[1][idx]).sort((a, b) => a - b);
  return vals[Math.floor(vals.length / 2)];
};
const txt = [med(textBand, 0), med(textBand, 1), med(textBand, 2)];
const bg = [med(bgBand, 0), med(bgBand, 1), med(bgBand, 2)];

console.log(`${label || require('path').basename(file)}  [${x0},${y0} ${cw}x${ch}]`);
console.log(`  背景(最亮15%中位): rgb(${bg.join(',')})   文本(最暗15%中位): rgb(${txt.join(',')})`);
console.log(`  对比度: ${contrast(...txt, ...bg).toFixed(2)}:1   (WCAG AA 正文需 ≥4.5, 大字 ≥3.0)`);
console.log(`  极值: 最暗 rgb(${darkest.join(',')})  最亮 rgb(${lightest.join(',')})`);
