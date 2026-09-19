<template>
  <el-dialog
    :model-value="modelValue"
    title="导入配置"
    width="720px"
    append-to-body
    @close="onClose"
  >
    <div v-if="!rows.length" class="import-drop">
      <input ref="fileRef" type="file" accept=".json" hidden @change="onFile" />
      <el-button type="primary" plain @click="fileRef?.click()">选择 JSON 文件</el-button>
      <p>支持原项目「各大平台中转站配置」导出格式。将跳过 stt，占位 Key 可在下面一次性替换。</p>
    </div>
    <template v-else>
      <el-form label-width="108px" class="import-form">
        <el-form-item label="统一替换 Key">
          <el-input v-model="keyOverride" placeholder="留空则使用文件中的 Key" show-password type="password" />
        </el-form-item>
        <el-form-item label="冲突策略">
          <el-radio-group v-model="conflict">
            <el-radio label="keep">并存</el-radio>
            <el-radio label="skip">跳过同名</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <el-table :data="previewRows" max-height="280" size="small">
        <el-table-column prop="name" label="名称" min-width="140" />
        <el-table-column prop="service_type" label="类型" width="110" />
        <el-table-column prop="provider" label="厂商" width="100" />
        <el-table-column prop="api_protocol" label="协议" width="110" />
        <el-table-column prop="base_url" label="Base URL" min-width="160" show-overflow-tooltip />
      </el-table>
      <p v-if="skippedStt" class="hint">已隐藏 {{ skippedStt }} 条 stt（当前页面不管理语音识别）。</p>
    </template>
    <template #footer>
      <el-button @click="onClose">取消</el-button>
      <el-button type="primary" :disabled="!previewRows.length" :loading="saving" @click="submit">
        导入 {{ previewRows.length }} 条
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { aiAPI } from '@/api/ai'

const props = defineProps({
  modelValue: Boolean,
  existing: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue', 'applied'])

const fileRef = ref(null)
const rows = ref([])
const keyOverride = ref('')
const conflict = ref('keep')
const saving = ref(false)
const skippedStt = ref(0)

const previewRows = computed(() => {
  let list = rows.value.filter((r) => r.service_type !== 'stt')
  if (conflict.value === 'skip') {
    const names = new Set((props.existing || []).map((e) => `${e.service_type}:${e.name}`))
    list = list.filter((r) => !names.has(`${r.service_type}:${r.name}`))
  }
  return list
})

function onClose() {
  emit('update:modelValue', false)
}

function onFile(ev) {
  const file = ev.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || '[]'))
      if (!Array.isArray(parsed)) throw new Error('JSON 必须是数组')
      rows.value = parsed
      skippedStt.value = parsed.filter((r) => r.service_type === 'stt').length
    } catch (e) {
      ElMessage.error('无法解析：' + (e.message || ''))
      rows.value = []
    }
  }
  reader.readAsText(file)
  ev.target.value = ''
}

async function submit() {
  saving.value = true
  let ok = 0
  const errors = []
  try {
    for (const cfg of previewRows.value) {
      try {
        const models = Array.isArray(cfg.model) ? cfg.model : (cfg.model ? [cfg.model] : [])
        await aiAPI.create({
          service_type: cfg.service_type,
          name: cfg.name,
          provider: cfg.provider,
          api_protocol: cfg.api_protocol || '',
          base_url: cfg.base_url,
          api_key: keyOverride.value.trim() || cfg.api_key,
          model: models,
          default_model: cfg.default_model || models[0] || null,
          endpoint: cfg.endpoint || '',
          query_endpoint: cfg.query_endpoint || '',
          priority: cfg.priority ?? 0,
          is_default: !!cfg.is_default,
          settings: cfg.settings || null,
        })
        ok++
      } catch (e) {
        errors.push(`${cfg.name}: ${e?.message || '失败'}`)
      }
    }
    if (errors.length) ElMessage.warning(`导入 ${ok} 条成功，失败：${errors.slice(0, 3).join('；')}`)
    else ElMessage.success(`已导入 ${ok} 条`)
    rows.value = []
    emit('applied')
    emit('update:modelValue', false)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.import-drop {
  padding: 28px 8px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}
.import-drop p { margin-top: 12px; line-height: 1.5; }
.hint { margin-top: 8px; font-size: 12px; color: var(--text-faint); }
</style>
