<template>
  <Teleport to="body">
    <div v-if="open" class="canvas-help-overlay" @click.self="$emit('close')">
      <div class="canvas-help-card">
        <div class="help-title">画布快捷键</div>
        <div v-for="row in rows" :key="row.keys" class="help-row">
          <kbd>{{ row.keys }}</kbd>
          <span>{{ row.desc }}</span>
        </div>
        <el-button size="small" class="help-close" @click="$emit('close')">关闭</el-button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { CANVAS_SHORTCUT_ROWS } from '@/composables/useCanvasShortcuts'

defineProps({
  open: { type: Boolean, default: false },
})
defineEmits(['close'])

const rows = CANVAS_SHORTCUT_ROWS
</script>

<style scoped>
.canvas-help-overlay {
  position: fixed;
  inset: 0;
  z-index: 5000;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
}
.canvas-help-card {
  width: min(420px, 92vw);
  padding: 18px 20px 16px;
  border-radius: 12px;
  background: #18181b;
  border: 1px solid #3f3f46;
  color: #e4e4e7;
}
.help-title {
  font-weight: 700;
  margin-bottom: 12px;
}
.help-row {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  margin-bottom: 8px;
}
kbd {
  min-width: 120px;
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid #3f3f46;
  background: #09090b;
  font-size: 12px;
  color: #c7d2fe;
}
.help-close {
  margin-top: 8px;
}
</style>
