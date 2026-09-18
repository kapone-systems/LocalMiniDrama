# UI 验证工具

配合 `docs/plans/2026-09-18-ui-polish-a-b.md` 与 `docs/ui-polish-acceptance.md` 使用的
无依赖（Node 22+ 内置 WebSocket）验证脚本。CSS 改动无法靠单元测试验证，这些脚本用于
**截图存档、像素统计、计算样式比对、功能回归**。

## 前置条件

```bash
cd backend-node && npm start      # :5679
cd frontweb && npm run dev        # :3013
```

脚本默认连 `http://localhost:3013`。截图类脚本依赖本机 Chrome
（路径写死在脚本顶部的 `CHROME`，按需修改）。

## 脚本一览

| 脚本 | 用途 | 用法 |
|---|---|---|
| `shot.js` | 单页截图（可设 localStorage 切换明暗） | `node shot.js <url> <out.png> [dark\|light] [w] [h]` |
| `batch-shot.js` | 7 页 × 明暗批量截图 | `node batch-shot.js [outDir] [tag]` |
| `shot-dialog.js` | 打开指定弹窗后截图 | `node shot-dialog.js <url> <out.png> <theme> <selector>` |
| `analyze.js` | PNG 像素统计（平均亮度、纯白占比、主色分布） | `node analyze.js <png...>` |
| `crop-analyze.js` | 裁剪区域 + WCAG 对比度计算 | `node crop-analyze.js <png> <x> <y> <w> <h> [label]` |
| `probe.js` | 读计算样式 / CSS 变量 / DOM 状态 | `node probe.js <url> <theme> "<js表达式>"` |
| `probe-width.js` | 指定视口宽度下检查布局（验证 `@media`） | `node probe-width.js <url> <theme> <width> "<js>"` |
| `check-errors.js` | 逐页收集控制台错误与页面异常 | `node check-errors.js [theme]` |
| `check-fouc2.js` | **首帧闪烁检测**：拦截 JS bundle，模拟"CSS 已加载、应用 JS 未执行" | `node check-fouc2.js <url> <theme> [out.png]` |
| `style-snapshot.js` | 抓 7 页全部元素的计算样式快照 | `node style-snapshot.js <out.json> [theme]` |
| `diff-snapshot.js` | 对比两份快照，列出样式差异 | `node diff-snapshot.js <before.json> <after.json>` |
| `regression.js` | 43 项 header 功能回归（按钮/弹窗/路由/主题/侧栏联动） | `node regression.js [theme]` |

## 典型工作流

**改 CSS 前存档，改完比对**（本项目验证 `!important` 治理时用的方法）：

```bash
node style-snapshot.js /tmp/before.json light
# ... 改 theme.css ...
node style-snapshot.js /tmp/after.json light
node diff-snapshot.js /tmp/before.json /tmp/after.json   # 期望：总差异 0
```

`style-snapshot.js` 抓取 7 页共约 2500 个元素 × 23 个样式属性（圆角、背景、边框、
阴影、字号、层级等），比像素比对更灵敏，且不受渲染噪声干扰。**任何声称"安全"的
CSS 批量改动，都应先过这一关。**

**验证主题相关改动**：

```bash
node check-fouc2.js http://localhost:3013/ light   # 首帧必须是亮色
node check-fouc2.js http://localhost:3013/ dark    # 首帧必须是暗色
```

## 注意事项

- 截图存 `docs/ui-*` 目录；基线（`docs/ui-baseline/`）是计划要求的交付物，**不要删**。
- `regression.js` 的断言依赖 `AppHeader.vue` 的类名（`.app-header`、`.app-header__actions`、
  `.app-btn-theme`）与各页按钮文案。改这些标识时需同步更新断言。
- 这批脚本是开发期工具，未做参数校验与跨平台适配（Chrome 路径为 Windows 默认）。
