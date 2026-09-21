import { parseDramaMetadata } from './canvasLayout.js'

function cloneDrama(drama) {
  if (!drama || typeof drama !== 'object') return drama
  return {
    ...drama,
    episodes: (drama.episodes || []).map((ep) => ({
      ...ep,
      storyboards: (ep.storyboards || []).map((sb) => ({ ...sb })),
      characters: ep.characters ? [...ep.characters] : ep.characters,
      scenes: ep.scenes ? [...ep.scenes] : ep.scenes,
      props: ep.props ? [...ep.props] : ep.props,
    })),
    characters: drama.characters ? [...drama.characters] : drama.characters,
    scenes: drama.scenes ? [...drama.scenes] : drama.scenes,
    props: drama.props ? [...drama.props] : drama.props,
    metadata: (typeof drama.metadata === 'object' && drama.metadata && !Array.isArray(drama.metadata))
      ? { ...drama.metadata }
      : drama.metadata,
  }
}

function findEpisode(drama, episodeId) {
  if (!drama) return null
  if (episodeId == null) return null
  return (drama.episodes || []).find((ep) => Number(ep.id) === Number(episodeId)) || null
}

function findStoryboardSlot(drama, episodeId, storyboardId) {
  for (const ep of drama?.episodes || []) {
    if (episodeId != null && Number(ep.id) !== Number(episodeId)) continue
    const idx = (ep.storyboards || []).findIndex((s) => Number(s.id) === Number(storyboardId))
    if (idx >= 0) return { episode: ep, index: idx, storyboard: ep.storyboards[idx] }
  }
  return null
}

/** 浅合并，不丢未出现在 patch 里的字段（characters、first_frame_* 等） */
export function patchStoryboard(drama, episodeId, storyboardId, patch) {
  if (!drama || storyboardId == null || !patch || typeof patch !== 'object') return drama
  const next = cloneDrama(drama)
  const slot = findStoryboardSlot(next, episodeId, storyboardId)
  if (!slot) return drama
  slot.episode.storyboards[slot.index] = { ...slot.storyboard, ...patch }
  return next
}

export function upsertStoryboard(drama, episodeOrId, storyboard, { index } = {}) {
  if (!drama || !storyboard?.id) return drama
  const episodeId = (episodeOrId && typeof episodeOrId === 'object') ? episodeOrId.id : episodeOrId
  if (episodeId == null) return drama
  const next = cloneDrama(drama)
  const ep = findEpisode(next, episodeId)
  if (!ep) return drama
  const boards = ep.storyboards || []
  const existing = boards.findIndex((s) => Number(s.id) === Number(storyboard.id))
  if (existing >= 0) {
    boards[existing] = { ...boards[existing], ...storyboard }
  } else if (Number.isInteger(index) && index >= 0 && index <= boards.length) {
    boards.splice(index, 0, { ...storyboard })
  } else {
    boards.push({ ...storyboard })
  }
  ep.storyboards = boards
  return next
}

export function replaceEpisodeStoryboards(drama, episodeId, storyboards) {
  if (!drama || episodeId == null) return drama
  const next = cloneDrama(drama)
  const ep = findEpisode(next, episodeId)
  if (!ep) return drama
  ep.storyboards = (storyboards || []).map((sb) => ({ ...sb }))
  return next
}

export function bumpStoryboardNumbersFrom(drama, episodeId, fromNumber, delta = 1, exceptId = null) {
  if (!drama || episodeId == null) return drama
  const next = cloneDrama(drama)
  const ep = findEpisode(next, episodeId)
  if (!ep) return drama
  for (const sb of ep.storyboards || []) {
    if (exceptId != null && Number(sb.id) === Number(exceptId)) continue
    if ((Number(sb.storyboard_number) || 0) >= fromNumber) {
      sb.storyboard_number = (Number(sb.storyboard_number) || 0) + delta
    }
  }
  return next
}

export function removeStoryboard(drama, storyboardId) {
  if (!drama || storyboardId == null) return drama
  const next = cloneDrama(drama)
  let found = false
  for (const ep of next.episodes || []) {
    const before = (ep.storyboards || []).length
    ep.storyboards = (ep.storyboards || []).filter((s) => Number(s.id) !== Number(storyboardId))
    if (ep.storyboards.length !== before) found = true
  }
  return found ? next : drama
}

const ASSET_LIST_KEY = {
  character: 'characters',
  scene: 'scenes',
  prop: 'props',
}

export function upsertAsset(drama, kind, entity) {
  const key = ASSET_LIST_KEY[kind]
  if (!drama || !key || !entity?.id) return drama
  const next = cloneDrama(drama)
  const list = Array.isArray(next[key]) ? next[key] : []
  const idx = list.findIndex((x) => Number(x.id) === Number(entity.id))
  if (idx >= 0) list[idx] = { ...list[idx], ...entity }
  else list.push({ ...entity })
  next[key] = list

  const episodeId = entity.episode_id
  if (episodeId != null) {
    const ep = findEpisode(next, episodeId)
    if (ep) {
      const epList = Array.isArray(ep[key]) ? ep[key] : []
      const epIdx = epList.findIndex((x) => Number(x.id) === Number(entity.id))
      if (epIdx >= 0) epList[epIdx] = { ...epList[epIdx], ...entity }
      else epList.push({ ...entity })
      ep[key] = epList
    }
  }
  return next
}

export function removeAsset(drama, kind, id) {
  const key = ASSET_LIST_KEY[kind]
  if (!drama || !key || id == null) return drama
  const next = cloneDrama(drama)
  next[key] = (next[key] || []).filter((x) => Number(x.id) !== Number(id))
  for (const ep of next.episodes || []) {
    if (Array.isArray(ep[key])) {
      ep[key] = ep[key].filter((x) => Number(x.id) !== Number(id))
    }
  }
  return next
}

export function patchEpisode(drama, episodeId, patch) {
  if (!drama || episodeId == null || !patch) return drama
  const next = cloneDrama(drama)
  const ep = findEpisode(next, episodeId)
  if (!ep) return drama
  Object.assign(ep, patch)
  return next
}

export function patchMetadata(drama, partialMeta) {
  if (!drama || !partialMeta || typeof partialMeta !== 'object') return drama
  const next = cloneDrama(drama)
  const meta = parseDramaMetadata(next.metadata)
  next.metadata = { ...meta, ...partialMeta }
  if (partialMeta.updated_at !== undefined) {
    next.updated_at = partialMeta.updated_at
  }
  return next
}

export function collectStoryboardIds(drama) {
  const ids = []
  for (const ep of drama?.episodes || []) {
    for (const sb of ep.storyboards || []) {
      if (sb?.id != null) ids.push(sb.id)
    }
  }
  return ids
}

export function pruneWorkflowGroups(drama, validSbIds) {
  if (!drama) return drama
  const valid = new Set((validSbIds || []).map(Number))
  const meta = parseDramaMetadata(drama.metadata)
  const groups = Array.isArray(meta.workflow_groups) ? meta.workflow_groups : []
  const nextGroups = groups.map((g) => ({
    ...g,
    storyboard_ids: (g.storyboard_ids || []).filter((id) => valid.has(Number(id))),
  }))
  return patchMetadata(drama, { workflow_groups: nextGroups })
}

export function swapStoryboardNumbers(drama, idA, idB) {
  if (!drama || idA == null || idB == null) return drama
  const next = cloneDrama(drama)
  let a = null
  let b = null
  let epA = null
  for (const ep of next.episodes || []) {
    for (const sb of ep.storyboards || []) {
      if (Number(sb.id) === Number(idA)) {
        a = sb
        epA = ep
      }
      if (Number(sb.id) === Number(idB)) b = sb
    }
  }
  if (!a || !b || !epA) return drama
  const tmp = a.storyboard_number
  a.storyboard_number = b.storyboard_number
  b.storyboard_number = tmp
  epA.storyboards = [...(epA.storyboards || [])].sort(
    (x, y) => (Number(x.storyboard_number) || 0) - (Number(y.storyboard_number) || 0),
  )
  return next
}

export { cloneDrama }
