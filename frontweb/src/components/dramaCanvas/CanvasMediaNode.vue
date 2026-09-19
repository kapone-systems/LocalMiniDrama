<template>
  <div
    class="canvas-media-node"
    :class="[
      'kind-' + data.kind,
      {
        highlighted: data.highlighted,
        dimmed: data.dimmed,
        focused: isFocused,
        processing: isNodeBusy,
        empty: isEmpty,
        flash: isFlash,
      },
    ]"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
  >
    <Handle type="target" :position="Position.Left" />
    <Handle v-if="data.kind !== 'video' && data.kind !== 'audio'" type="source" :position="Position.Right" />
    <CanvasNodeStatusOverlay :node-id="id" />
    <div class="tag">{{ kindLabel }}</div>
    <template v-if="data.kind === 'text'">
      <p class="text-body">{{ data.summary || '暂无脚本' }}</p>
    </template>
    <template v-else-if="data.kind === 'universal'">
      <p v-if="!isEmpty" class="text-body universal-body">{{ data.summary }}</p>
      <div v-else class="empty-slot">
        <span>待填写全能词</span>
      </div>
    </template>
    <template v-else-if="data.kind === 'image'">
      <img
        v-if="data.url && !isEmpty"
        :src="data.url"
        alt=""
        class="media-img"
      />
      <div v-else class="empty-slot">
        <span>{{ emptyLabel }}</span>
        <button type="button" class="empty-cta" :disabled="isNodeBusy" @click.stop="onGenerate">
          {{ ctaLabel }}
        </button>
      </div>
    </template>
    <template v-else-if="data.kind === 'video'">
      <video
        v-if="data.url && !isEmpty"
        ref="videoRef"
        :src="data.url"
        class="media-vid"
        muted
        playsinline
        loop
      />
      <div v-else class="empty-slot">
        <span>{{ emptyLabel }}</span>
        <button type="button" class="empty-cta" :disabled="isNodeBusy" @click.stop="onGenerate">
          {{ ctaLabel }}
        </button>
      </div>
    </template>
    <template v-else-if="data.kind === 'audio'">
      <div v-if="!isEmpty" class="audio-wrap">
        <span>🎵</span>
        <span>{{ data.audioType === 'narration' ? '旁白' : '对白' }}</span>
      </div>
      <div v-else class="empty-slot">
        <span>{{ data.skippedReason === '无对白' ? '无对白' : emptyLabel }}</span>
        <button
          v-if="data.skippedReason !== '无对白'"
          type="button"
          class="empty-cta"
          :disabled="isNodeBusy"
          @click.stop="onGenerate"
        >
          {{ ctaLabel }}
        </button>
      </div>
    </template>
    <Teleport to="body">
      <div
        v-if="imagePreview.visible"
        class="canvas-img-hover-preview"
        :style="{ left: imagePreview.x + 'px', top: imagePreview.y + 'px' }"
      >
        <img :src="data.url" alt="" />
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { useCanvasContext } from '@/composables/useCanvasContext'
import CanvasNodeStatusOverlay from './CanvasNodeStatusOverlay.vue'

const props = defineProps({
  id: { type: String, required: true },
  data: { type: Object, required: true },
})

const ctx = useCanvasContext()
const videoRef = ref(null)
const imagePreview = reactive({ visible: false, x: 0, y: 0 })

const isFocused = computed(() => ctx?.focusedNodeId?.value === props.id)
const isEmpty = computed(() => !!props.data.empty || (!props.data.url && (props.data.kind === 'image' || props.data.kind === 'video' || props.data.kind === 'audio')))
const isFlash = computed(() => !!(ctx?.flashNodeIds?.value || []).includes(props.id))

const isNodeBusy = computed(() => ctx?.nodeStatus?.isBusy?.(props.id) || false)

const kindLabel = computed(() => {
  if (props.data.frameLabel) return props.data.frameLabel
  const map = { text: '脚本摘要', universal: '全能分镜词', image: '分镜图', video: '视频', audio: '音频' }
  return map[props.data.kind] || props.data.kind
})

const emptyLabel = computed(() => {
  if (props.data.kind === 'image') {
    if (props.data.frameKind === 'first') return '待生首帧'
    if (props.data.frameKind === 'last') return '待生尾帧'
    return '待生图'
  }
  if (props.data.kind === 'video') return '待生视频'
  if (props.data.kind === 'audio') return '待配音'
  return '待填写'
})

const ctaLabel = computed(() => {
  if (props.data.kind === 'image') return '生图'
  if (props.data.kind === 'video') return '生视频'
  if (props.data.kind === 'audio') return '配音'
  return '生成'
})

function onGenerate() {
  ctx?.generateMediaNode?.(props.id, props.data)
}

function onEnter(e) {
  if (props.data.kind === 'video' && props.data.url && videoRef.value) {
    const el = videoRef.value
    el.muted = true
    el.loop = true
    el.play?.().catch(() => {})
  }
  if (props.data.kind === 'image' && props.data.url && !isEmpty.value) {
    imagePreview.visible = true
    imagePreview.x = Math.min(window.innerWidth - 380, (e.clientX || 0) + 16)
    imagePreview.y = Math.min(window.innerHeight - 220, (e.clientY || 0) - 40)
  }
}

function onLeave() {
  if (videoRef.value) {
    try {
      videoRef.value.pause()
      videoRef.value.currentTime = 0
    } catch (_) {}
  }
  imagePreview.visible = false
}
</script>

<style scoped>
.canvas-media-node {
  position: relative;
  width: 168px;
  min-height: 100px;
  padding: 8px;
  border-radius: 10px;
  border: 1px solid var(--border-muted, #3f3f46);
  background: rgba(24, 24, 27, 0.95);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.canvas-media-node.focused {
  border-color: #818cf8;
  box-shadow: 0 0 0 1px rgba(129, 140, 248, 0.35);
}
.canvas-media-node.empty {
  border-style: dashed;
}
.canvas-media-node.flash {
  box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.85);
}
.tag {
  font-size: 10px;
  font-weight: 600;
  color: #818cf8;
  margin-bottom: 6px;
}
.text-body {
  margin: 0;
  font-size: 11px;
  line-height: 1.45;
  color: #d4d4d8;
  display: -webkit-box;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.media-img {
  width: 100%;
  height: 92px;
  object-fit: cover;
  border-radius: 6px;
  background: #09090b;
}
.media-vid {
  width: 100%;
  height: 92px;
  object-fit: cover;
  border-radius: 6px;
  background: #000;
}
.audio-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 24px 8px;
  font-size: 12px;
  color: #fbbf24;
}
.empty-slot {
  min-height: 72px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 11px;
  color: #a1a1aa;
  text-align: center;
  padding: 8px 4px;
}
.empty-cta {
  appearance: none;
  border: 1px solid rgba(129, 140, 248, 0.45);
  background: rgba(129, 140, 248, 0.16);
  color: #c7d2fe;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 11px;
  cursor: pointer;
}
.empty-cta:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.universal-body {
  -webkit-line-clamp: 8;
}
.kind-universal { border-color: rgba(167, 139, 250, 0.5); }
.kind-universal .tag { color: #c4b5fd; }
.kind-image { border-color: rgba(129, 140, 248, 0.4); }
.kind-video { border-color: rgba(244, 114, 182, 0.4); }
.kind-audio { border-color: rgba(251, 191, 36, 0.4); }
.canvas-media-node.processing { border-color: #60a5fa; }
.highlighted { box-shadow: 0 0 0 2px rgba(129, 140, 248, 0.55); }
.dimmed { opacity: 0.28; }
</style>

<style>
.canvas-img-hover-preview {
  position: fixed;
  z-index: 4000;
  width: 360px;
  pointer-events: none;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(129, 140, 248, 0.45);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
  background: #09090b;
}
.canvas-img-hover-preview img {
  display: block;
  width: 360px;
  height: auto;
  max-height: 240px;
  object-fit: contain;
  background: #09090b;
}
</style>
