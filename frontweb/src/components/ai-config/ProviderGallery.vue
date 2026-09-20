<template>
  <el-dialog
    :model-value="modelValue"
    title="预设画廊"
    width="860px"
    class="preset-gallery"
    append-to-body
    @close="$emit('update:modelValue', false)"
  >
    <p class="gallery-lead">选一个预设，填入 API Key（自建网关再填地址），一次创建文本 / 图 / 视频全套配置。</p>
    <div v-for="g in PACK_GROUPS" :key="g.id" class="pack-group">
      <h3 class="pack-group-title">{{ g.label }}</h3>
      <div class="pack-grid">
        <button
          v-for="pack in packsByGroup(g.id)"
          :key="pack.id"
          type="button"
          class="pack-card"
          :class="{ active: selected?.id === pack.id }"
          @click="selected = pack"
        >
          <div class="pack-title">{{ pack.title }}</div>
          <div class="pack-desc">{{ pack.desc }}</div>
          <div class="pack-meta">{{ resolvePackConfigs(pack).length }} 条配置</div>
        </button>
      </div>
    </div>
    <div v-if="selected" class="pack-apply">
      <el-form label-position="top">
        <el-form-item :label="selected.title + ' API Key'" :required="selected.needsApiKey !== false">
          <el-input v-model="apiKey" type="password" show-password :placeholder="selected.needsApiKey === false ? '本地服务可留空' : 'sk-…'" />
        </el-form-item>
        <el-form-item v-if="selected.needsBaseUrl" label="网关 Base URL" required>
          <el-input v-model="baseUrl" :placeholder="selected.defaultBaseUrl || 'http://127.0.0.1:8000'" />
        </el-form-item>
      </el-form>
    </div>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :disabled="!canApply" :loading="saving" @click="apply">
        创建 {{ selected ? resolvePackConfigs(selected).length : 0 }} 条配置
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { aiAPI } from '@/api/ai'
import { PRESET_PACKS, PACK_GROUPS, resolvePackConfigs } from '@/ai-config/packs.js'

defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue', 'applied'])

const selected = ref(null)
const apiKey = ref('')
const baseUrl = ref('')
const saving = ref(false)

const canApply = computed(() => {
  const pack = selected.value
  if (!pack) return false
  if (pack.needsApiKey !== false && !apiKey.value.trim()) return false
  if (pack.needsBaseUrl && !(baseUrl.value || pack.defaultBaseUrl || '').trim()) return false
  return true
})

watch(selected, (p) => {
  baseUrl.value = p?.defaultBaseUrl || ''
})

function packsByGroup(id) {
  return PRESET_PACKS.filter((p) => p.group === id)
}

async function apply() {
  const pack = selected.value
  const key = apiKey.value.trim()
  if (!pack) return
  if (pack.needsApiKey !== false && !key) return
  const rows = resolvePackConfigs(pack)
  if (!rows.length) {
    ElMessage.warning('该预设没有可导入的配置')
    return
  }
  saving.value = true
  let ok = 0
  let fail = 0
  try {
    const gw = (baseUrl.value || pack.defaultBaseUrl || '').replace(/\/+$/, '')
    for (const cfg of rows) {
      if (cfg.service_type === 'stt') continue
      try {
        const models = Array.isArray(cfg.model) ? cfg.model : (cfg.model ? [cfg.model] : [])
        await aiAPI.create({
          service_type: cfg.service_type,
          name: cfg.name,
          provider: cfg.provider,
          api_protocol: cfg.api_protocol || '',
          base_url: pack.needsBaseUrl ? gw : (cfg.base_url || ''),
          api_key: key,
          model: models,
          default_model: cfg.default_model || models[0] || null,
          endpoint: cfg.endpoint || '',
          query_endpoint: cfg.query_endpoint || '',
          priority: cfg.priority ?? 10,
          is_default: cfg.is_default !== false,
          settings: cfg.settings || null,
        })
        ok++
      } catch (_) {
        fail++
      }
    }
    ElMessage.success(`已创建 ${ok} 条${fail ? `，${fail} 条失败` : ''}`)
    emit('update:modelValue', false)
    emit('applied')
    apiKey.value = ''
    selected.value = null
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.gallery-lead {
  margin: 0 0 16px;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.6;
}
.pack-group { margin-bottom: 18px; }
.pack-group-title {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-subtle);
  letter-spacing: 0.04em;
}
.pack-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
}
.pack-card {
  text-align: left;
  padding: 12px 14px;
  border-radius: var(--radius-md, 10px);
  border: 1px solid var(--border-color);
  background: var(--bg-inner);
  color: var(--text-primary);
  cursor: pointer;
  transition: border-color .15s, box-shadow .15s;
}
.pack-card:hover { border-color: var(--el-color-primary); }
.pack-card.active {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 1px var(--el-color-primary);
}
.pack-title { font-weight: 600; font-size: 14px; }
.pack-desc {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.45;
  min-height: 34px;
}
.pack-meta { margin-top: 8px; font-size: 11px; color: var(--text-faint); }
.pack-apply { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-color); }
</style>
