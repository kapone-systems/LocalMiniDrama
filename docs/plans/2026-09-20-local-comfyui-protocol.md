# 本地 ComfyUI 协议融合开发方案

> 来源：路线一（把本机 ComfyUI 当生图/生视频后端）+ 直连原生 API（不把 Rust OpenAI 代理当产品依赖）  
> 日期：2026-09-20  
> 范围：新增 `api_protocol: comfyui`，让现有角色图 / 场景图 / 分镜图 / 分镜视频走本机 ComfyUI。  
> 真源不变：分镜表、`image_generations`、`video_generations`、本地 `storage` 落盘逻辑都不改。画布仍是视图层。

---

## 0. 怎么用这份文档

- 按 **P0 → P1 → P2 → P3 → P4 → P5** 做。同一档内按编号顺序。前面档的核验没勾完，禁止开下一档。
- 每一条都有 **目标 / 改哪些文件 / 怎么做 / 不改什么 / 核验**。核验未全部勾上，该条不算完成。
- 纯函数必须有 `backend-node/test/` 单测（mock HTTP，不依赖本机真 Comfy）。P2 起才允许手工打真 Comfy。
- 改完必须：
  - `cd backend-node && node --test test/comfyui*.test.js test/protocolAdapters.test.js`
  - `cd frontweb && npm run build`
- 手工核验默认：ComfyUI `--listen` 在 `127.0.0.1:8188`；一份标题符合约定的 **API 格式** txt2img；一个已有短剧项目里至少 1 个角色、1 个分镜。

### 难度与预估

| 档 | 含义 | 预估 | 完成时用户能做什么 |
|---|---|---|---|
| P0 | 契约 + 纯函数 + 假服务器单测 | 1～2 天 | 开发者能跑通注入/轮询测试，产品无可见变化 |
| P1 | 协议注册 + AI 配置 + 连接测试 | 0.5～1 天 | 能在 AI 配置里选 ComfyUI，点「测试连接」打到 8188 |
| P2 | 文生图（角色/场景/道具，无参考图） | 2～4 天 | 点角色「生图」，图落到角色卡并进 ZIP |
| P3 | 参考图（分镜图） | 2～3 天 | 分镜带角色/场景参考图走 Comfy LoadImage |
| P4 | 图生视频 | 3～5 天 | 分镜有图时点「生视频」，mp4 落盘可合成 |
| P5 | 体验与稳健 | 2～4 天 | 工作流导入、映射覆盖、显存释放、错误可读 |
| PX | 明确不做 | — | 见文末 |

P0+P1+P2 是 **MVP（项目算融合了本地 ComfyUI）**。P3 让分镜图可用。P4 才是短剧本地闭环。P5 是给非开发者用的。

### 和旧文档的关系

| 旧材料 | 本方案态度 |
|---|---|
| `docs/comfyui配置.md`（Rust `comfyui-openai-api`） | **验证工作流标题的可选工具**，不是产品依赖，不写进 AI 配置一键包 |
| `docs/comfyui原理.txt` 标题约定 | **P2 默认注入规则原样沿用**，减少用户改图成本 |
| RunningHub 适配器 | **结构模板**：`model` = 工作流名，提交 + 轮询；本方案把云 HTTP 换成 `/prompt` + `/history` |
| 画布整改 D4（自由接线 / Krea） | **本方案不碰** |

---

## 1. 产品合同（全程不许打破）

### 1.1 本项目只填这些槽，不暴露 Comfy 节点图

| 槽 | 来源 | 注入到工作流 |
|---|---|---|
| `prompt` | 角色外观 / 场景描述 / 分镜提示词 | CLIPTextEncode（标题含 `Positive`）或 mapping |
| `negative_prompt` | 用户负面 + 系统防拼图负面 | 标题含 `Negative` |
| `size` | `1024x1024` 这类 | Width / Height，或 EmptyLatentImage 的 width/height |
| `seed` | 可选 | KSampler / RandomNoise 的 seed |
| `reference_image_urls` | 角色/场景/道具/分镜参考 | 先 `/upload/image`，再写入 `Reference Image 1…` 的 LoadImage |
| `duration` | 分镜时长 | 标题 `Duration` 的 PrimitiveInt / 视频节点 |
| `first_frame` / `last_frame` | 分镜主图 / 尾帧 | `Reference Image 1` / `First Frame`、`Last Frame` |
| `model` | AI 配置里的模型名 | **工作流文件名（不含 `.json`）**，不是 checkpoint 名 |

做不到「用这些槽跑起来」的 Comfy 图，不进流水线：用户在 Comfy 里出片，再上传。这不是缺陷，是边界。

### 1.2 工作流必须是 API 格式

ComfyUI 菜单 **Save (API Format)** 导出的 JSON（节点 id → `{ class_type, inputs, _meta.title }`）。  
带 `nodes`/`links` 的 UI 格式 **拒绝并给出明确错误**，提示用户重新导出。

### 1.3 默认标题约定（与 `docs/comfyui原理.txt` 对齐）

扫描每个节点的 `_meta.title`（大小写不敏感，子串匹配）：

| 标题包含 | 写入 |
|---|---|
| `Positive` | `inputs.text` ← prompt |
| `Negative` | `inputs.text` ← negative_prompt |
| `Width` | 整型/浮点节点，或 latent 的 width |
| `Height` | 同上 height |
| `Duration` | 秒 |
| `FPS` | 帧率，默认 24 |
| `Reference Image 1` / `2` / … | LoadImage.inputs.image ← 上传后的文件名（按序号） |
| `First Frame` / `Last Frame` | 视频首尾帧，优先于 Reference Image 序号 |

找不到 `Positive` 且 settings 里也没有 mapping → **直接失败**，禁止静默用图里写死的提示词（那会表现为「生出来了但完全不是这个角色」）。

### 1.4 进程与鉴权

- ComfyUI 由用户自己启动，本项目 **不拉 Python 子进程**。
- 默认 `base_url = http://127.0.0.1:8188`，`api_key` 可空。
- 本项目后端（Node）访问 Comfy；Electron 渲染进程不直连 8188。
- 出图后立刻用 `base_url + /view` 把文件拉进 `storage`，**禁止**把 `127.0.0.1:8188/view?...` 当长期 URL 存进数据库（Comfy 输出目录会轮转）。

### 1.5 并发

同一 `base_url` 上 Comfy 协议默认 **串行**（内部 mutex）。画布「并发 4」对 Comfy 配置不生效，避免和 Comfy 自己的 queue 叠两层把显存打爆。日志里写明「comfyui 协议已串行化」。

---

## 2. 目标架构

```
FilmCreate / DramaCanvas / 角色卡
        │  现有 generate 按钮（不改交互）
        ▼
imageClient.callImageApi / videoClient.callVideoApi
        │  api_protocol === 'comfyui'
        ▼
protocols/comfyui.js   （新文件，createAdapter 注册）
        │
        ├─ loadWorkflow(model)          data/comfy-workflows/{model}.json
        ├─ injectSlots(workflow, slots) 标题 或 settings.mapping
        ├─ uploadRefs()                 POST /upload/image
        ├─ POST /prompt                 → prompt_id
        ├─ poll GET /history/{id}       直到 outputs 或 error
        ├─ GET /view                    → buffer
        └─ 返回 { image_url: data:image/png;base64,... } 或 { video_url: data:... / 临时 file URL }
                │
                ▼
现有 downloadImageToLocal / downloadVideoToLocal
        │
        ▼
image_generations.local_path / characters.image_url / storyboard 视频
```

`settings` JSON（AI 配置已有该列，**不改表**）建议形状：

```json
{
  "workflows_dir": "",
  "timeout_seconds": 1800,
  "poll_interval_ms": 2000,
  "free_before_video": true,
  "client_id": "localminidrama",
  "mapping": {
    "character-sdxl": {
      "positive": { "node": "6", "input": "text" },
      "negative": { "node": "7", "input": "text" },
      "width": { "node": "5", "input": "width" },
      "height": { "node": "5", "input": "height" },
      "seed": { "node": "3", "input": "seed" },
      "images": [{ "node": "10", "input": "image" }]
    }
  }
}
```

`workflows_dir` 为空时默认：`{storage.local_path}/comfy-workflows/`（与素材同盘，随项目备份策略走，但工作流本身是 **全局** 的，不是某个 drama 私有）。

---

## 3. 必须动 / 禁止动的文件

### 3.1 会改

| 文件 | 从哪一档开始 |
|---|---|
| `backend-node/src/protocols/comfyui/`（新目录：`inject.js` `client.js` `adapter.js` `workflowStore.js`） | P0 |
| `backend-node/src/protocols/adapters.js` 末尾 `require('./comfyui/adapter')` | P1 |
| `backend-node/src/protocols/http.js` 必要时加更长 timeout 参数（已有 `timeoutMs`） | P2 |
| `backend-node/src/services/aiConfigService.js` `testConnection`：Comfy 允许空 key | P1 |
| `backend-node/test/comfyuiInject.test.js` `comfyuiClient.test.js` `protocolAdapters.test.js` | P0～P4 |
| `frontweb/src/ai-config/catalog.js` | P1 |
| `frontweb/src/components/AIConfigContent.vue`（连接测试、空 key、帮助文案） | P1 / P5 |
| `docs/configuration.md`、`docs/comfyui配置.md` 顶部加「正式路径 / 旧代理仅验证」 | P2 |
| `docs/comfyui/example-t2i-api.json`（示例，不含大模型权重） | P2 |
| 一键配置包 `frontweb/src/ai-config/packs/` 或 `各大平台中转站配置/` 下 `comfyui.json` | P2 |

### 3.2 禁止动（除非某条明确点名）

- `DramaCanvas.vue`、`dramaCanvasAdapter.js`、画布节点组件
- 分镜表结构、`project.json` schema
- grok2api / 火山等现有协议分支
- 不新增 Electron 里启动 Comfy 的逻辑
- 不把 UI 格式工作流转译成 API 格式（范围膨胀）

---

## P0 · 契约与纯函数（不连真 Comfy）

> 这一档的意义：把「最容易静默出错」的注入逻辑先用假 JSON 钉死，后面接 HTTP 才不会调一周才发现写错节点。

### R0.1 工作流形状校验

**目标**  
能区分 API 格式 / UI 格式 / 空对象，并抽出节点列表。

**怎么做**

1. 新文件 `backend-node/src/protocols/comfyui/inject.js`。
2. `assertApiWorkflow(json)`：
   - 对象且至少 1 个 key
   - 每个节点有 `class_type` 与 `inputs`（对象）
   - 若存在顶层 `nodes`+`links` 数组 → throw `请使用 ComfyUI「Save (API Format)」导出，不要用默认工作流文件`
3. `listNodes(json)` 返回 `{ id, class_type, title, inputs }`，`title` 取 `_meta.title` 或 `''`。

**不改什么**  
不读磁盘、不发 HTTP。

**核验**

- [ ] 单测：fixtures 里一份最小 txt2img API JSON 通过。
- [ ] 单测：`{ nodes: [], links: [] }` 抛出上述中文错误。
- [ ] 单测：缺 `class_type` 的节点抛错。

### R0.2 标题注入

**目标**  
给定 prompt / size / negative，按 §1.3 改 JSON，原对象不突变（返回深拷贝）。

**怎么做**

1. `injectSlots(workflow, slots, mapping?)`。
2. 匹配规则：title 去掉首尾空格，`/positive/i` 等子串；同一类多个节点时全部写入（有的图 Positive 出现两次）。
3. `size` 解析 `^(\d+)x(\d+)$`；写不进标题节点时，再找 `EmptyLatentImage` / `EmptySD3LatentImage` / `EmptyFlux2LatentImage` 的 width/height。
4. `mapping` 若提供，**覆盖**标题结果（按 node id 写 `inputs[input]`）。
5. 注入后若 `slots.prompt` 非空且没有任何节点被写成 Positive → throw `工作流未找到 Positive 节点，请给 CLIPTextEncode 标题加上 Positive，或在 AI 配置 settings.mapping 里指定节点 id`。

**核验**

- [ ] 单测：标题 Positive/Negative 被替换，原 workflow 对象不变。
- [ ] 单测：`1024x768` 写入 EmptyLatentImage。
- [ ] 单测：mapping 覆盖错误标题。
- [ ] 单测：无 Positive 且无 mapping → 抛错（不得返回未改 prompt 的图）。

### R0.3 输出解析

**目标**  
从 `/history/{id}` 的响应里取出第一张图或第一个视频的 `{ filename, subfolder, type }`。

**怎么做**

1. 同一文件或 `client.js` 里 `extractHistoryMedia(historyEntry)`。
2. 遍历 `outputs`：
   - `images[]` → 图（P2）
   - `gifs[]` / `videos[]` / `video[]` → 视频（P4 用，P0 先写解析，P2 可忽略）
3. 优先 `type === 'output'`，否则第一张。
4. 若 `status.status_str === 'error'` 或 `status.completed === false` 且带 `messages` 错误 → `{ error }`。
5. `formatNodeErrors(promptResponse)`：把 `/prompt` 返回的 `node_errors` 拼成可读中文（节点 class + 缺的模型名如果有）。

**核验**

- [ ] 单测：标准 SaveImage history → 一张 png 描述。
- [ ] 单测：空 outputs 且 completed → error「已完成但未找到输出文件」。
- [ ] 单测：`node_errors` 文本包含 class_type。

### R0.4 假 Comfy HTTP 客户端（内存 server）

**目标**  
不启动 Comfy，也能测「上传 → prompt → 轮询 → view」。

**怎么做**

1. `backend-node/src/protocols/comfyui/client.js`：`uploadImage`、`queuePrompt`、`getHistory`、`viewFile`、`systemStats`、`freeMemory`。
2. 单测用 `protocolAdapters.test.js` 同款 `startRouter`，或本文件内迷你 http server：
   - `GET /system_stats` → `{ system: { comfyui_version: "test" } }`
   - `POST /upload/image` → `{ name: "ref.png", subfolder: "", type: "input" }`
   - `POST /prompt` → 校验 body.prompt 是对象，返回 `{ prompt_id: "p1", node_errors: {} }`
   - `GET /history/p1` 第一次 pending（无 outputs），第二次带 images
   - `GET /view` → 返回 1×1 png buffer
3. 超时/轮询次数走已有 `PROTOCOL_POLL_INTERVAL_MS=0`、单独 `COMFY_POLL_MAX`（默认 900，测试里设 8）。

**核验**

- [ ] 单测：假服务器上 `queuePrompt` + 两次 history + view 得到 buffer。
- [ ] 单测：`node_errors` 非空时不进入轮询，直接 error。
- [ ] 不要求本机 8188 开着。

**P0 完成定义**：上述单测全绿；产品行为与现在完全一致。

---

## P1 · 协议出现在 AI 配置里（仍不出图）

### R1.1 注册 `comfyui` 适配器

**目标**  
`listProtocols()` 含 `comfyui`；`inferFromRegistry` 能从 provider / localhost:8188 认出它。

**怎么做**

1. `backend-node/src/protocols/comfyui/adapter.js` 调用已有 `createAdapter`：
   - `id: 'comfyui'`
   - `aliases: ['comfy', 'local_comfy']`
   - `auth: 'none'`
   - `group: 'local'`
   - `infer`: provider 为 comfyui/comfy，或 `baseUrl` 含 `:8188` 且不含 runninghub
   - `testPath` 不用 `/v1/models`，自定义 `testConnection` → `GET {base}/system_stats`（可跟 `/object_info` 二选一，stats 更轻）
   - `submitImage` / `submitVideo` 在 P1 **先返回明确 error** `ComfyUI 生图尚未启用（开发中）` 也可以；更好是直接接上 P0 的 client，但 P1 手工不要求出图。推荐：submitImage 已接到 client，P1 只保证测试连接。
2. `adapters.js` 底部 `require('./comfyui/adapter')`。
3. `protocolAdapters.test.js` 的 id 列表加上 `comfyui`。

**不改什么**  
不改 `callImageApi` 主链其它分支。`getProtocol('comfyui')` 一旦注册，`callImageApi` 里已有：

```js
const registered = getProtocol(protocol);
if (registered && typeof registered.submitImage === 'function') {
  return registered.submitImage(...)
}
```

因此 **不必改 imageClient 路由**（这是 RunningHub 已经铺好的路）。核实一遍：`inferProtocol` 在 `api_protocol` 为空且 provider=comfyui 时能命中 registry。若 `inferFromRegistry` 返回空，P1 就补 adapter.infer。

**核验**

- [ ] `listProtocols()` 含 comfyui。
- [ ] `inferFromRegistry({ provider: 'comfyui' }) === 'comfyui'`。
- [ ] `inferFromRegistry({ baseUrl: 'http://127.0.0.1:8188' }) === 'comfyui'`。
- [ ] `inferFromRegistry({ provider: 'grok2api' })` 不被抢走。
- [ ] 假服务器上 `testConnection` 200；关掉服务器则抛「无法连接 ComfyUI」。

### R1.2 连接测试允许空 API Key

**问题重点**  
`aiConfigService.testConnection` 一上来 `if (!opts.api_key) throw new Error('api_key 必填')`。本地 Comfy 默认无 key。

**怎么做**

1. 在该检查前：若 `api_protocol` 或 provider 或 infer 结果为 `comfyui`，跳过 key 必填。
2. 走 `registered.testConnection`。
3. 前端保存配置时，Comfy 条目允许 key 为空（确认 `AIConfigContent.vue` 校验；若有 `api_key required`，对 comfyui 放行）。

**核验**

- [ ] 单测或手工：key 空、base `http://127.0.0.1:8188`、协议 comfyui，测试连接打 `/system_stats`。
- [ ] 非 comfyui 协议缺 key 仍报必填。

### R1.3 前端目录与预设

**怎么做**

1. `catalog.js`：
   - `PROTOCOL_GROUPS` 新增一组 `local`，或放进 `general`：
     `{ id: 'comfyui', label: '本地 ComfyUI', services: ['image', 'storyboard_image', 'video'], help: '直连本机 8188。模型名 = 工作流 JSON 文件名（API 格式）。节点标题需含 Positive / Negative / Reference Image 1。' }`
   - `PROVIDER_PROTOCOL.comfyui = 'comfyui'`（以及 `comfy`）
   - `PROVIDER_BASE.comfyui = 'http://127.0.0.1:8188'`
   - `PROVIDER_PRESETS.image / storyboard_image / video` 各加一条 `{ id: 'comfyui', name: '本地 ComfyUI', models: ['character-t2i'] }`
2. 帮助文案写清：不要填 checkpoint 名；要填工作流名。

**不改什么**  
P1 不做工作流上传 UI（P5）。用户暂时把 JSON 手动放到默认目录。

**核验**

- [ ] AI 配置 → 图片 → 接口规范能选「本地 ComfyUI」。
- [ ] 选中后 Base URL 默认 `http://127.0.0.1:8188`。
- [ ] `npm run build` 通过。
- [ ] 本机 Comfy 开着时「测试连接」成功；关掉则失败信息含 8188 或 ECONNREFUSED。

**P1 完成定义**：配置页能选、能测通、还不能保证出图（若 R1.1 已接 submitImage，也必须等 P2 核验才算生图完成）。

---

## P2 · MVP 文生图（角色 / 场景 / 道具）

> 这是用户可感知的「融合成功」。不做参考图、不做视频。

### R2.1 工作流落盘

**目标**  
`model = "character-t2i"` → 读 `{workflows_dir}/character-t2i.json`。

**怎么做**

1. `workflowStore.js`：`resolveWorkflowPath(config, modelName)`、`loadWorkflow(config, modelName)`。
2. 默认目录：`path.join(storageRoot, 'comfy-workflows')`，启动时 `mkdir`。
3. 文件名只允许 `[A-Za-z0-9._-]+`，禁止 `..`。
4. 找不到文件 → error 列出目录里已有的 `.json` 名，避免用户对着 checkpoint 名干瞪眼。
5. 仓库提供 `docs/comfyui/example-t2i-api.json`：最小 SD1.5/SDXL txt2img API 格式，节点已按约定标题命名；checkpoint 用占位名 `PUT_YOUR_CHECKPOINT_HERE.safetensors`。文档说明：复制到 `comfy-workflows/character-t2i.json` 后改 checkpoint。

**核验**

- [ ] 单测：假目录下能 load；`../etc/passwd` 被拒。
- [ ] 单测：缺文件错误信息含已有文件名列表。

### R2.2 `submitImage` 真链路（无参考图）

**怎么做**

1. adapter.submitImage：
   1. loadWorkflow
   2. injectSlots（prompt / negative / size / seed）
   3. queuePrompt
   4. poll history（timeout 来自 settings.timeout_seconds，默认 1800）
   5. viewFile → `data:image/png;base64,...` 作为 `image_url`
2. **不要**把 Comfy `/view` HTTP URL 直接返回给前端当永久地址（Electron/跨源/文件被删）。data URL 可走现有 `downloadImageToLocal` 的 `data:` 分支。
3. 日志：`[comfyui图生]` 带 prompt_id、注入了哪些节点 id、耗时。
4. 失败：把 `node_errors` / history error 原文截断到 500 字放进 `error`，现有任务系统会写到 `image_generations.error_msg`。

**核验**

- [ ] 假服务器单测：submitImage 返回 data URL，且 POST /prompt 的 body 里 Positive 文本等于 opts.prompt。
- [ ] 手工：AI 配置图片默认改为 ComfyUI，角色点生图，角色卡出现图，刷新仍在，`storage` 下有 png。
- [ ] 手工：工作流缺 Positive 标题 → 任务失败文案提到 Positive，不出现一张「和提示词无关」的图。
- [ ] 手工：Comfy 里故意填错 checkpoint → 失败文案能看出节点/模型问题。
- [ ] grok2api / 火山生图回归：把默认改回去，原路径仍通。

### R2.3 配置包与文档

**怎么做**

1. `各大平台中转站配置/comfyui.json` + `frontweb/src/ai-config/packs/`（若 packs 机制扫该目录）三条：image / storyboard_image / video，video 可先写上但 P2 不保证能跑。
2. `docs/configuration.md` 增加「本地 ComfyUI」一节：启动参数、API 格式、标题、目录、测试连接、常见失败。
3. `docs/comfyui配置.md` 文首加 10 行：正式路径是本协议；下文 Rust 代理仅供对照标题约定，视频不要走 OpenAI 兼容去打代理。

**核验**

- [ ] 一键包导入后协议为 comfyui、URL 为 8188。
- [ ] 新用户按 configuration.md 能完成第一次角色出图（内部验收）。

**P2 完成定义**：角色或场景文生图稳定落盘；单测不依赖真 GPU；默认云协议未损坏。

---

## P3 · 分镜图（参考图）

### R3.1 上传参考图

**目标**  
`reference_image_urls`（及 data URL / 本地路径）→ Comfy input 目录里的文件名 → 按序号写入 LoadImage。

**怎么做**

1. 复用 `imageClient` 已有的 `resolveImageRef` 得到 data URL 或 http。
2. data/本地文件：在 client.uploadImage 用 `multipart/form-data` 字段 `image`（Comfy 标准）。
3. 上传结果 `name` 写入 `Reference Image 1…` 对应节点的 `inputs.image`。
4. 参考图数量 > 工作流 LoadImage 槽位数 → **截断并 warn**，不要把多出来的塞进 prompt 当 base64（Comfy 会炸）。
5. 工作流一个 LoadImage 都没有、但调用方传了参考图 → warn「工作流无 Reference Image 节点，参考图已忽略」，**仍然出图**（文生图兜底）。分镜图场景下，可在日志 + error_msg 旁路提示；不强制失败，避免用户第一份图还没改标题就完全不能用。

**核验**

- [ ] 单测：两张 data URL 参考图 → 两次 `/upload/image`，prompt 里两个 LoadImage 的 image 字段为上传返回名。
- [ ] 手工：分镜绑定 1 个角色图，storyboard_image 走 Comfy，出图能看出角色特征（主观，但失败时应能在 Comfy 历史里看到 LoadImage 不是空的）。
- [ ] 手工：0 张参考图时 P2 行为不变。

### R3.2 分镜服务类型分开工作流

**目标**  
`service_type=image` 用 `character-t2i`；`storyboard_image` 用 `storyboard-i2i`（用户可配不同 model 列表）。

**怎么做**

不写死文件名。文档与预设：

- 图片配置 model：`character-t2i`
- 分镜图配置 model：`storyboard-i2i`（多 LoadImage）

代码上已经是「当前配置的 model」。只需在文档和 packs 里拆成两条 AI 配置，避免同一份文生图去吃分镜多参考。

**核验**

- [ ] 两条配置可同时存在，角色生图与分镜生图打不同 JSON（日志里 workflow 文件名不同）。

**P3 完成定义**：分镜图带参考可跑；无参考仍走 P2。

---

## P4 · 图生视频

### R4.1 首帧上传 + 视频工作流

**目标**  
`first_frame_url` / `image_url` → 上传为 First Frame 或 Reference Image 1；`duration` 写入 Duration；轮询直到 mp4/webm/gif。

**怎么做**

1. `submitVideo`：若 settings.free_before_video 默认 true，先 `POST /free` `{ unload_models: true, free_memory: true }`（失败只 warn，不中断）。
2. 注入 duration、fps（有则写）、prompt。
3. poll history 用更长超时（默认 3600s），间隔 2s。
4. `viewFile` 得到 buffer 后：
   - 优先写临时文件再让现有 `downloadVideoToLocal` 吃 `file://` 或 data URL；
   - 若 `downloadVideoToLocal` 只吃 http(s)，则 **在 adapter 内写入 storage 临时路径并以 `file://` 或直接返回本地绝对路径**。P4 开工前先读 `videoService.downloadVideoToLocal`：若只支持 http，就在 adapter 落盘到 `storage/videos/comfy_{id}.mp4`，返回该路径能被现有更新逻辑识别的那种 `video_url`（必要时小改 videoService **一处**接受 `data:video` 或绝对路径，写在本条核验里，禁止大重构）。
5. 无视频输出节点 → error 提示「工作流需有 SaveVideo / VHS_VideoCombine / 其它会在 history 里产出 videos/gifs 的节点」。

**核验**

- [ ] 假服务器：history 带 `gifs[0].filename` → 得到非空 buffer。
- [ ] 手工：一分镜已有图，视频配置为 Comfy，点生视频，列表能播，合成本集能吃到这段。
- [ ] 手工：Comfy 关掉之后点生视频，任务失败而不是一直转圈超过 UI 忍耐（超时信息要出现）。
- [ ] 画布并发>1 时，Comfy 任务仍串行（日志有排队）。

### R4.2 尾帧（可选，P4 后半，可拆成 P4b）

**目标**  
`last_frame_url` 写入 `Last Frame` 或 `Reference Image 2`。

**怎么做**  
有 Last Frame 标题用它；否则若存在 Reference Image 2 且调用方给了 last_frame，写入 2。都没有则忽略尾帧并 warn。

**核验**

- [ ] 单测：同时有 first/last 时上传两次、写入两个节点。
- [ ] 无尾帧工作流 + 无 last_frame → 不报错。

**P4 完成定义**：至少「分镜图 → 本地 i2v → 能合成」在一份真实工作流上跑通。

---

## P5 · 给非开发者用的体验

按优先级，可再拆 PR，不必一天做完。

### R5.1 工作流导入（AI 配置页）

**目标**  
不必手拷文件：上传 `.json`，校验 API 格式，存进 workflows_dir，模型下拉出现文件名。

**怎么做**

1. 后端 `POST /ai-configs/comfy-workflows`（multipart）+ `GET` 列表 + `DELETE`。
2. 前端仅当 `api_protocol===comfyui'` 显示「导入工作流」。
3. 导入时跑 `assertApiWorkflow` + 扫描是否有 Positive，没有则 **警告可继续**（用户准备写 mapping）。

**核验**

- [ ] 导入 UI 格式 → 红字 Save (API Format)。
- [ ] 导入成功后 model 列表含新名字，生图能选到。

### R5.2 连接测试增强

**目标**  
测试连接成功时返回 Comfy 版本、VRAM 若有、以及 workflows_dir 里的工作流名（让用户知道 model 该填什么）。

**怎么做**  
`testConnection` 读 system_stats + 列目录；把摘要放进现有测试成功 toast（若 API 只返回 ok，就 log.info，前端至少「已连接 ComfyUI」）。

### R5.3 映射编辑（最小）

**目标**  
settings.mapping 可在配置里用 JSON 文本框编辑（AI 配置已有 settings 的话复用）。不做可视化节点选择器。

**核验**

- [ ] 标题故意改错，靠 mapping 仍能出图。

### R5.4 进度（可选）

Comfy websocket `/ws?clientId=` 推送 progress。P5 再做；P2～P4 用轮询即可。若做：把 progress 写进现有 task 的 message，画布/列表已有任务轮询就能显示「采样 12/20」。

**P5 完成定义**：不会用命令行的人，能在软件里导入 API JSON、测通、出图。

---

## 4. 测试策略

| 层 | 何时 | 手段 |
|---|---|---|
| 注入/解析 | P0 起每次 PR | `node --test test/comfyuiInject.test.js` |
| HTTP 客户端 | P0 起 | 假 Comfy `startRouter` |
| 协议注册 | P1 起 | 扩 `protocolAdapters.test.js` |
| 连接空 key | P1 | `test/comfyuiTestConnection.test.js` |
| 回归 | 每档结束 | grok2api 图测、火山若有的现有 test 全绿 |
| 真 GPU | P2、P3、P4 各一次手工 | 不进 CI |

CI **不得**依赖本机 Comfy 或 GPU。

---

## 5. 风险与对策

| 风险 | 对策 |
|---|---|
| 用户保存了 UI 格式 JSON | P0 校验直接拒绝，中文说明 |
| 无 Positive，静默用图内提示词 | P0 强制失败 |
| `/view` URL 存进 DB 后文件被 Comfy 清掉 | 只返回 data URL 或立刻 downloadImageToLocal |
| 视频下载 30s 超时（图下载现 30s） | P4 单独 timeout，视频至少 10 分钟 |
| `testConnection` 强求 api_key | P1 对 comfyui 放行 |
| 画布并发打爆显存 | 每 base_url mutex |
| 自定义节点缺失 | 把 node_errors 原文给用户 |
| 标题匹配误伤（某个笔记节点也叫 Positive） | 仅写入 `inputs.text` 存在的节点；mapping 可覆盖 |
| Electron 下 Node fetch 不稳 | 上传/下载用 `uploadService` 已有的 Node http 模块风格，不依赖 renderer fetch |
| 与 RunningHub 混淆 | 文案写「本地 ComfyUI」，infer 排除 runninghub 域名 |

---

## 6. 建议施工波次（合并成 PR 的切法）

**PR1 = P0**  
只有 `protocols/comfyui/inject.js` + fixtures + 单测。可单独合并，零产品风险。

**PR2 = P1 + P2**  
适配器 + catalog + 空 key + 文生图。这是用户能看见的第一刀。

**PR3 = P3**  
参考图上传。依赖 PR2 在真机出过一张图。

**PR4 = P4**  
视频。依赖已有「分镜图」和一份 i2v API 工作流。

**PR5 = P5**  
导入 UI、文档打磨。可与 PR4 并行（不同文件）。

不要把 PR2 和画布整改、grok2api 改动绑在同一个 PR。

---

## PX · 明确不做

| 编号 | 内容 | 原因 |
|---|---|---|
| X1 | 本项目启动/安装 ComfyUI | Python/CUDA/自定义节点不是 Electron 该管的 |
| X2 | 把 DramaCanvas 改成可接线 Comfy 图 | 真源是分镜表；画布整改 D4 |
| X3 | Krea 式无限纸 inpaint | 另一产品 |
| X4 | 把 UI 格式自动编译成 API 格式 | 边与 widget 语义复杂，易静默错 |
| X5 | 任意工作流不经注入直接跑 | 会用错提示词还看起来「成功」 |
| X6 | 产品依赖 Rust `comfyui-openai-api` | 多进程、视频轮询与本项目 OpenAI 视频默认路径不一致 |
| X7 | 在协议里实现完整 Comfy 前端（queue 管理器、节点编辑） | SwarmUI 的活 |
| X8 | 把 checkpoint / LoRA 文件扫进「模型」下拉 | 模型名 = 工作流名；权重在图里 |

若以后要做 X6 作为「高级兼容」，只能当第四种 `api_protocol` 文档附录，且必须单独配置 `query_endpoint=/v1/tasks/{taskId}`。本方案主路径仍是直连 8188。

---

## 7. 每档手工清单（给验收的人）

**P1**  
Comfy 启动（`python main.py --listen`）→ 软件 AI 配置选本地 ComfyUI → 测试连接成功。

**P2**  
把 example 复制为 `character-t2i.json` 并改好 checkpoint → 模型名填 `character-t2i` → 角色生图 → 卡片有图 → 换回 grok2api 再出一张证明没改坏。

**P3**  
`storyboard-i2i.json` 含 Reference Image 1 → 分镜挂角色图 → 生分镜图。

**P4**  
i2v 工作流含 First Frame + Duration → 该分镜生视频 → 播放 → 合成本集。

---

## 8. 完成定义（整条路线何时算过关）

同时满足：

1. AI 配置里有「本地 ComfyUI」，空 key 能测通 8188。  
2. 角色文生图经 Comfy 落盘，导出 ZIP 带得走。  
3. 无 Positive 的工作流会失败且说人话，不会静默出无关图。  
4. 分镜参考图能进 LoadImage（P3）。  
5. 至少一条图生视频能合成（P4）。  
6. 现有 grok2api / OpenAI / 火山测试仍绿。  
7. CI 不依赖 GPU。  
8. PX 清单没有被偷偷开工。
