# 按视频模型优化提示词（Video Prompt Skills）创作规划

> **用途**：把这份文档整份交给新对话，即可按分期开工。文档自包含，不依赖之前的对话。  
> **日期**：2026-09-20（二期扩写同日）  
> **范围**：图文生视频 / 文生视频提交前，按**当前视频模型族**把分镜提示词改写成该模型官方写法，再调用视频 API。  
> **仓库**：`LocalMiniDrama`（Node 后端 + Vue 前端）。不改 grok2api。  
> **状态**：**一期（P0 / P1 / P1b）已落地**。新对话若做二期，从 **§15** 开工，不要重做 H3 闭环。

---

## 0. 给实施对话的上下文

### 0.1 用户要的产品

使用者在「图文生视频」这一环，应能按视频模型换一套提示词规则：

- 加一份 **MiniMax H3 官方提示词 Skill** 后，当前视频模型是 `MiniMax-H3` 时，**生成前先按官方结构改写提示词**，再提交。
- 换海螺 / 可灵 / 万象 / Seedance 等同理：各有自己的 Skill，互不污染。
- Skill 可在「AI 配置 → 高级设置（提示词）」里查看、改、恢复默认。不是丢一个 OpenClaw `SKILL.md` 就会生效。

项目里的 `openclaw-skill/` 是给外部助手调本软件的，**不是**本功能。本功能的 Skill 是应用内的「视频提示词改写模板」。

### 0.2 为什么现在做不到

| 现状 | 文件 | 说明 |
|---|---|---|
| 视频词一份通吃 | `episodeStoryboardService.js` `generateVideoPrompt` | 按场景/动作/对白/景别/运镜拼中文，**不看视频模型** |
| 生视频原样提交 | `videoService.js` `createAndStart` / `processVideoGeneration` | `prompt` 最多拼上画风，然后 `callVideoApi` |
| 协议只改信封 | `videoClient.js`、`protocols/adapters.js` | H3 与海螺差的是 URL、时长、分辨率、`content[]`，**不改文案** |
| 提示词管理无视频模型项 | `routes/promptOverrides.js` `PROMPT_META` | 只有故事/分镜/提取/首尾帧生图 |
| 图片有润色、视频没有接上 | `storyboards.polishPrompt` → `polished_prompt` | 生图用。画布生视频缺 `video_prompt` 时才会退回这段图词 |
| 经典视频润色半成品 | `POST /storyboards/:id/classic-video-prompt-polish-stream` | 路由已挂，但 `promptI18n.getClassicVideoPromptPolishPrompt` **不存在**；前端 API 与界面都没接。即便接上，也是一份通用「图生视频」润色，不读当前是不是 H3 |

用户现在能做的只有：手改本镜 `video_prompt`、改字段后重建、或走全能模式自己的「生成/润色全能词」（可灵 Omni / Seedance 2.0 固定版式）。

### 0.3 生视频入口（改写钩子必须全覆盖）

1. 列表页 `FilmCreate.vue` → `videosAPI.create({ prompt: buildSbVideoPromptForApi(sb) })`
2. 画布 `useCanvasWorkflowRunner.js` `runVideoStep` → 同样 `videosAPI.create`
3. 一键流水线 / 整组重跑（后端任务）最终也进 `videoService.createAndStart` → `processVideoGeneration`

**改写放在后端 `processVideoGeneration`（真正调视频 API 之前）**，三处入口都生效。前端只负责开关、预览、展示「将使用哪份 Skill」。

### 0.4 已拍板的产品原则

1. **`storyboards.video_prompt` 永远是模型无关的真源**（字段拼装或用户手改）。H3 改写结果**默认不回写**真源，避免换可灵时仍带着 H3 运镜标签。
2. **实际提交词**写在 `video_generations.prompt`（该列本来就是发给厂商的那一段）。
3. 匹配不到 Skill、改写失败、用户关掉开关 → **原样提交**，生视频不能因为润色挂掉。
4. 全能模式（`creation_mode === 'universal'`）且当前协议是 `kling_omni` / `volcengine_omni` 时，**不要套 H3/海螺这类 I2V Skill**，以免打掉 `@图片N` 版式。这类走自己的 Omni Skill（二期）。
5. 一期只把 **MiniMax H3** 做成完整闭环，并补上 **generic 兜底 Skill**（把半成品经典润色收编）。其它模型先注册空位与匹配规则，默认文案可以薄，二期再填厚（**§15**）。

### 0.5 一期落地后还剩什么（二期要解决的）

已有钩子、H3 Skill、预览弹窗、总开关。还没做：

- 海螺 / 可灵 I2V / Wan / Seedance 经典仍是薄模板。
- `kling_omni` / `seedance_omni` 被 `phase1Skip` 关掉，全能提交**完全不改写**。
- 匹配末尾「全能+Omni → null」会挡住二期 Omni Skill，**P2-0 必须先改**（§15.1）。
- 提交词不能在界面查看；改写缓存只在前端会话。
- 未接 H3-Context-IR。

---

## 1. 用户故事与界面

### 1.1 主路径（自动）

1. 用户在 AI 配置里把默认视频配成 MiniMax H3。
2. 分镜已有图（或首尾帧）和通用视频词。
3. 点「生成视频」/ 画布空槽生视频 / 一键流水线。
4. 后端识别当前配置是 H3 Skill → 用文本模型按 H3 官方规则改写 → 把改写结果写入本次 `video_generations.prompt` → 调 H3 V2 接口。
5. 界面能看见：本镜通用词不变；本次任务显示「已按 MiniMax H3 优化」和实际提交词（可展开）。

### 1.2 辅路径（预览再生成）

分镜「手工编辑」/ 画布「视频词」旁增加：

- 按钮 **「按当前模型优化」**（流式输出到预览框，不立刻覆盖真源）
- 文案标明当前 Skill 名，例如「当前视频模型：MiniMax-H3 · 将使用 H3 官方 Skill」
- 操作：**仅用于下一次生成** / **采用到本镜提交缓存** / 关闭

「采用到本镜提交缓存」见 §4.4，不是写回 `video_prompt`。

### 1.3 管理路径

AI 配置 → **高级设置（提示词）** 增加分组：

- 现有：故事 / 分镜 / 提取 / 首尾帧（不变）
- 新增分组：**视频模型 Skill**  
  每条一个模型族，可编辑、恢复默认。蓝色锁定区（若有）仍是输出格式约束。

生成设置页增加总开关：

- **生成视频前按当前模型优化提示词**（默认开）
- 说明：关则所有入口都跳过改写。

单次请求可带 `adapt_prompt: false` 覆盖总开关（预览满意后「用原稿生成」）。

### 1.4 用户不需要知道的

- 不用写 OpenClaw skill
- 不用为每个分镜手填 H3 标签
- 换模型不必把旧改写词清掉（真源没被改）

---

## 2. 架构

```
分镜真源 video_prompt / 全能词
        │
        ▼
videos.create({ prompt, adapt_prompt? })
        │
        ▼
video_generations 入库（prompt = 真源，status=processing）
        │
        ▼
processVideoGeneration
        │
        ├─ 读默认视频配置（protocol + model）
        ├─ resolveVideoPromptSkill(config, storyboard)
        ├─ 开关关 / 无 Skill / Omni 豁免 → 跳过
        ├─ 文本模型 + Skill 系统提示词 改写
        │     失败 → 打日志，继续用原稿
        ├─ UPDATE video_generations.prompt = 改写结果
        │         （可选列 skill_id / prompt_source）
        ▼
callVideoApi(prompt = 改写结果)
```

预览走独立流式接口，**不创建** `video_generations`。

### 2.1 新模块（建议）

| 模块 | 职责 |
|---|---|
| `backend-node/src/services/videoPromptSkills.js` | Skill 注册表、匹配、取系统提示词（默认 ∪ override）、组装 user payload |
| `backend-node/src/services/videoPromptAdaptService.js` | 调文本模型改写、截断、失败降级、写回 `video_generations` |
| `promptI18n.js` | 各 Skill 默认正文 + generic 的 `getClassicVideoPromptPolishPrompt`（补齐半成品） |
| `routes/promptOverrides.js` | `PROMPT_META` 增加视频 Skill 条目与 `group` |
| `frontweb` PromptEditor | 按 `group` 分组 |
| `frontweb` 分镜视频区 / 画布面板 | 当前 Skill 徽章、优化按钮、提交词预览 |

不要把匹配规则散写进 `FilmCreate.vue`。前端只调 `GET /settings/video-prompt-skills/resolve`（或挂在 generation settings 里）拿到 `{ skill_id, label, enabled }`。

### 2.2 文本模型路由

改写走现有 `aiClient.generateText` / `streamGenerateText`，`scene_key: 'video_prompt_skill'`。

- 业务场景表可单独给这个 key 配更强的文本模型。
- 温度建议 `0.25–0.35`，`max_tokens` 按 Skill 声明（H3 可到 2000，输出上限 7000 字符）。
- 与图片润色共用文本配置即可，不强制新配置。

### 2.3 不调用 MiniMax 官方「只增强提示词」接口（一期）

H3 官方有 **H3-Context-IR**：只返回增强提示词、不生成视频。一期**不用**它，原因：

- 大量用户走中转站，没有这条 API。
- Skill 引擎必须对所有模型族同一套。

二期可在 H3 Skill 上加 `engine: 'text' | 'minimax_context_ir'`：官方直连且用户打开时走 Context-IR，否则仍用本地文本模型 + Skill 正文。

---

## 3. Skill 注册表

### 3.1 一条 Skill 的形状

```js
{
  id: 'minimax_h3',                 // 稳定 id，也是 prompt_overrides key 后缀
  label: 'MiniMax H3 官方提示词',
  description: '图/文生视频提交前，改写成 MiniMax-H3 官方结构（运镜方括号标签、动作为主、不改首帧外貌）',
  match: {
    protocols: ['minimax_h3'],
    models: [/^minimax[-_]?h3\b/i], // 与 videoClient.isMinimaxH3Model 对齐
  },
  priority: 100,                    // 同时命中时取高分；omni 应高于普通 kling
  skipIf: 'universal_omni',         // 见 §3.3；H3 不要跳过经典 I2V
  maxOutputChars: 7000,
  defaultBodyKey: 'video_skill.minimax_h3',
}
```

`prompt_overrides.key` = `video_skill.<id>`，复用现有表，**不必新表**。

### 3.2 匹配顺序

`resolveVideoPromptSkill(config, ctx)`：

1. 读 `config.api_protocol`（显式协议优先，与现网「显式 protocol 不被 grok-imagine 误判」一致）。
2. 读当前模型名（配置 `model[0]` 或本次 `video_generations.model`）。
3. 按 `priority` 降序，第一条 protocol 或 model 正则命中的胜出。
4. 都没有 → `generic`（若开关打开）。
5. `skipIf` 命中 → 当作无 Skill（全能 Omni 不套 I2V Skill）。

一期内置：

| id | 匹配 | 一期默认正文 |
|---|---|---|
| `minimax_h3` | protocol `minimax_h3` 或模型 MiniMax-H3 | **完整官方 Skill**（§6） |
| `minimax_hailuo` | `minimax_hailuo` / Hailuo-02 / 2.3 | 可先薄模板，或暂指向 generic |
| `kling_omni` | `kling_omni` | 一期只占位，匹配后 **skip**（已有全能润色） |
| `seedance_omni` | `volcengine_omni` | 同上 |
| `kling` | `kling` 且非 omni | 薄模板或 generic |
| `wan` | dashscope / siliconflow 且模型含 wan | 薄模板或 generic |
| `seedance` | volcengine 视频且模型含 seedance，非 omni | 薄模板或 generic |
| `generic` | 兜底 | 收编现有经典润色意图 |

二期再填：`sora` / `sora_official`、`grok2api`/`xai`、`veo3`、`runway`、`luma`、`pika`、`pixverse`、`zhipu` 等。未填厚的模型走 `generic`，行为不低于今天。

### 3.3 `skipIf: 'universal_omni'`

当同时满足：

- 分镜 `creation_mode === 'universal'`
- 且将提交的是 `universal_segment_text`（列表页 `buildSbVideoPromptForApi` 的逻辑）
- 且当前协议是 `kling_omni` 或 `volcengine_omni`

则**不改写**。全能词已经按 `@图片N` 版式生成/润色。

若用户开着全能分镜、但视频配置是 H3：仍应对**实际提交的那串 prompt**套 H3 Skill（此时提交的可能是全能词或经典词，H3 需要的是动作+运镜，不是 `@图片N`）。Skill 正文须写明：若输入含 `@图片N`，删掉指图语法，改成「首帧参考图已锁定外貌与构图」。

---

## 4. 数据与 API

### 4.1 真源 vs 提交词

| 字段 | 含义 | 谁写 |
|---|---|---|
| `storyboards.video_prompt` | 模型无关真源 | 分镜生成 / 重建 / 用户手改 / 现有经典润色（若保留） |
| `storyboards.universal_segment_text` | 全能真源 | 全能生成/润色 |
| `video_generations.prompt` | **这一次真正发给视频模型的词** | 创建时先写真源；改写成功后覆盖为 Skill 输出 |
| `video_generations.prompt_skill_id`（新列，可空） | 用了哪条 Skill | 改写成功后写入 |
| `video_generations.prompt_adapted`（新列 0/1） | 是否经过改写 | 便于 UI 徽章 |

`storyboards` **一期不加** `video_prompt_h3` 这类按模型列。换模型靠每次生成现改。

可选缓存（一期建议做，避免同一镜连续重生成反复烧文本 token）：

- `storyboards.adapted_video_prompt` TEXT
- `storyboards.adapted_video_skill_id` TEXT
- `storyboards.adapted_video_prompt_at` TEXT

仅当用户点「采用到本镜提交缓存」，或生成设置「缓存改写结果」打开时写入。缓存命中条件：skill_id 相同、且真源 `video_prompt` 的 hash 未变。真源一改就失效。

无缓存也能工作：每次生成都改写。

### 4.2 生成设置

在现有 `settings/generation` 增加：

```json
{
  "adapt_video_prompt": true,
  "adapt_video_prompt_cache": false
}
```

存 `global_settings`（与并发同一套）。默认：改写开、缓存关。

`videos.create` body 增加可选：

```json
{
  "adapt_prompt": true,
  "prompt_skill_id": "minimax_h3"
}
```

- `adapt_prompt === false`：跳过。
- `prompt_skill_id`：仅预览/调试允许强制指定；正式生成以配置匹配为准，忽略客户端乱填，防止前端把 H3 词强制套到可灵。

### 4.3 API

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/settings/prompts` | 现有列表，多返回 `group` |
| PUT/DELETE | `/settings/prompts/:key` | 现有覆盖，key 增加 `video_skill.*` |
| GET | `/settings/video-prompt-skills` | 返回注册表摘要（id/label/match/是否已自定义） |
| GET | `/settings/video-prompt-skills/resolve` | 按当前默认视频配置 + 可选 `storyboard_id` 返回将使用的 Skill |
| POST | `/storyboards/:id/video-prompt-adapt-stream` | 流式预览改写（NDJSON delta/done/error），**不改**真源；done 带 `skill_id` + `adapted_prompt` |
| POST | `/storyboards/:id/video-prompt-adapt-cache` | 把预览结果写入本镜缓存列 |
| 现有 | `/storyboards/:id/classic-video-prompt-polish-stream` | **收编**：内部改调 generic Skill；或 301 到新接口。禁止两套文案长期并存 |

`videos.create` 行为变化见 §2 钩子，路径不变。

列表/详情返回 `video_generations` 时带上 `prompt_skill_id`、`prompt_adapted`，供「本次已按 H3 优化」展示。

### 4.4 经典润色半成品怎么处理

`polishClassicVideoPromptStream` 今天会在结束后 **UPDATE storyboards.video_prompt**，这与「真源不被模型格式污染」冲突。

一期约定：

- **预览接口**（新）：不写库，或只写缓存列。
- **旧经典润色**：
  - 若产品仍希望「把通用词写得更像电影、但仍模型无关」，可保留为「润色通用视频词」，系统提示词用 `generic`，**继续写回 `video_prompt`**。
  - 「按当前模型优化」走新接口，**不写回** `video_prompt`。
- 两个按钮文案必须分开，避免用户以为优化 H3 会永久改掉通用词。

补齐 `getClassicVideoPromptPolishPrompt()`，作为 `video_skill.generic` 的默认正文；旧路由调用同一函数，消灭「调用不存在方法」的隐患。

---

## 5. 改写 User 消息（所有 Skill 共用骨架）

系统提示词按 Skill 变；User 消息结构固定，便于换模型只换 Skill 正文：

```
TASK: ADAPT_STORYBOARD_PROMPT_FOR_VIDEO_MODEL
SKILL_ID: minimax_h3
MODE: i2v | first_last | t2v | reference
DURATION_SEC: 5
RATIO: 16:9
HAS_FIRST_FRAME: true
HAS_LAST_FRAME: false
REFERENCE_COUNT: 1

CANONICAL_VIDEO_PROMPT:
<storyboards.video_prompt 或本次提交原稿>

STORYBOARD_FIELDS:
SHOT_NUM / ACTION / DIALOGUE / NARRATION / MOVEMENT / SHOT_TYPE / ...

FIRST_FRAME_ANCHOR:
<polished_prompt 或 image_prompt 摘要，强调外貌与构图已由参考图锁定>

CONSTRAINTS:
- 不要编造剧本没有的情节
- 对白原意不可改
- 时长秒数不可改
```

`MODE` 由本次请求的图决定：有首尾帧 → `first_last`；仅首帧/分镜图 → `i2v`；无图 → `t2v`；全能多参考 → `reference`。H3 Skill 必须按 MODE 分支（I2V 少写外貌、T2V 才写场景建立）。

改写输出：**只输出最终提示词正文**，无标题、无 Markdown、无「优化说明」。

失败判定：空、过短（< 12 字）、明显是模型在解释规则。失败则用原稿。

---

## 6. MiniMax H3 官方 Skill 默认正文（一期必做）

依据 MiniMax Video Generation V2 / MiniMax-H3 公开规则（2026-09 文档要点）：

- `content[]` 里 **text 必填**，描述场景与运动；图/视频/音频按 role 另传，提示词里不要假装「我附了 9 张图」。
- 可在关键描述后紧跟 **`[运镜]` 方括号指令** 引导镜头（如 `[推镜]` `[拉镜]` `[摇镜]` `[跟随]` `[环绕]` `[固定]` `[升]` `[降]`）。
- 整段提示词 **不超过 7000 字符**。
- 时长整数 **4–15 秒**；分辨率 768P / 2K（时长分辨率由 API 字段管，提示词不要写「请输出 1080p」这类无效指令）。
- 文生视频必须有比例且不能 `adaptive`；有参考图时比例跟图，API 已设 `adaptive`。
- 首尾帧图负责外貌与起止构图；提示词负责**运动、镜头、节奏、声画、光影变化**。

下面这段作为 `video_skill.minimax_h3` 的 `default_body` 初稿（实施时可微调，但结构不要拆掉）：

```text
你是 MiniMax-H3（Video Generation V2）的提示词改写器。把用户给的分镜视频词，改写成可直接放入 H3 `content[].text` 的官方风格提示词。

【只输出最终提示词】不要解释、不要标题、不要 Markdown、不要 JSON。

【H3 官方形式】
1. 一段连贯中文（可夹少量英文镜头术语）。主体 + 动作过程 + 镜头调度 + 环境动态 + 光影/氛围 + 必要的声音暗示。
2. 运镜必须用方括号标签，紧跟在被控制的那句之后，例如：
   女主抬眼看向窗外[推镜]，风把窗帘吹起[跟随]。
   允许的标签： [推镜] [拉镜] [摇镜] [跟随] [环绕] [固定] [升] [降] [手持]。
   一镜以 1–3 个标签为限，禁止堆一串互相冲突的运镜。
3. 总长度宁短勿水，一般 80–280 字，硬上限 7000 字。

【图生视频 / 首尾帧（MODE=i2v 或 first_last）——最高优先级】
- 人物外貌、服装、五官、场景陈设、构图左右关系已由参考图锁定。
- 禁止改脸、改发色、改服装、改场景时代、把室内写成室外。
- 不要用大段文字重复描写首帧里已经看见的静止内容。
- 重点写：从首帧到结束（或到尾帧）的动作过程、镜头如何动、光影如何变、口型/对白节奏、环境运动（风、雨、车流）。
- MODE=first_last 时：动作必须能合理连接两帧；不要写出尾帧里不存在的结局。

【文生视频（MODE=t2v）】
- 必须交代空间、主体、动作、光线，因为没有参考图。
- 不要写画面比例数字（由接口字段负责）。

【事实约束】
- 保留对白原意；需要口型时用「角色名：『台词』」这种短插入，不要扩写成旁白小说。
- 保留时长语义（几秒内能完成的动作），不要写「然后第二天」。
- 不要编造输入里没有的道具、配角、情节。
- 若输入含 @图片N / @姓名 等全能指图语法：全部去掉，改为一句「外貌与场景以参考图为准」。

【禁止】
- 英文关键词堆砌（masterpiece, 8k, best quality）。
- 分镜编号、JSON、Markdown 列表。
- 要求模型「加字幕、加台标、加水印」。
- 与 API 字段重复且无效的指令（分辨率、fps、seed）。
```

锁定后缀（`locked_suffix`，UI 不可改）建议：

```text
OUTPUT: 只输出一段最终中文提示词。不要前言。不要把规则复述给用户。
```

---

## 7. 一期占位 vs 二期要填厚的 Skill

一期注册表已有这些 id（`videoPromptSkills.js`），PromptEditor 里也能看见。**H3 / generic 已是完整正文**；其余是薄模板或 `phase1Skip: true`。

| id | 一期 | 二期 |
|---|---|---|
| `minimax_h3` | 完整官方正文，已接入生成 | 可选接 H3-Context-IR 引擎（§15.6） |
| `generic` | 完整兜底；经典润色共用 | 补「标签分句信息点」强制保留（对齐 `extractRetentionClausesFromVideoPrompts`） |
| `minimax_hailuo` | 薄模板，已匹配 | **填厚**（P2-A） |
| `kling` | 薄模板，已匹配 | **填厚**（P2-B） |
| `wan` | 薄模板，需 protocol+model 双命中 | **填厚**（P2-C） |
| `seedance` | 薄模板，需 protocol+model 双命中 | **填厚**（P2-D） |
| `kling_omni` | `phase1Skip: true`，全能时返回 null | **打开并保真 `@图片N`**（P2-E） |
| `seedance_omni` | 同上 | **打开并保真全能版式**（P2-F） |
| `sora` / `grok2api` / `veo3` 等 | 未注册，走 generic | 按用量新增（P2-G） |

二期**不要改** `processVideoGeneration` 钩子和「真源不回写」原则。只改：注册表开关、`getVideoSkillDefaultBody`、匹配单测、少量校验器、UI 展示。详细任务见 **§15**。

---

## 8. 界面改动清单

### 8.1 PromptEditor

- `PROMPT_META` 增加 `group: 'core' | 'video_skill'`（现有条目 `core`）。
- 左侧先小组标题「剧本与分镜」「视频模型 Skill」。
- 视频 Skill 条目显示「用于：MiniMax-H3」这类匹配说明（`description`）。

### 8.2 生成设置

- 开关「生成视频前按当前模型优化提示词」。
- 可选「缓存改写结果到分镜」（默认关）。
- 展示当前默认视频配置解析出的 Skill 名；未匹配则「将使用通用 Skill」或「当前模型无专用 Skill」。

### 8.3 列表页分镜视频区（`FilmCreate.vue`）

- 视频提示词预览旁：Skill 徽章 +「按当前模型优化」。
- 优化弹窗：左原稿、右流失改写；底部「用改写结果生成」「用原稿生成」「采用到缓存」。
- 生成中/完成后：若 `prompt_adapted`，在视频卡片上显示「H3 优化」。

「视频配置」弹窗里视频提示词今天是只读自动拼装。不要在那里直接塞 H3 词。优化入口放在「手工编辑」那条线上。

### 8.4 画布

- `CanvasStoryboardPanel` 视频词旁同样按钮（复用 composable，不要复制 FilmCreate 大段逻辑）。
- 工作流生视频走后端钩子，画布不必自己改 prompt；但空槽按钮旁可用小字「将按 H3 优化」。

### 8.5 不要做的 UI

- 不要在分镜上做「模型下拉」再绑 Skill（视频模型仍以 AI 配置默认项为准）。
- 不要让用户给每一镜选 Skill。
- 不要把 OpenClaw skill 文件选择器做进 UI。

---

## 9. 分期

按顺序。同一期内按编号。没勾完核验不算完成。

### P0 地基（不接生成）

1. `videoPromptSkills.js` 注册表 + `resolveVideoPromptSkill` 纯函数。
2. `PROMPT_META` 增加 `video_skill.minimax_h3`、`video_skill.generic`（可同时登记其它 id，正文可先等于 generic）。
3. `promptI18n.getDefaultPromptBody` / `getLockedSuffix` 支持这些 key；补 `getClassicVideoPromptPolishPrompt` = generic 正文。
4. PromptEditor 分组。
5. `GET /settings/video-prompt-skills` 与 `resolve`。
6. 单测：H3 模型/协议命中 `minimax_h3`；Hailuo 不命中 H3；无协议时模型正则仍能命中；全能+omni 协议 skip。

**核验（一期已完成）**

- [x] `backend-node` 单测覆盖匹配表（`test/videoPromptSkills.test.js`）。
- [x] 提示词页能看见 H3 Skill，保存/恢复默认走现有 overrides。
- [x] 尚未点生成时，行为与现在完全一样。

### P1 MiniMax H3 闭环（本功能的最小可用）

1. `videoPromptAdaptService.adaptPrompt({ skill, canonical, fields, mode })`：调文本模型、截断、校验。
2. `processVideoGeneration` 在 `callVideoApi` 前接入；总开关 + `adapt_prompt`；失败降级。
3. `video_generations` 增加 `prompt_skill_id`、`prompt_adapted`（migrate `ensureColumns`）。
4. 流式预览 API + 前端弹窗。
5. 列表页徽章与「按当前模型优化」。
6. 生成设置开关。
7. 日志：`[VideoPromptSkill] skill=minimax_h3 in=.. out=.. elapsed=`，prompt 只打长度和前 80 字。

**核验（一期已完成，手工项仍建议回归）**

- [x] 默认视频 = H3 时走 `maybeAdaptVideoGenerationPrompt`（`test/videoPromptAdapt.test.js`）。
- [x] `storyboards.video_prompt` 生成前后不由 Skill 回写。
- [x] `video_generations.prompt_skill_id` / `prompt_adapted` 列已加。
- [x] 关掉总开关：`adapt_video_prompt=false` 跳过改写。
- [x] 文本模型失败：`processVideoGeneration` catch 后用原稿。
- [x] 画布 `runVideoStep` 走同一 `videosAPI.create` → 后端钩子。
- [ ] 手工：无图 T2V 改写含场景建立。
- [ ] 手工：`frontweb` `npm run build` 通过。

### P1b 收编半成品经典润色

1. 旧 stream 路由改用 generic Skill 正文。
2. 前端若接「润色通用视频词」，文案与「按当前模型优化」分开。
3. 禁止再出现对 `getClassicVideoPromptPolishPrompt` 的悬空调用。

**核验（一期已完成）**

- [x] `getClassicVideoPromptPolishPrompt` 已导出，等于 generic Skill 系统提示词。
- [x] 旧路由不再因方法缺失 500。
- [x] 模型优化接口 `video-prompt-adapt-stream` **不**写回 `video_prompt`。

### P2 / P3 · 二期

见 **§15**。不要在这里另开一套钩子。

---

## 10. 建议改动的文件

**后端**

- 新建 `backend-node/src/services/videoPromptSkills.js`
- 新建 `backend-node/src/services/videoPromptAdaptService.js`
- 新建 `backend-node/test/videoPromptSkills.test.js`
- 新建 `backend-node/test/videoPromptAdapt.test.js`（mock `generateText`）
- 修改 `backend-node/src/services/promptI18n.js`（默认正文、generic、exports）
- 修改 `backend-node/src/routes/promptOverrides.js`（meta + group）
- 修改 `backend-node/src/routes/storyboards.js`（预览 stream；收编 classic polish）
- 修改 `backend-node/src/routes/index.js`、`settings.js`、`videos` 若需透传 `adapt_prompt`
- 修改 `backend-node/src/services/videoService.js`（钩子 + 新列）
- 修改 `backend-node/src/db/migrate.js`（ensureColumns）

**前端**

- 修改 `frontweb/src/components/PromptEditor.vue`
- 修改 `frontweb/src/api/prompts.js`、`storyboards.js`、`videos` 若有
- 修改 `frontweb/src/views/FilmCreate.vue`（按钮与弹窗，尽量抽 composable）
- 修改 `frontweb/src/components/dramaCanvas/CanvasStoryboardPanel.vue`
- 修改 `frontweb/src/components/AIConfigContent.vue` 生成设置
- 新建 `frontweb/src/composables/useVideoPromptAdapt.js`
- 单测：skill 徽章展示纯函数（若抽到 utils）

**文档**

- 本文件
- 完成后在 `CHANGELOG.md` 1.3.x 记一条：图文生视频支持按模型 Skill 优化提示词，一期 MiniMax H3

不要改 `openclaw-skill/`。不要为这个功能加新的 Electron 通道。

---

## 11. 测试策略

### 11.1 纯函数（必做）

- 匹配：H3 / hailuo / kling_omni skip / 显式 protocol 压过模型名误判。
- 输出校验：过短、带 ```、超 7000 字截断。
- Omni skip 条件。

### 11.2 服务（mock 文本模型）

- 改写成功覆盖 `video_generations.prompt`，不改 storyboard。
- 改写 throw → 原稿进 `callVideoApi`。
- `adapt_prompt: false` 不调文本模型。

### 11.3 手工（P1 完成时）

默认视频配 H3，经典模式一镜有分镜图：

1. 开开关生成，看日志与（若可抓包）上游 text。
2. 关开关生成，提交词 = 界面上的通用视频词。
3. 预览优化，确认真源未变，再用改写结果生成。
4. 换成海螺或其它模型生成，确认不会套 H3 方括号模板（一期可能走 generic，允许，但不得标 `prompt_skill_id=minimax_h3`）。

---

## 12. 明确不做

- 不把画布改成 ComfyUI 式「提示词节点可接线」。
- 不扫描磁盘上的 `SKILL.md` 作为运行时插件（用户要改词走提示词管理）。
- 不按分镜覆盖视频模型。
- 不把 H3 改写结果当成新的分镜真源。
- **一期**不接 H3-Context-IR（二期 §15.6 可选）。
- **一期**不给 20+ 个协议各写长文案；未填厚的走 generic（二期按 §15 白名单填，仍不给全部协议写长文）。
- 不在视频 API 适配器里用正则「顺手」改 prompt（改写必须发生在 Skill 层，便于用户看见、可关）。
- 二期仍禁止：把 Omni Skill 做成「再跑一遍全能生成」；全能真源仍是 `universal_segment_text`。

---

## 13. 实施时的默认选择（避免开工再问）

若实施中没有新的产品意见，按下面做：

| 问题 | 默认 |
|---|---|
| 改写默认开还是关 | 开（有 Skill 才改；无 Skill 的 generic 也开） |
| 失败 | 原稿继续生成，UI 可 toast「提示词优化失败，已用原稿」 |
| 缓存 | 一期不做列，每次生成改写（前端会话缓存可选用改写结果生成） |
| 旧经典润色 | 保留为「润色通用视频词」，写回真源 |
| 画布 | 只加徽章+按钮，执行仍靠后端钩子 |
| H3 标签语言 | 中文方括号 `[推镜]`，与国内文档一致 |
| 文本 scene_key | `video_prompt_skill` |

二期默认选择见 **§15.8**。

---

## 14. 完成定义（一期）

同时满足才算 P1 完成：

1. 当前视频模型为 MiniMax-H3 时，所有生视频入口都会先走 H3 Skill 再请求视频 API。
2. 用户可在提示词管理中编辑/恢复该 Skill。
3. 用户可在生成设置关闭该行为。
4. 用户可预览改写结果且不污染分镜真源。
5. 换非 H3 模型不会误标、误用 H3 Skill。
6. 改写失败不影响出片。
7. 相关单测与前端 build 通过。

---

## 15. 二期施工图（新对话从这里开工）

> 一期已有：注册表、生成钩子、H3 完整 Skill、generic 兜底、预览弹窗、生成设置开关、真源不回写。  
> 二期只填厚 Skill、打开 Omni、补校验/展示/可选引擎。**禁止重写 `processVideoGeneration` 主路径。**

### 15.0 一期代码地图（不要再发明第二套）

| 能力 | 位置 |
|---|---|
| 注册与匹配 | `backend-node/src/services/videoPromptSkills.js` |
| 改写与预览 | `backend-node/src/services/videoPromptAdaptService.js` |
| 默认正文 | `promptI18n.js` → `getVideoSkillDefaultBody` |
| 生成钩子 | `videoService.js` `processVideoGeneration`（`callVideoApi` 前） |
| 预览 API | `POST /storyboards/:id/video-prompt-adapt-stream` |
| 解析 API | `GET /settings/video-prompt-skills/resolve` |
| 总开关 | `global_settings.adapt_video_prompt` |
| 提交记录 | `video_generations.prompt` / `prompt_skill_id` / `prompt_adapted` / `adapt_requested` |
| 前端预览 | `VideoPromptAdaptDialog.vue` + `useVideoPromptAdapt.js`（**仅会话缓存**） |
| 提示词页 | `PromptEditor.vue` 分组 `video_skill` |

二期每加一个模型的固定三件套：

1. `getVideoSkillDefaultBody('<id>')` 换成完整官方正文（用户可在提示词页改）。
2. `test/videoPromptSkills.test.js` 补匹配；`test/videoPromptAdapt.test.js` mock 输出特征（见各条「输出指纹」）。
3. PromptEditor 已自动列出注册表，**一般不用改 UI**。

顺序：**P2-A → B → C → D → E → F**，然后 G 与 15.4–15.6。同一档内按编号。Omni（E/F）不要提前打开，否则薄模板会破坏 `@图片N`。

---

### 15.1 匹配层必须先改的两点（P2-0，开工第一天）

当前实现（一期）：

```js
if (skill.phase1Skip) continue;                    // kling_omni / seedance_omni 永远跳过
if (skill.skipIf === 'universal_omni' && universalOmni) continue;
if (universalOmni) return null;                    // 全能+Omni 协议 → 不改写
```

二期要的行为：

| 分镜模式 | 视频协议 | 应命中 |
|---|---|---|
| classic | `minimax_h3` | `minimax_h3`（已有） |
| classic | `kling` | `kling` |
| classic | `kling_omni` | `kling_omni`（可当 I2V 用，无 `@图片N` 时按单段改写） |
| **universal** | `kling_omni` | **`kling_omni`**（保真 `@图片N`） |
| **universal** | `volcengine_omni` | **`seedance_omni`** |
| universal | `minimax_h3` | `minimax_h3`（去掉 `@图片N`，一期正文已写） |

**改法**

1. 删掉（或恒为 false）`kling_omni` / `seedance_omni` 的 `phase1Skip`。
2. **这两条的 `skipIf` 改为 `null`**。全能正是它们的主场。一期的 `skipIf: 'universal_omni'` 若留在 Omni Skill 上，打开 phase1Skip 之后全能仍然匹配不到。
3. I2V 族（h3 / hailuo / kling / wan / seedance）**保留** `skipIf: 'universal_omni'` 作为保险，避免协议误判时用 H3 去改全能词。
4. `resolveVideoPromptSkill` 末尾：`if (universalOmni) return null` **删掉**，改为「没有命中任何非 fallback Skill 时，全能+Omni 才返回 null；否则不要用 generic 去改 `@图片N`」。

伪代码：

```
命中非 fallback → 返回该 Skill
if (universalOmni) return null   // 禁止 generic 碰全能词
return generic
```

**核验**

- [ ] 单测：`creationMode:'universal'` + `kling_omni` → `kling_omni`（不再是 `null`）。
- [ ] 单测：`universal` + `volcengine_omni` → `seedance_omni`。
- [ ] 单测：`universal` + `minimax_h3` → 仍是 `minimax_h3`。
- [ ] 单测：`universal` + 未知协议 → `null`，**不是** generic。
- [ ] 单测：`classic` + `kling_omni` → `kling_omni`。
- [ ] 现有 H3 / hailuo / wan 用例全绿。

P2-0 合上之前，**不要**把 Omni 默认正文换成会输出新版式的长文案（薄模板留着直到 P2-E 正文就绪）。

---

### 15.2 各模型 Skill 正文与输出指纹

User 消息骨架继续用 `buildAdaptUserMessage`（§5）。下面每条给出：**官方约束（写入 Skill 正文）**、**输出指纹（单测 mock 后断言）**、**不要做什么**。

实施时把正文粘进 `getVideoSkillDefaultBody`，锁定后缀仍用现有 `VIDEO_SKILL_LOCKED_SUFFIX`。

#### P2-A 海螺 02/2.3（`minimax_hailuo`）

**协议事实**（`videoClient` / `minimax_hailuo` 适配器）：V1 `/v1/video_generation`，与 H3 V2 不是一套；时长常见 6/10 秒档；prompt 为纯文本，图走 `first_frame_image` 一类字段。

**Skill 必须写明**

- 一段连贯中文，主体动作 + 镜头运动用**自然语言**（「缓缓推近」「镜头跟随」），**禁止** H3 的 `[推镜]` 方括号。
- I2V：外貌与场景以参考图为准，只写运动、表情变化、环境动态。
- 时长语义落在 6 或 10 秒能演完的动作；不要写「第二天」「一小时后」。
- 不要英文质量词、不要 `@图片N`。

**输出指纹（mock）**

- 不含 `[推镜]` `[拉镜]` `[跟随]`。
- 含明确运动动词（转身/走/看/推近/跟随 等）。
- 长度 40–800 字。

**核验**

- [ ] 配置海螺时 `prompt_skill_id=minimax_hailuo`，不是 `minimax_h3`。
- [ ] 同一镜先 H3 再换海螺生成：提交词不再带方括号运镜标签。

#### P2-B 可灵经典 I2V（`kling`）

**协议事实**：时长 API 侧钳成 `'5'` 或 `'10'`（见 `videoClient` `klingDuration`）；一镜一请求；非 Omni。

**Skill 必须写明**

- 电影感中文单镜头：起幅（可极简，因有首帧）→ 运动过程（至少 2 个可见动作或运镜，若时长≥5s）→ 落幅情绪。
- **禁止一镜内硬切/分屏/多段落「分镜1分镜2」**（那是 Omni 的活）。
- 运镜写中文：缓推、横摇、跟随、升降；不要方括号标签，不要 `@图片N`。
- 对白用「角色：『台词』」短插入，原字保留。
- 动作必须能在 5 或 10 秒内完成。

**输出指纹**

- 无 `@图片`、无 `分镜1：`、无 `[推镜]`。
- 有运镜或运动过程句。

**核验**

- [ ] protocol=`kling` 且模型不是 o1/omni → `kling`。
- [ ] `kling-video-o1` 不命中本条（应走 `kling_omni`）。

#### P2-C 通义万象 / Wan（`wan`）

**协议事实**：`dashscope` 或 `siliconflow`，模型名含 `wan` / `Wan2` / `kf2v`。`requireModelMatch: true` **不要去掉**（硅基还有别的视频模型）。

**Skill 必须写明**

- 中文短句，顺序建议：主体（可写「与参考图一致」）+ 动作 + 运镜 + 氛围。
- I2V / 首尾帧：禁止改脸改装改场景；首尾帧时动作必须能接到尾帧姿态。
- 硅基/万象对超长中文不友好，目标 **60–180 字**，硬上限沿用 2500。
- 不要 `@图片N`、不要质量词堆砌、不要英文为主（专有镜头术语可夹）。

**输出指纹**

- 长度 < 400 字（mock 场景）。
- 无 `@图片`、无 `[推镜]`。

**核验**

- [ ] `siliconflow` + `Wan-AI/Wan2.2-I2V-A14B` → `wan`。
- [ ] `siliconflow` + 非 wan 模型 → generic（一期已有，勿回归）。

#### P2-D Seedance 经典（`seedance`）

**协议事实**：`volcengine`（非 `volcengine_omni`），模型含 `seedance` 且不是 2.0 全能。项目已有 `layout_description` 空间合同、首尾帧连戏。

**Skill 必须写明**

- 中文影视腔；**首尾帧（MODE=first_last）铁律**：左右站位、人物距离、构图与首帧一致，只演化姿态/表情/结果；禁止左右互换。
- 为 `movement` 留呼吸（缓推可略收、横摇可有进出），不要写成几乎定格。
- 可把 `layout_description` 写进 User 骨架（二期允许给 `buildAdaptUserMessage` 加一行 `LAYOUT_ANCHOR:`，从 `storyboards.layout_description` 取）。这是对本模块骨架的**唯一允许扩展**。
- 不要 `@图片N` 行结构。

**输出指纹**

- MODE=first_last 的 mock 输入含「女主在画面左侧」时，输出仍出现左侧/左，不改成右侧。

**核验**

- [ ] `volcengine` + `doubao-seedance-1-5-pro-251215` → `seedance`。
- [ ] `volcengine_omni` 不命中本条。

#### P2-E 可灵 Omni（`kling_omni`）——二期最危险的一条

**先做完 P2-0，再换正文。**

**与现有「生成/润色全能提示词」的关系（铁律）**

| 入口 | 写谁 | Skill 做什么 |
|---|---|---|
| 分镜「生成/润色全能提示词」 | `universal_segment_text`（全能**真源**） | **不调用**视频 Skill |
| 点「生成视频」 | 提交 `universal_segment_text` 或退回 `video_prompt` | 此时才跑 `kling_omni` Skill |

Omni Skill **不是**再生成一遍全能词。它是提交前的最后整形：

1. **输入已是全能版式**（含 `画面风格和类型:`、`生成一个由以下`、`@图片N`、`分镜k：`）：  
   - 第 1–3 行：第 3 行必须与输入第 3 行**字符级一致**（与现有 `LINE3_REQUIRED` 相同）。  
   - `@图片N` 集合不能增删改号。  
   - `T1+…+TM` 仍等于本镜秒数。  
   - 只改写各「分镜k」行里的动作/运镜/光影措辞。  
2. **输入不是全能版式**（经典 `video_prompt` 被拿去喂 Omni）：  
   - 才允许改写成多拍块，且必须按 `getUniversalOmniMultiBeatFormatSpec` 的行结构，`@图片N` 只能引用 User 里给出的槽位（二期给 Omni 的 User 消息追加 `IMAGE_SLOT_MAP`，从现有 `buildUniversalSegmentUserPromptBundle` 或前端同序：场景→角色→道具）。

**禁止**

- 把 `@图片N` 改成 `@姓名`。
- 输出 SoulLens `主体:/叙事动态:` 单行。
- 调用 H3 / generic 正文。
- 改对白引号内文字。

**输出指纹**

- 已是全能版式的输入：输出仍含相同的 `@图片1` `@图片2`…集合；含 `分镜1：`；第 3 行与输入第 3 行相等（单测可抽 `extractOmniLine3`）。
- 经典词输入：输出以 `画面风格和类型:` 开头，含 `@图片`。

**核验**

- [ ] 全能镜 + 可灵 Omni 生成：提交词仍能被现有 Omni 解析（有 `@图片N`、秒数能加总）。
- [ ] `storyboards.universal_segment_text` 不被 Skill 回写。
- [ ] 预览弹窗对全能镜显示「将使用 可灵 Omni 提示词」，不再提示「请用润色全能提示词」。

**User 骨架扩展（仅 Omni Skill）**

在 `buildAdaptUserMessage` 增加可选块，缺省为空、不影响 H3：

```
IMAGE_SLOT_MAP: ...
LINE3_REQUIRED: ...
TOTAL_CLIP_SECONDS: ...
CURRENT_OMNI_DRAFT: ...   // 即 canonical，若已是全能版式
```

不要为此新建第二个 user builder 文件；用 `opts.omniMeta` 可选对象。

#### P2-F Seedance 全能（`seedance_omni`）

与 P2-E **同一套保真规则**（行结构、`@图片N`、秒数、第 3 行）。差别只写在 Skill 正文：

- 强调方舟多参考图、单镜头完整画幅、**禁止成片模仿四宫格/分屏**（项目全能 UI 文案已有这条，必须写进 Skill）。
- 模型名 `doubao-seedance-2-0-*` / protocol `volcengine_omni`。

可与 P2-E 共用 `omniMeta` 与 `extractOmniLine3` 小函数。

**核验**

- [ ] `volcengine_omni` + universal → `seedance_omni`，不是 `seedance`。
- [ ] 提交词不含「四宫格」「分屏」作为要生成的构图（可用负面句「单镜头完整画幅」）。

#### P2-G 按用量新增的薄+半厚 Skill（可与 E/F 并行，但优先低于 A–D）

只在注册表新增，匹配后走自己的正文；没有就把用量高的先做。建议白名单（仍不要给 20+ 协议各写长文）：

| id | 匹配 | 正文要点 | 语言 |
|---|---|---|---|
| `sora` | `sora` / `sora_official` | 英文镜头句，秒数，少形容词堆砌；I2V 不改外貌 | en |
| `grok` | `grok2api` / `xai`，模型 `grok-imagine-video*` | 英文、短、运动明确；参考图模式 duration≤10 的语义不要在文案里写超长故事 | en |
| `veo3` | `veo3` / `gemini` 视频 | 英文 cinematic action；图已锁定外貌 | en |

英文 Skill 的锁定后缀可单独一条：`OUTPUT: English prompt only. No preamble.` 在 `getLockedSuffix('video_skill.sora')` 等返回，不要把中文锁定套上去。

**核验**

- [ ] 中文项目 + Sora：输出以英文为主，不把整段中文 `场景：动作：` 原样丢上去。
- [ ] 未注册协议仍走 generic（中文），行为不低于一期。

---

### 15.3 generic 补强（随 P2-A 一起做）

一期 generic 已能用。二期补一条，与 `extractRetentionClausesFromVideoPrompts` 对齐：

- 若 CANONICAL 含「场景：/动作：/运镜：/配乐：/=VideoRatio:」等标签分句，成稿必须保留每一类信息点（允许换序，禁止整类消失）。
- 仍禁止输出 `[推镜]` 和 `@图片N` 版式（那是专用 Skill 的活）。

单测：输入带 `配乐：无` 与 `=VideoRatio: 16:9` 的 mock 输出仍能匹配到「无」与 `16:9` 或「16比9」。

---

### 15.4 提交词可查看 + 改写失败可感知（P2-UI）

一期缺口：用户看不到 `video_generations.prompt`，失败只打日志。

**做**

1. 列表视频卡片 / 画布视频空槽：已有「已按 xx 优化」徽章。点击徽章或「查看提交词」打开只读对话框，展示：
   - 分镜真源 `video_prompt` 或全能词（标明「未提交」）
   - 本次 `video_generations.prompt`（标明 skill 名）
   - 复制按钮
2. 数据：`videosAPI.list` 已返回 `prompt` / `prompt_skill_id` / `prompt_adapted`（`rowToItem` 已带）。不要再加列。
3. 改写失败：`processVideoGeneration` 已 warn。二期在 `video_generations` **不要**为此 failed。可选：列表 toast 一次「提示词优化失败，已用原稿提交」（需前端在轮询 completed 后看 `prompt_adapted===false` 且配置了 Skill——易误报）。更稳：后端成功出片时若 `skippedReason` 为 `sanitize_failed` 或 catch，写 `prompt_adapted=0` 并在 item 上加 `prompt_adapt_error` 短字符串（新列可空 TEXT）。没有该列就跳过 toast，只保证日志。

**建议**：先做只读「查看提交词」，`prompt_adapt_error` 列为可选项，不要阻塞 A–F。

**核验**

- [ ] H3 生成完成后打开提交词，能看到方括号运镜，且分镜编辑框里的通用词仍无方括号。
- [ ] 复制按钮复制的是提交词不是真源。

---

### 15.5 分镜级改写缓存（P2-Cache，可选但建议做）

一期：每次生成都调文本模型；「采用到本镜提交缓存」只在前端 `Map` 里，刷新即丢。

**做**

`storyboards` 增加（`ensureColumns`）：

- `adapted_video_prompt` TEXT
- `adapted_video_skill_id` TEXT
- `adapted_video_source_hash` TEXT
- `adapted_video_prompt_at` TEXT

Hash = 对 canonical 真源（`video_prompt` 或提交用的那段）做稳定短哈希（sha256 前 16 位即可，Node `crypto`）。

命中条件（`maybeAdaptVideoGenerationPrompt` 开头）：

- 总开关开
- `adapted_video_skill_id === 当前 skill.id`
- `adapted_video_source_hash === hash(row.prompt)`
- `adapted_video_prompt` 长度 ≥ 12

命中则直接用缓存，不调文本模型，仍写 `video_generations.prompt_adapted=1`。

写入时机：

- 预览接口成功且用户点「采用到本镜提交缓存」→ `POST /storyboards/:id/video-prompt-adapt-cache`（一期规划有、未做）
- 生成时改写成功 → **默认也写入**（二期默认开；生成设置加「缓存改写结果到分镜」，默认 true）

真源一改（手工编辑 `video_prompt` / 重建视频词 / 全能润色）必须清 hash 或让下次对不上。在 `storyboards.update` 里若 `video_prompt` 或 `universal_segment_text` 变化，把三列置空。

**核验**

- [ ] 同一镜连续生成两次 H3、真源未改：第二次日志无 `adapted` 的 generateText（或有 `cache hit`）。
- [ ] 改一个字视频词后再生成：重新改写。
- [ ] 换海螺再生成：不使用 H3 缓存。

---

### 15.6 H3-Context-IR（P2-Engine，可选，放在 A–F 之后）

MiniMax 官方有只增强提示词、不生成视频的接口（H3-Context-IR）。大量用户走中转站，**默认仍用文本模型 + Skill 正文**。

**做**

Skill 定义增加可选 `engine: 'text' | 'minimax_context_ir'`，默认 `'text'`。

仅当同时满足才走官方增强：

- 当前 skill 是 `minimax_h3`
- `config.api_protocol === 'minimax_h3'`
- base_url 像官方 `minimaxi.com` / `minimax.io`（不是任意中转）
- 生成设置 `h3_context_ir: false` 默认关，用户打开才用

走 IR 时：把 canonical 送 IR，返回的 `content.prompt` 再过 `sanitizeAdaptedOutput`；IR 失败则回退文本模型，再失败则原稿。

**不要**在中转站上猜 IR 路径。

**核验**

- [ ] 默认关：行为与一期完全相同（单测 mock 不出现第二 fetch）。
- [ ] 打开但 base 不是官方：仍走文本模型。

---

### 15.7 二期不要动的

- `processVideoGeneration` 的调用顺序（拿 config → 改写 → callVideoApi）。
- 真源字段：`video_prompt` / `universal_segment_text` 不被 Skill 覆盖。
- OpenClaw `openclaw-skill/`。
- 分镜级视频模型下拉。
- 把画布做成提示词节点可接线。
- 用 generic 去「优化」全能词。
- 在 `callMinimaxH3VideoApi` / 可灵适配器里直接改 `prompt` 字符串。

---

### 15.8 二期默认选择（避免开工再问）

| 问题 | 默认 |
|---|---|
| Omni Skill 是否替代「润色全能提示词」 | **否**。全能真源仍手工/流式生成；Skill 只在提交前整形 |
| 打开 Omni 后通用 Skill 还碰不碰全能 | **不碰**（匹配末尾 universalOmni → null） |
| 海螺用不用 `[推镜]` | **不用** |
| 英文模型 Skill 输出语言 | 英文 |
| 分镜 DB 缓存 | 做（15.5），默认写入 |
| H3-Context-IR | 默认关 |
| 查看提交词 | 做（15.4） |
| 新协议长文案 | 只白名单 sora / grok / veo3，其余 generic |

---

### 15.9 二期文件清单

**必改**

- `backend-node/src/services/videoPromptSkills.js`（P2-0 匹配；P2-G 新 id）
- `backend-node/src/services/promptI18n.js`（各 `getVideoSkillDefaultBody`；英文锁定后缀）
- `backend-node/src/services/videoPromptAdaptService.js`（omni User 块、缓存命中、可选 IR）
- `backend-node/test/videoPromptSkills.test.js`
- `backend-node/test/videoPromptAdapt.test.js`（每条 Skill 一条输出指纹）
- `CHANGELOG.md`

**P2-E/F 额外**

- `buildAdaptUserMessage` 可选 `omniMeta`
- 小函数抽 `omniPromptFormat.js`：`isOmniFormatted` / `extractOmniLine3` / `collectAtImageTokens`（**要单测**，这是防回归的核心）

**P2-UI / Cache**

- `videoService.js` `rowToItem` 已有字段；前端 `FilmCreate.vue` 提交词对话框
- `migrate.js` 分镜缓存列
- `storyboards.js` update 时清缓存；新 `POST .../video-prompt-adapt-cache`
- `settings.js` `adapt_video_prompt_cache`、`h3_context_ir`
- `AIConfigContent.vue` 两个开关
- `useVideoPromptAdapt.js` 会话缓存与 DB 缓存并存：有 DB 则以服务端为准

**不要新建**第二套 `processVideoGeneration`。

---

### 15.10 二期测试与手工核验

**自动（每条 Skill 合并前必须绿）**

- 匹配表：§15.1 全部断言。
- `omniPromptFormat`：从一段真实全能词 fixture 抽出 `@图片1,@图片2` 与 line3。
- mock `generateText`：各 Skill 输出指纹（§15.2）。
- 缓存：hash 命中不调用 generateText（把 aiClient 换成 throw）。

**手工**

1. 海螺一镜 I2V：提交词无方括号；真源不变。
2. 可灵 I2V：单段电影句，无 `分镜1：`。
3. 全能 + 可灵 Omni：先「润色全能提示词」，再生成视频；成片请求里 `@图片N` 与润色结果一致（允许动作句换词）。
4. 换 H3 再生成同一全能镜：提交词**没有** `@图片1`（H3 正文要求去掉）。
5. 查看提交词对话框能区分真源/提交。
6. 关总开关：所有模型都不改写。

---

## 16. 二期完成定义

同时满足才算二期可发布：

1. P2-0 匹配行为与 §15.1 表完全一致，一期 H3 用例不回归。
2. 海螺 / 可灵 I2V / Wan / Seedance 经典四条正文已换厚，且生成时 `prompt_skill_id` 正确。
3. 可灵 Omni、Seedance 全能在全能模式下会改写，但 **`@图片N` 与秒数总和与第 3 行不被破坏**；`universal_segment_text` 不被回写。
4. generic 不会再吃掉全能提交。
5. 用户能查看并复制「本次提交词」。
6. （若做了 15.5）真源未变时第二次生成走缓存。
7. 相关单测通过；`frontweb` build 通过。

§15.6 H3-Context-IR **不是**二期发布门槛。

---

## 17. 二期明确不做

- 不把「按当前模型优化」与「润色全能提示词」合成一个按钮。
- 不按分镜选择 Skill。
- 不从磁盘扫描 `SKILL.md`。
- 不为 Fal/Runway/Luma/Pika/Pixverse/即梦自建等再写长文案（继续 generic），除非后续单独开三期。
- 不在适配器层做 prompt 正则替换。
- 不把 H3 方括号标签推广到海螺/可灵。

---

## 18. 给二期实施对话的第一周排期

| 天 | 做完 |
|---|---|
| D1 | P2-0 匹配 + 单测全绿 |
| D2 | P2-A 海螺正文 + 指纹测 + 手工一镜 |
| D3 | P2-B 可灵 I2V + P2-C Wan |
| D4 | P2-D Seedance 经典 + generic 信息点 |
| D5–D6 | `omniPromptFormat` + P2-E 正文；全能回归 |
| D7 | P2-F Seedance 全能；P2-UI 查看提交词 |

P2-G、缓存、Context-IR 放第二周，做不完也不挡二期发布（完成定义 §16 第 6 条可降级为「未做缓存则在 CHANGELOG 写明」）。
)