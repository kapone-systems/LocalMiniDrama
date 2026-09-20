/**
 * 可灵 Omni / Seedance 全能提示词版式：保真校验用纯函数。
 * 不要在这里改写文案。
 */

function splitNonEmptyLines(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function isOmniFormatted(text) {
  const t = String(text || '');
  if (!t.trim()) return false;
  const hasStyle = /画面风格和类型\s*[:：]/.test(t);
  const hasAt = /@图片\d+/.test(t);
  const hasBeat = /分镜\s*1\s*[:：]/.test(t);
  return hasStyle && hasAt && hasBeat;
}

function extractOmniLine3(text) {
  const lines = splitNonEmptyLines(text);
  let styleIdx = -1;
  let countIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (styleIdx < 0 && /画面风格和类型\s*[:：]/.test(lines[i])) styleIdx = i;
    if (/生成一个由以下\s*\d+\s*个分镜/.test(lines[i]) || /^生成一个由以下/.test(lines[i])) {
      countIdx = i;
    }
  }
  if (countIdx >= 0 && countIdx + 1 < lines.length) return lines[countIdx + 1];
  if (styleIdx >= 0 && styleIdx + 2 < lines.length) return lines[styleIdx + 2];
  return lines.length >= 3 ? lines[2] : '';
}

function collectAtImageTokens(text) {
  const set = new Set();
  const re = /@图片(\d+)/g;
  const src = String(text || '');
  let m;
  while ((m = re.exec(src))) {
    set.add(`@图片${m[1]}`);
  }
  return [...set].sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
}

function extractOmniBeatSeconds(text) {
  const re = /分镜\s*\d+\s*[:：]\s*(\d+(?:\.\d+)?)\s*秒/g;
  const src = String(text || '');
  const secs = [];
  let m;
  while ((m = re.exec(src))) {
    secs.push(Number(m[1]));
  }
  return secs;
}

function sumSeconds(list) {
  return (list || []).reduce((a, b) => a + (Number(b) || 0), 0);
}

/**
 * 输入已是全能版式时，改写结果必须保真 @图片N、第 3 行、秒数总和。
 * @returns {string|null} 失败原因；通过则 null
 */
function omniPreservationError(original, adapted) {
  if (!isOmniFormatted(original)) return null;
  const out = String(adapted || '').trim();
  if (!isOmniFormatted(out)) return 'omni_format_lost';
  const origTok = collectAtImageTokens(original);
  const newTok = collectAtImageTokens(out);
  if (origTok.join(',') !== newTok.join(',')) return 'omni_at_image_lost';
  const line3 = extractOmniLine3(original);
  if (line3 && extractOmniLine3(out) !== line3) return 'omni_line3_changed';
  const origSecs = extractOmniBeatSeconds(original);
  if (origSecs.length) {
    const delta = Math.abs(sumSeconds(origSecs) - sumSeconds(extractOmniBeatSeconds(out)));
    if (delta > 0.05) return 'omni_seconds_mismatch';
  }
  return null;
}

module.exports = {
  isOmniFormatted,
  extractOmniLine3,
  collectAtImageTokens,
  extractOmniBeatSeconds,
  omniPreservationError,
  splitNonEmptyLines,
};
