将 macOS 版 ffmpeg 可执行文件放在本目录（一次只放一个架构）：
  ffmpeg-mac/ffmpeg
  ffmpeg-mac/ffprobe

不要手填 evermeet.cx：那个站点没有 Apple Silicon 构建。请用仓库脚本，
它会下载 ffmpeg-static 的静态包（darwin-arm64 或 darwin-x64）：

  node scripts/fetch-ffmpeg-mac.js arm64
  node scripts/fetch-ffmpeg-mac.js x64

arm64 和 x64 必须分开打包。`desktop/dist-mac.sh` 会按这个顺序各打一次。

构建 dmg 后，这两个文件会随安装包分发；用户首次启动时自动复制到：
  ~/Library/Application Support/DramaDesk/backend/tools/ffmpeg/
