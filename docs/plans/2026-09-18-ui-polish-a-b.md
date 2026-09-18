# LocalMiniDrama 前端 UI 美化开发计划（A 层 + B 层）

> **用途**：把这份文档整份交给新对话，即可开始 UI 改造。文档自包含，不依赖之前的对话上下文。
> **目标**：在**不改动任何业务功能**的前提下，提升前端视觉质量与一致性。
> **范围**：仅 A 层（纯 CSS / 主题令牌）+ B 层（抽取公共 Header 组件）。**不含** C 层（FilmCreate.vue 深度打磨）与 D 层（774 处硬编码色令牌化）。

---

## 0. 给新对话的上下文

### 0.1 项目位置与技术栈

| | |
|---|---|
| 前端路径 | `D:\Program Files\work\zcode project\project1\LocalMiniDrama\frontweb` |
| 后端路径 | `D:\Program Files\work\zcode project\project1\LocalMiniDrama\backend-node` |
| 技术栈 | Vue 3.5.27 + Element Plus 2.13.2 + Vite 5 + Pinia + vue-router 4 |
| 当前分支 | `dev`（基线 tag `v1.2.8-upstream`，grok2api 适配 tag `v1.2.8-grok2api`） |
| 前端 dev | `cd frontweb && npm run dev` → 端口 **3013** |
| 后端 dev | `cd backend-node && npm start` → 端口 **5679**（dev server 已配好代理） |
| 打包 | `cd frontweb && npm run build` → 产物在 `frontweb/dist`（Electron 加载此目录，见 `desktop/main.js:156`） |

### 0.2 硬约束（务必遵守）

0. **开工前先处理未提交改动。** 当前 `dev` 分支的工作区**不干净**——上一次 grok2api 适配修复有 12 个文件未提交：

   ```
   M backend-node/src/services/aiConfigService.js
   M backend-node/src/services/imageClient.js
   M backend-node/src/services/ttsService.js
   M backend-node/src/services/videoClient.js
   M backend-node/test/grok2ApiImage.test.js
   M backend-node/test/grok2ApiVideo.test.js
   M docs/configuration.md
   M docs/grok2api-acceptance.md
   M docs/grok2api-contract.md
   ?? backend-node/src/utils/apiUrl.js
   ?? backend-node/test/ttsEndpoint.test.js
   ?? docs/plans/2026-09-18-ui-polish-a-b.md   ← 本文档
   ```

   **建议先 `git add -A && git commit`（或 `git stash`）再开始 UI 改造**，否则 UI 改动会和后端修复混在一起，出问题时无法回退到干净基线。UI 改造本身**不涉及任何后端文件**，两者天然可分离。

1. **只改样式与结构，不改业务逻辑。** 不碰任何 `api/`、`stores/`、`utils/`、路由、后端。
2. **不删任何按钮、不删任何 `@click` 处理器。** B 层抽 Header 时，每个页面原有按钮的功能必须逐一保留。
3. **改完必须 `npm run build` 通过**，且 dev 模式下逐页目视确认。
4. **不要试图令牌化那 774 处硬编码颜色**（那是 D 层，风险高、收益低）。A 层只动 `styles/theme.css` 与全局 EP 覆盖。
5. **`FilmCreate.vue` 是 10791 行的高危文件。** B 层只允许改它的 `<header>` 片段与对应 CSS 块，禁止其他改动。

### 0.3 当前代码规模（实测）

| 指标 | 数值 |
|---|---|
| Vue 文件数 | **32 个**（7 views + 7 components + 17 components/dramaCanvas） |
| 总行数 | 24,446 行 |
| Vue 内 `<style>` 总行数 | 6,412 行 |
| `styles/theme.css` | 484 行 |
| **CSS 合计** | **约 6,896 行** |
| 硬编码 hex 颜色 | **774 处** |
| CSS 变量使用 | **仅 54 处** |
| `html.light` 覆盖规则 | **157 条**（散在 6 个文件） |
| `html.dark` 覆盖规则 | **3 条**（全在 theme.css） |

**结论：颜色令牌纪律极低（774 : 54），这是"观感不统一"的系统性根因。**

> 行数分布：`views/` 15,988 行（其中 `FilmCreate.vue` 独占 10,791 行 = 全前端 44%）、
> `components/` 5,845 行、`components/dramaCanvas/` 2,591 行。

---

## 1. 已核实的关键问题（改造依据）

以下每一条都在源码/构建产物中核实过，带 `file:line`。

### 1.1 🔴 暗色模式下 Element Plus 组件全部是亮色（最严重）

**现象**：点击"暗色"按钮后，页面背景变暗，但**所有 EP 组件仍是白底**——弹窗、表格、下拉框、输入框全白。

**证据链**：

1. EP 的暗色变量文件**从未被引入**：
   ```
   $ grep -rn "css-vars|theme-chalk/dark" frontweb/src/
   （空）
   ```
   `main.js:8` 只 import 了 `element-plus/dist/index.css`，而该文件定义的是 `:root{--el-bg-color:#ffffff}`。

2. `theme.css` 只为亮色映射了 EP 变量（`theme.css:147-162`）：
   ```css
   html.light {
     --el-bg-color: var(--bg-card);
     --el-text-color-primary: var(--text-primary);
     ...
   }
   ```
   暗色下**没有任何对应规则**。

3. 构建产物验证：`html.dark` 规则中的 `--el-*` 变量数量为 **0**：
   ```
   暗色下设置 --el-bg-color 的规则:
     .el-popover.el-popper.is-dark   （EP 自带的 tooltip 暗色，非主题）
     .el-popper.is-dark
   html.dark 规则中的 el- 变量数: 0
   ```

4. 后果：暗色下 `--el-bg-color` 回落到 `:root` 的 `#ffffff`。项目有 **53 个 `el-dialog`、38 个 `el-table`、52 个 `el-select`、200 个 `el-input`、376 个 `el-button`**，全部受影响。

**修复**：引入 EP 暗色变量 + 给 `html.dark` 补一组 `--el-*` 映射。纯 CSS，零逻辑风险。

### 1.2 🟠 默认主题与代码注释矛盾

`theme.css:2` 注释写"暗色模式（默认）"，但实际默认是**亮色**：

```js
// composables/useTheme.js:4
const isDark = ref(localStorage.getItem(STORAGE_KEY) === 'dark')
// 首次访问 localStorage 返回 null → isDark = false → apply() 加上 'light' 类
```

且**没有** `prefers-color-scheme` 跟随系统（全项目 grep 为空）。

**这也是为什么亮色被认真调过（113 条规则）而暗色被荒废（3 条）**——实际只有亮色被看见。

**决策点 D1**：默认主题定为哪个？（见 §2）

### 1.3 🟠 明暗两套主色不一致

| 模式 | `--el-color-primary` | 来源 |
|---|---|---|
| 亮色 | `#7c3aed`（紫） | `theme.css:250` 显式定义 |
| 暗色 | `#409eff`（EP 默认蓝） | 未定义，回落 EP 默认 |

同一个应用切换主题时主色从紫变蓝，观感割裂。代码里 `#7c3aed` 用了 27 次、`#409eff` 用了 16 次，说明紫色是事实上的品牌色。

**修复**：给暗色也定义紫色系主色（注意暗色下紫色需提亮以保证对比度）。

### 1.4 🟠 Header 在 5 个页面重复实现，且样式已漂移

**结构重复**：`FilmList`(47 行)、`FilmCreate`(44 行)、`DramaDetail`(25 行)、`DramaCanvas`(~50 行)、`AiConfig`(~15 行) 各写了一遍 `<header class="header">`。

**样式漂移证据**：

*Logo 渐变有 3 种不同值*：
| 文件 | `.logo-main` 渐变 |
|---|---|
| `FilmList.vue` | `#a5b4fc → #c084fc → #f0abfc` |
| `FilmCreate.vue` | `#d0d5e8 → #a8b0cc → #8890b0`（明显更灰暗） |
| `DramaDetail.vue` / `AiConfig.vue` | `#c4b5fd → #818cf8 → #a78bfa` |
| `DramaCanvas.vue` | 纯色 `var(--text-bright)`（无渐变） |

*`.btn-theme` 有 2 种不同定义*：
| 文件 | 底色 |
|---|---|
| `FilmList.vue` / `DramaDetail.vue` | `rgba(148,163,184,0.1)` |
| `FilmCreate.vue` | `rgba(255,255,255,0.04)` |

*Header 背景有 4 种*：
| 文件 | background |
|---|---|
| `FilmList.vue` | `rgba(12,12,18,0.82)` + 靛紫描边 |
| `FilmCreate.vue` | `rgba(20,21,28,0.78)` + 白描边 |
| `DramaDetail.vue` / `AiConfig.vue` | `rgba(18,18,22,0.82)` + 紫描边 |
| `DramaCanvas.vue` | `var(--bg-card)`（无毛玻璃） |

*主题切换按钮缺失*：只在 4 个页面有（FilmList / FilmCreate / DramaDetail / DramaCanvas），**AiConfig、FreeCreate、MediaLibrary 没有**。

**特殊约束**：`FilmCreate.vue` 的 header 有 `margin-left: 180px`，折叠时为 `48px`（`FilmCreate.vue:8340` 与 `:8343` 的 `.sidebar-collapsed .header { margin-left: 48px }`），与左侧导航栏联动；z-index 是 200（其他页 100，`DramaCanvas` 无 z-index）。抽组件时必须保留这两个能力。

### 1.5 🟡 存在 6 处非 scoped 全局样式块（B 层风险点）

这些 `<style>`（无 scoped）会泄漏到全局，改动时需格外小心：

| 文件 | 全局规则 |
|---|---|
| `views/DramaCanvas.vue` | `html.light .drama-canvas-page`、`html.light .vue-flow-canvas` |
| `components/AIConfigContent.vue` | `.provider-custom-option` |
| `components/StylePickerButton.vue` | `.style-picker-dialog .el-dialog__body` |
| `components/UniversalSegmentOmniAtEditor.vue` | `.omni-at-menu`（17 条 html.light） |
| `components/dramaCanvas/CanvasAssetPanel.vue` | `.canvas-panel-popper`（z-index 4000） |
| `components/dramaCanvas/CanvasStoryboardPanel.vue` | `.canvas-panel-popper`（与上者**重复定义**） |

### 1.6 🟡 现有架构是"倒置"的，不要试图统一

理解这一点能避免大量返工：

- **页面 scoped CSS 里硬编码的是「暗色」值**（例：`FilmList.vue` 的 `.film-list { background: #08080d; color: #e4e4e7; }`）
- **`theme.css` 用 `html.light` 覆盖成亮色**（例：`theme.css:47` 的 `html.light .film-list { background: var(--bg-page); }`）

即：页面 CSS 以暗色为基底，亮色靠全局覆盖。而 `theme.css` 的 EP 部分却是以亮色为基底。

**A 层不要去"修正"这个倒置**——那等于重写 6896 行 CSS。A 层只做**增量补全**：补上缺失的暗色 EP 变量、补齐令牌、统一全局 EP 观感。

---

## 2. 需要先定的决策

### 决策 D1：默认主题

| 选项 | 说明 | 推荐 |
|---|---|---|
| **保持亮色为默认** | 与当前实际行为一致；亮色已被认真调过（113 条规则） | ✅ **推荐** |
| 改为暗色为默认 | 需先完成 A 层修复，且要验证 157 条 `html.light` 规则在暗色下是否留下破绽 | 风险较高 |
| 跟随系统 `prefers-color-scheme` | 需扩展 `useTheme.js`（改逻辑，超出"不改功能"边界） | 建议单独立项 |

> **建议**：A 层**保持亮色默认**，只把 `theme.css:2` 的过时注释改正。把暗色做成"可用的第二主题"，而非改默认。

### 决策 D2：品牌主色

**建议统一为紫色系**：亮色 `#7c3aed`（现状），暗色提亮为 `#a78bfa`（保证暗底对比度）。

> 注意：暗色下直接沿用 `#7c3aed` 会偏暗、对比不足。建议暗色用 `#a78bfa` 作 primary，并按 EP 规范生成 `light-3/5/7/8/9` 与 `dark-2` 全套。

### 决策 D3：是否引入设计令牌（间距/圆角/阴影）

**建议引入最小集**（只加不删，不强制替换现有硬编码值）。**圆角值必须与 T-A3 及现有 `html.light` 的 8px 对齐**：

```css
:root {
  --radius-sm: 6px;    /* tag 等小元素 */
  --radius-md: 10px;   /* 卡片、下拉、表格 */
  --radius-lg: 14px;   /* 弹窗 */
  --shadow-sm: 0 1px 3px rgba(0,0,0,.06);
  --shadow-md: 0 4px 16px rgba(0,0,0,.08);
  --shadow-lg: 0 8px 40px rgba(0,0,0,.12);
  --space-xs: 4px;  --space-sm: 8px;  --space-md: 16px;
  --space-lg: 24px; --space-xl: 32px;
}
```

> **注意**：`--radius-sm` 定 6px 而非 8px，是因为按钮/输入框的 8px 已由现有 `html.light` 规则与 T-A3 的裸规则固定；令牌只用于**新增**样式，不用于回改既有值。若觉得两套数值容易混淆，也可以**跳过 D3 的圆角令牌**，只加 `--space-*` 与 `--shadow-*`。

新写的 CSS 用令牌；既有硬编码值**不动**（避免 D 层风险）。

---

## 3. 阶段 A：主题与全局样式（预计 0.5–1 天）

**原则**：只改 `frontweb/src/styles/theme.css` + `main.js` 一行 import。**不碰任何 `.vue` 文件。**

### T-A0 建立视觉基线（必做，先于一切）

在动手前，先把当前 UI 截图存档，用于改造后对比。**这一步不能省**——CSS 改动无法靠单元测试验证。

```bash
# 1. 启动后端与前端
cd backend-node && npm start          # :5679
cd frontweb && npm run dev            # :3013
```

逐页截图（亮色 + 暗色各一遍），存入 `docs/ui-baseline/`：
- `/`（项目列表）
- `/drama/1`（剧集管理）
- `/film/1`（制作页）
- `/film/1/canvas`（画布）
- `/ai-config`
- `/free-create`
- `/media-library`
- 以及至少一个弹窗（如「AI 配置」弹窗）

> 截图方式二选一：手动截图；或用 Playwright（需 `npm i -D playwright && npx playwright install chromium`）。
> **注意**：如果选择装 Playwright，它会修改 `frontweb/package.json`，属于工具依赖，可接受；但不要把它加进生产依赖。

**验收**：`docs/ui-baseline/` 下有 14 张以上截图（7 页 × 明暗）。

### T-A1 引入 Element Plus 暗色变量（修 §1.1）

**改动 1**：`frontweb/src/main.js` 增加一行 import，**必须在 `element-plus/dist/index.css` 之后**：

```js
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'   // ← 新增
```

> 文件已确认存在：`frontweb/node_modules/element-plus/theme-chalk/dark/css-vars.css`（3208 字节）。
> 它定义的是 `html.dark { color-scheme: dark; --el-bg-color: ...; }`。

**改动 2**：在 `theme.css` 的 `html.dark` 块内补 EP 变量映射（与现有 `html.light` 块对称）。

在 `theme.css` 顶部 `html.dark` 定义之后追加：

```css
/* Element Plus 暗色映射（与下方 html.light 块对称） */
html.dark {
  --el-bg-color: var(--bg-card);
  --el-bg-color-page: var(--bg-page);
  --el-bg-color-overlay: var(--bg-inner);
  --el-text-color-primary: var(--text-primary);
  --el-text-color-regular: var(--text-primary);
  --el-text-color-secondary: var(--text-muted);
  --el-text-color-placeholder: var(--text-faint);
  --el-border-color: var(--border-color);
  --el-border-color-light: var(--border-muted);
  --el-border-color-lighter: var(--border-muted);
  --el-fill-color: var(--bg-inner);
  --el-fill-color-blank: var(--bg-card);
  --el-fill-color-light: var(--bg-hover);
  --el-fill-color-lighter: var(--bg-hover);
  --el-mask-color: rgba(0, 0, 0, .7);
}
```

**验收**：暗色下打开「AI 配置」弹窗，弹窗、输入框、下拉框、表格均为深色；文字可读、无白底残留。

### T-A2 统一主色（修 §1.3）

在 `theme.css` 的 `html.dark` 块内加紫色系主色（亮色已有，见 `theme.css:250-256`）：

```css
html.dark {
  --el-color-primary: #a78bfa;
  --el-color-primary-light-3: #8b5cf6;
  --el-color-primary-light-5: #7c3aed;
  --el-color-primary-light-7: #6d28d9;
  --el-color-primary-light-8: #5b21b6;
  --el-color-primary-light-9: #4c1d95;
  --el-color-primary-dark-2: #c4b5fd;
}
```

> **注意**：EP 的 `light-N` 语义是"向背景色混合 N/10"，暗色主题下 light-3 应比 primary **更暗**、dark-2 应更亮。上面的值遵循这个方向，但**必须在暗色下目视确认按钮/链接/选中态的对比度**，必要时微调。

**验收**：明暗切换时主色保持紫色系，不出现蓝色；主按钮、链接、tab 选中态在两种模式下均清晰可读。

### T-A3 全局 Element Plus 组件观感统一

在 `theme.css` 末尾新增一节，**只作用于 EP 组件，不写 `html.light` 前缀**（这样明暗都生效）：

```css
/* =====================================================
   全局 Element Plus 观感统一（明暗通用）
   圆角统一取 8px —— 与现有 html.light 的 8px 保持一致（theme.css:359/379/390/448）
   ===================================================== */
.el-button { border-radius: 8px; }
.el-input__wrapper,
.el-textarea__wrapper { border-radius: 8px; }
.el-dialog { border-radius: 14px; }
.el-card { border-radius: 10px; }
.el-select-dropdown,
.el-popper.is-light { border-radius: 10px; }
.el-table { border-radius: 10px; overflow: hidden; }
.el-tag { border-radius: 6px; }
.el-message-box { border-radius: 14px; }
```

**务必注意**：

1. **不要加 `!important`** —— 让页面 scoped 样式仍能覆盖。现有 `theme.css` 的 `html.light` 块大量使用 `!important`，新规则不加即可自然让位。

2. **圆角统一取 8px，不要用 6px。** 已核实亮色下已有 4 处 `border-radius: 8px !important`：
   | 行 | 选择器 |
   |---|---|
   | `theme.css:359` | `html.light .el-button` |
   | `theme.css:379` | `html.light .el-input__wrapper` |
   | `theme.css:390` | `html.light .el-textarea__wrapper` |
   | `theme.css:448` | `html.light .el-radio-button__inner` |

   若这里写 6px，亮色下会被那 4 条 `!important` 覆盖成 8px、暗色下才是 6px —— **明暗圆角不一致**。取 8px 则两模式自然对齐，且**无需改动现有规则**。

3. **不要重复定义 `.el-message`**：`theme.css:461-478` 已有全局 `.el-message` 规则（非 `html.light` 前缀，明暗通用），不要再写一遍。

4. **不要给 `.el-dialog` 加 `background` / `color`**：`theme.css:166` 已有 `html.light .el-dialog` 的背景覆盖，暗色侧将由 T-A1 的变量映射接管。此处只调圆角。

**验收**：亮色与暗色下，按钮/输入框/弹窗/表格圆角**一致**（均 8px / 14px / 10px）；暗色下弹窗、下拉、表格不再白底。

### T-A4 修正过时注释（§1.2）

`theme.css:2` 的 `暗色模式（默认）` 改为 `亮色模式（默认）`，避免后续误判。

**验收**：注释与实际行为一致。

### T-A5 统一 `page-header` 观感（为 B 层铺路）

`FreeCreate.vue` 与 `MediaLibrary.vue` 用的是 `.page-header` 模式（非 `.header`），与另外 5 页不一致。**A 层不重构它们**，只让观感靠近 `.header`。

**已核实**：这两页**已有** scoped 定义，内容很简（`MediaLibrary.vue:274`、`FreeCreate.vue:337`）：

```css
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
```

注意它**没有** `background` / `border-bottom` / `padding`，所以看起来是"浮"在页面上的裸标题，与另外 5 页的条状 header 不一致。

**做法**：在 `theme.css` 末尾给 `.page-header` 补一条**不带 scoped 的兜底**，只补 scoped 未定义的那几个属性：

```css
/* FreeCreate / MediaLibrary 的页头兜底（scoped 已定义 flex 布局，此处只补视觉） */
.page-header {
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-card);
  border-radius: var(--radius-md, 10px);
}
```

> **为什么能生效**：scoped 规则带 `[data-v-xxx]` 属性选择器，优先级高于裸类选择器——所以 scoped 已定义的 `display/justify-content/margin-bottom` 仍由 scoped 胜出，而这里新增的 `padding/background/border` 因 scoped 未定义而生效。**这正是我们想要的效果。**
>
> ⚠️ 副作用：`margin-bottom: 20px`（scoped）+ 新增的 `border-bottom` + `background` 组合后，页头会变成一个带边框的卡片条。**必须在亮色和暗色下都目视确认**，如果观感突兀，改为只补 `padding` 与 `border-bottom`，不加 `background`。
>
> 如果不想承担这个副作用，**T-A5 可以整条跳过** —— 它不影响 A/B 层其他任务，也不影响 Header 组件迁移。

---

## 4. 阶段 B：抽取公共 Header 组件（预计 1–2 天）

### 4.0 设计：`AppHeader.vue` 的接口

新建 `frontweb/src/components/AppHeader.vue`，**用 slot 而非 props 传递页面特有内容**，最大化灵活性、最小化迁移风险。

```
frontweb/src/components/AppHeader.vue
```

**建议的模板骨架**：

```vue
<template>
  <header class="app-header" :class="{ 'is-sticky': sticky }">
    <div class="app-header__inner">
      <!-- 1. Logo（统一渐变，可点击回首页） -->
      <h1 class="app-logo" @click="onLogoClick">
        <span class="app-logo__main">本地短剧助手</span>
        <span class="app-logo__sub">{{ subtitle }}</span>
      </h1>

      <!-- 2. 中部：面包屑 / 页面标题 / 页面特有控件（选择集数等） -->
      <slot name="center" />

      <!-- 3. 右侧：页面特有操作按钮 -->
      <div class="app-header__actions">
        <slot name="actions" />

        <!-- 4. 主题切换（统一，内置；可通过 hideTheme 关闭） -->
        <el-button
          v-if="!hideTheme"
          class="app-btn-theme"
          :title="isDark ? '切换到浅色模式' : '切换到暗色模式'"
          @click="toggleTheme"
        >
          <el-icon><Sunny v-if="isDark" /><Moon v-else /></el-icon>
          {{ isDark ? '浅色' : '暗色' }}
        </el-button>
      </div>
    </div>
  </header>
</template>
```

**Props**：

| prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `subtitle` | String | `'LocalMiniDrama'` | 副标题（`DramaCanvas` 用 `'画布模式'`） |
| `logoClick` | Function | `null` | 点击 logo 的回调；不传则不响应 |
| `hideTheme` | Boolean | `false` | 隐藏主题切换按钮 |
| `sticky` | Boolean | `true` | 是否 sticky |
| `zIndex` | Number | `100` | `FilmCreate` 需要 200 |
| `offsetLeft` | String | `''` | 左侧偏移（`FilmCreate` 需要 `180px` / 折叠时 `48px`） |

**Slots**：`center`（面包屑、标题、选择器）、`actions`（页面按钮）。

**槽位边界（重要，决定各页 CSS 保留多少）**：

- `.app-header__actions` **由组件提供**，`margin-left: auto` 与 `gap` 由组件统一控制 → 各页的 `.header-actions` 类**可以删除**（迁移后不再需要）。
- `center` 槽里的内容**由各页自己写**，页面特有的类（`.page-title`、`.header-episode-select`、`.breadcrumb-sep`）**保留在各页 scoped CSS 里**，不要移进组件。
- 各页特有的按钮类（`.btn-library`、`.btn-back-drama`、`.btn-back-list`、`.btn-settings`、`.btn-import`、`.btn-new`、`.btn-wechat`、`.btn-ai-config`、`.btn-back`）**保留在各页 scoped CSS 里** —— 它们颜色各异，属于页面设计，不属于公共 Header。
- **只有 `.header`、`.header-inner`、`.logo`、`.logo-main`、`.logo-sub`、`.page-title`、`.header-actions`、`.btn-theme` 这 8 个类是"公共"的**，迁移后从各页删除。

> 各页 `.header-actions` 的 `gap` 目前不一致（`FilmList`/`DramaDetail` 是 6px，`DramaCanvas` 是 8px）。统一交给组件的 8px，这是预期改进。

**组件内 scoped CSS**：把 §1.4 表格里 4 种 header 背景**统一为一种**（建议沿用 `FilmList` 的毛玻璃靛紫描边方案，观感最现代），logo 渐变统一为 `FilmList` 的 `#a5b4fc → #c084fc → #f0abfc`，`.btn-theme` 统一为 `rgba(148,163,184,...)` 那套。

### 4.1 迁移顺序（务必按此顺序，从低风险到高风险）

| 序 | 文件 | 原有内容 | 风险 | 备注 |
|---|---|---|---|---|
| 1 | `views/AiConfig.vue` | 仅 logo + 标题 + 返回按钮 | ⭐ 最低 | 先拿它验证组件可用 |
| 2 | `views/DramaDetail.vue` | logo + 面包屑 + 返回 + 主题 + 进入制作 + 画布模式 | ⭐⭐ | |
| 3 | `views/FilmList.vue` | logo + 3 个素材库按钮 + 微信 + 主题 + AI配置 + 导入 + 新建项目 | ⭐⭐⭐ | 按钮最多，注意 `importFileInput` ref 与 `triggerImport` |
| 4 | `views/DramaCanvas.vue` | logo + 面包屑 + 集数筛选 + 保存状态 + 7 个按钮 | ⭐⭐⭐ | 注意保存状态是动态的，需放 `center` slot |
| 5 | `views/FilmCreate.vue` | logo + 面包屑 + 集数选择 + 返回剧集 + 画布模式 + 主题 + AI配置 | ⭐⭐⭐⭐ | **有 `margin-left:180px` 侧栏联动，最高风险** |

**每迁移一页的固定流程**：
1. 改该页 `<template>` 的 `<header>` 段为 `<AppHeader>` + slots
2. 删除该页 scoped CSS 里已迁移到组件的规则（`.header`、`.header-inner`、`.logo*`、`.page-title`、`.btn-theme` 等）
3. **保留**该页特有的类（如 `.header-library`、`.header-episode-select`、`.btn-back-drama`）
4. `npm run dev` 目视对比基线截图
5. `npm run build` 确认无编译错误
6. 确认所有按钮仍可点击、回调正确

### 4.2 逐页迁移要点（防遗漏）

**AiConfig.vue**（模板见 `AiConfig.vue` header 段）：
- 原有：`goList` 返回按钮
- 无主题切换按钮 → 迁移后**会新增**主题按钮（这是预期改进，属"补齐缺失"）

**DramaDetail.vue**：
- 原有：`router.push('/')`、`goCreate`、`goCanvasMode`、`toggleTheme`
- 页面标题是动态的 `{{ drama?.title || '剧集管理' }}` → 放 `center` slot

**FilmList.vue**：
- 原有：`showCharLibrary`、`showSceneLibrary`、`showPropLibrary`、`showWechat`、`toggleTheme`、`showAiConfigDialog`、`triggerImport`、`goNewProject`
- **注意**：`<input ref="importFileInput" ... @change="onImportFile">` 必须保留（可放在 header 外）
- `v-if="!vendorLockEnabled"` 的微信按钮条件必须保留
- 注释掉的"自由创作/素材库"按钮：**保持注释状态**，不要恢复

**DramaCanvas.vue**：
- 原有：`focusScriptNode`、`openCreateDialog('storyboard'|'character'|'scene'|'prop'|'episode')`、`onAlignNodes`、`goListMode`、`toggleTheme`
- 动态保存状态（`layoutSaveState` 的 saving/saved/error 三态）→ 放 `center` slot
- 该页 header 是 `flex-shrink: 0` 参与纵向布局，**不要改成 sticky**

**FilmCreate.vue**（最高风险）：
- 原有：`goList`（logo 点击）、`onEpisodeSelect`、`router.push('/drama/'+dramaId)`、`goCanvasMode`、`toggleTheme`、`showAiConfigDialog`
- **必须保留** `margin-left: 180px` 与 `.sidebar-collapsed` 联动 → 用 `offsetLeft` prop
- z-index 200（不是 100）→ 用 `zIndex` prop
- `header-episode-select`（`el-select`，宽 130px）→ 放 `center` slot
- 该页有 `v-if="dramaId"` 条件渲染的按钮（返回剧集、画布模式），必须保留条件

- ⚠️ **`@media (max-width: 768px)` 里有 `.header, .main { margin-left: 48px !important; }`**（`FilmCreate.vue:8488`）。这条规则用**裸 `.header` 类选择器**，一旦 header 迁移到组件、类名变成 `.app-header`（且带 scoped 属性），**这条响应式规则会失效**，窄屏下 header 会盖住侧栏。

  **两种处理方式，任选其一**：
  1. 组件保留 `header` 作为额外类名：`<header class="header app-header">`，则该 `@media` 规则继续生效（推荐，改动最小）；
  2. 把该 `@media` 规则一并迁移进 `AppHeader.vue`，用 `offsetLeft` prop 在窄屏下切换为 `48px`（需组件内监听 `window.matchMedia`，复杂度更高）。

  **无论选哪种，都必须在窄屏（<768px）下目视验证** header 与侧栏不重叠。

- ⚠️ 这个文件 10791 行，**只允许改 header 相关片段**，改完必须 `npm run build` 验证

### 4.3 迁移后清理

5 页全部迁移完成后，全局 grep 确认残留：

```bash
cd frontweb/src
# 应无输出（除 AppHeader.vue 自身）
grep -rn "^\.header {\|^\.logo-main\|^\.btn-theme" views/
# 检查是否还有硬编码 logo 渐变
grep -rn "a5b4fc\|d0d5e8\|c4b5fd" views/
```

---

## 5. 验证方法

### 5.1 每步必做

```bash
cd frontweb
npm run build          # 必须通过，无报错
npm run dev            # 逐页目视
```

### 5.2 视觉对比

用 T-A0 存的基线截图逐页对比，重点检查：
- 亮色：**不应有任何变化**（A 层主要改暗色；B 层只统一 header 样式）
- 暗色：EP 组件不再白底；主色为紫；文字可读
- Header：5 页观感一致；所有按钮仍在、仍可点

### 5.3 功能回归清单（B 层必查）

逐项手动点击确认：

| 页面 | 必查项 |
|---|---|
| FilmList | 3 个素材库弹窗、微信弹窗、AI配置弹窗、导入 zip、新建项目、主题切换 |
| FilmCreate | logo 点击回列表、集数选择切换、返回剧集、进入画布、AI配置、主题切换、侧栏折叠时 header 跟随 |
| DramaDetail | logo 回首页、返回列表、进入制作、画布模式、主题切换 |
| DramaCanvas | 剧本定位、6 个新建节点、对齐节点、返回列表模式、集数筛选、主题切换 |
| AiConfig | 返回列表 |

### 5.4 前端既有测试

```bash
cd frontweb
node --test "test/*.test.js"    # 2 个测试文件 / 10 个用例，改造后应仍全绿
```

> ⚠️ **必须带引号的 glob 模式**。直接写 `node --test test/` 在 Windows 下会报
> `Cannot find module '...\frontweb\test'`（Node 把它当模块路径解析，而非目录）。
> 这与代码质量无关，是命令写法问题。

**改造前基线（已实测）**：10 个用例全绿。

---

## 6. 风险与注意事项

1. **`!important` 的对抗**：`theme.css` 现有 157 条 `html.light` 规则大量使用 `!important`。新增的通用 EP 规则**不要加 `!important`**，否则会与页面 scoped 样式打架且难以回退。
2. **全局样式泄漏**：§1.5 列出 6 处非 scoped `<style>`，它们会影响所有页面。改这些文件的样式时务必先确认影响范围。
3. **`FilmCreate.vue` 是雷区**：10791 行、290 处硬编码色、32 处 `!important`、15 处动态 `:class/:style`。B 层对它只做 header 迁移，其余一律不动。
4. **Electron 打包版读 `frontweb/dist`**（`desktop/main.js:156`）：改完必须 `npm run build`，否则打包版看不到效果。源码模式（3013）改完即见。
5. **无 lint / prettier 配置**：项目没有 ESLint/Prettier，纯人工保持风格。建议跟随现有写法（2 空格缩进、kebab-case 类名）。
6. **不要引入新依赖**（除非为截图装 Playwright 且仅 devDependency）。EP 的暗色变量文件已在 `node_modules` 里，无需安装。
7. **不要顺手"优化"硬编码颜色**：774 处替换是 D 层，风险高且无自动验证手段。A/B 层完成后如需 D 层，应单独立项。
8. **`html.light` 覆盖的脆弱性**：因为页面 CSS 以暗色为基底、亮色靠覆盖，任何**新增**的页面样式都默认是暗色值。若新增样式，记得同步补 `html.light` 覆盖（或直接用 CSS 变量，更稳）。

---

## 7. 交付物清单

- [ ] `docs/ui-baseline/` —— 改造前基线截图（7 页 × 明暗，含 1 个弹窗）
- [ ] `frontweb/src/main.js` —— 引入 EP 暗色变量
- [ ] `frontweb/src/styles/theme.css` —— 暗色 EP 映射、暗色主色、设计令牌、全局 EP 观感、注释修正
- [ ] `frontweb/src/components/AppHeader.vue` —— 新增公共 Header 组件
- [ ] 5 个 view 的 header 迁移（AiConfig / DramaDetail / FilmList / DramaCanvas / FilmCreate）
- [ ] 改造后对比截图
- [ ] `npm run build` 通过记录
- [ ] 功能回归清单逐项确认记录

---

## 8. 附录：关键文件索引

| 文件 | 作用 | A 层 | B 层 |
|---|---|---|---|
| `frontweb/src/styles/theme.css` | 全局主题（484 行） | ✅ 主要改动 | — |
| `frontweb/src/main.js` | 入口，EP 引入 | ✅ 加一行 import | — |
| `frontweb/src/composables/useTheme.js` | 主题状态（13 行） | 只读参考 | 被 AppHeader 复用 |
| `frontweb/src/components/AppHeader.vue` | 公共 Header | — | ✅ 新建 |
| `frontweb/src/views/AiConfig.vue` | AI 配置页（131 行） | — | ✅ 迁移 |
| `frontweb/src/views/DramaDetail.vue` | 剧集管理（1520 行） | — | ✅ 迁移 |
| `frontweb/src/views/FilmList.vue` | 项目列表（1337 行） | — | ✅ 迁移 |
| `frontweb/src/views/DramaCanvas.vue` | 画布（1145 行） | — | ✅ 迁移 |
| `frontweb/src/views/FilmCreate.vue` | 制作页（10791 行） | ❌ 不动 | ⚠️ 仅迁移 header |
| `frontweb/src/views/FreeCreate.vue` | 自由创作（586 行） | 补 `.page-header` 兜底 | 不迁移 |
| `frontweb/src/views/MediaLibrary.vue` | 素材库（478 行） | 补 `.page-header` 兜底 | 不迁移 |
| `frontweb/src/components/AIConfigContent.vue` | AI 配置内容（2775 行） | ❌ 不动 | ❌ 不动 |

## 附录 B：常用命令

```bash
# 启动（两个终端）
cd backend-node && npm start        # :5679
cd frontweb && npm run dev          # :3013

# 构建（Electron 打包版依赖）
cd frontweb && npm run build

# 查残留的重复 header 样式
cd frontweb/src && grep -rn "^\.header {\|^\.logo-main\|^\.btn-theme" views/

# 查硬编码 logo 渐变是否清理干净
cd frontweb/src && grep -rn "a5b4fc\|d0d5e8\|c4b5fd" views/

# 查全局（非 scoped）样式块
cd frontweb/src && for f in $(find . -name "*.vue"); do n=$(grep -c "<style" "$f"); s=$(grep -c "<style scoped>" "$f"); [ "$n" -ne "$s" ] && echo "$f: style=$n scoped=$s"; done
```

## 附录 C：当前 CSS 变量全集（theme.css 已有）

```
--bg-page  --bg-card  --bg-inner  --bg-hover
--border-color  --border-muted
--text-primary  --text-bright  --text-muted  --text-subtle  --text-faint
--shadow
```

> 仅 12 个。A 层 T-A3 建议新增 `--radius-*` / `--shadow-*` / `--space-*` 三组，**只增不改**。
