<template>
  <div class="canvas-zoom-controls nodrag nopan nowheel" @pointerdown.stop @mousedown.stop>
    <button
      type="button"
      class="zoom-btn"
      :disabled="atMin"
      title="缩小"
      aria-label="缩小"
      @click.stop="onZoomOut"
    >
      <el-icon :size="18"><Minus /></el-icon>
    </button>
    <button
      type="button"
      class="zoom-pct"
      title="点击恢复 100%"
      aria-label="当前缩放，点击恢复百分百"
      @click.stop="onResetZoom"
    >
      {{ zoomLabel }}
    </button>
    <button
      type="button"
      class="zoom-btn"
      :disabled="atMax"
      title="放大"
      aria-label="放大"
      @click.stop="onZoomIn"
    >
      <el-icon :size="18"><Plus /></el-icon>
    </button>
    <button
      type="button"
      class="zoom-btn fit"
      title="适应画布"
      aria-label="适应画布"
      @click.stop="onFitView"
    >
      <el-icon :size="16"><FullScreen /></el-icon>
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { FullScreen, Minus, Plus } from '@element-plus/icons-vue'
import { useCanvasContext } from '@/composables/useCanvasContext'
import { CANVAS_MAX_ZOOM, CANVAS_MIN_ZOOM } from '@/utils/canvasLayout'

const ctx = useCanvasContext()
const ZOOM_ANIM = { duration: 160 }

const zoom = computed(() => Number(ctx?.currentViewport?.value?.zoom) || 1)
const zoomLabel = computed(() => `${Math.round(zoom.value * 100)}%`)
const atMin = computed(() => zoom.value <= CANVAS_MIN_ZOOM + 0.0001)
const atMax = computed(() => zoom.value >= CANVAS_MAX_ZOOM - 0.0001)

function flow() {
  return ctx?.canvasFlowApi?.value
}

function onZoomOut() {
  flow()?.zoomOut?.(ZOOM_ANIM)
}

function onZoomIn() {
  flow()?.zoomIn?.(ZOOM_ANIM)
}

function onResetZoom() {
  flow()?.zoomTo?.(1, ZOOM_ANIM)
}

function onFitView() {
  flow()?.fitView?.({ padding: 0.14, duration: 280, includeHiddenNodes: false })
}
</script>

<style scoped>
.canvas-zoom-controls {
  position: absolute;
  right: 16px;
  top: 16px;
  z-index: 12;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px;
  border-radius: 12px;
  border: 1px solid var(--border-muted, #3f3f46);
  background: var(--bg-card, rgba(24, 24, 27, 0.94));
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}
.zoom-btn,
.zoom-pct {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--text-bright, #fafafa);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  min-width: 36px;
  padding: 0;
  border-radius: 8px;
  font: inherit;
}
.zoom-btn:hover:not(:disabled),
.zoom-pct:hover {
  background: var(--bg-hover, #27272a);
}
.zoom-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.zoom-pct {
  min-width: 58px;
  padding: 0 6px;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary, #e4e4e7);
}
.zoom-btn.fit {
  margin-left: 4px;
  border-left: 1px solid var(--border-muted, #3f3f46);
  border-radius: 0 8px 8px 0;
  padding-left: 8px;
}
</style>
