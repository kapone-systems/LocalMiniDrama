本目录的 ffmpeg / ffprobe 不入库。打包前由脚本下载 Linux x64 静态构建：

  node scripts/fetch-ffmpeg-linux.js

产物：
  ffmpeg-linux/ffmpeg
  ffmpeg-linux/ffprobe

来源是 BtbN/FFmpeg-Builds 的 linux64-gpl 静态包。不要把这两个文件放进
backend-node/tools/ffmpeg/，否则 Windows 安装包会把它们一起打进去。
