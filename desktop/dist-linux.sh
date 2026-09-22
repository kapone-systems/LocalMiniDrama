#!/bin/bash
# Linux 打包脚本（完整版 + 纯净版，x64 AppImage + deb）
# 用法：在 desktop/ 目录下执行 bash dist-linux.sh
# 需要在 Linux 上运行：better-sqlite3 / sharp 必须是本机架构的二进制。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "========== 下载 Linux ffmpeg / ffprobe =========="
node ../scripts/fetch-ffmpeg-linux.js

echo ""
echo "========== 准备后端与前端 =========="
npm run prepare-backend
npm run build:front
npm run copy-front

echo ""
echo "========== [1/2] 构建完整版（含示例资源）=========="
npx electron-builder --linux --config electron-builder-linux.json --publish never

echo ""
echo "========== [2/2] 构建纯净版（不含示例资源）=========="
npx electron-builder --linux --config electron-builder-linux-lite.json --publish never

echo ""
echo "========== 全部构建完成 =========="
echo "输出目录：release/"
echo "  完整版 AppImage：LocalMiniDrama-x.x.x-linux-x86_64.AppImage"
echo "  完整版 deb     ：LocalMiniDrama-x.x.x-linux-amd64.deb"
echo "  纯净版 AppImage：LocalMiniDrama-Lite-x.x.x-linux-x86_64.AppImage"
echo "  纯净版 deb     ：LocalMiniDrama-Lite-x.x.x-linux-amd64.deb"
echo ""
