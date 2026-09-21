import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useDramaMutations } from '@/composables/useDramaMutations'

/** 画布内新建实体（复用列表模式同款 API / 共享 mutations） */
export function useCanvasCrud(deps) {
  const {
    drama,
    filterEpisodeId,
    layoutCache,
    focusedNodeId,
    refreshCanvas,
    persistCanvasState,
    refreshLocal,
  } = deps

  const mutations = useDramaMutations()
  const createDialogVisible = ref(false)
  const createDialogType = ref('storyboard')
  /** 右键菜单创建时在画布上的坐标 { x, y } */
  const pendingFlowPosition = ref(null)

  function resolveEpisodeId(formEpisodeId) {
    if (filterEpisodeId.value) return filterEpisodeId.value
    if (formEpisodeId) return formEpisodeId
    const eps = drama.value?.episodes || []
    if (eps.length === 1) return eps[0].id
    return null
  }

  function openCreateDialog(type, flowPosition = null) {
    const eps = drama.value?.episodes || []
    if (['storyboard', 'character', 'scene', 'prop'].includes(type) && !eps.length) {
      ElMessage.warning('请先创建一集')
      return
    }
    createDialogType.value = type
    pendingFlowPosition.value = flowPosition
    createDialogVisible.value = true
  }

  async function saveNodePosition(nodeId, pos) {
    if (!pos || !nodeId) return
    const prev = layoutCache.value || { version: 1, nodes: {} }
    layoutCache.value = {
      ...prev,
      version: 1,
      nodes: {
        ...(prev.nodes || {}),
        [nodeId]: { x: pos.x, y: pos.y },
      },
    }
    await persistCanvasState({ layoutOnly: true })
  }

  async function afterCreate(nodeId) {
    if (typeof refreshLocal === 'function') await refreshLocal()
    else await refreshCanvas()
    if (nodeId) focusedNodeId.value = nodeId
    pendingFlowPosition.value = null
  }

  async function createStoryboard(form) {
    const episodeId = resolveEpisodeId(form.episode_id)
    if (!episodeId) throw new Error('请先选择集数')
    const sb = await mutations.createStoryboard({
      episodeId,
      title: form.title,
      description: form.description,
      flowPosition: pendingFlowPosition.value,
    })
    await afterCreate(sb?.id ? `sb:${sb.id}` : null)
    ElMessage.success('分镜已添加')
    return sb
  }

  async function createEpisode(form) {
    const newEp = await mutations.createEpisode(form)
    if (newEp?.id) {
      filterEpisodeId.value = newEp.id
      const pos = pendingFlowPosition.value
      if (pos) await saveNodePosition(`episode:${newEp.id}`, pos)
      await afterCreate(`episode:${newEp.id}`)
    } else {
      await afterCreate(null)
    }
    ElMessage.success(`已添加${(form.title || '').trim() || '新集'}`)
  }

  async function createCharacter(form) {
    const episodeId = resolveEpisodeId(form.episode_id)
    const newChar = await mutations.createCharacter(form, { episodeId })
    const nodeId = newChar?.id ? `char:${newChar.id}` : null
    const pos = pendingFlowPosition.value
    if (nodeId && pos) await saveNodePosition(nodeId, pos)
    await afterCreate(nodeId)
    ElMessage.success('角色已添加')
  }

  async function createScene(form) {
    const episodeId = resolveEpisodeId(form.episode_id)
    const scene = await mutations.createScene(form, { episodeId })
    const sceneId = scene?.id ?? scene?.scene?.id
    const nodeId = sceneId ? `scene:${sceneId}` : null
    const pos = pendingFlowPosition.value
    if (nodeId && pos) await saveNodePosition(nodeId, pos)
    await afterCreate(nodeId)
    ElMessage.success('场景已添加')
  }

  async function createProp(form) {
    const episodeId = resolveEpisodeId(form.episode_id)
    const prop = await mutations.createProp(form, { episodeId })
    const propId = prop?.id ?? prop?.prop?.id
    const nodeId = propId ? `prop:${propId}` : null
    const pos = pendingFlowPosition.value
    if (nodeId && pos) await saveNodePosition(nodeId, pos)
    await afterCreate(nodeId)
    ElMessage.success('道具已添加')
  }

  async function submitCreate(form) {
    const type = createDialogType.value
    if (type === 'storyboard') await createStoryboard(form)
    else if (type === 'episode') await createEpisode(form)
    else if (type === 'character') await createCharacter(form)
    else if (type === 'scene') await createScene(form)
    else if (type === 'prop') await createProp(form)
    createDialogVisible.value = false
  }

  return {
    createDialogVisible,
    createDialogType,
    pendingFlowPosition,
    openCreateDialog,
    submitCreate,
    resolveEpisodeId,
  }
}
