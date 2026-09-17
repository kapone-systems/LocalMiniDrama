# grok2api 适配验收记录

> 对应 `LMD_GROK2API_PLAN.md` 第 4 节各阶段验收标准与第 7 节交付物清单。
> 本文件记录**实际执行**的验证结果，非计划。
>
> - 分支：`dev`
> - 版本 tag：`v1.2.8-grok2api`（基线 `v1.2.8-upstream` = `8a7254e`）
> - 环境：Windows 10.0.26200 / Node v24.19.0 / npm 11.17.0
> - 验证日期：2026-09-18

---

## 1. 交付物清单

| 交付物 | 路径 | 状态 |
|---|---|---|
| 适配后的 LMD 源码 | `LocalMiniDrama/`（git `dev` 分支，6 个提交） | ✅ |
| 上游契约固化文档 | `docs/grok2api-contract.md` | ✅ |
| 图片回归测试 | `backend-node/test/grok2ApiImage.test.js`（26 例） | ✅ |
| 视频回归测试 | `backend-node/test/grok2ApiVideo.test.js`（24 例） | ✅ |
| 测试连接回归测试 | `backend-node/test/grok2ApiTestConnection.test.js`（10 例） | ✅ |
| 一键导入配置 | `各大平台中转站配置/grok2api.json` | ✅ |
| 前端 grok2api 预设 | `frontweb/src/components/AIConfigContent.vue` | ✅ |
| 接入文档 | `docs/configuration.md`（新增 grok2api 章节） | ✅ |
| 端到端验收脚本 | `backend-node/scripts/verify-grok2api-e2e.js` | ✅ |
| 验收记录 | 本文件 | ✅ |

---

## 2. 阶段验收

### 阶段 0：基建

| 项 | 验收标准 | 结果 |
|---|---|---|
| T0.1 | 完整源码就位 | ✅ 351 文件（与 `tree.json` blob 数一致），含 95MB `ffmpeg.exe` |
| T0.2 | git 基线 + tag + dev 分支 | ✅ `8a7254e` 基线；tag `v1.2.8-upstream`；已切 `dev` 分支 |
| T0.3 | 源码模式能启动、能打开界面 | ✅ 后端 `:5679` 提供 API 与已构建前端，`/health` 返回 ok |
| T0.4 | 补 `test` script，现有测试全绿 | ✅ 补 `node --test "test/*.test.js"`；基线 70 例全绿 |
| T0.5 | `docs/grok2api-contract.md` 固化契约 | ✅ 已建，含 `file:line` 依据 |

**T0.3 关键证据**：
```
$ curl -s http://127.0.0.1:5679/health
{"status":"ok","app":"LocalMiniDrama API","version":"1.0.0"}
$ curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5679/
200
```

**环境搭建时发现并解决的问题**（原计划未预见）：
1. `npm install` 在 `better-sqlite3@11` 上编译失败 —— Node 24 无预编译包且本机无 VS 构建工具。
   解决：升级到 `better-sqlite3@12` 并拉取对应预编译二进制。
2. `node --test test/` 在 Windows 上不识别目录参数（报 `MODULE_NOT_FOUND`）。
   解决：改用 glob 形式 `node --test "test/*.test.js"`。
3. 前端 `dist` 不存在导致后端只返回占位页。解决：`npm run build` 构建前端。

---

### 阶段 1：图片适配（原计划「当前完全不可用」的部分）

| 项 | 验收标准 | 结果 |
|---|---|---|
| T1.1 | `imageClient.js` 新增 `grok2api` 协议分支 | ✅ `callGrok2ApiImage` + 分派链 + `isGrok2ApiImageProtocol` |
| T1.2 | 实现 `callGrok2ApiImage`（generations / edits 分流） | ✅ |
| T1.3 | `grok2ApiAspectRatioFromSize` 尺寸映射 + 21:9 回退 | ✅ |
| T1.4 | 参考图数量钳制 | ✅ 钳制到 **3 张**（非计划写的 8，见 §4 偏差 A1） |
| T1.5 | 修 `quality: 'standard'` 硬编码 | ✅ 4 处全部移除（character 2 处 + scene 2 处） |
| T1.6 | 写测试 | ✅ `grok2ApiImage.test.js` 26 例全绿 |

**验收 1：生成角色图成功出图**（端到端脚本，真实 `callImageApi` 路径）
```
PASS  文生图成功出图  — {"image_url":"https://cdn.example/out.png"}
PASS  文生图走 /v1/images/generations  — /v1/images/generations
PASS  文生图发 aspect_ratio=16:9  — {"model":"grok-imagine-image","prompt":"a cat","n":1,"aspect_ratio":"16:9"}
PASS  文生图不发 size/quality
```
→ 请求体正是 `{model, prompt, n, aspect_ratio}`，**不含 `size`、不含 `quality`**，
即原日志中 13 次 400 的根因已消除。

**验收 2：带参考图生成分镜图，参考图确实生效**
```
PASS  图生图成功出图  — {"image_url":"https://cdn.example/out.png"}
PASS  参考图走 /v1/images/edits  — /v1/images/edits
PASS  参考图在 images[{url}] 字段  — [{"url":"https://cdn.example/ref1.png"},{"url":"https://cdn.example/ref2.png"}]
PASS  图生图 aspect_ratio=9:16  — 9:16
```
→ 参考图确实进入 `/images/edits` 的 `images:[{url}]`，不再被静默丢弃（D3 修复）。

**验收 3：测试全绿** —— 见 §3。

---

### 阶段 2：视频适配

| 项 | 验收标准 | 结果 |
|---|---|---|
| T2.1 | `videoClient.js` 新增 `grok2api` 协议 | ✅ `inferVideoProtocol` / `resolveVideoProtocol` / 分派链 / `buildQueryUrl` |
| T2.2 | `callGrok2ApiVideo` 提交 + 轮询 | ✅ 提交读 `request_id`；轮询读 `status` + `video.url` |
| T2.3 | 首尾帧处理 | ✅ 首帧走 `image`；参考图走 `reference_images`；互斥时保留首帧；尾帧忽略并告警 |
| T2.4 | 参数钳制 | ✅ 参考图 ≤7；duration ≤10s；1080p 仅 1.5 且参考图模式降 720p |
| T2.5 | 修正数据库/前端预设的错误配置 | ✅ 预设与 `grok2api.json` 均为正确 endpoint |
| T2.6 | 写测试 | ✅ `grok2ApiVideo.test.js` 24 例全绿 |

**验收 1-3：文生视频 / 图生视频 / 多图参考**
```
PASS  文生视频提交成功  — {"task_id":"req_e2e","status":"submitted"}
PASS  视频提交走 /v1/videos/generations  — /v1/videos/generations
PASS  视频 body 无未知字段  — {"model":"grok-imagine-video","prompt":"a cat running","duration":6,"aspect_ratio":"16:9","resolution":"720p"}
PASS  图生视频首帧走 image{url}  — {"url":"https://cdn.example/first.png"}
PASS  参考图截断到 7 张  — 7
PASS  duration 钳制到 10s  — 10
```

**验收 4：轮询与 resume-poll**
```
PASS  轮询解析出 video.url  — {"video_url":"https://cdn.example/out.mp4"}
```
单元测试另覆盖完整「提交 → 轮询 pending → 轮询 done」往返：
```
✔ resolves the video url from the {status, video:{url}} poll response
```
`resume-poll` 复用同一条 `pollVideoTask` 路径，故同样受此覆盖。

**验收 5：测试全绿** —— 见 §3。

---

### 阶段 3：文本 / TTS / 测试连接

| 项 | 验收标准 | 结果 |
|---|---|---|
| T3.1 | 文本走 `/chat/completions` | ✅ 上游支持，含 SSE 流式（LMD 强制 `stream:true`） |
| T3.2 | TTS 走 `/audio/speech` | ✅ 字段全兼容；`alloy`→`ara` 等自动映射 |
| T3.3 | 修「测试连接」误导（D8） | ✅ 改为 `GET /v1/models`，同时验证 key 与模型存在性 |

**T3.1 / T3.2 结论**：这两个路径**无需改代码**，上游契约与 LMD 现有实现兼容。
只需在配置里用正确的模型名（`grok-4.5` / `grok-voice-latest` 等），已写入预设与文档。

**T3.3 验收：测试连接不再误导**（通过真实 HTTP 路由 `/api/v1/ai-configs/test` 验证）
```
# 模型存在 → 通过
{"success":true,"data":{"message":"连接测试成功"}}

# 模型不存在（正是原计划里配错的 grok-imagine-medium）→ 明确失败并给出可用模型
{"success":false,"error":{"code":"BAD_REQUEST",
 "message":"连接测试失败: 模型「grok-imagine-medium」在上游不存在。可用模型：grok-imagine-image, grok-imagine-video"}}
```
→ 过去这个配置会报「测试连接成功」，然后在真实生成时 400。现在**在测试阶段就被拦下**，
并直接列出可用模型名。

---

### 阶段 4：工程化收尾

| 项 | 验收标准 | 结果 |
|---|---|---|
| T4.1 | 前端加 grok2api 预设 | ✅ 一键创建 text/image/storyboard_image/video/tts 五类配置 |
| T4.2 | 补 `各大平台中转站配置/grok2api.json` | ✅ 格式对齐 `302ai-302.json` |
| T4.3 | 更新 `docs/configuration.md` | ✅ 新增 grok2api 章节（配置表 / 模型表 / 限制说明） |
| T4.4 | 全量回归 | ✅ 见 §3 |
| T4.5 | 打 tag | ✅ `v1.2.8-grok2api` |

**T4.1 验证**：前端构建通过，预设已进入产物
```
$ grep -o "一键配置 grok2api" dist/assets/AIConfigContent-*.js
一键配置 grok2api
```

---

## 3. 全量回归结果

### 单元测试

```
$ cd backend-node && npm test
ℹ tests 130
ℹ suites 27
ℹ pass 130
ℹ fail 0
```

构成：基线 70 例（未改动，全绿）+ 新增 60 例
（图片 26 + 视频 24 + 测试连接 10）。

### 端到端集成验证

```
$ node scripts/verify-grok2api-e2e.js
==== 17/17 通过 ====
```

该脚本起一个**模拟 grok2api 的 HTTP 服务**，并按上游真实校验规则拒绝请求
（非 2.0 模型带 `quality` → 400；带 `size` → 400；视频未知字段 → 400；
`image` + `reference_images` 同时出现 → 400；参考图 >7 → 400；参考图模式 duration >10 → 400）。
因此「通过」意味着 LMD 发出的请求**能通过上游的真实校验**，而不只是自洽。

覆盖：测试连接（存在/不存在模型）、文生图、图生图、文生视频、图生视频、
参考图截断、duration 钳制、轮询取 URL。

---

## 4. 与计划文档的偏差（已在契约文档中修正）

实现过程中重新核对 grok2api 源码，发现 `LMD_GROK2API_PLAN.md` 第 1 节有 7 处与源码不符。
**实现以 `docs/grok2api-contract.md` 为准**，其中影响最大的三处：

| # | 计划文档写法 | 源码实际 | 处理 |
|---|---|---|---|
| **A1** | 图片编辑参考图「最多 8 张」 | HTTP 层允许 8，但 **Console 适配器只放行 3**（`console/media.go:31,138`） | 钳制上限取 **3** |
| **A2** | `1792x1024`→16:9、`1536x1024`→16:9 | 实际 **`1792x1024`→`3:2`、`1536x1024`→`3:2`、`1024x1792`→`2:3`、`1024x1536`→`2:3`**（`console/media.go:790-796`） | 按源码映射 |
| **A4** | `grok-imagine-image` 能力 = Image + ImageEdit | **Web 侧只有 Image**，仅 Console 侧有 Edit（`web/catalog.go:28`） | 文档标注：图生图依赖 Console 账号 |

其余 4 处（A3 21:9、A5 image 字段 url/file_id 二选一、A6 output/storage_options 直接 400、
A7 轮询地址免鉴权）详见契约文档附录。

---

## 5. 实现过程中发现并修复的真实缺陷

**E2E 脚本捕获的 URL 拼接缺陷**：当 `endpoint = /v1/images/generations` 而 `base_url`
不含 `/v1` 时，edits 路径退化为 `/images/edits`，丢失版本段导致 **404**。
这正是 `各大平台中转站配置/grok2api.json` 采用的配置形态，即真实使用场景会踩到。

修复：`buildGrok2ApiImageUrl` 改为从配置的 generations endpoint **推导**同前缀的 edits 路径，
并已补回归测试：
```
✔ derives the edits path from the configured generations endpoint (keeps the /v1 prefix)
```

---

## 6. 未覆盖项 / 后续事项

1. **未对真实 grok2api 实例做联调**：验证时本机 `127.0.0.1:8000` 无服务监听，
   且计划文档提到的 Electron 数据库路径 `%APPDATA%\localminidrama-desktop\backend\data\drama_generator.db`
   在本机不存在。因此所有验证均基于「按上游真实校验规则实现的模拟服务」。
   **建议**：grok2api 实例启动后，用 `docs/grok2api-contract.md` §5.2 的 curl 命令做一次真实联调。
2. **`duration` 的实际可用区间未实测**：契约文档记录上游接受 1–15，但各模型/账号档位的
   真实可用值需实测（例如是否只有 6/10 等离散值）。
3. **号池渠道差异未实测**：图生视频与参考图依赖 Console 账号。若实际号池只有 Web 账号，
   这两项会失败并提示「请使用 Build 或 Console」——需按实际号池确认。
4. **TTS 需 Console 账号**，同样未实测。
5. **Electron 打包版未重新打包**：本次改动只在源码模式验证；如需出 exe，
   需在 `desktop/` 执行 `npm run dist`。
6. **`better-sqlite3` 版本未固化**：本机因 Node 24 无 v11 预编译包而临时升到 v12，
   但 `package.json` 仍声明 `^11.6.0`。若团队统一用 Node 20/22，应保持 v11；
   若统一用 Node 24，建议把依赖显式升到 `^12`。
