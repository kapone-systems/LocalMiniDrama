<template>
  <span class="canvas-flow-aligner" aria-hidden="true" />
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useVueFlow } from '@vue-flow/core'
import { useCanvasContext } from '@/composables/useCanvasContext'

const { fitView, getViewport, setViewport, zoomIn, zoomOut, zoomTo, setCenter } = useVueFlow()
const ctx = useCanvasContext()

onMounted(() => {
  ctx?.registerCanvasFlowApi?.({
    getViewport,
    setViewport,
    setCenter,
    zoomIn: () => zoomIn(),
    zoomOut: () => zoomOut(),
    zoomTo: (z) => zoomTo(typeof z === 'number' ? z : 1),
    fitView: (opts = {}) => fitView({
      padding: 0.14,
      includeHiddenNodes: false,
      ...opts,
      duration: undefined,
    }),
  })
})

onUnmounted(() => {
  ctx?.registerCanvasFlowApi?.(null)
})
</script>

<style scoped>
.canvas-flow-aligner {
  display: none;
}
</style>
