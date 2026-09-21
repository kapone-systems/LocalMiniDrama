import { ElMessage } from 'element-plus'
import { dramaAPI } from '@/api/drama'
import { storyboardsAPI } from '@/api/storyboards'
import { sceneAPI } from '@/api/scenes'
import { propAPI } from '@/api/props'
import { useFilmStore } from '@/stores/film'
import { parseCanvasLayout, parseDramaMetadata } from '@/utils/canvasLayout'
import { dramaUsesFirstLastFrame } from '@/utils/storyboardMedia'
import { findStoryboardInDrama, parseWorkflowGroups } from '@/utils/canvasWorkflow'
import { collectStoryboardIds } from '@/utils/dramaDocumentPatch'
import {
  hasEpisodeSavedStoryboardLayout,
  insertStoryboardLayout,
  removeStoryboardLayout,
  swapStoryboardLayoutRows,
} from '@/utils/canvasLayoutInsert'

function findEpisode(drama, episodeId) {
  return (drama?.episodes || []).find((ep) => Number(ep.id) === Number(episodeId)) || null
}

function sortedBoards(episode) {
  return [...(episode?.storyboards || [])].sort(
    (a, b) => (Number(a.storyboard_number) || 0) - (Number(b.storyboard_number) || 0),
  )
}

function collectExistingCharacters(dramaData, episodeId) {
  const map = new Map()
  for (const c of dramaData?.characters || []) {
    if (c?.id != null) map.set(Number(c.id), c)
  }
  if (episodeId != null) {
    const ep = findEpisode(dramaData, episodeId)
    for (const c of ep?.characters || []) {
      if (c?.id != null && !map.has(Number(c.id))) map.set(Number(c.id), c)
    }
  }
  return [...map.values()]
}

function toCharacterSavePayload(c) {
  return {
    id: c.id,
    name: c.name || '',
    role: c.role || undefined,
    description: c.description || undefined,
    personality: c.personality || undefined,
    appearance: c.appearance || undefined,
    image_url: c.image_url || undefined,
    local_path: c.local_path || undefined,
  }
}

export function useDramaMutations() {
  const store = useFilmStore()

  function layoutOptions() {
    return { useFirstLastFrame: dramaUsesFirstLastFrame(store.drama) }
  }

  async function persistLayout(nextLayout, workflowGroups) {
    const id = store.dramaId
    if (!id) return
    if (nextLayout == null && workflowGroups === undefined) return
    const updated = await dramaAPI.saveCanvasLayout(id, nextLayout ?? null, workflowGroups)
    const meta = parseDramaMetadata(updated?.metadata)
    const patch = {}
    if (nextLayout != null) {
      patch.canvas_layout = meta.canvas_layout || nextLayout
    }
    if (workflowGroups !== undefined) {
      patch.workflow_groups = meta.workflow_groups !== undefined ? meta.workflow_groups : workflowGroups
    }
    if (updated?.updated_at) patch.updated_at = updated.updated_at
    store.patchMetadata(patch)
  }

  async function writeInsertLayout(episode, newSb, index, flowPosition) {
    const layout = parseCanvasLayout(store.drama?.metadata)
    if (flowPosition && Number.isFinite(flowPosition.x) && Number.isFinite(flowPosition.y)) {
      const next = insertStoryboardLayout(layout, episode, newSb, index, {
        ...layoutOptions(),
        flowPosition,
      })
      await persistLayout(next)
      return
    }
    if (!hasEpisodeSavedStoryboardLayout(layout, episode, newSb.id)) return
    const next = insertStoryboardLayout(layout, episode, newSb, index, layoutOptions())
    if (next && next !== layout) await persistLayout(next)
  }

  async function createStoryboard({
    episodeId,
    title,
    description,
    atIndex,
    flowPosition,
    creation_mode,
    narration,
  } = {}) {
    const epId = episodeId ?? store.currentEpisode?.id
    if (!epId) throw new Error('请先选择集数')
    const ep = findEpisode(store.drama, epId)
    const boards = sortedBoards(ep)
    let created
    let index = atIndex

    if (Number.isInteger(atIndex) && atIndex >= 0 && atIndex < boards.length) {
      const target = boards[atIndex]
      created = await storyboardsAPI.insertBefore(target.id)
      store.bumpStoryboardNumbers(epId, Number(target.storyboard_number) || 0, 1, created.id)
      index = atIndex
      store.upsertStoryboard(epId, created, { index })
    } else {
      const maxNum = boards.reduce((max, sb) => Math.max(max, sb.storyboard_number || 0), 0)
      const nextNum = maxNum + 1
      const payload = {
        episode_id: epId,
        storyboard_number: nextNum,
        title: (title || '').trim() || `镜头 ${nextNum}`,
        description: (description || '').trim() || '',
      }
      created = await storyboardsAPI.create(payload)
      if (creation_mode || narration != null) {
        const extra = {}
        if (creation_mode) extra.creation_mode = creation_mode
        if (narration != null) extra.narration = narration
        try {
          created = (await storyboardsAPI.update(created.id, extra)) || { ...created, ...extra }
        } catch (_) {
          created = { ...created, ...extra }
        }
      }
      index = boards.length
      store.upsertStoryboard(epId, created, { index })
    }

    const epAfter = findEpisode(store.drama, epId)
    await writeInsertLayout(epAfter, created, index, flowPosition)
    return created
  }

  async function insertStoryboardBefore(sb) {
    if (!sb?.id) throw new Error('缺少目标分镜')
    const found = findStoryboardInDrama(store.drama, sb.id)
    const epId = found?.episode?.id ?? sb.episode_id
    const boards = sortedBoards(found?.episode)
    const at = boards.findIndex((s) => Number(s.id) === Number(sb.id))
    return createStoryboard({
      episodeId: epId,
      atIndex: at >= 0 ? at : 0,
    })
  }

  async function deleteStoryboard(id) {
    if (id == null) return
    await storyboardsAPI.delete(id)
    const layout = parseCanvasLayout(store.drama?.metadata)
    const hadLayout = !!(layout?.nodes && Object.keys(layout.nodes).length)
    const nextLayout = hadLayout ? removeStoryboardLayout(layout, id) : null
    store.removeStoryboard(id)
    const validIds = collectStoryboardIds(store.drama)
    const groups = parseWorkflowGroups(store.drama?.metadata)
    const pruned = groups.map((g) => ({
      ...g,
      storyboard_ids: (g.storyboard_ids || []).filter((sid) => validIds.map(Number).includes(Number(sid))),
    }))
    const groupsChanged = JSON.stringify(groups) !== JSON.stringify(pruned)
    store.pruneWorkflowGroups(validIds)
    if (hadLayout) await persistLayout(nextLayout, groupsChanged ? pruned : undefined)
    else if (groupsChanged) await persistLayout(null, pruned)
  }

  async function updateStoryboard(id, patch) {
    if (id == null) return null
    const updated = await storyboardsAPI.update(id, patch)
    const found = findStoryboardInDrama(store.drama, id)
    const episodeId = found?.episode?.id ?? updated?.episode_id
    const localPatch = { ...(updated || patch) }
    if (patch.character_ids !== undefined && localPatch.characters == null) {
      localPatch.characters = patch.character_ids
    }
    if (patch.prop_ids !== undefined && localPatch.prop_ids == null) {
      localPatch.prop_ids = patch.prop_ids
    }
    store.patchStoryboard(episodeId, id, localPatch)
    return updated
  }

  async function setStoryboardRelations(id, { character_ids, scene_id, prop_ids } = {}) {
    const patch = {}
    if (character_ids !== undefined) patch.character_ids = character_ids
    if (scene_id !== undefined) patch.scene_id = scene_id
    if (prop_ids !== undefined) patch.prop_ids = prop_ids
    return updateStoryboard(id, patch)
  }

  async function createCharacter(form, { episodeId } = {}) {
    const dramaId = store.dramaId
    const epId = episodeId ?? store.currentEpisode?.id
    if (!dramaId) throw new Error('项目未加载')
    const beforeIds = new Set((store.drama?.characters || []).map((c) => Number(c.id)))
    const existing = collectExistingCharacters(store.drama, epId).map(toCharacterSavePayload)
    const name = (form.name || '').trim()
    await dramaAPI.saveCharacters(dramaId, {
      characters: [
        ...existing,
        {
          name,
          role: form.role?.trim() || undefined,
          description: form.description?.trim() || undefined,
          appearance: form.appearance?.trim() || undefined,
        },
      ],
      episode_id: epId ?? undefined,
    })
    await store.loadDrama(dramaId)
    const list = store.drama?.characters || []
    return list.find((c) => !beforeIds.has(Number(c.id))) || list.find((c) => c.name === name) || null
  }

  async function createScene(form, { episodeId } = {}) {
    const dramaId = store.dramaId
    const epId = episodeId ?? store.currentEpisode?.id
    if (!dramaId) throw new Error('项目未加载')
    const scene = await sceneAPI.create({
      drama_id: dramaId,
      episode_id: epId ?? undefined,
      location: (form.location || '').trim(),
      time: form.time?.trim() || undefined,
      prompt: form.prompt?.trim() || undefined,
    })
    const entity = scene?.id ? scene : (scene?.scene || scene)
    if (entity?.id) store.upsertAsset('scene', { ...entity, episode_id: entity.episode_id ?? epId })
    return entity
  }

  async function createProp(form, { episodeId } = {}) {
    const dramaId = store.dramaId
    const epId = episodeId ?? store.currentEpisode?.id
    if (!dramaId) throw new Error('项目未加载')
    const prop = await propAPI.create({
      drama_id: dramaId,
      episode_id: epId ?? undefined,
      name: (form.name || '').trim(),
      description: form.description?.trim() || undefined,
      prompt: form.prompt?.trim() || undefined,
    })
    const entity = prop?.id ? prop : (prop?.prop || prop)
    if (entity?.id) store.upsertAsset('prop', { ...entity, episode_id: entity.episode_id ?? epId })
    return entity
  }

  async function createEpisode(form) {
    const dramaId = store.dramaId
    if (!dramaId) throw new Error('项目未加载')
    const list = store.drama?.episodes || []
    const nextNum = list.length > 0
      ? Math.max(...list.map((ep) => Number(ep.episode_number) || 0), 0) + 1
      : 1
    const title = (form?.title || '').trim() || `第${nextNum}集`
    const updated = list.map((ep, i) => ({
      episode_number: ep.episode_number ?? i + 1,
      title: ep.title || `第${ep.episode_number ?? i + 1}集`,
      script_content: ep.script_content || '',
      description: ep.description ?? null,
      duration: ep.duration ?? 0,
    }))
    updated.push({
      episode_number: nextNum,
      title,
      script_content: '',
      description: null,
      duration: 0,
    })
    await dramaAPI.saveEpisodes(dramaId, updated)
    await store.loadDrama(dramaId)
    return (store.drama?.episodes || []).find((ep) => Number(ep.episode_number) === nextNum) || null
  }

  async function moveStoryboard(id, direction) {
    const found = findStoryboardInDrama(store.drama, id)
    if (!found) throw new Error('分镜不存在')
    const boards = sortedBoards(found.episode)
    const idx = boards.findIndex((s) => Number(s.id) === Number(id))
    const other = direction === 'up' ? boards[idx - 1] : boards[idx + 1]
    if (!other) {
      ElMessage.info(direction === 'up' ? '已经是第一镜' : '已经是最后一镜')
      return null
    }
    await storyboardsAPI.swapWith(id, other.id)
    store.swapStoryboardNumbers(id, other.id)
    const layout = parseCanvasLayout(store.drama?.metadata)
    if (layout?.nodes && (layout.nodes[`sb:${id}`] || layout.nodes[`sb:${other.id}`])) {
      const next = swapStoryboardLayoutRows(layout, id, other.id)
      await persistLayout(next)
    }
    return { a: id, b: other.id }
  }

  return {
    createStoryboard,
    insertStoryboardBefore,
    deleteStoryboard,
    updateStoryboard,
    setStoryboardRelations,
    createCharacter,
    createScene,
    createProp,
    createEpisode,
    moveStoryboard,
  }
}
