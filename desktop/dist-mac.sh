#!/bin/bash
# macOS 打包脚本（完整版 + 纯净版 DMG，arm64 与 x64 分开打）
# 用法：在 desktop/ 目录下执行 bash dist-mac.sh
# 一个 ffmpeg-mac/ 目录一次只能放一个架构，所以 arm64 / x64 分两次构建。

set -euo pipefail

# 本地打包默认走国内镜像。GitHub Actions 上用官方源，避免镜像在海外 runner 上失败。
if [ "${GITHUB_ACTIONS:-}" != "true" ]; then
  export ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"
  export ELECTRON_BUILDER_BINARIES_MIRROR="${ELECTRON_BUILDER_BINARIES_MIRROR:-https://cdn.npmmirror.com/binaries/electron-builder-binaries/}"
fi
export CSC_IDENTITY_AUTO_DISCOVERY=false

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

HOST="$(uname -m)"

install_sharp_for() {
  local arch="$1"
  if [ "$HOST" = "arm64" ] && [ "$arch" = "x64" ]; then
    echo "当前是 Apple Silicon，为 x64 DMG 安装 sharp 的 darwin-x64 预编译包"
    npm install --no-save --os=darwin --cpu=x64 @img/sharp-darwin-x64@0.34.5 @img/sharp-libvips-darwin-x64@1.2.4
  elif [ "$HOST" != "arm64" ] && [ "$arch" = "arm64" ]; then
    echo "当前是 Intel，为 arm64 DMG 安装 sharp 的 darwin-arm64 预编译包"
    npm install --no-save --os=darwin --cpu=arm64 @img/sharp-darwin-arm64@0.34.5 @img/sharp-libvips-darwin-arm64@1.2.4
  fi
}

build_arch() {
  local arch="$1"
  echo ""
  echo "========== ffmpeg (${arch}) =========="
  node ../scripts/fetch-ffmpeg-mac.js "$arch"
  install_sharp_for "$arch"

  echo ""
  echo "========== 完整版 DMG (${arch}) =========="
  npx electron-builder --mac --"$arch" --config electron-builder-mac.json --publish never

  echo ""
  echo "========== 纯净版 DMG (${arch}) =========="
  npx electron-builder --mac --"$arch" --config electron-builder-mac-lite.json --publish never
}

echo ""
echo "========== 准备后端与前端 =========="
npm run prepare-backend
npm run build:front
npm run copy-front

build_arch arm64
build_arch x64

echo ""
echo "========== 全部构建完成 =========="
echo "输出目录：release/"
echo "  完整版（Intel）：LocalMiniDrama-x.x.x-mac-x64.dmg"
echo "  完整版（ARM）  ：LocalMiniDrama-x.x.x-mac-arm64.dmg"
echo "  纯净版（Intel）：LocalMiniDrama-Lite-x.x.x-mac-x64.dmg"
echo "  纯净版（ARM）  ：LocalMiniDrama-Lite-x.x.x-mac-arm64.dmg"
echo ""
