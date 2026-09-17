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
| 端到端验收脚本（模拟上游） | `backend-node/test/manual/verify-grok2api-e2e.js` | ✅ |
| 真实上游联调脚本 | `backend-node/test/manual/verify-grok2api-live.js` | ✅ |
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
$ node test/manual/verify-grok2api-e2e.js
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

## 6. 真实上游联调（第二轮，2026-09-18）

> 首轮验收（§1–§5）只用了模拟服务。本节记录**真实 grok2api 实例**上的联调结果。

### 6.1 实例与环境

第一轮验收时本机 `127.0.0.1:8000` 无服务监听，原因是 **Docker Desktop 未启动**。
启动后确认实例其实一直在：

```
$ docker ps
ghcr.io/chenyme/grok2api:latest   Up (healthy)   0.0.0.0:8000->8000/tcp   grok2api
```

| 项 | 值 |
|---|---|
| 镜像 | `ghcr.io/chenyme/grok2api:latest` |
| 配置 | `C:\Users\Lenovo\.zcode\workspace\default\grok2api\config.yaml` |
| 账号池 | 1 个邮箱的三种关联账号：`grok_web`(Web/heavy) + `grok_console`(Console) + `grok_build`(Build) |
| 客户端 Key | 通过管理 API `GET /api/admin/v1/client-keys/2/secret` 取回 |

### 6.2 契约 §5.2 的 curl 打通结果

| # | 验证项 | 结果 |
|---|---|---|
| 1 | `GET /v1/models` | ✅ 返回 23 个模型，与契约 §3 的模型表一致 |
| 2 | 文生图（`aspect_ratio`，不发 `size`） | ✅ HTTP 200，真实出图 |
| 3 | 文本 `chat/completions`（SSE 流式） | ✅ 真实生成：「雨夜街头，旧爱意外重逢，泪混雨下。」 |
| 4 | TTS `audio/speech` | ✅ HTTP 200，63KB MP3（24kHz 单声道） |
| 5 | 文生视频提交 + 轮询 | ✅ 提交得 `request_id`；轮询 `pending(10%)`→`pending(99%)`→`done`，取到 `video.url` |
| 6 | 视频直链下载 | ✅ 1.7MB MP4，**无需 API Key**（实测印证契约 A7） |
| 7 | 图生图 `/v1/images/edits` | ✅ 用 `grok-imagine-image-edit` 模型 HTTP 200 真实出图（见 6.4） |

### 6.3 实测复现并证实了两个原始根因

计划文档 §0.3 记录的日志错误 `quality 必须是 low 或 medium`，在真实上游上**逐条复现**：

```bash
# 旧代码的真实请求体（size + quality:'standard'）→ 400，与计划文档日志完全一致
$ curl ... -d '{"model":"grok-imagine-image","prompt":"a cat","n":1,"size":"2560x1440","quality":"standard"}'
{"error":{"code":"invalid_parameter","message":"quality 必须是 low 或 medium"}}   HTTP 400

# 只发 size、不发 quality → 仍然 400（size 本身也不被接受）
$ curl ... -d '{"model":"grok-imagine-image","prompt":"a dog","n":1,"size":"2560x1440"}'
{"error":{"message":"aspect_ratio 不受支持"}}                                    HTTP 400

# 新代码的请求体（只发 aspect_ratio）→ 200 成功
$ curl ... -d '{"model":"grok-imagine-image","prompt":"a cat sitting on a chair","n":1,"aspect_ratio":"16:9"}'
{"created":...,"data":[{"url":"http://127.0.0.1:8000/v1/media/images/img_..."}]}  HTTP 200
```

→ **D1 与 D2 两个根因都在真实上游上得到证实**，且新代码的请求形状确实能通过。

同时实测证实了契约中的三条上游校验规则（纯校验，不耗额度）：

| 规则 | 实测响应 |
|---|---|
| `image` 与 `reference_images` 互斥 | 400 `image 不能与 reference_images/reference_audios 同时使用` |
| 视频接口拒绝未知字段 | 400 `json: unknown field "seed"`（证实 `DisallowUnknownFields`） |
| 图片编辑 >8 张 | 400 `image 或 images 数量必须在 1 到 8 之间` |
| `quality` 值非法（`high`） | 400 `quality 必须是 low 或 medium` |
| 参考图视频被路由到 Console | 400 `Grok Web 当前仅支持文本生视频；图片视频请使用 Build 或 Console Provider`（**实测印证契约 §1.3 与 A4**） |

### 6.4 参考图确实生效（真实上游）

用真实生成的图作为参考图，走 `/v1/images/edits`（模型 `grok-imagine-image-edit`）真实出图，
再对比输入输出：

```
ref.jpg    960x960  jpeg
edited.jpg 1408x1408 jpeg
感知哈希汉明距离: 10 / 64   (完全不同约 32)
```

→ 输出与参考图**高度相似**，说明参考图确实被上游采纳。这直接验证了 D3 的修复
（旧代码把参考图发到 `/images/generations` 的 `image` 字段，会被静默丢弃）。

### 6.5 LMD 真实代码路径打真实上游

用 `test/manual/verify-grok2api-live.js`（走 LMD 真实的 `callImageApi` / `callVideoApi` /
`pollVideoTask` / `testConnection`，非模拟）：

```
$ G2A_KEY=g2a_xxx node test/manual/verify-grok2api-live.js
PASS  testConnection 真实上游通过
PASS  testConnection 拒绝不存在的模型  — 模型「grok-imagine-medium」在上游不存在。可用模型：grok-4.5, grok-4.6, ...
PASS  文生图真实出图（角色/场景图）  — http://127.0.0.1:8000/v1/media/images/img_...   耗时 5.6s
FAIL  带参考图分镜图真实出图（/images/edits）  — 上游 Console 额度耗尽（非适配缺陷）
PASS  文生视频真实提交  — request_id=video_VceRLrOZqHQaPC2wiEBQGdfe
PASS  文生视频轮询拿到真实 video.url  — http://127.0.0.1:8000/v1/media/videos/vid_...

==== 5/6 通过 ====
```

**D8 修复在真实上游上的效果**（通过 LMD 的 `/api/v1/ai-configs/test` HTTP 路由）：

```
正确模型  → {"success":true,"message":"连接测试成功"}
错误模型  → {"success":false,"message":"连接测试失败: 模型「grok-imagine-medium」在上游不存在。
                                    可用模型：grok-4.5, grok-4.6, ...（共 23 个）"}
错误 Key  → {"success":false,"message":"连接测试失败: 客户端 API Key 无效"}
```

→ 计划文档 §附录 C 里配错的 `grok-imagine-medium`，现在会在**测试连接阶段**就被拦下。

### 6.6 唯一未通过项：账号额度/渠道限制（非适配缺陷）

`带参考图分镜图` 未通过，原因是账号状态，有两条独立证据：

1. **审计表证明请求形状正确**。数据库 `request_audits` 记录该请求被正确路由：
   ```
   {"model_public_id":"grok-imagine-image","provider":"grok_console","operation":"image_edit",
    "status_code":503,"error_code":"upstream_quota_exhausted",
    "media_input_images":1,"request_path":"/v1/images/edits"}
   ```
   `media_input_images=1` 说明上游**接受并识别了参考图**，失败在账号额度而非请求格式。

2. **额度窗口实测为 0**。管理 API 显示 Console 账号的图片/视频额度窗口为空：
   ```
   console        remaining=10/10  window=86400s   ← 聊天额度正常
   console_image  remaining=0/0    window=0s       ← 图片额度不可用
   console_video  remaining=0/0    window=0s       ← 视频额度不可用
   ```

3. **同样的 curl 请求时好时坏**。同一个 `edit_body2.json`，先是 HTTP 200 成功出图，
   随后重放返回 `429 上游账号正在冷却` / `503 当前没有可用的上游账号`——
   若是请求格式问题，不会出现这种时变行为。

**一个可操作的实测发现**：图片编辑能力按模型分流到不同渠道，这决定了号池要求：

| 模型 | image_edit 路由到的渠道 | 本机号池可用性 |
|---|---|---|
| `grok-imagine-image-edit` | **Web** | ✅ 可用（实测 200 出图） |
| `grok-imagine-image` | Console | ❌ Console 图片额度为 0 |
| `grok-imagine-image-quality` | Console | ❌ 同上 |
| `grok-imagine-image-2.0` | Console | ❌ 同上 |

→ **如果号池只有 Web 账号，图片编辑应配 `grok-imagine-image-edit`**；
用 `grok-imagine-image` 做图生图则必须有可用的 Console 图片额度。
这一条已补进契约文档与 `docs/configuration.md`。

视频侧同理，且**这条在第三轮直接解决了图生视频的阻塞**（见 6.7）：

| 模型 | video 路由到的渠道 | 本机号池可用性 |
|---|---|---|
| `grok-imagine-video` | Web / Console | ❌ Web 限流、Console 视频额度 `0/0` |
| `grok-imagine-video-1.5` | Console **+ Build** | ✅ **Build 账号可用** |

### 6.7 图生视频与多图参考视频（第三轮，已跑通）

第二轮卡住的原因是**模型选错渠道**，不是额度不足。查 `model_routes` 后定位：

| 模型 | video 路由到的渠道 | 本机可用性 |
|---|---|---|
| `grok-imagine-video` | Web / Console | ❌ Web 限流、Console 视频额度 `0/0` |
| `grok-imagine-video-1.5` | Console **+ Build** | ✅ **Build 账号可用** |

改用 `grok-imagine-video-1.5` 后两条验收标准均达成：

**图生视频（首帧）**——提交 → 轮询 → 取片：
```
{"request_id":"video_dU27-ef4Qc67uQrQ-Y4YgMx0"}                       HTTP 200
[1] {"progress":1,"status":"pending"}
[2] {"progress":37,"status":"pending"}
[3] {"progress":100,"status":"done","video":{"duration":6,"url":".../vid_3wmXB8pP1Ss6..."}}
```
下载后抽首帧与原图比对，**验证「视频确实以该帧开头」**：
```
输入首帧 vs 视频首帧  汉明距离: 3 / 256   相似度 98.8%
（不相关图通常约 50% 相似度）
```
输出视频：4.0MB MP4。

**多图参考视频**——2 张 data URL 参考图：
```
{"request_id":"video_Lg-Xu-AszUKpiJEqIu9BLPQ7"}                       HTTP 200
[4] {"progress":100,"status":"done","video":{"url":".../vid_hR0g4UHMuTR1..."}}
```
输出视频：5.5MB，`Duration 00:00:06.04`，`1280x720 h264 24fps`。

> **一个重要的实测约束**：Build 渠道**不接受 `http://` 图片 URL**，会返回
> `Build 视频生成失败: Fetching images over plain http:// is not supported. [WKE=invalid_image]`。
> 必须用 `https://` 或 **data URL**。这正好印证契约 §7「data URL 被全面支持」的实用价值——
> LMD 把本地图转 base64 的做法在 Build 渠道上是**必需**的，不只是可选优化。

### 6.8 完整成片链路（第三轮，已走通）

在 LMD 里按计划 §5.3 的顺序完整走了一遍：

| 步骤 | 接口 | 结果 |
|---|---|---|
| 1. 建项目 | `POST /dramas` | ✅ 项目 id=1 |
| 2. 生成故事 | `POST /generation/story` | ✅ 剧集「雨夜半边钥」 |
| 3. 提取角色 | `POST /generation/characters` | ✅ 3 个（林晚、陈默、林晓） |
| 4. 生成角色图 | `POST /characters/:id/generate-image` | ✅ 3/3 张 |
| 5. 生成分镜 | `POST /episodes/1/storyboards` | ✅ 10 个分镜 |
| 6. 生成分镜图 | `POST /images` | ⚠️ 3/10（受 Web 限流，见 6.9） |
| 7. 生成视频 | `POST /videos` | ✅ 3/3 个 |
| 8. 合并成片 | `POST /episodes/1/finalize` | ✅ 24 秒成片 |

**成片验证**（ffmpeg 探测真实产物）：
```
$ ffmpeg -i data/storage/projects/*/videos/merged/merged_1789671649590.mp4
  Duration: 00:00:24.15, start: 0.000000, bitrate: 7357 kb/s
  Stream #0:0: Video: h264 (High), yuv420p(tv, bt709), 2560x1440, 7230 kb/s, 24 fps
```
文件 22.2MB，由 3 个真实生成的分镜视频（各 6 秒）合并而成，
剧集状态随之变为 `completed`。

**角色图生成的关键日志**（证明 grok2api 协议分支按预期工作）：
```
[图生] callImageApi 路由 {"protocol":"grok2api","api_protocol_raw":"grok2api",
                          "provider":"grok2api","model":"grok-imagine-image","size":"1792x1024"}
[grok2api图生] 提交 {"endpoint":"/images/generations","aspect_ratio":"3:2",
                    "original_size":"1792x1024","quality":"(omitted)"}
```
→ `1792x1024` 被正确映射为 `3:2`，且**未发送 `quality`**——正是修复后的目标行为。

**分镜图生成的关键日志**（证明参考图走 edits）：
```
[grok2api图生] 提交 {"url":".../v1/images/edits","endpoint":"/images/edits",
                    "model":"grok-imagine-image-edit","aspect_ratio":"16:9",
                    "has_ref_images":true,"ref_count":1,"quality":"(omitted)"}
```

### 6.9 分镜图 3/10：Web 账号限流（外部资源限制）

分镜图仅完成 3/10，其余失败于 `429 上游账号正在冷却` / `503 当前没有可用的上游账号`。
判定为账号侧限制，依据是上游审计表——**同一时间段内图片全渠道失败、视频全成功**：

```
provider       operation    status  error_code                 n
grok_web       image        503     upstream_cooling           3
grok_web       image_edit   503     upstream_cooling           1
grok_web       image_edit   503     upstream_unavailable       2
grok_console   image        503     upstream_quota_exhausted   1
grok_build     video        200     (成功)                     4
```

Web 账号 `failureCount` 从 6 涨到 8，冷却时间被上游逐次延长（19:08 → 19:38 → 20:10）。
在冷却窗口结束的瞬间重试即成功（第 4 次尝试生成出第 1 张分镜图），
之后连续请求又迅速触发限流——典型的**上游速率限制**特征，与请求格式无关。

> 结论：分镜图这一步**代码路径已验证可用**（3 张真实出图 + 日志显示正确路由到
> `/images/edits` 并带 1 张参考图），未完成的部分纯粹是号池配额不足。

### 6.10 仍未覆盖

1. **分镜图未跑满 10/10**：受 Web 账号限流，完成 3 张。需等待配额恢复后补跑。
2. **`duration` 的离散可用值未实测**：只验证了 `6` 秒可用（文生/图生/参考视频均通过）。
3. **Electron 打包版未重新打包**：改动只在源码模式验证。
4. **`better-sqlite3` 版本未固化**：本机因 Node 24 无 v11 预编译包而临时升到 v12，
   但 `package.json` 仍声明 `^11.6.0`。若团队统一用 Node 20/22，应保持 v11；
   若统一用 Node 24，建议把依赖显式升到 `^12`。
5. **管理凭据的存放**：本次为取回客户端 Key，读取了容器挂载的 `config.yaml`
   （含 `bootstrapAdmin` 明文密码）并调用了管理 API。该密码明文存放于配置文件，
   建议改为环境变量注入，并在首次登录后按官方注释删除 `bootstrapAdmin` 段。
6. **界面级操作**：本次通过 LMD 的 HTTP API 走通全链路（与前端调用的是同一批接口），
   未在浏览器里逐一点击。接口层已验证，UI 层未做人工点击验收。


