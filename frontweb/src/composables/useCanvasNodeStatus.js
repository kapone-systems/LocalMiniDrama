import { reactive } from 'vue'

const OK_TTL_MS = 2000

/** 画布节点操作状态（生图/生视频/生成参考图等） */
export function createCanvasNodeStatusStore() {
  const map = reactive({})
  const timers = {}

  function clearTimer(nodeId) {
    if (timers[nodeId]) {
      clearTimeout(timers[nodeId])
      delete timers[nodeId]
    }
  }

  function set(nodeId, payload) {
    if (!nodeId) return
    clearTimer(nodeId)
    if (!payload) {
      delete map[nodeId]
      return
    }
    const status = payload.status || 'busy'
    const at = Date.now()
    map[nodeId] = {
      status,
      step: payload.step || 'busy',
      message: payload.message || (status === 'error' ? '失败' : status === 'ok' ? '完成' : '处理中…'),
      at,
    }
    if (status === 'ok') {
      timers[nodeId] = setTimeout(() => {
        if (map[nodeId]?.status === 'ok' && map[nodeId].at === at) {
          delete map[nodeId]
        }
        delete timers[nodeId]
      }, OK_TTL_MS)
    }
  }

  function setBusy(nodeId, payload) {
    set(nodeId, { ...payload, status: 'busy' })
  }

  function setError(nodeId, payload) {
    set(nodeId, { ...payload, status: 'error' })
  }

  function setOk(nodeId, payload) {
    set(nodeId, { ...payload, status: 'ok' })
  }

  function clear(nodeId) {
    if (!nodeId) return
    clearTimer(nodeId)
    delete map[nodeId]
  }

  function get(nodeId) {
    return nodeId ? map[nodeId] || null : null
  }

  function isBusy(nodeId) {
    return get(nodeId)?.status === 'busy'
  }

  return { map, set, setBusy, setError, setOk, clear, get, isBusy }
}

export const CANVAS_NODE_STATUS_LABELS = {
  image: '生图中',
  video: '生视频中',
  audio: '配音中',
  polish: '润色中',
  save: '保存中',
  ref_image: '生成参考图',
  generate_sb: 'AI 生成分镜',
  save_script: '保存剧本',
  extract_chars: '提取角色',
  extract_scenes: '提取场景',
  extract_props: '提取道具',
  extract_all: '一键提取',
  merge: '合成中',
}
