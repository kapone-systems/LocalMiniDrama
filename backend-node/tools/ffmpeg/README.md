# FFmpeg 本地目录

后端会优先使用本目录下的可执行文件，**无需配置环境变量**。

## 获取可执行文件

`ffmpeg.exe` 与 `ffprobe.exe` 各约 95MB，未纳入版本控制。在仓库根目录执行：

```bash
node scripts/fetch-ffmpeg.js
```

脚本会自动下载官方构建（gyan.dev，Windows x64）并解压到本目录。**若只缺其中一个，只补缺失的那个。**

> 终端用户不需要执行这一步：发布版安装包已把 ffmpeg/ffprobe 打进程序内部，开箱即用。

## 其它平台

macOS / Linux 请用系统包管理器安装，后端会自动从 `PATH` 中查找：

```bash
brew install ffmpeg          # macOS
sudo apt install ffmpeg      # Debian / Ubuntu
```

## 路径优先级

1. 环境变量 `FFMPEG_PATH` / `FFPROBE_PATH`
2. `process.cwd()/tools/ffmpeg/`（打包后为 userData/backend，用户可在此覆盖）
3. exe 同级目录的 `tools/ffmpeg/`，或直接放在 exe 旁边
4. 本目录（源码开发时）
5. 系统 `PATH`（兜底）

详见 `backend-node/src/utils/ffmpegPath.js`。
