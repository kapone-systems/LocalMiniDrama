#!/usr/bin/env node
/**
 * 下载 Linux x64 静态 ffmpeg / ffprobe 到 desktop/ffmpeg-linux/。
 *
 * 使用 BtbN/FFmpeg-Builds 的 linux64-gpl 包（含 libx264 / drawtext 等，
 * 和 Windows 上 gyan essentials 的能力对齐）。不要写到 backend-node/tools/ffmpeg/，
 * 那个目录会被 Windows 安装包整份打进去。
 *
 * 用法：node scripts/fetch-ffmpeg-linux.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ARCHIVE = 'ffmpeg-master-latest-linux64-gpl.tar.xz';
const URL = `https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/${ARCHIVE}`;
const DEST_DIR = path.join(__dirname, '..', 'desktop', 'ffmpeg-linux');

function log(msg) {
  console.log(`[fetch-ffmpeg-linux] ${msg}`);
}

function fail(msg) {
  console.error(`[fetch-ffmpeg-linux] 错误：${msg}`);
  process.exit(1);
}

async function download(url, destPath) {
  log(`下载 ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) fail(`下载失败 HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buf);
  log(`已保存 ${(buf.length / 1048576).toFixed(1)} MB`);
}

function findBinary(root, name) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name === name) return full;
    }
  }
  return null;
}

async function main() {
  fs.mkdirSync(DEST_DIR, { recursive: true });
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-ffmpeg-linux-'));
  try {
    const archivePath = path.join(tmpDir, ARCHIVE);
    await download(URL, archivePath);
    const extractDir = path.join(tmpDir, 'extracted');
    fs.mkdirSync(extractDir, { recursive: true });
    log('解压中…');
    try {
      execFileSync('tar', ['-xJf', archivePath, '-C', extractDir], { stdio: 'inherit' });
    } catch (e) {
      fail(`tar 解压失败（需要支持 xz 的 tar）：${e.message}`);
    }
    for (const name of ['ffmpeg', 'ffprobe']) {
      const found = findBinary(extractDir, name);
      if (!found) fail(`压缩包中未找到 ${name}`);
      const dest = path.join(DEST_DIR, name);
      fs.copyFileSync(found, dest);
      fs.chmodSync(dest, 0o755);
      log(`已就位 ${name} (${(fs.statSync(dest).size / 1048576).toFixed(1)} MB)`);
    }
    log(`完成，输出目录：${DEST_DIR}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((e) => fail(e.message));
