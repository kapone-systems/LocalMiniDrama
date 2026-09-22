#!/usr/bin/env node
/**
 * 下载 ffmpeg / ffprobe 到 backend-node/tools/ffmpeg/。
 *
 * 这两个可执行文件各约 95MB，不适合放进仓库（会撑大 clone、并消耗 LFS 带宽配额），
 * 因此由本脚本按需获取。发布用的安装包在构建时会把它们打进 extraResources，
 * 所以终端用户下载 exe 后无需执行本脚本。
 *
 * 用法：node scripts/fetch-ffmpeg.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const FFMPEG_VERSION = '8.0.1';
const BUILD_KIND = 'essentials_build';
const REPO_ROOT = path.resolve(__dirname, '..');
const DEST_DIR = path.join(REPO_ROOT, 'backend-node', 'tools', 'ffmpeg');

const ARCHIVE = `ffmpeg-${FFMPEG_VERSION}-${BUILD_KIND}.zip`;
const PRIMARY_URL = `https://github.com/GyanD/codexffmpeg/releases/download/${FFMPEG_VERSION}/${ARCHIVE}`;

function log(msg) {
  console.log(`[fetch-ffmpeg] ${msg}`);
}

function fail(msg) {
  console.error(`[fetch-ffmpeg] 错误：${msg}`);
  process.exit(1);
}

async function download(url, destPath) {
  log(`下载 ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) fail(`下载失败 HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buf);
  log(`已保存 ${(buf.length / 1048576).toFixed(1)} MB${total ? ` / ${(total / 1048576).toFixed(1)} MB` : ''}`);
}

/** 用系统自带解压工具展开 zip，避免引入额外依赖。 */
function extractZip(zipPath, outDir) {
  if (process.platform === 'win32') {
    execFileSync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${outDir}' -Force`,
    ], { stdio: 'inherit' });
  } else {
    execFileSync('unzip', ['-o', '-q', zipPath, '-d', outDir], { stdio: 'inherit' });
  }
}

/** 在解压结果中递归查找指定文件名（gyan.dev 的包把可执行文件放在 bin/ 下）。 */
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
  if (process.platform !== 'win32') {
    fail(
      '本脚本提供的是 Windows 构建（gyan.dev）。\n' +
      '  打包 macOS：node scripts/fetch-ffmpeg-mac.js <arm64|x64>\n' +
      '  打包 Linux：node scripts/fetch-ffmpeg-linux.js\n' +
      '  只在本机开发运行时，macOS 用 `brew install ffmpeg`，Linux 用发行版包管理器安装，\n' +
      '  后端会从系统 PATH 中查找 ffmpeg / ffprobe。'
    );
  }

  fs.mkdirSync(DEST_DIR, { recursive: true });

  const targets = ['ffmpeg.exe', 'ffprobe.exe'];
  const missing = targets.filter((n) => !fs.existsSync(path.join(DEST_DIR, n)));
  if (missing.length === 0) {
    log(`已存在，跳过：${targets.join(', ')}`);
    return;
  }
  log(`缺失：${missing.join(', ')}`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-ffmpeg-'));
  try {
    const zipPath = path.join(tmpDir, ARCHIVE);
    await download(PRIMARY_URL, zipPath);

    const extractDir = path.join(tmpDir, 'extracted');
    fs.mkdirSync(extractDir, { recursive: true });
    log('解压中…');
    extractZip(zipPath, extractDir);

    for (const name of missing) {
      const found = findBinary(extractDir, name);
      if (!found) fail(`压缩包中未找到 ${name}`);
      fs.copyFileSync(found, path.join(DEST_DIR, name));
      log(`已就位 ${name} (${(fs.statSync(found).size / 1048576).toFixed(1)} MB)`);
    }
    log(`完成，输出目录：${DEST_DIR}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((e) => fail(e.message));
