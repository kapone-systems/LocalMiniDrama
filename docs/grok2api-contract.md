# grok2api 上游契约（固化文档）

> 本文件把 grok2api 的接口契约固化下来，供 LMD 侧适配开发与后续长期二次开发查阅。
>
> **核实基准**：grok2api **v3.1.6** 源码（`project1/grok2api/backend`）。
> 文中每条都带 `file:line`，均为在本仓库源码中实际核对过的结论。
>
> ⚠️ **与 `LMD_GROK2API_PLAN.md` 第 1 节不一致的地方已在文末「附录：与计划文档的偏差」列出**，
> 那些偏差是本文件重新核对源码后发现的，**以本文件为准**。

---

## 1. 定位

grok2api 是**只读的上游契约**——已部署好、账号已导入、API Key 可用，**不要修改**。
所有适配改动都发生在 LMD 侧。

| | LocalMiniDrama | grok2api |
|---|---|---|
| 角色 | 要改的项目 | 上游 API 网关（不改） |
| 技术栈 | Node.js Express + better-sqlite3 + Vue 3 + Element Plus | Go + React |
| 版本 | v1.2.8 | v3.1.6 |

---

## 2. 接口清单

路由注册见 `internal/transport/http/inference/handler.go:88-112`。

```
GET    /v1/models
POST   /v1/responses                    POST   /v1/chat/completions      POST   /v1/messages
POST   /v1/images/generations           POST   /v1/images/edits
POST   /v1/videos/generations           POST   /v1/videos/edits          POST   /v1/videos/extensions
GET    /v1/videos/{requestId}           GET    /v1/videos/{requestId}/content
POST   /v1/tts                          GET    /v1/tts/voices            GET    /v1/tts/voices/{voiceId}
POST   /v1/stt                          GET    /v1/stt
POST   /v1/audio/speech                 POST   /v1/audio/tasks           POST   /v1/audio/transcriptions
GET    /v1/realtime                     POST   /v1/responses/compact
GET    /v1/responses/{responseId}       DELETE /v1/responses/{responseId}
```

**注意**：`/v1/videos` 本身**不存在**（`handler.go:133` 的测试断言了这点），
只有 `/v1/videos/generations`、`/v1/videos/edits`、`/v1/videos/extensions`。

---

## 3. 模型清单（合法 public ID）

### 3.1 文本模型（`console/catalog.go:25-30`）

`grok-4.5`、`grok-4.3`、`grok-4.20-0309-reasoning`、`grok-4.20-0309-non-reasoning`、
`grok-4.20-multi-agent-0309`、`grok-build-0.1`

### 3.2 图片模型

Console（`console/catalog.go:41-49`，能力见 `Capabilities`）：

| public ID | 能力 |
|---|---|
| `grok-imagine-image` | Image + ImageEdit |
| `grok-imagine-image-quality` | Image + ImageEdit |
| `grok-imagine-image-2.0` | Image + ImageEdit |
| `grok-imagine-image-edit` | （仅 Web 侧）ImageEdit |

Web（`web/catalog.go:27-30`）：

| public ID | 能力 | 备注 |
|---|---|---|
| `grok-imagine-image-lite` | Image | 仅 Web |
| `grok-imagine-image` | Image | 仅 Web |
| `grok-imagine-image-2.0` | Image | 仅 Web |
| `grok-imagine-image-edit` | ImageEdit | 仅 Web |

> **关键**：`grok-imagine-image` 在 **Web 侧只有 Image 能力，没有 ImageEdit**（`web/catalog.go:28` 只有
> `CapabilityImage`）。所以「带参考图的图生图」能否成功，**取决于号池里是否有支持 Edit 的账号**
> （Console 的 `grok-imagine-image` 支持 Edit）。
>
> **实测补充（v3.1.6，2026-09-18）**：图片编辑能力按模型分流到不同渠道，可在管理端
> `model_routes` 表看到（`capability='image_edit'`）：
>
> | 模型 | image_edit 路由到的渠道 |
> |---|---|
> | `grok-imagine-image-edit` | **Web**（`Web/grok-imagine-image-edit`） |
> | `grok-imagine-image` | Console（`Console/grok-imagine-image`） |
> | `grok-imagine-image-quality` | Console |
> | `grok-imagine-image-2.0` | Console |
>
> 因此：**号池只有 Web 账号时，图生图应使用 `grok-imagine-image-edit`**；
> 用 `grok-imagine-image` 做图生图则必须有可用的 Console 图片额度，
> 否则报 `503 当前没有可用的上游账号` 或 `429 上游账号额度等待恢复`。
> 详见验收记录 §6.6。

### 3.3 视频模型（`console/catalog.go:44-46`）

`grok-imagine-video`、`grok-imagine-video-1.5`（均仅 Console 能力）

### 3.4 语音模型（`console/catalog.go:47-50`）

`grok-voice-latest`、`grok-voice-think-fast-2.0`、`grok-voice-think-fast-1.0`、`grok-stt`

---

## 4. 图片接口契约

### 4.1 `/v1/images/generations`

请求结构 `imageGenerationRequest`（`handler.go:135-147`）：

```
model           string  必填
prompt          string  必填
n               int     可选，1–10（handler.go:409）
size            string  可选
aspect_ratio    string  可选
resolution      string  可选
quality         string  可选
response_format string  可选
stream          bool    可选
partial_images  int     可选，0–3，且仅 stream=true 时可用
```

**字段处理要点**：

- `quality`：非空时**必须是 `low` 或 `medium`**，否则 400 `invalid_parameter`
  （`handler.go:425-429`）。注意这里只做值域校验；**模型维度的校验在下游**（见 4.3）。
- **不校验未知字段**：`generateImage` 用 `decodeSingleJSON(..., false)`（`handler.go:398`），
  多余的字段**不报错但被忽略**——这是「静默丢图」的根源。
- `storage_options` 非空即 400（`handler.go:403-406`）。

### 4.2 `/v1/images/edits`

请求结构 `imageEditJSONRequest`（`handler.go:154-168`）：在 generations 字段基础上，
把 `image`/`images` 换成编辑输入。

```
image   object  {url, file_id}      可选
images  array   [{url, file_id}]    可选
```

**约束**：

- `image` 与 `images` **合并计算**，总数必须 **1–8**（`handler.go:614`，报错文案
  「image 或 images 数量必须在 1 到 8 之间」）。
- 每个输入**必须提供 `url`**；`file_id` 当前**不支持**（`handler.go:621-623`）。
- `model` 与 `prompt` 均必填（`handler.go:630`）。
- `n` 必须 1–10（`handler.go:633`）。

> ⚠️ **HTTP 层允许 1–8 张，但 Console 适配器只允许 1–3 张**（见 4.3），
> 且 Web 侧同样最多 8 张（`web/image.go:788`）。**LMD 侧应钳制到 3 张**才安全。

### 4.3 图片参数的下游校验（真正的限制在这里）

**Console 适配器**（`console/media.go`）：

| 参数 | 规则 | 位置 |
|---|---|---|
| `aspect_ratio` / `size` | 见下方映射表；不支持则 400 | `media.go:783-799` |
| `resolution` | 仅 `1k` / `2k` | `media.go:758-767` |
| `quality` | **仅 `grok-imagine-image-2.0` 可用**，其他模型传了报错「quality 仅支持 grok-imagine-image-2.0」；值必须是 `low`/`medium` | `media.go:769-781` |
| 编辑图数量 | **1–3 张**（`consoleMaxEditImages = 3`，`media.go:31,138`） | |

**`aspect_ratio` 与 `size` 的映射表**（`console/media.go:783-799`，Console 与 Web 一致）：

| 输入 | 解析为 |
|---|---|
| `1:1`、`16:9`、`9:16`、`4:3`、`3:4`、`3:2`、`2:3`、`2:1`、`1:2` | 原样 |
| `1024x1024` | `1:1` |
| `1280x720` | `16:9` |
| `720x1280` | `9:16` |
| `1792x1024` | **`3:2`** |
| `1536x1024` | **`3:2`** |
| `1024x1792` | **`2:3`** |
| `1024x1536` | **`2:3`** |

> **`aspect_ratio` 优先于 `size`**：`resolveConsoleImageAspectRatio(aspectRatio, size)` 先读
> `aspect_ratio`，为空才读 `size`（`media.go:784-788`）。**发 `aspect_ratio` 更可靠。**

**Web 适配器**（`web/image.go`）：

- `quality` **完全不支持**，传了就报错「Grok Web 图片模型不支持 quality」（`web/image.go:789-791`）。
- `resolveImageAspectRatio`（`web/image.go:1789-1806`）支持的比例比 Console 多：
  额外支持 `auto`、`19.5:9`、`9:19.5`、`20:9`、`9:20`。

**结论**：图片侧**只发 `aspect_ratio`，不发 `size`、不发 `quality`** 是最安全且跨渠道通用的做法。

### 4.4 图片编辑的 size 白名单（HTTP 层）

`validImageEditSize`（`handler.go:1080-1086`）只接受：
`auto`、`1024x1024`、`1024x1536`、`1536x1024`。

> 这是 HTTP 层的辅助校验函数；主路径用的是 4.3 的 `resolveConsoleImageAspectRatio`。
> 为规避两条路径的差异，**编辑请求同样应只发 `aspect_ratio`**。

---

## 5. 视频接口契约

### 5.1 提交 `POST /v1/videos/generations`

请求结构 `videoGenerationRequest`（`handler.go:179-192`）：

```
model             string   必填
prompt            string
user              string
duration          int|string  可选，1–15（缺省 8）
aspect_ratio      string   可选，白名单见下
resolution        string   可选
image             object   {url} 或 {file_id}   ← 首帧（i2v）
reference_images  array    [{url}...]           ← 参考图
reference_audios  array    [{url}...]
video             object   {url} 或 {file_id}
output            object   非空即 400（不支持 output.upload_url）
storage_options   object   非空即 400
```

**关键约束**：

1. **校验未知字段**：`decodeSingleJSON(..., true)`（`handler.go:729`），
   多传字段会直接 400（`DisallowUnknownFields`）。
2. **`image` 与 `reference_images` 互斥**：同时提供报错
   「image 不能与 reference_images/reference_audios 同时使用」（`handler.go:824`）。
3. **`image` 必须且只能提供 `url` 或 `file_id` 之一**（`handler.go:751-753`）；
   两者都给或都不给都会 400（`handler.go:751`）。
4. **`reference_images` 上限 8**（`mediadomain.MaxInputImages = 8`，`handler.go:828`）。
5. **`duration` 必须是整数或整数字符串**，范围 1–15（`handler.go:1015-1030`）。
6. `aspect_ratio` 白名单（`handler.go:1053-1059`）：`1:1`、`16:9`、`9:16`、`4:3`、`3:4`、`3:2`、`2:3`。
   **视频不支持 `21:9`、`19.5:9` 等**。

**提交响应**：`{"request_id": "<job id>"}`（`handler.go:919`）。

### 5.2 轮询 `GET /v1/videos/{requestId}`

响应由 `videoGenerationResponse`（`handler.go:1087-1112`）生成：

```jsonc
// 进行中
{ "status": "pending", "model": "...", "progress": 0..99 }

// 完成
{ "status": "done", "model": "...", "progress": 100,
  "video": { "url": "<公网可直链的播放地址>", "respect_moderation": true, "duration": <秒，可选> } }

// 失败
{ "status": "failed", "error": { "code": "...", "message": "..." } }
```

**视频地址取 `video.url`**。它优先返回公开媒体路由
`/v1/media/videos/{assetId}`（`handler.go:955-960`）——该地址**不需要 API Key 即可在浏览器/播放器打开**；
只有当任务没有落盘 asset 时才回退到需要鉴权的 `/v1/videos/{id}/content`。

### 5.3 视频参数的硬约束（`gateway/video.go:236-268`）

常量定义在 `infra/provider/provider.go:547-550`：

```go
ConsoleVideoMaxReferenceImages          = 7
ConsoleVideoMaxReferenceDurationSeconds = 10
```

| 约束 | 条件 | 位置 |
|---|---|---|
| Web 渠道**不支持图生视频** | provider=Web 且带 `image` 或 `reference_images` | `video.go:242-244` |
| 参考图 ≤ **7 张** | Console + `grok-imagine-video` 或 `-1.5` | `video.go:248-250` |
| 参考图模式下 duration ≤ **10s** | **仅** `grok-imagine-video` + 有参考图 | `video.go:253-256` |
| `1080p` 仅 `grok-imagine-video-1.5` 支持 | 其他模型报错 | `video.go:259-262` |
| 参考图模式最高 **720p** | 有参考图时 1080p 报错 | `video.go:263-265` |

> 注意 `grok-imagine-video-1.5` + 参考图**没有** 10s 限制，但同样受 7 张与 720p 限制。
> 走 `image`（首帧）的图生视频**保持 15s 上限**，不受 10s 约束。

### 5.4 视频编辑 / 延长

- `/v1/videos/edits`、`/v1/videos/extensions` **只支持 `grok-imagine-video`**，不支持 1.5（`console/media.go:467`）。
- 这两个操作**不接受** `image`/`reference_images`/`reference_audios`（`handler.go:864-866`）。

---

## 6. 文本 / TTS / STT

### 6.1 文本

`/v1/chat/completions` 存在且兼容 OpenAI 形态（`handler.go:91`）。
模型名用 3.1 的文本模型 ID（如 `grok-4.5`）。

### 6.2 TTS

- `/v1/audio/speech` 是 OpenAI 兼容别名（`handler.go:104`），LMD 的 TTS 走的正是这个。
- OpenAI 风格 voice 会自动映射，例如 `alloy` → `ara`（`openai_audio_handler.go:165`，测试见 `openai_audio_handler_test.go:126`）。
- 模型名用 `grok-voice-latest` 等（3.4）。
- **TTS 需要 Console 账号**。

---

## 7. 图片输入格式

**data URL 被全面支持**：

- 图片编辑：`validConsoleMediaInputURL` 接受 `data:image/...;base64,...`（`console/media.go:801-808`）。
- 视频首帧/参考图同理（`console/media.go:801-808` 的同一函数）。

所以 **LMD 把本地图转 base64 的做法是可行的，不用改**。

---

## 8. 给 LMD 侧的实现结论（速查）

| 项 | 结论 |
|---|---|
| 图片 size | **不发 `size`，改发 `aspect_ratio`**（只发比例，跨 Web/Console 通用） |
| 图片 quality | **默认不发**；仅当模型是 `grok-imagine-image-2.0` 且用户显式要求时才发 `low`/`medium` |
| 图片 resolution | 可选，仅 `1k`/`2k`（Console）；Web 不支持，**默认不发** |
| 有参考图的图生图 | 走 **`/v1/images/edits`**，字段 `images: [{url}...]` |
| 图片编辑参考图上限 | **钳制到 3 张**（Console 适配器限制，比 HTTP 层的 8 更严） |
| 视频提交 | `POST /v1/videos/generations` |
| 视频轮询 | `GET /v1/videos/{requestId}`，读 `status` + `video.url` |
| 视频首帧 | `image: {url}` |
| 视频参考图 | `reference_images: [{url}...]`，**与 `image` 互斥** |
| 视频参考图上限 | **7 张** |
| 视频 duration | 1–15；`grok-imagine-video` + 参考图时 **≤10** |
| 视频 resolution | 1080p 仅 `-1.5`；参考图模式 ≤720p |
| 视频 aspect_ratio | 不支持 `21:9`，需回退 |

---

## 附录：与计划文档的偏差

以下是我在本仓库源码中**重新核对**后发现的、与 `LMD_GROK2API_PLAN.md` 第 1 节不一致之处。
**以本文件为准。**

| # | 计划文档的写法 | 源码实际 | 影响 |
|---|---|---|---|
| **A1** | 图片编辑参考图「最多 8 张」（`handler.go:614`） | HTTP 层确实允许 1–8，但 **Console 适配器只允许 1–3**（`console/media.go:31,138`），Web 侧 8（`web/image.go:788`） | 钳制上限应取 **3** 而非 8，否则 Console 号池下必然失败 |
| **A2** | size 白名单写 `1792x1024` → 16:9、`1536x1024` → 16:9 等 | 实际 **`1792x1024`→`3:2`、`1536x1024`→`3:2`、`1024x1792`→`2:3`、`1024x1536`→`2:3`**（`console/media.go:790-796`） | 按文档映射会得到错误画幅 |
| **A3** | 视频 aspect_ratio 支持 `21:9` 回退到 16:9（决策 4 表） | 视频白名单**根本不含 21:9**（`handler.go:1053-1059`）；图片侧 Web 支持 `19.5:9`/`20:9`，Console 不支持 | 21:9 需映射到 16:9，且图片/视频白名单不同 |
| **A4** | 「`grok-imagine-image` 能力 = Image + ImageEdit」 | **Web 侧的 `grok-imagine-image` 只有 Image**（`web/catalog.go:28`）；只有 Console 侧才有 Edit | 带参考图的图生图依赖 Console 账号，Web-only 号池会失败 |
| **A5** | 未提及 | **`image` 字段必须且只能有 `url` 或 `file_id` 之一**（`handler.go:751-753`）；`file_id` 在图片编辑中不支持 | 构造首帧对象时不要同时带两个字段 |
| **A6** | 未提及 | 视频接口对 `output`/`storage_options` 非空**直接 400**（`handler.go:733-740`） | 不要透传这些字段 |
| **A7** | 未提及 | 轮询完成时视频地址取 `video.url`，优先是**免鉴权**的 `/v1/media/videos/{assetId}` | LMD 可直接下载该 URL，无需额外鉴权处理 |

> **A1–A7 均已对真实 grok2api v3.1.6 实例实测验证**（2026-09-18）。
> 其中 A2（`size` 被拒）、A4（Web 无 Edit 能力）、A5（互斥）、A6（未知字段 400）、
> A7（直链免鉴权）拿到了真实上游的响应作为证据；
> 详细过程与原始响应见 `docs/grok2api-acceptance.md` §6。

---

## 维护说明

- 本文件描述的是 **grok2api v3.1.6** 的契约。上游升级后需重新核对并更新本文件。
- 核对方法：在 `project1/grok2api/backend` 下用 `file:line` 定位对应源码。
- LMD 侧的适配实现在 `backend-node/src/services/imageClient.js`（`callGrok2ApiImage`）
  与 `backend-node/src/services/videoClient.js`（`callGrok2ApiVideo`），
  回归测试在 `backend-node/test/grok2ApiImage.test.js` 与 `grok2ApiVideo.test.js`。
