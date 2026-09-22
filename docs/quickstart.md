# 快速开始 / 开发指南

**导航：[项目主页](../README.md) | [English](en.md) | [AI 配置](configuration.md) | [版本历史](changelog.md)**

---

## 目录

- [运行方式一：下载安装包（推荐普通用户）](#运行方式一下载安装包推荐普通用户)
- [运行方式二：开发模式（推荐开发者）](#运行方式二开发模式推荐开发者)
  - [环境要求](#环境要求)
  - [启动后端](#1-启动后端)
  - [启动前端](#2-启动前端)
  - [一键启动脚本](#3-一键启动脚本)
- [打包](#打包)
- [配置文件说明](#配置文件说明)
- [数据库与数据目录](#数据库与数据目录)
- [常见问题 FAQ](#常见问题-faq)

---

## 运行方式一：下载安装包（推荐普通用户）

1. 前往 **[Releases](../../releases)** 下载与你的系统对应的包。标准版含示例项目，Lite 不含。文件名里的 `x.x.x` 换成版本号（当前 **1.4.1**）。

   **Windows**

   - `LocalMiniDrama-Setup-x.x.x.exe` — 安装版
   - `LocalMiniDrama-x.x.x.exe` — 便携版
   - `LocalMiniDrama-Lite-Setup-x.x.x.exe` / `LocalMiniDrama-Lite-x.x.x.exe` — 精简版

   **macOS**（未签名。若提示已损坏或无法打开：右键 App → 打开，或到「系统设置 → 隐私与安全性」允许）

   - `LocalMiniDrama-x.x.x-mac-arm64.dmg` — Apple Silicon
   - `LocalMiniDrama-x.x.x-mac-x64.dmg` — Intel
   - Lite 文件名中多一段 `-Lite-`

   **Linux x64**

   - `LocalMiniDrama-x.x.x-linux-x86_64.AppImage` — `chmod +x` 后运行
   - `LocalMiniDrama-x.x.x-linux-amd64.deb` — `sudo apt install ./LocalMiniDrama-x.x.x-linux-amd64.deb`
   - Lite 同样是 AppImage + deb

2. 安装包已内置 ffmpeg / ffprobe。打开后在「AI 配置」填入 API Key。

3. 首次运行的配置文件：

   | 系统 | 路径 |
   |------|------|
   | Windows | `%APPDATA%\localminidrama-desktop\backend\configs\config.yaml` |
   | macOS | `~/Library/Application Support/localminidrama-desktop/backend/configs/config.yaml` |
   | Linux | `~/.config/localminidrama-desktop/backend/configs/config.yaml` |

   Linux 上若烧录字幕的汉字变成方框，安装中文字体：`sudo apt install fonts-noto-cjk`。

> 💡 不知道去哪里申请 API Key？请看 → [AI 配置指南](configuration.md)

---

## 运行方式二：开发模式（推荐开发者）

### 环境要求

| 依赖 | 版本要求 |
|------|----------|
| Node.js | >= 18 |
| npm | 随 Node.js 附带 |
| Git | 任意版本 |

---

### 1. 启动后端

```bash
cd backend-node

# 安装依赖
npm install

# 复制配置文件模板
cp configs/config.example.yaml configs/config.yaml
# Windows PowerShell:
# copy configs\config.example.yaml configs\config.yaml

# 编辑 config.yaml，填入你的 AI API 地址与密钥（见配置指南）

# 首次运行：初始化数据库
npm run migrate

# 启动服务（默认端口 5679）
npm start

# 开发模式（热重载）
npm run dev
```

后端启动成功后，终端会输出：
```
Server started on port 5679
```

---

### 2. 启动前端

**新开一个终端窗口：**

```bash
cd frontweb

# 安装依赖
npm install

# 启动开发服务器（默认端口 3013，自动代理到后端 5679）
npm run dev
```

浏览器访问 `http://localhost:3013` 即可看到界面。

---

### 3. 一键启动脚本

在项目根目录提供了一键启动脚本，**同时启动后端和前端**：

**Windows（双击运行）：**
```
run_dev.bat
```

**PowerShell：**
```powershell
.\run_dev.ps1
```

脚本会分别在两个窗口中启动后端（端口 5679）和前端（端口 3013），并自动打开浏览器。

---

## 打包

> 原生模块（`better-sqlite3`、`sharp`）必须在目标系统上安装。不要在 Windows 上打 Mac / Linux 包。
> GitHub Actions（`.github/workflows/release.yml`）会在打 tag `vX.Y.Z` 时分别用 Windows、macOS、Linux runner 构建，并上传到同一个 Release 草稿。

### Windows

```bash
cd desktop
npm install
npm run dist          # NSIS 安装包 + 便携版
npm run dist:cn       # 同上，Electron 走国内镜像，并再打 Lite
```

产物在 `desktop/release/`：

- `LocalMiniDrama-Setup-x.x.x.exe`
- `LocalMiniDrama-x.x.x.exe`
- `LocalMiniDrama-Lite-Setup-x.x.x.exe`（仅 `dist:cn` 或 CI）
- `LocalMiniDrama-Lite-x.x.x.exe`

### macOS

在 Mac 上（CI 用的是 Apple Silicon runner，会交叉打 x64）：

```bash
cd desktop
npm install
bash dist-mac.sh
```

产物：`LocalMiniDrama-x.x.x-mac-arm64.dmg`、`LocalMiniDrama-x.x.x-mac-x64.dmg`，以及对应的 Lite DMG。未签名。

### Linux x64

在 Linux 上：

```bash
cd desktop
npm install
bash dist-linux.sh
```

产物：`LocalMiniDrama-x.x.x-linux-x86_64.AppImage`、`LocalMiniDrama-x.x.x-linux-amd64.deb`，以及对应的 Lite 包。

**打包原理：**

1. 下载该平台的 ffmpeg / ffprobe（Windows 用 `scripts/fetch-ffmpeg.js`，Mac / Linux 由上面的脚本调用）
2. 构建前端静态文件，复制后端代码
3. electron-builder 打出安装包

---

## 配置文件说明

配置文件位于 `backend-node/configs/config.yaml`（开发模式），或安装包的用户数据目录（见上一节表格）。

主要配置项：

```yaml
server:
  port: 5679          # 后端端口

database:
  path: ./data/drama_generator.db   # SQLite 数据库路径

storage:
  local_path: ./data/storage        # 生成图片/视频的本地存储目录

language: zh          # 界面及提示词语言（zh / en）

style:
  default_style: realistic           # 默认画风
  default_image_ratio: "16:9"        # 默认图片比例
  default_video_ratio: "16:9"        # 默认视频比例
```

AI 服务配置通过软件内「AI 配置」页面管理，无需手动编辑 YAML。  
详细说明请见 → [AI 配置指南](configuration.md)

---

## 数据库与数据目录

| 路径 | 说明 |
|------|------|
| `backend-node/data/drama_generator.db` | SQLite 数据库（开发模式） |
| `backend-node/data/storage/` | 生成的图片和视频文件 |
| `%APPDATA%\localminidrama-desktop\`（macOS / Linux 见上方配置路径表） | 安装包模式下的所有数据 |

> ⚠️ 升级版本前建议备份 `data/` 目录；数据库会在启动时自动执行迁移脚本，一般无需手动操作。

---

## 常见问题 FAQ

### Q: 后端启动报错 `Cannot find module 'better-sqlite3'`

```bash
cd backend-node
npm install
```

如果仍然报错，可能是 Node.js 版本不兼容，请升级到 >= 18。

---

### Q: 前端报错 `Failed to fetch` 或 API 请求 404

确认后端已正常启动（终端显示 `Server started on port 5679`），且前端代理配置指向正确端口。  
检查 `frontweb/vite.config.js` 中的 `proxy` 配置，确保 target 为 `http://localhost:5679`。

---

### Q: 打包 exe 时 Electron 下载失败

使用国内镜像：
```bash
cd desktop
npm run dist:cn
```

或手动设置环境变量后再运行：
```bash
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm run dist
```

---

### Q: 生成的图片/视频保存在哪里？

开发模式：`backend-node/data/storage/`  
安装包：用户数据目录下的 `backend/data/storage/`（Windows 为 `%APPDATA%\localminidrama-desktop`，macOS 为 `~/Library/Application Support/localminidrama-desktop`，Linux 为 `~/.config/localminidrama-desktop`）

目录结构：
```
storage/
├── images/        # 分镜生成的图片
├── characters/    # 角色图片
├── scenes/        # 场景图片
├── videos/        # 生成的视频片段
└── merged/        # 合成后的完整视频
```

---

### Q: 如何备份/迁移项目数据？

**方法一（推荐）**：在软件首页点击项目卡片上的「导出」按钮，下载 ZIP 格式的工程文件，在新机器上导入即可。

**方法二**：直接备份整个 `data/` 目录，将其复制到新机器的相同位置。

---

### Q: 支持 Mac / Linux 吗？

支持。Release 里有 macOS DMG（arm64 / x64，标准版和 Lite）和 Linux x64 的 AppImage、deb（标准版和 Lite）。三个平台的安装包都带 ffmpeg。源码开发模式在 macOS / Linux 上也可以跑，视频合成需要系统里能找到 `ffmpeg` 和 `ffprobe`。

---

[← 返回项目主页](../README.md)
