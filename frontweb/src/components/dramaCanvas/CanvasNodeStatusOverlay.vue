<template>
  <div v-if="status" class="node-status-layer" :class="'st-' + status.status">
    <div v-if="status.status === 'busy'" class="node-status-overlay" :class="'step-' + status.step">
      <span class="spinner" />
      <span class="msg">{{ status.message }}</span>
    </div>
    <div
      v-else
      class="status-badge"
      :class="status.status"
      :title="status.message"
    >
      {{ status.status === 'error' ? '!' : '✓' }}
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useCanvasContext } from '@/composables/useCanvasContext'

const props = defineProps({
  nodeId: { type: String, required: true },
})

const ctx = useCanvasContext()

const status = computed(() => {
  const map = ctx?.nodeStatus?.map
  if (!map || !props.nodeId) return null
  return map[props.nodeId] || null
})
</script>

<style scoped>
.node-status-layer {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}
.node-status-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: rgba(9, 9, 11, 0.72);
  border-radius: inherit;
}
.spinner {
  width: 22px;
  height: 22px;
  border: 2px solid rgba(255, 255, 255, 0.15);
  border-top-color: #818cf8;
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
}
.step-ref_image .spinner { border-top-color: #34d399; }
.step-extract_chars .spinner,
.step-extract_scenes .spinner,
.step-extract_props .spinner,
.step-extract_all .spinner,
.step-save_script .spinner { border-top-color: #fbbf24; }
.step-video .spinner { border-top-color: #f472b6; }
.step-audio .spinner { border-top-color: #fbbf24; }
.msg {
  font-size: 10px;
  color: #e4e4e7;
  text-align: center;
  padding: 0 8px;
  line-height: 1.3;
}
.status-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 800;
  color: #fff;
}
.status-badge.error {
  background: #ef4444;
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.25);
}
.status-badge.ok {
  background: #10b981;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
