# 列表模式 ↔ 画布模式 双向开发计划

> 日期：2026-09-21  
> 范围：让列表（`FilmCreate`）与画布（`DramaCanvas`）成为**同一份项目文档的两个投影**，任何一边的新建 / 删除 / 改字段 / 改绑定，另一边都能看到同一条记录。  
> 前置：`docs/plans/2026-06-15-drama-canvas-workflow-plan.md`（画布是视图层）、`docs/plans/2026-09-19-canvas-remediation.md`（D4 禁止自由接线）。本计划**不推翻**这两条，只补「客户端不同步」这一层。

---

## 0. 怎么用这份文档

- 按 **W0 → W1 → W2 → W3 → W4** 做。同一波内按编号顺序。W5 是可选体验，W6 是明确不做。
- 每条都有 **问题重点 / 改法 / 不改什么 / 核验**。核验未全部勾上，该条不算完成。
- 改完必须 `cd frontweb && npm run build` 通过。涉及纯函数的条目必须补 `frontweb/test/` 单测。
- 手工核验默认项目：至少 8 个分镜、2 集、其中 1 集已有手工拖过的 `canvas_layout`；经典模式与首尾帧模式各走一遍「列表新建 → 切画布」和「画布新建 → 切列表」。
- 本轮**禁止**把画布改成可任意接线的第二份真源，也**禁止**把 `FilmCreate.vue` 一万行一次性重写成绑定 store 的表单。列表继续用现有 `sbAction` / `sbDialogue` 等本地 map，靠「drama 变更时再同步一遍」接双向。

### 难度

| 档 | 含义 | 预估 |
|---|---|---|
| W0 低 | 纯函数、契约、单测，不接 UI | 0.5～1 天 |
| W1 中 | 画布改读 Pinia；列表 watch 同一份 drama | 1～2 天 |
| W2 中 | 抽出共享 mutation，两边创建/删除/改字段走同一入口 | 2～3 天 |
| W3 中 | 列表增删改序时写入 `canvas_layout` 落点 | 1～2 天 |
| W4 中 | 画布主路径 CRUD 对齐列表（插入、模式、旁白、上移下移） | 2～3 天 |
| W5 可选 | keep-alive / 分栏，两边同时开着也能即时看见 | 2～4 天 |
| W6 不做 | 自由接线、列表当节点编辑器、把所有列表字段搬进 Inspector | — |

---

## 1. 一句话目标

列表改项目，画布上的节点 / 空槽 / 虚线跟着变；画布新建或改项目，列表里的分镜 / 角色 / 场景 / 道具跟着变。两边改的是**同一行数据库记录**，不是互相翻译的两份副本。

「列表修改画布」的正确含义：列表改的是分镜表、绑定关系和顺序，画布作为投影重画；若该项目已有手工布局，列表的增删还要给新节点一个不打架的坐标。  
「画布修改列表」的正确含义：画布上的新建 / 保存 / 删除走现有 API，并且把结果写回共享文档，列表不必等一次「碰巧重新进页」才看见。

---

## 2. 现在到底双向在哪、断在哪

### 2.1 已经双向（服务端文档）

| 操作 | 列表 | 画布 | 真源 |
|---|---|---|---|
| 新建分镜 | `storyboardsAPI.create` | `useCanvasCrud.createStoryboard` 同一 API | `storyboards` 表 |
| 删除分镜 | `storyboardsAPI.delete` | Inspector / Delete 键同一 API | 同上 |
| 改对白 / 提示词 / 绑定 | `storyboardsAPI.update` | `CanvasStoryboardPanel` 同一 API | 同上 |
| 新建角色 / 场景 / 道具 / 集 | 各 save / create API | `useCanvasCrud` 同款或等价 API | 现有表 |
| 生图 / 生视频 / 配音 | 列表流水线 | `runImageStep` 等，最终同一 create 接口 | `image_generations` / `video_generations` / 音频路径 |
| 打开另一模式 | `goCanvasMode` 带 `?episode=` | `goListMode` 带 `?episode=` 与 `#sb-id` | 路由，不是数据 |

切页时两边都会 `GET /dramas/:id`。所以**关页再开，数据是通的**。用户觉得不是双向，是因为客户端各持一份内存，而且画布独占坐标。

### 2.2 实际断裂点

1. **两份客户端 drama。** `useFilmStore().drama` 只给列表用。画布自己 `const drama = ref(null)`，每次进页再拉一遍。Pinia 里那份对画布无效。
2. **列表还有第三份副本。** `FilmCreate.vue` 把当前集分镜拆成 `sbAction` / `sbDialogue` / `sbCharacterIds` / … 几十个 map。即使 store 更新了，不跑 `syncStoryboardStateFromEpisode`，列表输入框仍显示旧值。
3. **布局与实体脱节。** `canvas_layout.nodes` 只在画布拖拽 / 对齐时写入。列表新增一镜不会给 `sb:{id}` 写坐标；再进画布时新节点走 `resolveNodePosition` 的默认网格，和已经手拖过的行叠在一起或插到错误的 Y。
4. **画布创建比列表瘦。** 画布分镜对话框只有标题 + 描述；没有「在此之前插入」、没有 `creation_mode`、没有旁白、没有上移/下移镜号。深字段仍靠「列表详情」。
5. **布局保存可能误伤文档。** `persistCanvasState` 在 `saveCanvasLayout` 成功后，若返回体带 `episodes` / `characters` 就整段替换本地 `drama`。布局接口本应只碰 `metadata`。W1 要规定：布局保存只 patch `metadata` + `updated_at`。
6. **工作流组是画布私有 UI。** `workflow_groups` 已在 metadata 里，列表不需要编辑它。双向范围不包括「在列表里画分组框」。

### 2.3 目标结构

```
                    ┌─────────────────────────┐
                    │  服务端真源（不变）        │
                    │  分镜/角色/场景/道具表     │
                    │  + metadata.canvas_layout │
                    │  + metadata.workflow_groups│
                    └────────────┬────────────┘
                                 │ GET / PUT 现有 API
                    ┌────────────▼────────────┐
                    │  Pinia drama 文档         │
                    │  store.drama + revision   │
                    │  applyServerDrama()       │
                    │  patchStoryboard() 等     │
                    └──────┬───────────┬──────┘
           列表投影         │           │         画布投影
    FilmCreate             │           │      DramaCanvas
    syncStoryboardState    │           │      rebuildGraph()
    本地 sbXxx map         │           │      Vue Flow nodes/edges
                           │           │
              列表 mutation ─┴─ 共享 useDramaMutations ─┴─ 画布 mutation
              （create / insertBefore / update / delete / 绑定）
```

连线仍然由 `dramaCanvasAdapter.js` **推导**，`:nodes-connectable="false"` 保持。用户在列表里改「角色绑定 / 分镜顺序」，虚线和顺序链跟着变——这就是列表改画布拓扑的唯一合法方式。

---

## 3. 不变量（全程有效）

1. **真源仍是表，不是图。** 禁止用户手拉 `sbimg → sbvid` 以外的边；禁止把边写进 metadata。
2. **`canvas_layout` 只存坐标和视口。** 节点是否存在由实体决定；没有分镜就没有 `sb:{id}`，即使 layout 里还留着旧 key（读取时忽略，删除时顺手清掉）。
3. **工作流组只属于画布 UI。** 列表增删分镜后，组内 `storyboard_ids` 要丢掉已删除的 id，但不在列表页提供「创建工作流」。
4. **切模式保留集数。** 已有 `?episode=`；本轮补上画布→列表的 `#sb-{id}` 在从 Inspector 跳转时保持（已有），从顶栏「列表模式」若有焦点分镜也带上 hash。
5. **全量 GET 是兜底，不是热路径。** 改一个标题不要把整本剧的本地编辑态冲掉。生成类任务完成后才全量刷新媒体。
6. **不把列表 100% 搬进 Inspector。** 四宫格、参考图上传、`@图片N`、小说导入、字幕烧录仍走列表。画布主路径是：新建、插入、删、改文案/绑定/模式/旁白、生图生视频配音、首尾帧、衔接。

---

## 4. 数据契约

### 4.1 客户端文档

扩展现有 `frontweb/src/stores/film.js`（不要再开第二个 drama store，避免双缓存）。新增字段与方法建议如下，名称可微调，语义不能变：

```js
// 已有
drama                    // 完整 GET /dramas/:id 形状
currentEpisode
setDrama(d)
setCurrentEpisode(ep)

// 新增
revision                 // 单调递增，供视图 watch
mediaEpoch               // 图/视频列表需要重拉时 +1
loadDrama(id, { silent }) // 唯一全量加载入口
applyServerDrama(d, { replaceMedia?: boolean })
patchStoryboard(episodeId, storyboardId, patch)
upsertStoryboard(episode, storyboard, { index })
removeStoryboard(storyboardId)
upsertAsset(kind, entity)          // character | scene | prop
removeAsset(kind, id)
patchEpisode(episodeId, patch)
patchMetadata(partialMeta)         // 合并 canvas_layout / workflow_groups
pruneWorkflowGroups(validSbIds)
```

`FilmCreate.loadDrama` 与 `DramaCanvas.loadDrama` 都改成调用 `store.loadDrama`。禁止视图里再直接 `dramaAPI.get` 后只写自己的 ref。

### 4.2 变更分类

| 级别 | 例子 | 客户端做法 |
|---|---|---|
| L1 字段 | 改对白、标题、提示词、时长、旁白、creation_mode | API update → `patchStoryboard`，不重拉图 |
| L2 结构 | 新建 / 插入 / 删除分镜或素材、改镜号顺序、改角色/场景/道具绑定 | API → upsert/remove → 画布 `rebuildGraph`；若已有 layout 则走 W3 落点 |
| L3 媒体 | 生图、生视频、配音、尾帧衔接、上传参考图 | API + 任务轮询 → `mediaEpoch++` → 列表 `loadStoryboardMedia`、画布 `loadForDrama` |
| L4 布局 | 拖节点、对齐、视口 | 只 `saveCanvasLayout` + `patchMetadata`；**禁止**用返回体覆盖 episodes |

### 4.3 新分镜的画布落点（W3 核心纯函数）

文件建议：`frontweb/src/utils/canvasLayoutInsert.js`（或并入 `canvasLayout.js`）。

输入：当前 `canvas_layout`、该集分镜数组（含新镜、已按 `storyboard_number` 排序）、新镜 id、插入下标、项目是否首尾帧 / 全能。

规则：

1. 若 `layout.nodes` 为空：不写坐标，交给 adapter 默认网格。
2. 若该集已有保存过的 `sb:{id}`：
   - **追加在末尾：** 新行 Y = 最后一镜 `sb` 的 Y + `SB_GAP_Y`（280），X = 该镜 X；媒体链用相对偏移 `MEDIA_OFFSET_X` / `MEDIA_GAP_X`（与 adapter 常量同源，禁止再写一套魔数）。
   - **插入在 i：** 把 i 及之后每一镜的整行（`sb` + `sbtxt`/`sbuni` + 图槽 + 视频 + 音频）Y 全部 +`SB_GAP_Y`；新行占用原来 i 的 Y。
3. 媒体槽位按模式一次写全（空槽也要有 id，与 R1 空槽稳定 id 一致）：
   - 经典：`sbtxt`、`sbimg`、`sbvid`、`sbaud:{id}:dialogue`
   - 首尾帧：`sbtxt`、`sbimg-first`、`sbimg-last`、`sbvid`、音频
   - 全能：`sbuni`、`sbvid`、音频
4. 删除：去掉该 id 的全部节点 key；**本波默认不自动收拢空洞**（避免打乱用户横向拖拽）。用户可点「对齐节点」做全量网格。可选后续：只收拢同一集的 Y。
5. 列表改绑定（角色/场景/道具）：**不改坐标**，只靠 adapter 重画虚线。

导出函数至少：

- `mediaNodeIdsForStoryboard(sb, { useFirstLastFrame })`
- `rowOffsets()`  // 返回各媒体节点相对 sb 的 {x,y}
- `insertStoryboardLayout(layout, episode, newSb, index, options)`
- `removeStoryboardLayout(layout, storyboardId)`
- `shiftEpisodeRows(layout, episode, fromIndex, dy)`

---

## 5. 需求条目

### W0 · 契约（先写测试再接线）

#### R0 纯函数与 fixture

**问题重点**  
落点和 patch 逻辑若直接写在 Vue 里，列表和画布会再次分叉。

**怎么改**

1. 新增 `frontweb/test/canvasLayoutInsert.test.js`、`frontweb/test/dramaDocumentPatch.test.js`。
2. Fixture：一集 3 镜，已保存 `sb:1` Y=200、`sb:2` Y=480、`sb:3` Y=760；在镜 2 前插入新镜 99，断言镜 2/3 的 sb 与 sbimg Y 都 +280，新镜 Y=480。
3. 删除镜 2：layout 中不再有 `sb:2` / `sbimg:2` 等；镜 1、3 坐标不变。
4. `patchStoryboard` 浅合并，不丢未出现在 patch 里的字段（特别是 `characters`、`first_frame_*`）。

**不改什么**  
不改 Vue 组件。

**核验**

- [ ] `cd frontweb && node --test "test/*.js"` 全绿。
- [ ] 插入测试覆盖经典 / 首尾帧 / 全能三种媒体 id 集合。

---

### W1 · 共享 drama 文档

#### R1 画布改读 `useFilmStore`

**问题重点**  
画布 `loadDrama` 写入本地 ref，和列表的 store 互不看见。

**怎么改**

1. `DramaCanvas.vue` 的 `drama` 改为 `storeToRefs(useFilmStore()).drama`（或 computed 包一层，避免把 store 拆丢）。
2. `loadDrama` 调用 `store.loadDrama(id)`。
3. `persistCanvasState` 成功后只 `store.patchMetadata({ canvas_layout, workflow_groups })`，禁止 `drama.value.episodes = updated.episodes`。
4. `refreshCanvas` / `refreshDrama` 对 L3 走 `store.loadDrama(id, { silent: true })` + `loadForDrama`；对 L1/L2 能 patch 则不 GET。

**不改什么**  
不改 Vue Flow 手势、空槽、Inspector 外观。

**核验**

- [ ] 列表改一镜对白并保存，不关应用，进画布，Inspector 打开该镜能看到新对白（W1 结束后靠进页 GET 即可；W2 后应无需依赖「列表先保存到服务器」之外的任何本地通道——仍是服务器为真源）。
- [ ] 画布拖节点保存后，`GET /dramas/:id` 的 episodes 数量与内容与保存前一致（抓包或刷新列表核对）。
- [ ] `npm run build` 通过。

#### R2 列表 watch `store.drama`

**问题重点**  
画布已经把新分镜写进库，用户切回列表时 `FilmCreate` 会重新挂载并 `loadDrama`，目前其实能看到。W1 仍要接 watch，否则 W5 keep-alive 和「同页分栏」会立刻脏读；也防止将来路由变成 keep-alive 时回归。

**怎么改**

1. `FilmCreate.vue` 对 `store.drama` + `store.revision` 做 watch：若 `currentEpisode` 仍在新 drama 里，对该集调用现有 `syncStoryboardStateFromEpisode`。
2. watch `store.mediaEpoch`：调用现有 `loadStoryboardMedia`。
3. 正在聚焦的 textarea（例如正在改对白）**不要**被 watch 覆盖：若 `document.activeElement` 在该分镜的输入框内，跳过该字段或整镜跳过，失焦后再同步。最小实现：`revision` 变化时若有 `activeSbField` 则延迟到 blur。
4. `store.reset()` 仅在离开项目（回首页 / 换 id）时调用；切画布不要 reset。

**不改什么**  
不把 `sbDialogue` 等 map 删掉。

**核验**

- [ ] 单元无法覆盖「焦点保护」时，手工：列表焦点在对白框，另一边（或控制台）`patchStoryboard` 同一镜的 title，对白框不被打断；blur 后 title 更新。
- [ ] 切到画布再切回列表，分镜数量与文案一致。

---

### W2 · 统一 mutation

#### R3 `useDramaMutations`

**问题重点**  
`useCanvasCrud` 和 `FilmCreate.onAddSingleStoryboard` / `onDeleteSingleStoryboard` / `onInsertStoryboardBefore` 各写一遍序号和 refresh，落点规则无法共用。

**怎么改**

新建 `frontweb/src/composables/useDramaMutations.js`，内部用 store + 现有 API：

| 方法 | API | 之后 |
|---|---|---|
| `createStoryboard({ episodeId, title, description, atIndex?, flowPosition? })` | `storyboardsAPI.create` | upsert + W3 落点 |
| `insertStoryboardBefore(sb)` | `storyboardsAPI.insertBefore` | 全量或按返回列表 upsert + 落点 |
| `deleteStoryboard(id)` | `storyboardsAPI.delete` | remove + `removeStoryboardLayout` + `pruneWorkflowGroups` |
| `updateStoryboard(id, patch)` | `storyboardsAPI.update` | `patchStoryboard` |
| `createCharacter/Scene/Prop/Episode` | 现有 API | upsertAsset / 刷新 episodes |
| `setStoryboardRelations(id, { character_ids, scene_id, prop_ids })` | update | patch + 画布重画虚线 |

`useCanvasCrud.submitCreate` 与 `FilmCreate` 的添加/删除/插入改为调这些方法。  
`CanvasStoryboardPanel.saveFields` / `onRelationChange` / `deleteStoryboard` 同样改走这里，不要再自己 `refreshDrama()` 全量 GET（L1 保存后 patch 即可；删除走 L2）。

**不改什么**  
生成（生图/视频）仍走 `useCanvasWorkflowRunner` 与列表原函数，只在完成后 `mediaEpoch++` 并按需 GET。

**核验**

- [ ] 列表点「添加分镜」，网络里有 create；Pinia `drama.episodes[].storyboards` 立即 +1；再进画布无需第二次 create。
- [ ] 画布右键新建角色，切列表，本集角色下拉能选到新角色。
- [ ] 画布删除分镜，切列表，该镜消失；工作流组若含该 id，metadata 里已去掉。
- [ ] 列表保存对白，画布不刷新页面、仅切过来后内容一致（W2 结束时因会卸载画布，进页 GET 即可）。

#### R4 序号与插入语义对齐

**问题重点**  
两边都用「当前最大 `storyboard_number` + 1」。列表另有 `insertBefore`。画布没有插入，导致「列表改顺序、画布按旧坐标看」更乱。

**怎么改**

1. 追加：`storyboard_number = max+1`，落点用「末尾规则」。
2. 插入：必须走 `insertBefore` API（后端已重排镜号），客户端用返回的该集 storyboards 替换，再对**新 id** 做插入落点，对后续镜做 Y 下移。
3. 不要在前端自己改其它镜的 `storyboard_number` 除非 API 已改完。

**核验**

- [ ] 在镜 3 前插入，列表顺序 1,2,新,3,4；画布竖排顺序相同（按 `storyboard_number`）。
- [ ] 后端镜号与画布卡片 `#N` 一致。

---

### W3 · 列表写画布落点

#### R5 创建 / 插入 / 删除时更新 `canvas_layout`

**问题重点**  
这是用户说「列表可以修改画布」里目前唯一缺的持久化部分。没有它，列表加镜只改表，画布手拖布局会把新镜丢到默认 (360, 网格Y)。

**怎么改**

1. `useDramaMutations` 在 L2 成功后：
   - 读 `parseCanvasLayout(store.drama.metadata)`
   - 调用 R0 的 insert/remove
   - `dramaAPI.saveCanvasLayout(id, nextLayout)`（不要带 workflow_groups 除非同时 prune）
   - `store.patchMetadata({ canvas_layout: nextLayout })`
2. 画布右键带 `flowPosition` 时：**覆盖**自动 Y/X，沿用现在 `saveNodePosition` 行为；媒体槽仍按相对偏移排在该点右侧。
3. 若项目从未进过画布（无 `canvas_layout`）：L2 **不**主动写 layout，保持「进画布才生成默认网格」。

**不改什么**  
列表页不出现拖拽画布。用户不能在列表里改 X/Y。

**核验**

- [ ] 手工拖乱 5 镜后再用列表追加第 6 镜，进画布：前 5 镜坐标不变，第 6 镜在第 5 镜下方 280px，右侧有空槽，不与第 1 镜重叠。
- [ ] 在已有 layout 的集中间插入，后续行整体下移，插入行空槽完整。
- [ ] 列表删除一镜，画布不再出现该 `sb:{id}`；其它镜坐标不变。
- [ ] 从未打开过画布的项目，列表加镜后 metadata 仍无 `canvas_layout`；第一次进画布自动布局正常。
- [ ] 单测覆盖「有 layout / 无 layout」两条。

#### R6 绑定变化只重画边

**问题重点**  
列表改分镜角色后，画布虚线应变。不需要动坐标。

**怎么改**  
L2 绑定 patch 后 `revision++`。画布若已挂载（W5）则 `rebuildGraph`；未挂载则下次 `buildDramaCanvasGraph` 自然用新 `characters` / `scene_id` / `prop_ids`。

检查 adapter 的 `getAssetRelationHighlight` 与建边逻辑是否和列表保存格式一致（有的分镜是 `characters: [{id}]`，有的是 id 数组）。W3 顺手加一条 adapter 单测：绑定 id 数组也能画出 `e-char-*-sb-*`。

**核验**

- [ ] 列表给镜 1 绑角色 A，进画布点角色 A，镜 1 高亮。
- [ ] 取消绑定后虚线消失。

---

### W4 · 画布主路径 CRUD 对齐

目标：日常「加一镜、插一镜、改文案、切全能、写旁白、删掉」不必再跳列表。不是把列表所有控件搬过来。

#### R7 画布插入分镜

**怎么改**

1. 分镜节点右键菜单增加「在前方插入」「在后方追加」。
2. 前方走 `insertStoryboardBefore`；后方走 `createStoryboard`。
3. 创建后 focus 新 `sb:{id}`，打开 Inspector。

**核验**

- [ ] 画布在镜 2 前插入，列表顺序正确。
- [ ] 新镜空槽齐全，可直接生图。

#### R8 画布：模式、旁白、上移下移

**怎么改**

1. Inspector 增加 `creation_mode` 切换（经典 / 全能）。切换后 `rebuildGraph`（全能去掉经典图槽，出现 `sbuni`）。走 `updateStoryboard`。
2. 旁白字段：`narration` 文本；有旁白再画 `sbaud:{id}:narration` 由 adapter 决定——若当前 adapter 只画对白槽，本条只保证字段能保存到列表；旁白空槽若要画出来，单列 adapter 小改，不要做完整旁白混音 UI。
3. 「上移 / 下移」：若后端没有 swap API，本波用「读相邻镜号、两次 update `storyboard_number`」或复用 insert 语义前先查后端。**优先查现有 storyboard 路由**；没有 swap 就前端两次 update，然后对这两行做 layout Y 交换（只交换这两行节点组，不动其它集）。
4. 顶栏「列表模式」若 `focusedNodeId` 是分镜，带 `#sb-{id}`。

**不改什么**  
角度、运镜、景深、四宫格、参考图上传、layout_description 重生，仍只在列表。Inspector 已有「在列表中编辑参考图」保留。

**核验**

- [ ] 画布把一镜改成全能，切列表该镜是全能；画布行变成 `sbuni → sbvid`。
- [ ] 画布填写旁白，列表旁白框一致。
- [ ] 上移后两边顺序一致，手工 X 保留、两行 Y 对调。

#### R9 画布新建对话框补集数提示与失败态

**问题重点**  
未选集合灰提示「请先选择集数」，新用户以为画布不能新建。

**怎么改**  
无 `filterEpisodeId` 且多集时，对话框先选集，或默认当前展开集。单集项目自动用那一集。不要静默失败。

**核验**

- [ ] 两集项目、顶栏集数=「全部」，右键新建分镜能选集并创建成功。
- [ ] 单集项目不弹选集。

---

### W5 · 可选：同时开着也能即时看见

W0–W4 完成后，**切页已经是双向**。W5 只解决「两个视图同时存在」。

#### R10 路由 keep-alive（推荐，先于分栏）

**怎么改**

1. `App.vue` 对 `film` 与 `film-canvas` 做 `keep-alive`（`include` 这两个 name，组件需设 `defineOptions({ name: 'FilmCreate' })` 等）。
2. 两边 `watch(store.revision)`：列表跑 R2 同步；画布 `rebuildGraph`（L1 可只更新对应 node.data，允许第一版整图 rebuild）。
3. `watch(store.mediaEpoch)` 拉媒体。
4. 切走画布时仍 debounce 保存 layout（现有 `onBeforeUnmount` 要改成 `onDeactivated` 也存一次）。

**风险**  
`FilmCreate` 极重，keep-alive 会占内存。只缓存当前 `dramaId`；换项目 `store.reset` 并让 keep-alive 的 `max=2`。

**核验**

- [ ] 列表加镜，不刷新，切画布（组件未销毁）立刻多一行。
- [ ] 画布改标题保存，切列表输入框已是新标题。
- [ ] 换另一个项目再回来，不会串戏。

#### R11 分栏（不默认做）

左右同时显示列表与画布。工作量大、`FilmCreate` DOM 更重，**本轮默认不做**。若做，必须先完成 R10，分栏只是两个已订阅 store 的组件并排。不要为分栏再写一套同步。

---

### W6 · 明确不做

| 编号 | 内容 | 原因 |
|---|---|---|
| X1 | 用户自由拉线、自定义节点、A/B DAG | 违反「画布是视图层」；真源不能变成图文档 |
| X2 | 列表页拖拽改 `canvas_layout` | 列表不是节点编辑器 |
| X3 | 把四宫格 / 参考图上传 / `@图片N` / 小说导入 / 字幕烧录搬进画布 | 已在整改计划 D4；跳列表即可 |
| X4 | 重写 `FilmCreate.vue` 去掉 sbXxx map | 与双向无关的巨型重构 |
| X5 | WebSocket / 多人协作 | 本地单用户 |
| X6 | 列表展示工作流分组框 | 画布私有 UI |
| X7 | 每次列表加镜都「对齐全部节点」 | 会毁掉用户手拖布局 |

若以后要做 X1，必须先写新的真源设计，不能在 adapter 派生边上硬接。

---

## 6. 建议施工顺序与文件

### 波次

| 波次 | 条目 | 做完用户能感到什么 |
|---|---|---|
| 第一波 | R0 → R1 → R2 | 两边读同一份 drama；布局保存不再误替换分镜 |
| 第二波 | R3 → R4 → R5 → R6 | 列表加/插/删镜，画布位置正确；画布新建回列表可见 |
| 第三波 | R7 → R8 → R9 | 画布能当主路径工作台，不必为插入/模式/旁白跳列表 |
| 可选 | R10 | 来回切页不丢组件、立刻看见 |
| 不做 | R11、W6 | — |

### 主要文件

| 文件 | 动作 |
|---|---|
| `frontweb/src/stores/film.js` | 扩展文档方法 |
| `frontweb/src/utils/canvasLayout.js` 或 `canvasLayoutInsert.js` | 落点纯函数 |
| `frontweb/src/utils/dramaCanvasAdapter.js` | 绑定建边与列表字段格式对齐；导出间距常量 |
| `frontweb/src/composables/useDramaMutations.js` | **新建**，唯一结构变更入口 |
| `frontweb/src/composables/useCanvasCrud.js` | 改调 mutations |
| `frontweb/src/views/DramaCanvas.vue` | 改用 store；布局保存只 patch metadata |
| `frontweb/src/views/FilmCreate.vue` | 添加/删除/插入改调 mutations；watch revision |
| `frontweb/src/components/dramaCanvas/CanvasStoryboardPanel.vue` | 保存/删除/关系走 mutations；R8 字段 |
| `frontweb/src/components/dramaCanvas/CanvasContextMenu.vue` | 插入分镜 |
| `frontweb/src/components/dramaCanvas/CanvasCreateDialog.vue` | R9 选集 |
| `frontweb/test/canvasLayoutInsert.test.js` | **新建** |
| `frontweb/test/dramaDocumentPatch.test.js` | **新建** |
| `frontweb/test/dramaCanvasAdapter.test.js` | 补绑定虚线 |

后端：W0–W4 **默认不改路由**。只在 R8「上移下移」发现没有安全的镜号交换接口时，才加一个小 API。不要为双向去改 `saveCanvasLayout` 的合并语义（它已经 merge metadata）；前端停止误用返回体即可。

---

## 7. 全局核验（每一波结束时跑一次）

1. `cd frontweb && npm run build`
2. `cd frontweb && node --test "test/*.js"`
3. 明暗主题各一遍：列表新建分镜 → 画布看见空槽 → 画布生图 → 列表看见图。
4. 反向：画布右键新建分镜/角色/场景/道具 → 列表对应栏出现。
5. 已有手工布局的项目：列表插入一镜，旧节点不跳动，新行落在正确顺序。
6. 缩放与手势回归（整改计划全局核验第 4 条）：滚轮缩放、右上角控件、中键/右键平移。
7. 导出 ZIP 再导入：`canvas_layout` 与分镜都在，两边仍对得上。
8. 列表主路径无回归：首尾帧、尾帧衔接、全能流式、批量生图。

---

## 8. 完成定义

同时满足才算「双向」过关：

- 列表追加 / 插入 / 删除分镜后进入画布：顺序一致，已有手工坐标的节点不重置，新镜有完整空槽且不与旧镜重叠（无 layout 的项目仍走默认网格）。
- 画布新建分镜 / 角色 / 场景 / 道具 / 集后进入列表：能看到、能继续编辑、能选进分镜绑定。
- 任一端改对白、标题、提示词、角色/场景/道具绑定，另一端看到同一内容。
- 画布可插入分镜、切换经典/全能、编辑旁白，结果写回同一行记录。
- 保存 layout 不会减少、打乱或回滚分镜内容。
- W6 清单没有被偷偷开工。
- 全局核验 1～8 全过。

W5 keep-alive 不是过关必要条件。切页重挂载 + 共享 store + 落点，已经满足「双向」产品语义。

---

## 9. 与既有计划的关系

- 本计划**依赖**整改计划已落地的空槽（R1）、Inspector（R3）、首尾帧/衔接（R8/R9）。那些是画布能作为工作台的前提。
- 本计划**不替代**整改计划未做完的条目。若空槽仍未画，先把空槽做完再做本计划 W3，否则落点函数写出的媒体 id 在图上根本没有节点。
- 画布工作流组、整组重跑、后端 `workflow-runs` 仍只从画布发起；列表不提供入口，但删除分镜必须 prune 组内 id（R3）。

---

## 10. 风险

| 风险 | 规避 |
|---|---|
| `FilmCreate` 本地 map 与 store 双写打架 | 只允许 map 在用户输入时领先；blur/保存走 mutations 写回 store；外部 revision 在无焦点时覆盖 map |
| `insertBefore` 返回形状与 create 不同 | mutations 里归一成「该集 storyboards 数组」；单测用真实 fixture |
| 全量 GET 冲掉未保存的列表输入 | L1 禁止 GET；切画布前提示或自动 blur 保存当前字段（最小：沿用现有 `@blur` 保存） |
| keep-alive 内存 | W5 才开启；max=2；换项目 reset |
| 把双向理解成自由接线 | W6；code review 拒绝 `nodes-connectable=true` |
| 列表每次加镜触发整图对齐 | R5 只插入一行，不对齐全局 |
