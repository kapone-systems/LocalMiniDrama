<template>
  <div v-if="open" class="canvas-lightbox nodrag nopan">
    <div class="lb-head">
      <span>灯箱 · {{ cells.length }} 镜</span>
      <el-button link size="small" @click="$emit('close')">关闭</el-button>
    </div>
    <div class="lb-row">
      <button
        v-for="cell in cells"
        :key="cell.id"
        type="button"
        class="lb-cell"
        :class="{ active: cell.storyboardId === focusedSbId, empty: cell.empty }"
        @click="$emit('select', cell.storyboardId)"
        @mouseenter="onEnter(cell)"
        @mouseleave="onLeave"
      >
        <video
          v-if="hoverId === cell.storyboardId && cell.videoUrl"
          :src="cell.videoUrl"
          class="thumb"
          muted
          loop
          autoplay
          playsinline
        />
        <img v-else-if="cell.imageUrl" :src="cell.imageUrl" alt="" class="thumb" />
        <div v-else class="thumb empty-thumb">空</div>
        <div class="cap">#{{ cell.number }} · {{ cell.duration }}s</div>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  open: { type: Boolean, default: false },
  cells: { type: Array, default: () => [] },
  focusedSbId: { type: Number, default: null },
})

defineEmits(['close', 'select'])

const hoverId = ref(null)

function onEnter(cell) {
  if (cell.videoUrl) hoverId.value = cell.storyboardId
}

function onLeave() {
  hoverId.value = null
}
</script>

<style scoped>
.canvas-lightbox {
  height: 132px;
  flex-shrink: 0;
  border-top: 1px solid var(--border-color, #27272a);
  background: var(--bg-card, #18181b);
  padding: 8px 12px 10px;
}
.lb-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: #a1a1aa;
  margin-bottom: 6px;
}
.lb-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.lb-cell {
  flex: 0 0 112px;
  border: 1px solid #3f3f46;
  background: #09090b;
  border-radius: 8px;
  padding: 0;
  cursor: pointer;
  color: inherit;
}
.lb-cell.active {
  border-color: #818cf8;
}
.lb-cell.empty {
  border-style: dashed;
}
.thumb {
  display: block;
  width: 112px;
  height: 64px;
  object-fit: cover;
  background: #09090b;
  border-radius: 8px 8px 0 0;
}
.empty-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #71717a;
}
.cap {
  font-size: 10px;
  padding: 4px 6px;
  color: #d4d4d8;
  text-align: left;
}
</style>
