<template>
  <div
    class="canvas-group-frame"
    :class="{ active: isActive }"
    :style="{
      width: (data.width || 240) + 'px',
      height: (data.height || 160) + 'px',
      background: data.color?.fill,
      borderColor: data.color?.stroke,
    }"
  >
    <div class="gf-bar nodrag nopan" @pointerdown.stop @mousedown.stop>
      <div class="gf-title">{{ data.group?.title || '工作流' }}</div>
      <div class="gf-meta">
        {{ (data.group?.storyboard_ids || []).length }} 镜 · {{ (data.group?.pipeline || []).join('→') }}
      </div>
      <div class="gf-actions">
        <el-button size="small" type="primary" @click.stop="runGroup">运行</el-button>
      </div>
      <div class="gf-sort">
        <div
          v-for="(sid, idx) in ids"
          :key="sid"
          class="sort-row"
          draggable="true"
          @dragstart.stop="onDragStart(idx, $event)"
          @dragover.prevent.stop
          @drop.stop="onDrop(idx, $event)"
        >
          <span class="drag-handle" title="拖拽排序">⋮⋮</span>
          <span>#{{ labelOf(sid) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useCanvasContext } from '@/composables/useCanvasContext'
import { findStoryboardInDrama } from '@/utils/canvasWorkflow'

const props = defineProps({
  id: { type: String, required: true },
  data: { type: Object, required: true },
})

const ctx = useCanvasContext()
const ids = computed(() => [...(props.data.group?.storyboard_ids || [])])
const isActive = computed(() => ctx?.activeGroupId?.value === props.data.group?.id)
const dragFrom = ref(-1)

function labelOf(sid) {
  const found = findStoryboardInDrama(ctx?.drama?.value, sid)
  return found?.storyboard?.storyboard_number ?? sid
}

function onDragStart(index, event) {
  dragFrom.value = index
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', String(index))
}

function onDrop(index, event) {
  event.preventDefault()
  const from = dragFrom.value
  dragFrom.value = -1
  if (from < 0 || from === index) return
  const next = [...ids.value]
  const [item] = next.splice(from, 1)
  next.splice(index, 0, item)
  ctx?.reorderWorkflowGroup?.(props.data.group.id, next)
}

function runGroup() {
  ctx?.runWorkflowById?.(props.data.group.id)
}
</script>

<style scoped>
.canvas-group-frame {
  border: 1.5px dashed rgba(251, 191, 36, 0.45);
  border-radius: 16px;
  pointer-events: none;
}
.canvas-group-frame.active {
  border-style: solid;
  box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.35);
}
.gf-bar {
  pointer-events: auto;
  padding: 8px 12px 6px;
}
.gf-title {
  font-size: 12px;
  font-weight: 700;
  color: #fcd34d;
}
.gf-meta {
  font-size: 10px;
  color: #a1a1aa;
  margin: 2px 0 6px;
}
.gf-sort {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.sort-row {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: #d4d4d8;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 6px;
  padding: 2px 6px;
  cursor: grab;
}
.sort-row:active {
  cursor: grabbing;
}
.drag-handle {
  color: #fcd34d;
  letter-spacing: -2px;
}
</style>
