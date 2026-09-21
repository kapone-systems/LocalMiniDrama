<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="420px"
    destroy-on-close
    @closed="resetForm"
  >
    <el-form label-position="top" size="default" @submit.prevent="onSubmit">
      <el-form-item v-if="showEpisodeSelect" label="所属集数" required>
        <el-select v-model="form.episode_id" placeholder="请选择集数" style="width: 100%">
          <el-option
            v-for="ep in episodes"
            :key="ep.id"
            :label="ep.title || ('第' + (ep.episode_number || 0) + '集')"
            :value="ep.id"
          />
        </el-select>
      </el-form-item>
      <template v-if="type === 'storyboard'">
        <el-form-item label="分镜标题">
          <el-input v-model="form.title" placeholder="留空则自动命名" />
        </el-form-item>
        <el-form-item label="描述（可选）">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="简要描述" />
        </el-form-item>
      </template>

      <template v-else-if="type === 'episode'">
        <el-form-item label="集标题">
          <el-input v-model="form.title" placeholder="留空则自动命名" />
        </el-form-item>
      </template>

      <template v-else-if="type === 'character'">
        <el-form-item label="角色名称" required>
          <el-input v-model="form.name" placeholder="必填" />
        </el-form-item>
        <el-form-item label="角色类型">
          <el-select v-model="form.role" placeholder="可选" clearable style="width: 100%">
            <el-option label="主角" value="main" />
            <el-option label="配角" value="supporting" />
          </el-select>
        </el-form-item>
        <el-form-item label="外貌描述">
          <el-input v-model="form.appearance" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="简介">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
      </template>

      <template v-else-if="type === 'scene'">
        <el-form-item label="场景地点" required>
          <el-input v-model="form.location" placeholder="必填，如：客厅" />
        </el-form-item>
        <el-form-item label="时间">
          <el-input v-model="form.time" placeholder="如：白天、夜晚" />
        </el-form-item>
        <el-form-item label="场景描述">
          <el-input v-model="form.prompt" type="textarea" :rows="3" />
        </el-form-item>
      </template>

      <template v-else-if="type === 'prop'">
        <el-form-item label="道具名称" required>
          <el-input v-model="form.name" placeholder="必填" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="提示词">
          <el-input v-model="form.prompt" type="textarea" :rows="2" />
        </el-form-item>
      </template>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="onSubmit">创建</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  type: { type: String, default: 'storyboard' },
  onSubmit: { type: Function, default: null },
  episodes: { type: Array, default: () => [] },
  needEpisodeSelect: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'submit'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const submitting = ref(false)
const form = reactive({
  title: '',
  description: '',
  name: '',
  role: '',
  appearance: '',
  location: '',
  time: '',
  prompt: '',
  episode_id: null,
})

const dialogTitle = computed(() => {
  const map = {
    storyboard: '新建分镜',
    episode: '新建集',
    character: '新建角色',
    scene: '新建场景',
    prop: '新建道具',
  }
  return map[props.type] || '新建'
})

const showEpisodeSelect = computed(() => {
  if (!props.needEpisodeSelect) return false
  return ['storyboard', 'character', 'scene', 'prop'].includes(props.type)
})

function resetForm() {
  form.title = ''
  form.description = ''
  form.name = ''
  form.role = ''
  form.appearance = ''
  form.location = ''
  form.time = ''
  form.prompt = ''
  form.episode_id = props.needEpisodeSelect ? ((props.episodes || [])[0]?.id ?? null) : null
  submitting.value = false
}

watch(() => props.type, () => resetForm())
watch(() => props.modelValue, (open) => {
  if (open) {
    form.episode_id = props.needEpisodeSelect ? ((props.episodes || [])[0]?.id ?? null) : null
  }
})

function validate() {
  if (showEpisodeSelect.value && !form.episode_id) {
    ElMessage.warning('请先选择集数')
    return false
  }
  if (props.type === 'character' || props.type === 'prop') {
    if (!form.name.trim()) {
      ElMessage.warning('请填写名称')
      return false
    }
  }
  if (props.type === 'scene' && !form.location.trim()) {
    ElMessage.warning('请填写场景地点')
    return false
  }
  return true
}

async function onSubmit() {
  if (!validate()) return
  submitting.value = true
  try {
    const handler = props.onSubmit || ((form) => emit('submit', form))
    await handler({ ...form })
  } finally {
    submitting.value = false
  }
}
</script>
