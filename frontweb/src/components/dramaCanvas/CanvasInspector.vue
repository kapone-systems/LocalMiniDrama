<template>
  <aside
    v-if="node"
    class="canvas-inspector nodrag nopan"
    :class="{ overlay: isNarrow }"
    @pointerdown.stop
    @mousedown.stop
    @click.stop
  >
    <CanvasStoryboardPanel
      v-if="node.type === 'canvasStoryboard'"
      :storyboard="node.data.storyboard"
      :episode-id="node.data.episodeId"
      :node-id="node.id"
    />
    <CanvasMediaPanel
      v-else-if="node.type === 'canvasMedia'"
      :node-id="node.id"
      :kind="node.data.kind"
      :storyboard="node.data.storyboard"
      :summary="node.data.summary"
      :url="node.data.url"
      :audio-type="node.data.audioType"
      :frame-kind="node.data.frameKind"
      :frame-label="node.data.frameLabel"
      :empty="!!node.data.empty"
      :skipped-reason="node.data.skippedReason"
    />
    <CanvasAssetPanel
      v-else-if="node.type === 'canvasAsset'"
      :kind="node.data.kind"
      :entity="node.data.entity"
      :node-id="node.id"
    />
    <CanvasScriptPanel
      v-else-if="node.type === 'canvasScript'"
      :episode="node.data.episode"
      :node-id="node.id"
    />
  </aside>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import CanvasStoryboardPanel from './CanvasStoryboardPanel.vue'
import CanvasMediaPanel from './CanvasMediaPanel.vue'
import CanvasAssetPanel from './CanvasAssetPanel.vue'
import CanvasScriptPanel from './CanvasScriptPanel.vue'

const props = defineProps({
  node: { type: Object, default: null },
})

const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1440)
const isNarrow = computed(() => viewportWidth.value < 1280)

function onResize() {
  viewportWidth.value = window.innerWidth
}

onMounted(() => window.addEventListener('resize', onResize))
onBeforeUnmount(() => window.removeEventListener('resize', onResize))
</script>

<style scoped>
.canvas-inspector {
  width: 340px;
  flex-shrink: 0;
  border-left: 1px solid var(--border-color, #27272a);
  background: var(--bg-card, #18181b);
  overflow: auto;
  z-index: 8;
}
.canvas-inspector.overlay {
  position: absolute;
  top: 56px;
  right: 0;
  bottom: 0;
  box-shadow: -12px 0 32px rgba(0, 0, 0, 0.35);
}
.canvas-inspector :deep(.canvas-node-panel) {
  margin-top: 0;
  width: 100%;
  max-width: none;
  border: none;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
  padding: 12px 14px 16px;
}
</style>
