# AI 配置指南

**导航：[项目主页](../README.md) | [快速开始](quickstart.md) | [English](en.md)**

---

## 目录

- [配置入口](#配置入口)
- [三类模型配置](#三类模型配置)
- [阿里云 DashScope（通义）](#阿里云-dashscope通义)
  - [申请 API Key](#申请-api-key)
  - [可用模型](#可用模型)
  - [配置示例](#配置示例)
- [火山引擎 Volcengine（豆包）](#火山引擎-volcengine豆包)
  - [申请 API Key](#申请-api-key-1)
  - [可用模型](#可用模型-1)
  - [配置示例](#配置示例-1)
- [本地部署模型（Ollama 等）](#本地部署模型ollama-等)
- [本地 ComfyUI](#本地-comfyui)
- [其他 OpenAI 兼容接口](#其他-openai-兼容接口)
- [一键配置功能](#一键配置功能)
- [连接测试](#连接测试)
- [常见问题](#常见问题)

---

## 配置入口

点击软件右上角 **「AI 配置」** 按钮，进入 AI 服务管理页面。

页面分为三个 Tab：
- **文本生成** — 用于生成剧本、分镜脚本、提示词等
- **图片生成** — 用于生成角色图、场景图、分镜图
- **视频生成** — 用于生成分镜视频片段

每类模型可独立配置不同的服务商和模型，互不影响。

---

## 三类模型配置

| 类型 | 用途 | 推荐服务商 |
|------|------|----------|
| 文本生成 | 剧本生成、角色提取、分镜脚本、提示词优化 | 通义 Qwen、豆包 Pro |
| 图片生成 | 角色形象图、场景背景图、分镜静帧图 | 通义万象、豆包图片 |
| 视频生成 | 分镜视频片段 | 豆包 Seedance（经典单链路或 **Seedance 2.0 多图 / 全能模式**） |

---

## 阿里云 DashScope（通义）

### 申请 API Key

1. 访问 [阿里云百炼控制台](https://bailian.console.aliyun.com/)
2. 注册/登录阿里云账号
3. 进入「模型广场」，开通你需要的模型（文本类、图片类等）
4. 左侧菜单点击「API-KEY 管理」，创建新的 API Key
5. 复制 API Key（以 `sk-` 开头）

> 新用户通常有免费额度，建议先用免费额度测试。

### 可用模型

**文本生成：**
| 模型名 | 说明 |
|--------|------|
| `qwen-turbo` | 速度快、成本低，适合批量生成 |
| `qwen-plus` | 性能均衡，推荐日常使用 |
| `qwen-max` | 最强文本能力，适合剧本生成 |
| `qwen-long` | 超长上下文，适合长剧本 |

**图片生成：**
| 模型名 | 说明 |
|--------|------|
| `wanx2.1-t2i-turbo` | 速度快，通用图片生成 |
| `wanx2.1-t2i-plus` | 更高质量 |
| `wanx-v1` | 经典版本 |

**视频生成：**
| 模型名 | 说明 |
|--------|------|
| `wan2.1-t2v-turbo` | 文字转视频，速度较快 |
| `wan2.1-t2v-plus` | 更高质量 |

### 配置示例

在「AI 配置」页面新增配置：

```
服务商：DashScope
Base URL：https://dashscope.aliyuncs.com/compatible-mode/v1
API Key：sk-xxxxxxxxxxxxxxxx
模型：qwen-plus（文本）/ wanx2.1-t2i-turbo（图片）/ wan2.1-t2v-turbo（视频）
```

---

## 火山引擎 Volcengine（豆包）

### 申请 API Key

1. 访问 [火山方舟控制台](https://console.volcengine.com/ark)
2. 注册/登录火山引擎账号
3. 进入「模型广场」，开通所需模型（文本/图片/视频）
4. 左侧点击「API Key 管理」，创建 API Key
5. 复制 API Key

> 💡 视频生成（Seedance）需要单独开通，且按生成时长计费，注意控制用量。

### 可用模型

**文本生成：**
| 模型名 | API 端点 ID | 说明 |
|--------|------------|------|
| `Doubao-pro-32k` | `doubao-pro-32k-241215` | 通用高性能模型 |
| `Doubao-lite-32k` | `doubao-lite-32k-241215` | 低成本模型 |
| `Doubao-pro-128k` | `doubao-pro-128k-241215` | 超长上下文 |

**图片生成：**
| 模型名 | API 端点 ID | 说明 |
|--------|------------|------|
| `Doubao-seedream-4.5` | `doubao-seedream-4-5-251128` | 高质量图片生成 |

**视频生成：**
| 模型名 | API 端点 ID | 说明 |
|--------|------------|------|
| `Doubao-Seedance-1.0-pro-fast` | `doubao-seedance-1-0-pro-250528` | 较快速度 |
| `Doubao-Seedance-1.5-pro` | `doubao-seedance-1-5-pro-251215` | 高质量版 |
| `Doubao-Seedance-2.0-pro` | `doubao-seedance-2-0-260128` | **Seedance 2.0**，方舟多参考图；配合接口规范 **`volcengine_omni`** 与分镜**全能模式** |
| `Doubao-Seedance-2.0-fast` | `doubao-seedance-2-0-fast-260128` | Seedance 2.0 快速版 |

> ⚠️ 配置中填写模型名时，系统会自动映射到正确的 API 端点 ID，两种写法均可。

**分镜「全能模式」与接口规范（v1.2.5+，v1.2.7 增强校验）：**

- 制作页单个分镜可切换为 **「全能模式」**：中间编辑区为**片段描述**，可用 **`@图片1`、`@图片2`…** 对应参考图顺序（一般为场景 → 角色 → 物品；不含经典分镜中间主图；`@图片N` 后建议加**半角空格**）。若该框有内容，生视频时**只发送这段文本**，不会拼接下方结构化「视频提示词」。
- 在 **AI 配置 → 视频生成** 中，将 **接口规范** 选为 **`volcengine_omni`**（火山即梦 Seedance 2.0 等多图参考）或 **`kling_omni`**（可灵 Omni）。Seedance **2.x** 单段时长由后端吸附到 **4–15 秒**；方舟多图侧最多 **9** 张参考图。
- **v1.2.7**：单条生视频前会检测配置是否匹配（`kling_omni`，或 `volcengine_omni` + Seedance 2.x 模型名）；不匹配时弹窗说明，可选强制继续（降级为场景图 / 分镜主图参考）。**经典模式**无分镜参考图时会提示先生成分镜图，不提供纯文案强行生成。
- 亦可使用 **可灵 Omni** 走同一套全能分镜工作流，详见 AI 配置页内嵌说明。

### 配置示例

```
服务商：Volcengine
Base URL：https://ark.cn-beijing.volces.com/api/v3
API Key：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
模型：Doubao-pro-32k（文本）/ Doubao-seedream-4.5（图片）/ Doubao-Seedance-1.0-pro-fast（视频）
```

**视频生成参数（可选）：**
| 参数 | 说明 | 默认值 |
|------|------|--------|
| 分辨率 | `720p` / `1080p` / `480p` | `720p` |
| 视频时长 | 每段分镜的视频秒数（4 / 5 / 8 / 10s） | `5` |
| seed | 随机种子，固定可复现结果 | 随机 |
| camera_fixed | 是否固定摄像机 | `false` |
| watermark | 是否添加水印 | `false` |

---

## 本地部署模型（Ollama 等）

如果你在本机或内网部署了兼容 OpenAI 接口的模型服务（如 Ollama、LM Studio、vLLM 等）：

```
服务商：自定义 / OpenAI 兼容
Base URL：http://localhost:11434/v1   （Ollama 示例）
API Key：ollama   （或任意字符串，本地服务通常不验证）
模型：qwen2.5:7b   （你下载的模型名）
```

> ⚠️ 本地 **文本** 模型（Ollama 等）仅适用于剧本生成。图片和视频请用云端 API，或下面的 **本地 ComfyUI**。

---

## 本地 ComfyUI

把本机 [ComfyUI](https://github.com/comfyanonymous/ComfyUI) 当作角色图 / 场景图 / 分镜图 / 分镜视频后端。本项目 **不启动** Python 进程，请先自己开 Comfy：

```
python main.py --listen
```

默认地址 `http://127.0.0.1:8188`。AI 配置里选协议 **本地 ComfyUI**，API Key 可留空，点「测试连接」应打到 `/system_stats`。

### 工作流必须是 API 格式

在 ComfyUI 菜单用 **Save (API Format)** 导出 JSON（节点 id → `{ class_type, inputs, _meta.title }`）。  
带 `nodes` / `links` 的默认工作流文件会被拒绝。

**模型名 = 工作流文件名（不含 `.json`）**，不是 checkpoint 名。例如文件 `comfy-workflows/character-t2i.json`，配置里模型填 `character-t2i`。

仓库示例：`docs/comfyui/example-t2i-api.json`。复制到 storage 下：

```
{storage.local_path}/comfy-workflows/character-t2i.json
```

然后把里面的 `PUT_YOUR_CHECKPOINT_HERE.safetensors` 改成你本机已有的权重。也可在 AI 配置页点「导入工作流」。

建议分三条配置、三份图：

| 服务类型 | 推荐模型名 | 工作流要点 |
|---|---|---|
| 图片（角色/场景/道具） | `character-t2i` | 文生图，标题含 Positive / Negative |
| 分镜图 | `storyboard-i2i` | 多个 `LoadImage`，标题 `Reference Image 1`… |
| 视频 | `storyboard-i2v` | `First Frame` + `Duration`，history 里要有 videos/gifs |

### 节点标题约定

大小写不敏感，子串匹配 `_meta.title`：

| 标题包含 | 写入 |
|---|---|
| Positive | 正向提示词 |
| Negative | 负向提示词 |
| Width / Height | 宽高；没有标题时写入 EmptyLatentImage |
| Reference Image 1 / 2 | 上传后的参考图文件名 |
| First Frame / Last Frame | 视频首尾帧 |
| Duration / FPS | 秒 / 帧率（默认 24） |

找不到 Positive 且 settings.mapping 也没指定节点 → **直接失败**，不会静默用图里写死的提示词。

可选 `settings.mapping` 按工作流名覆盖节点 id：

```json
{
  "timeout_seconds": 1800,
  "mapping": {
    "character-t2i": {
      "positive": { "node": "6", "input": "text" },
      "negative": { "node": "7", "input": "text" }
    }
  }
}
```

### 常见失败

| 现象 | 原因 |
|---|---|
| 测试连接失败，含 8188 或 ECONNREFUSED | Comfy 没开，或没 `--listen` |
| 请使用 Save (API Format) | 导入了 UI 格式 JSON |
| 工作流未找到 Positive 节点 | 没改 CLIPTextEncode 标题，也没写 mapping |
| 找不到工作流「xxx」 | 模型名填成了 checkpoint；错误信息会列出目录里已有的 json |
| 节点 (CheckpointLoaderSimple): ckpt_name | 工作流里的权重文件本机没有 |
| 任务一直转圈后超时 | Comfy 卡住或超时过短；settings.timeout_seconds 默认图 1800s、视频 3600s |

同一 Comfy 地址上本协议会 **串行** 提交（日志：`comfyui 协议已串行化`），画布并发数对它不生效，避免叠两层队列打爆显存。

一键包：预设画廊「本地 ComfyUI」，或导入 `各大平台中转站配置/comfyui.json`。

---

## 其他 OpenAI 兼容接口

任何支持 OpenAI Chat Completions 协议的接口均可接入：

```
Base URL：https://your-api-endpoint/v1
API Key：your-api-key
模型：your-model-name
```

常见兼容服务商：DeepSeek、硅基流动（SiliconFlow）、Groq、OpenRouter 等。

---

## 协议与预设（v1.3.0）

AI 配置页用「预设画廊」一次创建全套，不必手填协议。

| 分组 | 怎么用 |
|---|---|
| 官方直连 | 火山 / Agnes / 通义：填官方 Key |
| 中转 / 聚合 | APIMart、硅基流动、OpenRouter，以及 302 / 飞儿 / 云雾 等 JSON 包 |
| 自建网关 | grok2api：填本机 Base URL + Key；本地 ComfyUI：直连 8188，Key 可空 |

图/视频不要再用「OpenAI 兼容」去套异步中转。APIMart 必须选 **APIMart 任务中心**（`apimart`），轮询 `GET /v1/tasks/{id}`；硅基流动视频是 `POST /v1/video/submit` + `POST /v1/video/status`。海螺 02/2.3 与 MiniMax H3 是两套协议，不要混用。OpenAI 官方 Sora 用 `sora_official`（JSON `/v1/videos`），中转站 multipart 仍用原来的 `sora`。

---

## grok2api（本地 Grok 网关）

grok2api 是一个把 Grok Web / Console 账号池转成 OpenAI 兼容接口的网关。
本地部署好并导入账号后，LMD 可以直接接入，获得文本、图片、视频、TTS 全套能力。

### 配置示例

假设 grok2api 跑在 `http://127.0.0.1:8000`：

| 服务类型 | base_url | 模型 | endpoint | query_endpoint |
|---|---|---|---|---|
| 文本 | `http://127.0.0.1:8000` | `grok-4.5` | `/v1/chat/completions` | — |
| 文本生成图片 | `http://127.0.0.1:8000` | `grok-imagine-image` | `/v1/images/generations` | — |
| 分镜图片生成 | `http://127.0.0.1:8000` | `grok-imagine-image` | `/v1/images/generations` | — |
| 视频 | `http://127.0.0.1:8000` | `grok-imagine-video` | `/v1/videos/generations` | `/v1/videos/{taskId}` |
| 语音合成 | `http://127.0.0.1:8000` | `grok-voice-latest` | `/v1/audio/speech` | — |

> **`base_url` 与 `endpoint` 的 `/v1` 只写一份即可。** 上表是推荐写法（base 不带 `/v1`、
> endpoint 带）。若你的 `base_url` 已写成 `http://127.0.0.1:8000/v1`，LMD 会自动去重，
> 不会产生 `/v1/v1/...` 的 404。但**端点路径本身必须与上表一致**——例如视频的 endpoint
> 写成 `/videos`（旧 xai 写法）会打到上游不存在的路径，此时日志会输出
> `endpoint 与上游契约不符` 告警。

> **`api_protocol` 建议显式填 `grok2api`**（图片与视频）。不填也能用——
> 模型名以 `grok-imagine-` 开头时会自动识别；但显式填写更稳妥。

也可以直接用「一键配置 grok2api」按钮，或导入 `各大平台中转站配置/grok2api.json`。

### 可用模型

| 类别 | 模型 ID |
|---|---|
| 文本 | `grok-4.5`、`grok-4.3`、`grok-4.20-*`、`grok-build-0.1` |
| 图片 | `grok-imagine-image`、`grok-imagine-image-quality`、`grok-imagine-image-2.0` |
| 视频 | `grok-imagine-video`、`grok-imagine-video-1.5` |
| 语音 | `grok-voice-latest`、`grok-voice-think-fast-2.0`、`grok-voice-think-fast-1.0` |

### 已知限制（LMD 已自动处理）

- **`quality` 参数只对 `grok-imagine-image-2.0` 有效**，其他图片模型传了会直接报错。
  LMD 默认不发 `quality`。
- **图片画幅用 `aspect_ratio` 而不是像素 `size`**。LMD 会把内部的 `2560x1440` 等尺寸自动映射为
  `16:9` 等比例；`21:9` 上游不支持，回退为 `16:9`。
- **带参考图的图生图走 `/v1/images/edits`**，参考图上限 **3 张**（超出自动截断）。
- **视频参考图上限 7 张**；`grok-imagine-video` 带参考图时 `duration` 上限 **10 秒**。
- **首帧（`image`）与参考图（`reference_images`）互斥**。两者同时提供时 LMD 保留首帧、丢弃参考图并写告警日志。
- **上游不支持尾帧**，LMD 会忽略尾帧并写告警日志。
- **`1080p` 仅 `grok-imagine-video-1.5` 支持**，且参考图模式最高 `720p`。
- **Web 号池不支持图生视频**：图生视频（首帧）与参考图需要 Console 账号，
  否则上游会报「Grok Web 当前仅支持文本生视频」。

### 图片编辑（图生图）该选哪个模型

图片编辑能力按模型分流到不同渠道，这决定了你的号池能否支持：

| 模型 | 编辑能力路由到 | 说明 |
|---|---|---|
| `grok-imagine-image-edit` | **Web** | 只有 Web 账号也能用 |
| `grok-imagine-image` | Console | 需要 Console 图片额度 |
| `grok-imagine-image-quality` | Console | 需要 Console 图片额度 |
| `grok-imagine-image-2.0` | Console | 需要 Console 图片额度 |

> **实测经验**：如果号池里只有 Web 账号（或 Console 图片额度为 0），
> 带参考图的图生图会返回 `503 当前没有可用的上游账号` 或 `429 上游账号额度等待恢复`。
> 此时把分镜图配置的模型换成 **`grok-imagine-image-edit`** 即可走通。

> 完整的上游契约（含 `file:line` 依据）见仓库 `docs/grok2api-contract.md`。

---

## 一键配置功能

在「AI 配置」页面，点击顶部的：
- **「一键配置通义」** — 自动创建阿里云 DashScope 的文本/图片/视频三套配置模板
- **「一键配置火山」** — 自动创建火山引擎的文本/图片/视频三套配置模板
- **「一键配置 Agnes」**（v1.2.8+）— 自动创建 Agnes AI 的文本/图片/视频三套配置模板（`agnes-2.0-flash` / `agnes-image-2.1-flash` / `agnes-video-v2.0`）
- **「一键配置 grok2api」** — 自动创建 grok2api 的文本/图片/分镜图/视频/语音五套配置模板（需填 grok2api 地址与 Key）

一键配置后，只需填入你的 API Key，其他参数已预填好，点击「保存」即可使用。

---

## 图床配置（v1.2.8+）

部分 AI 接口（如 Gemini 图生、Seedance 2.0 角色认证）需要将本地图片上传到公网图床。可在 `backend-node/configs/config.yaml` 的 `image_proxy` 段配置：

```yaml
image_proxy:
  expire_hours: 2              # 缓存有效期（小时）
  use_for_video: true
  upload_timeout_seconds: 180  # 上传超时（秒），默认 180
  upload_max_attempts: 2       # 失败重试次数
  # upload_url: https://your-proxy.example.com/api/upload
```

未配置 `upload_url` 时使用内置默认中转地址。缓存 URL 在使用前会探测是否仍有效，失效则自动重新上传。

---

## 连接测试

每条 AI 配置记录右侧有「测试」按钮，点击后会发送一条简短请求验证连接是否正常。  
测试成功显示绿色提示，失败会显示具体错误信息（如认证失败、模型不存在等）。

---

## 常见问题

### Q: API Key 填错了或过期了怎么办？

在「AI 配置」页面找到对应记录，点击编辑，修改 API Key 后保存即可立即生效。

---

### Q: 生成图片时提示「image size must be at least 3686400 pixels」

这是火山引擎图片生成 API 的最低像素要求。本系统会自动根据项目设定的画面比例计算合适的分辨率（最低 2560×1440），通常无需手动处理。如果仍然报错，请检查是否配置了自定义的 size 参数。

---

### Q: 视频生成提示「model does not exist」

火山引擎视频模型的 API 端点 ID 与展示名称不同。请确认你已在火山方舟控制台开通了该模型，并使用正确的模型名称。系统内置了常见模型名称的映射，两种写法（展示名 / 端点 ID）均支持。

---

### Q: 生成速度很慢怎么办？

- 图片生成通常需要 15–60 秒
- 视频生成通常需要 1–5 分钟（取决于时长和分辨率）
- 建议使用 `turbo` 或 `fast` 后缀的模型加快速度
- 如频繁遇到 429 限流，系统会自动重试，无需手动干预

---

[← 返回项目主页](../README.md)
