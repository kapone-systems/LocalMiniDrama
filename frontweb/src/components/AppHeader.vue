<template>
  <header class="header app-header" :class="{ 'is-sticky': sticky }" :style="rootStyle">
    <div class="header-inner app-header__inner">
      <!-- Logo：统一渐变，logoClick 不传则不可点 -->
      <h1 class="logo" @click="onLogoClick">
        <span class="logo-main">本地短剧助手</span>
        <span class="logo-sub">{{ subtitle }}</span>
      </h1>

      <!-- 中部：面包屑 / 页面标题 / 页面特有控件（选择集数等） -->
      <slot name="center" />

      <!-- 右侧：页面特有按钮 + 统一主题切换 -->
      <div class="app-header__actions">
        <slot name="actions" />

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

    <!-- 默认槽：header 内 header-inner 之外的附加条（如画布页的工作流条） -->
    <slot />
  </header>
</template>

<script setup>
import { computed } from 'vue'
import { Sunny, Moon } from '@element-plus/icons-vue'
import { useTheme } from '@/composables/useTheme.js'

const props = defineProps({
  /** 副标题（DramaCanvas 传 '画布模式'） */
  subtitle: { type: String, default: 'LocalMiniDrama' },
  /** 点击 logo 的回调；不传则不响应 */
  logoClick: { type: Function, default: null },
  /** 隐藏主题切换按钮 */
  hideTheme: { type: Boolean, default: false },
  /** 是否 sticky（画布页参与纵向布局，传 false） */
  sticky: { type: Boolean, default: true },
  /** 层级（FilmCreate 需要 200） */
  zIndex: { type: Number, default: 100 },
  /** 左侧偏移（FilmCreate 侧栏联动：180px / 折叠时 48px） */
  offsetLeft: { type: String, default: '' },
})

const { isDark, toggle: toggleTheme } = useTheme()

function onLogoClick(e) {
  if (props.logoClick) props.logoClick(e)
}

const rootStyle = computed(() => {
  const style = { zIndex: String(props.zIndex) }
  if (props.offsetLeft) style['--app-header-offset-left'] = props.offsetLeft
  return style
})
</script>

<style scoped>
/* 毛玻璃 header：沿用原 FilmList 的靛紫描边方案 */
.app-header {
  background: rgba(12, 12, 18, 0.82);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(99, 102, 241, 0.18);
  box-shadow: 0 1px 0 rgba(99, 102, 241, 0.08), 0 4px 24px rgba(0, 0, 0, 0.3);
  flex-shrink: 0;
  margin-left: 0;
  transition: margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 侧栏联动偏移用 CSS 变量而非内联 margin-left：
   内联样式会压过 FilmCreate 的 .sidebar-collapsed .header { margin-left: 48px }，
   变量则仍可被页面的普通规则覆盖。 */
.app-header {
  margin-left: var(--app-header-offset-left, 0);
}

.app-header.is-sticky {
  position: sticky;
  top: 0;
}

.app-header:not(.is-sticky) {
  position: relative;
}

/* 亮色兜底（theme.css 的 html.light .header 带 !important，优先级更高，
   此处仅为该规则缺失时仍能正常渲染） */
html.light .app-header {
  background: rgba(255, 255, 255, 0.85);
  border-bottom-color: rgba(99, 102, 241, 0.2);
  box-shadow: 0 1px 0 rgba(99, 102, 241, 0.06), 0 4px 20px rgba(139, 92, 246, 0.08);
}

.header-inner {
  max-width: min(1400px, 96vw);
  margin: 0 auto;
  padding: 12px 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

/* ── Logo ── */
.logo {
  margin: 0;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 1px;
  line-height: 1;
  transition: filter 0.3s;
}

.logo-main {
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  background: linear-gradient(135deg, #a5b4fc 0%, #c084fc 50%, #f0abfc 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  filter: drop-shadow(0 0 10px rgba(168, 85, 247, 0.35));
}

.logo-sub {
  font-size: 0.68rem;
  font-weight: 400;
  letter-spacing: 0.02em;
  color: #6d6d7a;
  -webkit-text-fill-color: #6d6d7a;
  filter: none;
}

/* theme.css 的 html.light .logo 给整个 logo 上了紫色渐变，但 .logo-main 自身
   绘制 background-image，会盖掉父级渐变；故亮色需单独覆盖为深紫渐变。
   沿用原 FilmList 的亮色值（对比度实测 5.25:1，优于其他页的 #7c3aed→#6366f1）。 */
html.light .logo-main {
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #9333ea 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  filter: drop-shadow(0 0 8px rgba(99, 102, 241, 0.2));
}

/* logo-sub 需显式声明自身色，否则继承父级 transparent 而显示为渐变 */
html.light .logo-sub {
  color: #9ca3af;
  -webkit-text-fill-color: #9ca3af;
}

/* ── 右侧操作区：统一 margin-left:auto 与 8px 间距 ── */
.app-header__actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* ── 主题切换按钮（沿用原 FilmList 的灰蓝方案） ── */
.app-btn-theme {
  --el-button-bg-color: rgba(148, 163, 184, 0.1);
  --el-button-border-color: rgba(148, 163, 184, 0.3);
  --el-button-text-color: #94a3b8;
  --el-button-hover-bg-color: rgba(148, 163, 184, 0.2);
  --el-button-hover-border-color: rgba(148, 163, 184, 0.5);
  --el-button-hover-text-color: #cbd5e1;
  transition: all 0.2s;
}

html.light .app-btn-theme {
  --el-button-bg-color: rgba(99, 102, 241, 0.08);
  --el-button-border-color: rgba(99, 102, 241, 0.3);
  --el-button-text-color: #6366f1;
  --el-button-hover-bg-color: rgba(99, 102, 241, 0.15);
  --el-button-hover-border-color: rgba(99, 102, 241, 0.5);
  --el-button-hover-text-color: #4f46e5;
}
</style>
