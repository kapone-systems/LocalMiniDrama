<template>
  <el-dialog
    :model-value="modelValue"
    :title="dialogTitle"
    width="780px"
    destroy-on-close
    class="vp-adapt-dialog"
    @close="onClose"
  >
    <div v-if="resolved" class="vp-adapt-skill">
      <template v-if="resolved.skill">
        当前视频模型：{{ resolved.model || '（配置默认）' }}
        · 将使用 <strong>{{ resolved.skill.label }}</strong>
      </template>
      <template v-else-if="resolved.reason === 'universal_omni_skip' || resolved.reason === 'universal_skip_generic'">
        全能分镜未匹配到 Omni 专用 Skill，不会用通用改写去碰 @图片N。请将视频协议设为可灵 Omni 或 Seedance 全能。
      </template>
      <template v-else-if="resolved.reason === 'no_video_config'">
        未配置视频模型，无法按模型优化。
      </template>
      <template v-else>
        当前模型将使用通用视频提示词 Skill。
      </template>
      <span v-if="resolved.adapt_enabled === false" class="vp-adapt-off">（生成设置中已关闭自动优化）</span>
    </div>
    <p class="vp-adapt-hint">
      优化结果只用于提交视频 API，不会覆盖本镜通用视频词。换模型后请重新优化。
    </p>
    <div class="vp-adapt-grid">
      <div>
        <div class="vp-adapt-col-title">原稿（真源）</div>
        <el-input :model-value="canonical" type="textarea" :rows="10" readonly />
      </div>
      <div>
        <div class="vp-adapt-col-title">按当前模型改写</div>
        <el-input v-model="adapted" type="textarea" :rows="10" placeholder="点击下方「开始优化」流式生成" />
      </div>
    </div>
    <template #footer>
      <el-button @click="onClose">关闭</el-button>
      <el-button :loading="running" :disabled="!canRun" @click="runAdapt">
        {{ adapted ? '重新优化' : '开始优化' }}
      </el-button>
      <el-button :disabled="!adapted.trim()" @click="onCache">采用到本镜提交缓存</el-button>
      <el-button :disabled="!storyboard?.id" @click="emit('generate-original')">用原稿生成</el-button>
      <el-button type="primary" :disabled="!adapted.trim()" @click="onGenerateAdapted">用改写结果生成</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { storyboardsAPI } from '@/api/storyboards'
import { videoPromptSkillsAPI } from '@/api/prompts'
import { setVideoPromptAdaptCache } from '@/composables/useVideoPromptAdapt'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  storyboard: { type: Object, default: null },
  draftPrompt: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'generate-adapted', 'generate-original'])

const resolved = ref(null)
const adapted = ref('')
const running = ref(false)
let abort = null

const canonical = computed(() => {
  const draft = (props.draftPrompt || '').trim()
  if (draft) return draft
  const sb = props.storyboard
  if (!sb) return ''
  return (sb.universal_segment_text || sb.video_prompt || '').toString().trim()
})

const dialogTitle = computed(() => {
  const n = props.storyboard?.storyboard_number ?? props.storyboard?.id ?? ''
  return `按当前模型优化视频提示词${n !== '' ? ` · 分镜 ${n}` : ''}`
})

const canRun = computed(() => !!props.storyboard?.id && canonical.value.length >= 4 && !running.value)

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) {
      if (abort) abort.abort()
      abort = null
      running.value = false
      return
    }
    adapted.value = ''
    resolved.value = null
    try {
      resolved.value = await videoPromptSkillsAPI.resolve({
        storyboard_id: props.storyboard?.id,
      })
    } catch (_) {
      resolved.value = { skill: null, reason: 'resolve_failed' }
    }
  }
)

function onClose() {
  emit('update:modelValue', false)
}

async function runAdapt() {
  if (!canRun.value) return
  running.value = true
  adapted.value = ''
  abort = new AbortController()
  try {
    const done = await storyboardsAPI.adaptVideoPromptStream(
      props.storyboard.id,
      { draft_video_prompt: canonical.value },
      (delta) => {
        adapted.value += delta
      },
      abort.signal,
    )
    const text = (done?.adapted_prompt && String(done.adapted_prompt).trim()) || adapted.value.trim()
    if (!text) {
      ElMessage.warning('未收到完整优化结果')
      return
    }
    adapted.value = text
    if (done?.skill_id) {
      resolved.value = {
        ...(resolved.value || {}),
        skill: {
          id: done.skill_id,
          label: done.skill_label || resolved.value?.skill?.label || done.skill_id,
        },
      }
    }
    ElMessage.success('已按当前模型优化（未改写分镜真源）')
  } catch (e) {
    if (e?.name === 'AbortError') return
    ElMessage.error(e.message || '优化失败，请检查文本模型配置')
  } finally {
    running.value = false
    abort = null
  }
}

async function onCache() {
  const text = adapted.value.trim()
  if (!text || !props.storyboard?.id) return
  const skillId = resolved.value?.skill?.id || 'generic'
  setVideoPromptAdaptCache(props.storyboard.id, skillId, text, canonical.value)
  try {
    await storyboardsAPI.adaptVideoPromptCache(props.storyboard.id, {
      adapted_prompt: text,
      skill_id: skillId,
      source_prompt: canonical.value,
    })
    ElMessage.success('已缓存到本镜，下次生成将直接提交该改写结果')
  } catch (e) {
    ElMessage.success('已缓存在本会话；服务端缓存未写入：' + (e.message || ''))
  }
}

function onGenerateAdapted() {
  const text = adapted.value.trim()
  if (!text) return
  const skillId = resolved.value?.skill?.id || 'generic'
  setVideoPromptAdaptCache(props.storyboard.id, skillId, text, canonical.value)
  emit('generate-adapted', {
    prompt: text,
    skillId,
    adapt_prompt: false,
    adapted_by_skill_id: skillId,
  })
}
</script>

<style scoped>
.vp-adapt-skill {
  font-size: 13px;
  color: var(--el-text-color-primary);
  margin-bottom: 8px;
  line-height: 1.5;
}
.vp-adapt-off {
  color: var(--el-color-warning);
  margin-left: 6px;
}
.vp-adapt-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin: 0 0 12px;
  line-height: 1.5;
}
.vp-adapt-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.vp-adapt-col-title {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}
@media (max-width: 720px) {
  .vp-adapt-grid { grid-template-columns: 1fr; }
}
</style>
