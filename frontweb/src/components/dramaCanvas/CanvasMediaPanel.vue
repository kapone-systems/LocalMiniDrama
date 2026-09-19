<template>
  <div
    class="canvas-node-panel media-panel nodrag nopan"
    :class="'kind-' + kind"
    @pointerdown.stop
    @mousedown.stop
    @click.stop
    @mouseup.stop
  >
    <div class="panel-head">
      <span>{{ kindTitle }}</span>
      <div class="head-right">
        <span v-if="busyLabel" class="busy-tag">{{ busyLabel }}</span>
        <el-button link size="small" @click.stop="closePanel">收起</el-button>
      </div>
    </div>

    <div class="panel-body">
      <template v-if="kind === 'text'">
        <p class="summary nowheel">{{ summary || '暂无脚本内容' }}</p>
        <el-button size="small" type="primary" plain @click.stop="focusStoryboard">编辑脚本</el-button>
      </template>

      <template v-else-if="kind === 'universal'">
        <el-input
          v-model="uniText"
          type="textarea"
          :rows="6"
          resize="vertical"
          class="nowheel uni-input"
          placeholder="全能分镜词"
        />
        <div class="panel-actions">
          <el-button size="small" :loading="uniBusy === 'gen'" :disabled="!!uniBusy" @click.stop="streamUniversal('generate')">
            生成
          </el-button>
          <el-button size="small" :loading="uniBusy === 'polish'" :disabled="!!uniBusy" @click.stop="streamUniversal('polish')">
            润色
          </el-button>
          <el-button v-if="uniBusy" size="small" type="danger" plain @click.stop="cancelUniStream">取消</el-button>
          <el-button size="small" @click.stop="saveUniText">保存</el-button>
          <el-button size="small" type="primary" :loading="busy" @click.stop="runStep('video')">生视频</el-button>
        </div>
      </template>

      <template v-else-if="kind === 'image'">
        <div class="preview-wrap">
          <img v-if="url && !busy" :src="url" alt="" class="preview-img" />
          <div v-else-if="!busy" class="preview-empty">{{ empty ? '待生图' : '无分镜图' }}</div>
          <div v-if="busy" class="preview-loading"><span class="spinner" />生图中…</div>
        </div>
        <template v-if="isFrameSlot">
          <el-input
            v-model="framePrompt"
            type="textarea"
            :rows="4"
            resize="vertical"
            class="nowheel"
            placeholder="帧提示词"
          />
          <div class="panel-actions">
            <el-button size="small" :loading="frameBusy === 'load'" @click.stop="loadFramePrompt">查看/刷新</el-button>
            <el-button size="small" :loading="frameBusy === 'save'" @click.stop="saveFramePromptText">保存提示词</el-button>
            <el-button size="small" type="primary" :loading="busy" @click.stop="generateThisFrame">生成本帧</el-button>
            <el-button size="small" :loading="pairBusy" @click.stop="generatePair">一键生成首尾帧</el-button>
            <el-button
              v-if="frameKind === 'first'"
              size="small"
              :disabled="!canUsePrevTail"
              :title="prevTailTooltip"
              :loading="linkBusy === 'prev'"
              @click.stop="usePrevTail"
            >
              使用上镜尾帧
            </el-button>
          </div>
        </template>
        <el-button v-else size="small" type="primary" :loading="busy" @click.stop="runStep('image')">
          {{ empty ? '生图' : '重新生图' }}
        </el-button>
      </template>

      <template v-else-if="kind === 'video'">
        <div class="preview-wrap wide">
          <video v-if="url && !busy" :src="url" class="preview-vid nowheel" controls playsinline />
          <div v-else-if="!busy" class="preview-empty">{{ empty ? '待生视频' : '无视频' }}</div>
          <div v-if="busy" class="preview-loading"><span class="spinner" />生视频中…</div>
        </div>
        <div class="panel-actions">
          <el-button size="small" type="primary" :loading="busy" @click.stop="runStep('video')">
            {{ empty ? '生视频' : '重新生视频' }}
          </el-button>
          <el-button
            size="small"
            :disabled="!canLinkTail"
            :title="linkTailTooltip"
            :loading="linkBusy === 'next'"
            @click.stop="linkTail"
          >
            尾帧衔接下一镜
          </el-button>
        </div>
      </template>

      <template v-else-if="kind === 'audio'">
        <div class="audio-label">{{ audioType === 'narration' ? '旁白音频' : '对白音频' }}</div>
        <audio v-if="url" :src="url" controls class="preview-aud nowheel" />
        <p v-if="skippedReason === '无对白'" class="hint">无对白，空槽仅作占位</p>
        <el-button size="small" type="warning" :loading="busy" @click.stop="runStep('audio')">
          {{ empty ? '配音' : '重新配音' }}
        </el-button>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useCanvasContext } from '@/composables/useCanvasContext'
import { CANVAS_NODE_STATUS_LABELS } from '@/composables/useCanvasNodeStatus'
import { runImageStep, runVideoStep, runAudioStep, pollTaskSimple } from '@/composables/useCanvasWorkflowRunner'
import { findStoryboardInDrama, getDramaGenerationOptions } from '@/utils/canvasWorkflow'
import { dramaUsesFirstLastFrame, resolveSbLastImageRecord } from '@/utils/storyboardMedia'
import { getAdjacentStoryboards } from '@/utils/storyboardContinuity'
import { storyboardsAPI } from '@/api/storyboards'
import {
  ensureProfessionalFramePrompt,
  generateStoryboardFrameImage,
  generateStoryboardFramePair,
  getCachedFramePromptFromDb,
  linkTailFrameToNext,
  reusePrevTailAsFirst,
  saveStoryboardFramePrompt,
} from '@/composables/filmCreate/storyboardFrameGenerate'

const props = defineProps({
  nodeId: { type: String, default: '' },
  kind: { type: String, required: true },
  storyboard: { type: Object, default: null },
  summary: { type: String, default: '' },
  url: { type: String, default: '' },
  audioType: { type: String, default: 'dialogue' },
  frameKind: { type: String, default: '' },
  frameLabel: { type: String, default: '' },
  empty: { type: Boolean, default: false },
  skippedReason: { type: String, default: '' },
})

const ctx = useCanvasContext()
const busy = ref(false)
const uniText = ref('')
const uniBusy = ref('')
const uniAbort = ref(null)
const framePrompt = ref('')
const frameBusy = ref('')
const pairBusy = ref(false)
const linkBusy = ref('')

const sbNodeId = computed(() => (props.storyboard?.id ? `sb:${props.storyboard.id}` : ''))
const isFrameSlot = computed(() => props.frameKind === 'first' || props.frameKind === 'last')
const drama = computed(() => ctx?.drama?.value)
const adj = computed(() => getAdjacentStoryboards(drama.value, props.storyboard))
const useFirstLast = computed(() => dramaUsesFirstLastFrame(drama.value))

const canLinkTail = computed(() => !!(adj.value.next && props.url))
const linkTailTooltip = computed(() => {
  if (!props.url) return '没有视频'
  if (!adj.value.next) return '没有下一镜'
  return '提取本镜视频尾帧设为下一镜首帧'
})

const prevLast = computed(() => {
  const prev = adj.value.prev
  if (!prev) return null
  return resolveSbLastImageRecord(prev, ctx?.imagesBySbId?.value || {})
})
const canUsePrevTail = computed(() => !!(adj.value.prev && prevLast.value && useFirstLast.value))
const prevTailTooltip = computed(() => {
  if (!useFirstLast.value) return '仅首尾帧模式可用'
  if (!adj.value.prev) return '没有上一镜'
  if (!prevLast.value) return '上一镜尚无尾帧'
  return '用上一镜尾帧作为本镜首帧'
})

const kindTitle = computed(() => {
  if (props.frameLabel) return props.frameLabel
  const map = { text: '脚本摘要', universal: '全能分镜词', image: '分镜图', video: '视频', audio: '音频' }
  return map[props.kind] || '媒体'
})

const busyLabel = computed(() => {
  const map = ctx?.nodeStatus?.map
  const id = props.nodeId || sbNodeId.value
  return id && map ? map[id]?.message : ''
})

watch(() => props.summary, (v) => { uniText.value = v || '' }, { immediate: true })
watch(() => [props.storyboard?.id, props.frameKind], () => {
  if (isFrameSlot.value) loadFramePrompt()
}, { immediate: true })

function focusStoryboard() {
  if (sbNodeId.value) ctx?.setFocusedNode?.(sbNodeId.value)
}

function closePanel() {
  ctx?.clearFocusedNode?.()
}

function flashNodes(ids) {
  ctx?.flashNodes?.(ids)
}

async function loadFramePrompt() {
  if (!props.storyboard?.id || !isFrameSlot.value) return
  frameBusy.value = 'load'
  try {
    framePrompt.value = await getCachedFramePromptFromDb(props.storyboard.id, props.frameKind)
    if (!framePrompt.value) {
      framePrompt.value = await ensureProfessionalFramePrompt(props.storyboard, props.frameKind, {
        fallbackPrompt: props.storyboard.image_prompt || '',
        pollTask: pollTaskSimple,
      })
    }
  } catch (e) {
    ElMessage.error(e?.message || '读取帧提示词失败')
  } finally {
    frameBusy.value = ''
  }
}

async function saveFramePromptText() {
  if (!props.storyboard?.id) return
  const text = framePrompt.value.trim()
  if (!text) {
    ElMessage.warning('提示词不能为空')
    return
  }
  frameBusy.value = 'save'
  try {
    await saveStoryboardFramePrompt(props.storyboard.id, props.frameKind, text)
    ElMessage.success('已保存')
  } catch (e) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    frameBusy.value = ''
  }
}

async function generateThisFrame() {
  await generateFrame(props.frameKind)
}

async function generateFrame(slot) {
  const d = drama.value
  const sb = props.storyboard
  if (!d || !sb) return
  busy.value = true
  const nodeId = slot === 'last' ? `sbimg-last:${sb.id}` : `sbimg-first:${sb.id}`
  ctx?.nodeStatus?.setBusy(nodeId, { step: 'image', message: slot === 'last' ? '尾帧生成中' : '首帧生成中' })
  try {
    const prompt = framePrompt.value.trim() || await ensureProfessionalFramePrompt(sb, slot, {
      fallbackPrompt: sb.image_prompt || sb.polished_prompt || '',
      pollTask: pollTaskSimple,
    })
    await generateStoryboardFrameImage({
      dramaId: d.id,
      sb,
      slot,
      prompt,
      style: getDramaGenerationOptions(d).style,
      aspectRatio: getDramaGenerationOptions(d).aspectRatio,
      pollTask: pollTaskSimple,
    })
    ElMessage.success(slot === 'last' ? '尾帧已生成' : '首帧已生成')
    ctx?.nodeStatus?.setOk(nodeId, { step: 'image', message: '完成' })
    await ctx?.refresh?.()
  } catch (e) {
    ctx?.nodeStatus?.setError(nodeId, { step: 'image', message: e?.message || '失败' })
    ElMessage.error(e?.message || '生成失败')
  } finally {
    busy.value = false
  }
}

async function generatePair() {
  pairBusy.value = true
  try {
    await generateStoryboardFramePair({
      hasFirst: !!adj.value && false,
      generateOne: async (slot) => generateFrame(slot),
    })
  } finally {
    pairBusy.value = false
  }
}

async function linkTail() {
  const d = drama.value
  const sb = props.storyboard
  if (!d || !sb || !canLinkTail.value) return
  linkBusy.value = 'next'
  try {
    await linkTailFrameToNext(sb.id, d.id)
    const next = adj.value.next
    ElMessage.success('尾帧已衔接到下一镜')
    await ctx?.refresh?.()
    flashNodes([`sbvid:${sb.id}`, `sbimg-first:${next.id}`])
  } catch (e) {
    ElMessage.error(e?.message || '尾帧衔接失败')
  } finally {
    linkBusy.value = ''
  }
}

async function usePrevTail() {
  const d = drama.value
  const sb = props.storyboard
  if (!d || !sb || !canUsePrevTail.value) return
  linkBusy.value = 'prev'
  try {
    await reusePrevTailAsFirst({
      dramaId: d.id,
      sb,
      prevSb: adj.value.prev,
      prevLastImg: prevLast.value,
    })
    ElMessage.success('已使用上镜尾帧')
    await ctx?.refresh?.()
    flashNodes([`sbimg-first:${sb.id}`, `sbimg-last:${adj.value.prev.id}`])
  } catch (e) {
    ElMessage.error(e?.message || '设置失败')
  } finally {
    linkBusy.value = ''
  }
}

async function saveUniText() {
  if (!props.storyboard?.id) return
  try {
    await storyboardsAPI.update(props.storyboard.id, { universal_segment_text: uniText.value.trim() || null })
    ElMessage.success('已保存')
    await ctx?.refreshDrama?.(true)
  } catch (e) {
    ElMessage.error(e?.message || '保存失败')
  }
}

async function streamUniversal(mode) {
  if (!props.storyboard?.id) return
  cancelUniStream()
  const ac = new AbortController()
  uniAbort.value = ac
  uniBusy.value = mode === 'polish' ? 'polish' : 'gen'
  uniText.value = ''
  try {
    const api = mode === 'polish'
      ? storyboardsAPI.polishUniversalSegmentPromptStream
      : storyboardsAPI.generateUniversalSegmentPromptStream
    const body = mode === 'polish'
      ? { draft_universal_segment_text: props.summary || '' }
      : {}
    const res = await api.call(storyboardsAPI, props.storyboard.id, body, (delta) => {
      uniText.value += delta
    }, ac.signal)
    if (res?.universal_segment_text) uniText.value = res.universal_segment_text
    await storyboardsAPI.update(props.storyboard.id, { universal_segment_text: uniText.value.trim() || null })
    await ctx?.refreshDrama?.(true)
  } catch (e) {
    if (e?.name === 'AbortError') ElMessage.info('已取消')
    else ElMessage.error(e?.message || '生成失败')
  } finally {
    uniBusy.value = ''
    uniAbort.value = null
  }
}

function cancelUniStream() {
  uniAbort.value?.abort?.()
  uniAbort.value = null
}

async function runStep(step) {
  const d = ctx?.drama?.value
  const sbId = props.storyboard?.id
  if (!d || !sbId) return
  busy.value = true
  const statusMsg = CANVAS_NODE_STATUS_LABELS[step] || '处理中…'
  ctx?.nodeStatus?.setBusy(props.nodeId, { step, message: statusMsg })
  ctx?.nodeStatus?.setBusy(sbNodeId.value, { step, message: statusMsg })
  try {
    const found = findStoryboardInDrama(d, sbId)
    const sb = found?.storyboard || props.storyboard
    const genOpts = ctx?.getGenerationOptions?.() || getDramaGenerationOptions(d)
    if (step === 'image') {
      await runImageStep(d, sb, {
        ...genOpts,
        frameSlot: props.frameKind === 'last' || props.frameKind === 'first' ? props.frameKind : undefined,
      })
    } else if (step === 'video') await runVideoStep(d, sb, genOpts)
    else if (step === 'audio') {
      const res = await runAudioStep(sb)
      if (res?.skipped) {
        ElMessage.info(res.reason || '已跳过')
        return
      }
    }
    ElMessage.success('生成完成')
    ctx?.nodeStatus?.setOk(props.nodeId, { step, message: '完成' })
    await ctx?.refresh?.()
  } catch (e) {
    ctx?.nodeStatus?.setError(props.nodeId, { step, message: e?.message || '失败' })
    ElMessage.error(e?.message || '生成失败')
  } finally {
    busy.value = false
    ctx?.nodeStatus?.clear(sbNodeId.value)
  }
}
</script>

<style scoped>
.media-panel {
  margin-top: 10px;
  width: min(360px, 90vw);
  padding: 10px 12px 12px;
  border-radius: 10px;
  border: 1px solid rgba(129, 140, 248, 0.4);
  background: rgba(15, 15, 18, 0.96);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.4);
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  font-weight: 700;
  color: #a5b4fc;
  margin-bottom: 8px;
}
.head-right {
  display: flex;
  align-items: center;
  gap: 6px;
}
.busy-tag {
  font-size: 10px;
  color: #93c5fd;
}
.panel-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.summary {
  margin: 0;
  font-size: 11px;
  line-height: 1.45;
  color: #d4d4d8;
  max-height: 120px;
  overflow-y: auto;
}
.preview-wrap {
  position: relative;
  width: 100%;
  height: 120px;
  border-radius: 6px;
  overflow: hidden;
  background: #09090b;
}
.preview-wrap.wide { height: 160px; }
.preview-img,
.preview-vid {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.preview-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #71717a;
}
.preview-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: rgba(9, 9, 11, 0.85);
  font-size: 10px;
  color: #d4d4d8;
}
.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.12);
  border-top-color: #818cf8;
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
}
.preview-aud { width: 100%; }
.audio-label {
  font-size: 11px;
  color: #fbbf24;
}
.hint { font-size: 11px; color: #71717a; margin: 0; }
.panel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.kind-video { border-color: rgba(244, 114, 182, 0.45); }
.kind-universal { border-color: rgba(167, 139, 250, 0.45); }
.kind-audio { border-color: rgba(251, 191, 36, 0.45); }
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
