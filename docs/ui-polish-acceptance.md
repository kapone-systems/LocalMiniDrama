# LocalMiniDrama UI 美化验收报告（A 层 + B 层）

> 对应计划：`docs/plans/2026-09-18-ui-polish-a-b.md`
> 执行日期：2026-09-18　范围：仅 A 层 + B 层，未触碰 C/D 层，未改任何业务逻辑。

---

## 1. 改动文件清单

### 第一轮（A 层 + B 层）

| 文件 | 改动 |
|---|---|
| `frontweb/src/main.js` | 引入 `element-plus/theme-chalk/dark/css-vars.css`；**并把 `styles/theme.css` 移到 EP 样式之后**（见 §4 关键修正） |
| `frontweb/src/styles/theme.css` | `html.dark` 的 EP 变量映射、暗色紫色主色、设计令牌、全局 EP 观感统一、注释修正、`.page-header` 兜底 |
| `frontweb/src/components/AppHeader.vue` | **新增**公共 Header 组件 |
| `frontweb/src/views/AiConfig.vue` | header 迁移 |
| `frontweb/src/views/DramaDetail.vue` | header 迁移 |
| `frontweb/src/views/FilmList.vue` | header 迁移 |
| `frontweb/src/views/DramaCanvas.vue` | header 迁移 |
| `frontweb/src/views/FilmCreate.vue` | **仅** header 段迁移（其余 10k+ 行未动） |

### 第二轮（优化建议）

| 文件 | 改动 | 对应 |
|---|---|---|
| `frontweb/index.html` | **新增**内联主题脚本（首帧防闪烁） | §6.1 |
| `frontweb/src/styles/theme.css` | `:root` 拆为亮色默认 + `html.dark`；收窄 `.header`/`.logo` 到 `.app-header`；合并 `.canvas-panel-popper` | §6.1 / §6.4 / §6.6 |
| `frontweb/src/components/AIConfigContent.vue` | 追加 `html.dark` 覆盖；5 处 `#409eff` → 令牌 | §6.2 / §6.3 |
| `frontweb/src/components/PromptEditor.vue` | 追加 `html.dark` 覆盖 | §6.2 |
| `frontweb/src/components/SceneModelMap.vue` | `#409eff` → 令牌 | §6.3 |
| `frontweb/src/views/MediaLibrary.vue` | 3 处 `#409eff` → 令牌 | §6.3 |
| `frontweb/src/views/FreeCreate.vue` | 2 处 `#409eff` → 令牌 | §6.3 |
| `frontweb/src/components/dramaCanvas/CanvasAssetPanel.vue` | 删除重复 popper 定义 | §6.4 |
| `frontweb/src/components/dramaCanvas/CanvasStoryboardPanel.vue` | 删除重复 popper 定义 | §6.4 |

`git status` 确认：`api/`、`stores/`、`utils/`、`router/`、`backend-node/` **零改动**。

---

## 2. 验收证据

### 2.1 构建（要求 4）

```
cd frontweb && npm run build
✓ built in 4.90s      # 每次任务改完均执行，全部通过
```

产物：`frontweb/dist`（Electron 打包版加载此目录，`desktop/main.js:156`）。
另用 `vite preview`（:4013）验证 **生产构建** 渲染正确：
`--el-bg-color=#18181b`、`--el-color-primary=#a78bfa`、按钮圆角 `8px`、`--radius-md=10px`。

### 2.2 前端测试（计划 §5.4）

```
cd frontweb && node --test "test/*.test.js"
ℹ tests 10   ℹ pass 10   ℹ fail 0
```

与计划记录的改造前基线一致（10 用例全绿）。

### 2.3 功能回归（计划 §5.3）

`tools/ui-verify/regression.js` 逐页真实点击验证，**明暗两套均 43/43 通过**：

| 页面 | 覆盖项 |
|---|---|
| FilmList | 3 素材库按钮、微信我、AI配置、导入项目、新建项目、主题切换、**导入 zip input 保留**、素材/微信/AI 三个弹窗可开、项目卡片渲染 |
| DramaDetail | logo、动态标题、返回列表、进入制作、画布模式、主题切换、episode 卡片 |
| FilmCreate | **z-index 200**、**margin-left 180px**、集数选择器、返回剧集、画布模式、AI配置、主题切换、**侧栏折叠跟随 48px 且无重叠**、AI配置弹窗 |
| DramaCanvas | **非 sticky**、副标题=画布模式、workflow-bar / generate-bar 保留、集数筛选、剧本、6 个新建节点、对齐节点、列表模式、主题切换 |
| AiConfig | 返回按钮（且点击确实跳转 `/`）、主题切换（新增）、页面标题 |

浏览器控制台：7 页全部无错误（`tools/ui-verify/check-errors.js`）。

### 2.4 截图（要求 2）

| 目录 | 内容 |
|---|---|
| `docs/ui-baseline/` | 改造前基线 **16 张**（7 页 × 明暗 + AI 配置弹窗 × 明暗） |
| `docs/ui-after-a/` | A 层完成后 14 张 |
| `docs/ui-after-b/` | B 层第 1 页迁移后 2 张 |
| `docs/ui-after-b-final/` | B 层全部完成后 16 张（7 页 × 明暗 + 弹窗 × 明暗） |
| `docs/ui-before-optimize/` | 第二轮改动前基准 14 张（用于比对优化前后） |
| `docs/ui-after-optimize/` | 第二轮优化后 14 张 |

**核心成效（像素统计，`tools/ui-verify/analyze.js`）**

| 截图 | 纯白像素占比 | 平均亮度 |
|---|---|---|
| `ai-config-dark` 改造前 → 后 | 13.3% → **0.0%** | 95.9 → **38.6** |
| `film-dark` 改造前 → 后 | 27.2% → **0.0%** | 99.6 → **33.2** |
| `drama-dark` 改造前 → 后 | 10.3% → **0.0%** | 47.9 → **22.7** |
| `dialog-aiconfig-dark` 改造前 → 后 | 37.0% → **0.0%** | 150.0 → **36.5** |
| `dialog-aiconfig-light` 改造前 → 后 | 42.5% → 42.5% | 194.8 → 194.8 |

亮色模式全部页面 `avgLum` 变化 ≤ 1.5，符合计划 §5.2「亮色不应有任何变化」。

---

## 3. 计划标注的三处坑（要求 5）

### 坑 1：FilmCreate 的 `@media (max-width: 768px)`（`FilmCreate.vue:8483`）

**采用计划推荐的方案 1**：`AppHeader` 根元素同时保留 `header` 与 `app-header` 两个类名
（`<header class="header app-header">`），使该裸类选择器继续生效。

实测（`tools/ui-verify/probe-width.js`，视口 700px）：

```
headerMarginLeft: "48px"    navWidth: 48    overlap: false    z-index: 200
```

同时 `.sidebar-collapsed .header { margin-left: 48px }`（1440px 下点击折叠按钮）实测
`margin-left: 180px → 48px`，`overlap: false`。

> **实现细节**：`offsetLeft` 通过 CSS 变量 `--app-header-offset-left` 下发，而**不用内联
> `style.marginLeft`**。因为内联样式优先级高于 `.sidebar-collapsed .header` 这条类选择器规则，
> 会锁死折叠联动；改用变量后，页面规则仍可正常覆盖。

### 坑 2：公共类边界

按计划 §4.0 迁移的 8 个公共类：`.header`、`.header-inner`、`.logo`、`.logo-main`、
`.logo-sub`、`.page-title`、`.header-actions`、`.btn-theme`。

**保留在页面 scoped CSS 的类**（属页面设计，未移入组件）：
`.header-library`、`.header-episode-select`、`.btn-back-drama`、`.btn-canvas-mode`、
`.btn-back-list`、`.btn-library`、`.btn-wechat`、`.btn-settings`、`.btn-import`、
`.btn-new`、`.btn-ai-config`、`.breadcrumb-sep`、`.episode-select`、`.layout-status`、
`.page-title`、`.workflow-bar`、`.generate-bar`。

> **与计划的一处偏差（有意）**：计划把 `.page-title` 列入"迁移后从各页删除"的 8 个公共类，
> 但它实际位于 `center` **插槽内容**中。Vue 的作用域规则下，插槽内容属于**父组件**编译域，
> 组件自身的 scoped CSS（带 `data-v-组件` 属性）无法命中它。若删除页面定义，`.page-title`
> 会完全失去样式。故 `.page-title`（及 `.breadcrumb-sep`）保留在各页 scoped CSS —— 这也正是
> 计划 §4.0「槽位边界」一节的规则（"页面特有的类保留在各页 scoped CSS"）。两处规则冲突时，
> 以槽位边界为准。

清理结果（计划 §4.3 命令）：

```
grep -rn "^\.header {\|^\.logo-main\|^\.btn-theme" views/     → 无输出 ✅
grep -rn "linear-gradient(135deg, #a5b4fc|#d0d5e8|#c4b5fd" views/  → 无输出 ✅
grep -c 'class="header-actions"' 5 个 view                    → 全为 0 ✅
```

（`#a5b4fc` / `#c4b5fd` 仍出现在 FilmList/FilmCreate 中，但那是**按钮与状态色**，非 logo 渐变，
按计划 §6.7 不做 D 层令牌化。）

### 坑 3：圆角统一 8px

按计划**未加 `!important`**，与既有 4 处 `html.light ... !important`（theme.css:359/379/390/448）
自然对齐。实测**明暗一致**：

| 元素 | 亮色 | 暗色 |
|---|---|---|
| `.el-button` | 8px | 8px |
| `.el-input__wrapper` | 8px | 8px |
| `.el-dialog` | 14px | 14px |
| `.el-table` | 10px | 10px |

---

## 4. 计划外的一处关键修正（必须记录）

计划 §T-A1 只要求"在 `element-plus/dist/index.css` **之后**"新增暗色 import，未提
`theme.css` 的位置。但原 `main.js` 的顺序是 `theme.css` → `element-plus/dist/index.css`，
即 **theme.css 在 EP 样式之前**。

EP 的 `dark/css-vars.css` 与我们的 `html.dark { --el-bg-color: ... }` **特异性相同**
（都是 `html.dark`），此时由**源码顺序**决定胜负。若按原顺序，EP 的 `--el-bg-color:#141414`
会反过来覆盖项目令牌映射。

**处理**：把 `import './styles/theme.css'` 移到 EP 两个 CSS 之后。构建产物验证：

```
dist/assets/index-*.css:
  html.dark{color-scheme:dark;...--el-bg-color:#141414   ← EP 暗色默认
  html.dark{--el-bg-color: var(--bg-card)                ← 项目映射，在后，胜出
```

运行时实测 `--el-bg-color` 由 `#ffffff`（改造前）→ `#18181b`，符合预期。

---

## 4b. 迁移中引入并已修复的亮色回归（logo 对比度）

**发现方式**：交付后复查时，用 `tools/ui-verify/crop-analyze.js` 对 header logo 区域做 WCAG
对比度测量（改造前后同坐标裁剪对比），发现亮色下 logo 可读性**下降**。

**根因**：迁移前 4 个页面各自定义了 `html.light .logo-main { background: linear-gradient(...) }`
（深紫渐变，白底可读）。B 层把这些页面规则统一收进 `AppHeader.vue` 时，只保留了暗色的
浅紫渐变（`#a5b4fc → #c084fc → #f0abfc`），**漏掉了亮色覆盖**。`theme.css` 里那条
`html.light .logo { background: ... }` 救不了 —— `.logo-main` 自身绘制 `background-image`，
会盖掉父级渐变。

**修复**：在 `AppHeader.vue` 补回 `html.light .logo-main` 覆盖，取原 `FilmList` 的深紫渐变
（`#4f46e5 → #7c3aed → #9333ea`），因为它的对比度原本就是各页中最好的。

**实测对比度（WCAG，白底）**

| 页面 | 改造前 | 回归时 | 修复后 |
|---|---|---|---|
| 项目列表 | 5.25:1 | 2.44:1 | **5.37:1** |
| 剧集管理 | 4.22:1 | 2.44:1 | **5.37:1** |
| 画布 | 2.25:1 | 2.41:1 | **5.37:1** |
| AI 配置 | 2.23:1 | 2.44:1 | **5.37:1** |

修复后不仅回到基线，还**高于**基线（原来 2 个页面只有 2.2:1，未达 AA）。
暗色侧不受影响（7.0:1，浅紫渐变保持）。

> 教训：B 层「统一 logo 样式」时必须同时检查**亮色与暗色两套**覆盖。各页原本的
> `html.light` 覆盖是逐页手写的，收拢到组件时极易只搬暗色那半。


---

## 5. 未纳入范围（计划明确排除）

- **C 层**（`FilmCreate.vue` 深度打磨）：未做。
- **D 层**（774 处硬编码色令牌化）：未做。
- **FreeCreate / MediaLibrary 的暗色适配**：这两页 scoped CSS 硬编码亮色底（`#f5f7fa`）
  且全项目 `html.dark` 覆盖为 0 条，属**既有状况**，计划 §8 明确标注"不迁移"。T-A5 因此
  **只补 `padding` 与 `border-bottom`，未加 `background`** —— 若加背景色，会在暗色下形成
  "亮页上的暗条"，反而更突兀。
- **`prefers-color-scheme` 跟随系统**：计划 §2 决策 D1 建议单独立项，未做。
- 默认主题保持**亮色**（决策 D1 推荐项），仅修正 `theme.css` 过时注释。

---

## 6. 第二轮：优化建议执行记录

针对 §6 列出的遗留问题逐项执行。**结论：6 项中 5 项已修复，1 项经实验证明不可安全缩减（已回滚）。**

### 6.1 ✅ 已修复 · 主题闪烁（FOUC）

**问题**：`index.html` 的 `<html>` 无类名，`theme.css` 的 `:root` 兜底为暗色值，
而 `useTheme.js` 要等 JS 执行后才加 `light` 类 → 亮色用户首帧看到暗色。

**修复**：
1. `index.html` 的 `<head>` **最前面**加内联脚本，在首次绘制前设好 `light`/`dark` 类
   （逻辑与 `useTheme.js` 对齐：仅 `'dark'` 视为暗色；`try/catch` 兜底为亮色）。
   Electron 侧已核实**无 CSP**（`desktop/main.js` 无 `contentSecurityPolicy`），内联脚本可用。
2. `theme.css` 把 `:root, html.dark` 拆为 `:root, html.light`（默认亮色）+ `html.dark`，
   消除"暗色当兜底"的语义矛盾。

**验证**（`tools/ui-verify/check-fouc2.js`：拦截 JS bundle，使 `main.js` 不执行，
精确模拟"CSS 已加载、应用 JS 未执行"的首帧；在生产构建 `vite preview` 上测）：

| 用户偏好 | 修复前首帧 | 修复后首帧 |
|---|---|---|
| 亮色 | `rgb(8,8,24)` 全暗 | **`rgb(244,242,250)`** ✅ |
| 暗色 | `rgb(8,8,24)` | `rgb(15,15,18)` ✅ |

### 6.2 ✅ 已修复 · 暗色下浅色底残留

**问题**：`AIConfigContent.vue` / `PromptEditor.vue` 按亮色硬编码浅底+深字，
暗色下形成"暗页上的浅色块"。实际扫描出的范围**比初报的 5 处更大**——
`AIConfigContent.vue` 有 11 处浅底 + 20 余处写死灰阶文字。

**修复**：在两个文件的 scoped 块末尾追加 `html.dark` 覆盖（浅底改半透明同色系、
深字改令牌）。**只改颜色，不改布局**。`.ph-tag-img` 的蓝 / `.ph-tag-vid` 的绿
保留为语义类型色（区分图片/视频），未强改为品牌紫。

**验证**：

| 指标 | 修复前 | 修复后 |
|---|---|---|
| `.default-tip` 背景 | `rgb(240,249,255)` | `rgb(125,211,252)` @ 12% |
| 该区域 WCAG 对比度 | 2.70:1（不达 AA） | **5.93:1** ✅ |
| 暗色页亮背景元素数（7 页扫描） | ai-config 1、film 3 | **0**（仅剩 `el-switch` 旋钮，属 EP 正常设计） |

### 6.3 ✅ 已修复 · 硬编码 EP 蓝 `#409eff`

14 处裸用中替换 13 处为 `var(--el-color-primary)`：

| 文件 | 处数 |
|---|---|
| `AIConfigContent.vue` | 5（含 1 处模板内联 style） |
| `FilmCreate.vue` | 3（含 1 处模板内联 style） |
| `MediaLibrary.vue` | 3 |
| `FreeCreate.vue` | 2 |
| `SceneModelMap.vue` | 1 |

**保留 1 处**：`AIConfigContent.vue` 的 `.ph-tag-img`——它是"图片"类型标识，
与 `.ph-tag-vid`（绿色"视频"）配对构成语义区分，强改主色会丢失该信息。
另 2 处（`:2351` / `:2514`）本来就是 `var(--el-color-primary, #409eff)` 写法，无需改动。

### 6.4 ✅ 已修复 · `.canvas-panel-popper` 重复定义

两个组件里**字节完全相同**的非 scoped 规则已删除，合并到 `theme.css` 单一来源
（popper 由 EP teleport 到 `body`，必须用全局规则，故放 theme.css 是正确位置）。
消除加载顺序依赖。

### 6.5 ⛔ 经实验证明不可安全缩减 · `!important` 治理（已回滚）

**这是本轮最重要的发现。** 我最初用静态分析判断"页面 scoped 未定义同名属性的
`!important` 可安全移除"，得出 46–70 处可去。**实测证明该判断是错的。**

用 `tools/ui-verify/style-snapshot.js`（抓 7 页 × 2549 个元素 × 23 个计算样式属性）
做改动前后精确 diff，三轮实验结果：

| 方案 | 移除数 | 计算样式差异 | 结论 |
|---|---|---|---|
| 静态分析：非 EP 类 + 无页面竞争 | 27 | **61 处** | 不安全，回滚 |
| 静态分析：EP 类 + 无页面竞争 | 70 | **99 处** | 不安全，回滚 |
| 全部剥离（对照实验） | 168 | **341 处** | 证明几乎全部承重 |

典型回归：`.el-table` 表头 `borderBottomColor` 从 `rgb(228,228,231)` 变 `rgb(212,212,216)`、
`.el-radio-button__inner` 圆角从 `8px` 变 `4px 0 0 4px`。**这些页面 scoped 里都没有同名属性**，
是 EP 自带 CSS 与 theme.css 内部多规则叠加的结果——静态分析看不到这一层。

**决定**：回滚，`!important` 保持 167 条。已回滚并验证 `diff = 0`（与改动前完全一致）。

**结论**：`!important` 无法通过"局部删除"治理，只能按 §6.5 原判断走**架构改造**
（页面直接用 `var(--bg-card)` 等令牌，让 `html.light` 覆盖层整体消失）。这必须独立立项，
且改造后仍需用同样的 snapshot diff 逐轮验证。**本轮已把验证工具链建好**
（`style-snapshot.js` + `diff-snapshot.js`），后续改造可直接复用。

### 6.6 ✅ 已修复 · 收窄全局裸类选择器

`html.light .header` → `html.light .app-header`、`html.light .logo` →
`html.light .app-header .logo`（共 4 处，`theme.css:62/66/330/337`）。

**只收窄了这两个类**：核实 `.header` / `.logo` 全项目仅 `AppHeader.vue` 使用（其他使用点 0）。
**`.page-title` 刻意保留全局** —— 它被 7 个页面使用（含 FreeCreate / MediaLibrary 的
`.page-header` 区），收窄会破坏这两页。

验证：亮色下 `header` 仍是白→淡紫渐变、`logo` 仍是紫色渐变，样式未失效。

### 6.7 ⏸ 未处理 · FreeCreate / MediaLibrary 无暗色适配

计划 §8 明确标注"不迁移"，且这两页需整页补暗色（scoped 硬编码 `#f5f7fa` / `#fff`），
属独立工作量。最终扫描显示这两页在暗色下仍各有 3 / 1 处亮背景元素，
即"整页偏亮"的既有状况，非本轮引入。

---

## 7. 第二轮验证结果

| 验证项 | 命令 | 结果 |
|---|---|---|
| 构建 | `npm run build` | ✅ 通过（4.95–5.28s） |
| 单测 | `node --test "test/*.test.js"` | ✅ 10/10 |
| 功能回归（暗色） | `tools/ui-verify/regression.js dark` | ✅ **43/43** |
| 功能回归（亮色） | `tools/ui-verify/regression.js light` | ✅ **43/43** |
| 首帧无闪烁（生产构建） | `tools/ui-verify/check-fouc2.js` | ✅ 明暗均正确 |
| 暗色亮底残留 | 7 页 DOM 扫描 | ✅ 前 5 页 0 处（后 2 页为已知未适配页） |
| 控制台错误 | `tools/ui-verify/check-errors.js` | ✅ 7 页全 OK |
| logo 对比度 | `tools/ui-verify/crop-analyze.js` | ✅ 亮 5.37:1 / 暗 7.0:1 |
| `!important` 回滚一致性 | `tools/ui-verify/diff-snapshot.js` | ✅ 差异 0 |

**截图**：`docs/ui-after-optimize/`（7 页 × 明暗 = 14 张）。

---

## 8. 最终结论

- **A/B 层交付**：完整、无回归。
- **第一轮遗留问题**：FOUC（§6.1）、暗色浅底残留（§6.2）已修复；
  硬编码蓝（§6.3）、popper 重复（§6.4）、裸类选择器（§6.6）已清理。
- **`!important`（§6.5）**：经 3 轮实验证明**不能局部删减**，只能架构改造；
  已回滚，并把验证工具链（`style-snapshot.js` / `diff-snapshot.js`）留给后续立项使用。
- **仍未处理**：FreeCreate / MediaLibrary 暗色适配（计划明确排除）、
  `!important` 架构改造（需独立立项）。
- **净变化**：15 个文件，`+343 / -524` 行（减少的以 5 页重复 header CSS 与重复 popper 为主）。

