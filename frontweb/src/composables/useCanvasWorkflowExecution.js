import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { dramaAPI } from '@/api/drama'
import { taskAPI } from '@/api/task'
import { findStoryboardInDrama } from '@/utils/canvasWorkflow'
import { CANVAS_NODE_STATUS_LABELS } from '@/composables/useCanvasNodeStatus'

function parseResult(raw) {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function stepNodeIds(storyboardId, step, drama) {
  const ids = [`sb:${storyboardId}`]
  if (step === 'image') {
    ids.push(`sbimg:${storyboardId}`, `sbimg-first:${storyboardId}`, `sbimg-last:${storyboardId}`)
  } else if (step === 'video') ids.push(`sbvid:${storyboardId}`)
  else if (step === 'audio') ids.push(`sbaud:${storyboardId}:dialogue`)
  return ids
}

export function useCanvasWorkflowExecution(deps) {
  const {
    drama,
    dramaId,
    nodeStatus,
    refreshCanvas,
    locateStoryboard,
  } = deps

  const workflowRunning = ref(false)
  const workflowProgress = ref('')
  const activeRunTaskId = ref(null)
  const runSnapshot = ref(null)
  const failedItems = ref([])
  let pollTimer = null

  const progressLabel = computed(() => {
    const snap = runSnapshot.value
    if (!snap) return workflowProgress.value
    const cur = snap.current || {}
    const total = cur.total || (snap.storyboard_ids || []).length || 0
    const index = cur.index || 0
    const stepLabel = cur.step === 'image' ? '生图' : cur.step === 'video' ? '生视频' : cur.step === 'audio' ? '配音' : ''
    const num = cur.storyboardNumber || cur.storyboardId || ''
    if (!total) return workflowProgress.value
    return `${index}/${total} 镜${num ? ` #${num}` : ''}${stepLabel ? ` · ${stepLabel}` : ''}`
  })

  function applySnapshotToNodes(snap) {
    if (!snap) return
    const current = snap.current
    if (current?.storyboardId && current.step && (snap.status === 'processing' || !snap.status)) {
      const msg = CANVAS_NODE_STATUS_LABELS[current.step] || '处理中…'
      for (const id of stepNodeIds(current.storyboardId, current.step, drama.value)) {
        nodeStatus.setBusy(id, { step: current.step, message: msg })
      }
    }
    for (const item of snap.items || []) {
      if (item.status === 'failed') {
        for (const id of stepNodeIds(item.storyboardId, item.step || 'image', drama.value)) {
          nodeStatus.setError(id, { step: item.step, message: item.error || '失败' })
        }
      }
      if (item.status === 'ok') {
        for (const id of stepNodeIds(item.storyboardId, item.step || 'image', drama.value)) {
          if (nodeStatus.get(id)?.status === 'busy') nodeStatus.setOk(id, { step: item.step, message: '完成' })
        }
      }
    }
    failedItems.value = (snap.summary?.failed || snap.items || [])
      .filter((x) => x.status === 'failed' || x.error)
      .map((x) => ({
        storyboardId: x.storyboardId,
        error: x.error,
        number: findStoryboardInDrama(drama.value, x.storyboardId)?.storyboard?.storyboard_number,
      }))
  }

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  async function pollOnce() {
    if (!activeRunTaskId.value) return
    try {
      const t = await taskAPI.get(activeRunTaskId.value)
      const snap = parseResult(t.result) || {}
      snap.status = t.status
      runSnapshot.value = snap
      applySnapshotToNodes(snap)
      if (t.status === 'completed' || t.status === 'failed') {
        stopPoll()
        workflowRunning.value = false
        activeRunTaskId.value = null
        await refreshCanvas?.(true)
        if (t.status === 'failed' && (t.error || '').includes('取消')) {
          ElMessage.info('工作流已停止')
        } else if ((snap.summary?.failed || []).length) {
          ElMessage.warning(`完成 ${(snap.summary?.ok || []).length} 镜，失败 ${(snap.summary.failed || []).length} 镜`)
        } else if (t.status === 'completed') {
          ElMessage.success(`工作流执行完成，共 ${(snap.summary?.ok || []).length} 镜`)
        }
        workflowProgress.value = ''
      }
    } catch (_) {}
  }

  function startPoll(taskId) {
    stopPoll()
    activeRunTaskId.value = taskId
    workflowRunning.value = true
    pollOnce()
    pollTimer = setInterval(pollOnce, 1500)
  }

  async function startRun(body) {
    if (!dramaId.value) return
    const res = await dramaAPI.startWorkflowRun(dramaId.value, body)
    const taskId = res?.task_id || res?.id
    if (!taskId) throw new Error('未返回任务 ID')
    startPoll(taskId)
    return taskId
  }

  async function stopRun() {
    if (!activeRunTaskId.value) return
    try {
      await taskAPI.cancel(activeRunTaskId.value)
    } catch (_) {}
  }

  async function resumeIfNeeded() {
    if (!dramaId.value) return
    try {
      const list = await taskAPI.listByResource(String(dramaId.value))
      const items = Array.isArray(list) ? list : (list?.items || [])
      const running = items.find((t) => t.type === 'workflow_run' && (t.status === 'pending' || t.status === 'processing'))
      if (running) startPoll(running.id)
    } catch (_) {}
  }

  function locateFailed(item) {
    locateStoryboard?.(item.storyboardId)
  }

  return {
    workflowRunning,
    workflowProgress,
    progressLabel,
    failedItems,
    runSnapshot,
    activeRunTaskId,
    startRun,
    stopRun,
    resumeIfNeeded,
    locateFailed,
    startPoll,
    stopPoll,
  }
}
