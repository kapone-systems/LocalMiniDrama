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

# npm 会拒绝在 arm64 机器上安装 darwin-x64 的 optional 包（EBADPLATFORM）。
# 用 npm pack 把预编译包直接放进 node_modules，不走平台检查。
install_prebuilt() {
  local spec="$1"
  local folder="$2"
  local tmp tgz
  tmp="$(mktemp -d)"
  npm pack "$spec" --pack-destination "$tmp" >/dev/null
  tgz="$(find "$tmp" -name '*.tgz' -print -quit)"
  if [ -z "${tgz}" ]; then
    echo "npm pack 没有产出 ${spec}"
    exit 1
  fi
  rm -rf "node_modules/@img/${folder}"
  mkdir -p "node_modules/@img/${folder}"
  tar -xzf "$tgz" -C "node_modules/@img/${folder}" --strip-components=1
  rm -rf "$tmp"
  echo "已放入 node_modules/@img/${folder}"
}

install_sharp_for() {
  local arch="$1"
  if [ "$HOST" = "arm64" ] && [ "$arch" = "x64" ]; then
    echo "当前是 Apple Silicon，为 x64 DMG 放入 sharp 的 darwin-x64 预编译包"
    install_prebuilt @img/sharp-darwin-x64@0.34.5 sharp-darwin-x64
    install_prebuilt @img/sharp-libvips-darwin-x64@1.2.4 sharp-libvips-darwin-x64
  elif [ "$HOST" != "arm64" ] && [ "$arch" = "arm64" ]; then
    echo "当前是 Intel，为 arm64 DMG 放入 sharp 的 darwin-arm64 预编译包"
    install_prebuilt @img/sharp-darwin-arm64@0.34.5 sharp-darwin-arm64
    install_prebuilt @img/sharp-libvips-darwin-arm64@1.2.4 sharp-libvips-darwin-arm64
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
echo "  完整版（Intel）：DramaDesk-x.x.x-mac-x64.dmg"
echo "  完整版（ARM）  ：DramaDesk-x.x.x-mac-arm64.dmg"
echo "  纯净版（Intel）：DramaDesk-Lite-x.x.x-mac-x64.dmg"
echo "  纯净版（ARM）  ：DramaDesk-Lite-x.x.x-mac-arm64.dmg"
echo ""
