#!/usr/bin/env node
/**
 * 下载 macOS 静态 ffmpeg / ffprobe 到 desktop/ffmpeg-mac/。
 *
 * evermeet.cx 只有 Intel 构建，没有 Apple Silicon。这里用 ffmpeg-static 发布的
 * 单文件 gzip（darwin-arm64 与 darwin-x64 都有，且同时提供 ffprobe）。
 * 一次只放一个架构：arm64 与 x64 要分两次打包，避免 DMG 里打进错误的二进制。
 *
 * 用法：node scripts/fetch-ffmpeg-mac.js arm64
 *       node scripts/fetch-ffmpeg-mac.js x64
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const TAG = 'b6.1.1';
const BASE = `https://github.com/eugeneware/ffmpeg-static/releases/download/${TAG}`;
const DEST_DIR = path.join(__dirname, '..', 'desktop', 'ffmpeg-mac');

function log(msg) {
  console.log(`[fetch-ffmpeg-mac] ${msg}`);
}

function fail(msg) {
  console.error(`[fetch-ffmpeg-mac] 错误：${msg}`);
  process.exit(1);
}

async function download(url) {
  log(`下载 ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) fail(`下载失败 HTTP ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  log(`已下载 ${(buf.length / 1048576).toFixed(1)} MB`);
  return buf;
}

async function main() {
  const arch = process.argv[2];
  if (arch !== 'arm64' && arch !== 'x64') {
    fail('用法：node scripts/fetch-ffmpeg-mac.js <arm64|x64>');
  }

  fs.mkdirSync(DEST_DIR, { recursive: true });
  for (const name of ['ffmpeg', 'ffprobe']) {
    const gz = await download(`${BASE}/${name}-darwin-${arch}.gz`);
    let bin;
    try {
      bin = zlib.gunzipSync(gz);
    } catch (e) {
      fail(`解压 ${name}-darwin-${arch}.gz 失败：${e.message}`);
    }
    const dest = path.join(DEST_DIR, name);
    fs.writeFileSync(dest, bin);
    fs.chmodSync(dest, 0o755);
    log(`已就位 ${name} (${arch}, ${(bin.length / 1048576).toFixed(1)} MB)`);
  }
  log(`完成，输出目录：${DEST_DIR}`);
}

main().catch((e) => fail(e.message));
