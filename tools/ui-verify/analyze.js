// 分析 PNG 截图的像素统计（无需第三方依赖）
// 用法: node analyze.js <png...>
const fs = require('fs');
const zlib = require('zlib');

function decodePNG(buf) {
  if (buf.slice(0, 8).toString('binary') !== '\x89PNG\r\n\x1a\n') throw new Error('非 PNG');
  let pos = 8, idat = [], w = 0, h = 0, bitDepth = 0, colorType = 0;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.slice(pos + 4, pos + 8).toString('ascii');
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8) throw new Error('仅支持 8-bit, got ' + bitDepth);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error('不支持 colorType ' + colorType);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = Buffer.alloc(w * h * channels);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.from(line);
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = cur[i];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
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

function analyze(file) {
  const img = decodePNG(fs.readFileSync(file));
  const { w, h, channels, data } = img;
  let lumSum = 0, n = 0;
  const colors = new Map();
  let white = 0, nearWhite = 0;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const o = (y * w + x) * channels;
      const r = data[o], g = data[o + 1], b = data[o + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lumSum += lum; n++;
      if (r > 250 && g > 250 && b > 250) white++;
      else if (r > 235 && g > 235 && b > 235) nearWhite++;
      const key = (r >> 4) + ',' + (g >> 4) + ',' + (b >> 4);
      colors.set(key, (colors.get(key) || 0) + 1);
    }
  }
  const top = [...colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([k, v]) => {
      const [r, g, b] = k.split(',').map((x) => (Number(x) * 16 + 8));
      return `rgb(${r},${g},${b}):${(v / n * 100).toFixed(1)}%`;
    });
  return {
    file: require('path').basename(file), size: `${w}x${h}`,
    avgLum: (lumSum / n).toFixed(1),
    whitePct: (white / n * 100).toFixed(1),
    nearWhitePct: (nearWhite / n * 100).toFixed(1),
    top,
  };
}

for (const f of process.argv.slice(2)) {
  try {
    const r = analyze(f);
    console.log(`${r.file.padEnd(28)} ${r.size.padEnd(10)} avgLum=${String(r.avgLum).padStart(6)} white=${String(r.whitePct).padStart(5)}% nearWhite=${String(r.nearWhitePct).padStart(5)}%  ${r.top.join(' ')}`);
  } catch (e) {
    console.log(`${require('path').basename(f).padEnd(28)} ERROR ${e.message}`);
  }
}
