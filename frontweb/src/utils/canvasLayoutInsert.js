import {
  MEDIA_GAP_X,
  MEDIA_OFFSET_X,
  MEDIA_Y_OFFSET,
  SB_GAP_Y,
} from './canvasLayout.js'

function cloneLayout(layout) {
  if (!layout || typeof layout !== 'object') {
    return { version: 1, nodes: {} }
  }
  return {
    ...layout,
    nodes: { ...(layout.nodes || {}) },
  }
}

function sortedStoryboards(episode) {
  return [...(episode?.storyboards || [])].sort(
    (a, b) => (Number(a.storyboard_number) || 0) - (Number(b.storyboard_number) || 0),
  )
}

function nodeKeyMatchesStoryboard(key, storyboardId) {
  const id = String(storyboardId)
  return (
    key === `sb:${id}`
    || key.startsWith(`sbtxt:${id}`)
    || key.startsWith(`sbuni:${id}`)
    || key.startsWith(`sbimg:${id}`)
    || key.startsWith(`sbimg-first:${id}`)
    || key.startsWith(`sbimg-last:${id}`)
    || key.startsWith(`sbvid:${id}`)
    || key.startsWith(`sbaud:${id}`)
  )
}

export function hasLayoutNodes(layout) {
  return !!(layout?.nodes && Object.keys(layout.nodes).length)
}

export function hasEpisodeSavedStoryboardLayout(layout, episode, excludeId = null) {
  if (!hasLayoutNodes(layout)) return false
  for (const sb of episode?.storyboards || []) {
    if (excludeId != null && Number(sb.id) === Number(excludeId)) continue
    if (layout.nodes[`sb:${sb.id}`]) return true
  }
  return false
}

export function mediaNodeIdsForStoryboard(sb, { useFirstLastFrame } = {}) {
  const id = sb?.id
  if (id == null) return []
  if (sb.creation_mode === 'universal') {
    return [`sbuni:${id}`, `sbvid:${id}`, `sbaud:${id}:dialogue`]
  }
  if (useFirstLastFrame) {
    return [
      `sbtxt:${id}`,
      `sbimg-first:${id}`,
      `sbimg-last:${id}`,
      `sbvid:${id}`,
      `sbaud:${id}:dialogue`,
    ]
  }
  return [`sbtxt:${id}`, `sbimg:${id}`, `sbvid:${id}`, `sbaud:${id}:dialogue`]
}

/** 各媒体节点相对 sb 的 {x,y} */
export function rowOffsets(sb, { useFirstLastFrame } = {}) {
  const ids = mediaNodeIdsForStoryboard(sb, { useFirstLastFrame })
  const out = {}
  ids.forEach((nid, i) => {
    out[nid] = {
      x: MEDIA_OFFSET_X + i * MEDIA_GAP_X,
      y: MEDIA_Y_OFFSET,
    }
  })
  return out
}

export function storyboardRowNodeIds(sb, options = {}) {
  if (sb?.id == null) return []
  return [`sb:${sb.id}`, ...mediaNodeIdsForStoryboard(sb, options)]
}

function shiftNode(nodes, nodeId, dy, dx = 0) {
  const pos = nodes[nodeId]
  if (!pos || !Number.isFinite(pos.y)) return
  nodes[nodeId] = {
    x: (Number.isFinite(pos.x) ? pos.x : 0) + dx,
    y: pos.y + dy,
  }
}

function shiftStoryboardRow(nodes, sb, dy, options = {}) {
  if (sb?.id == null) return
  const id = sb.id
  const known = storyboardRowNodeIds(sb, options)
  for (const key of known) shiftNode(nodes, key, dy)
  for (const key of Object.keys(nodes)) {
    if (known.includes(key)) continue
    if (nodeKeyMatchesStoryboard(key, id)) shiftNode(nodes, key, dy)
  }
}

function writeRowAt(nodes, sb, origin, options = {}) {
  const { x, y } = origin
  nodes[`sb:${sb.id}`] = { x, y }
  const offsets = rowOffsets(sb, options)
  for (const [nid, off] of Object.entries(offsets)) {
    nodes[nid] = { x: x + off.x, y: y + off.y }
  }
}

export function shiftEpisodeRows(layout, episode, fromIndex, dy, options = {}) {
  if (!hasLayoutNodes(layout) || !dy) return layout
  const boards = sortedStoryboards(episode)
  const next = cloneLayout(layout)
  for (let i = fromIndex; i < boards.length; i++) {
    shiftStoryboardRow(next.nodes, boards[i], dy, options)
  }
  const addId = episode?.id != null ? `add:storyboard:${episode.id}` : null
  if (addId) shiftNode(next.nodes, addId, dy)
  return next
}

/**
 * 在已有手工布局的集中为新分镜写入坐标。
 * layout.nodes 为空或该集没有已保存的 sb 节点时原样返回（交给 adapter 默认网格）。
 */
export function insertStoryboardLayout(layout, episode, newSb, index, options = {}) {
  if (!newSb?.id) return layout
  const flowPosition = options.flowPosition
  const useFirstLastFrame = !!options.useFirstLastFrame
  if (flowPosition && Number.isFinite(flowPosition.x) && Number.isFinite(flowPosition.y)) {
    const next = cloneLayout(layout)
    writeRowAt(next.nodes, newSb, { x: flowPosition.x, y: flowPosition.y }, { useFirstLastFrame })
    const addId = episode?.id != null ? `add:storyboard:${episode.id}` : null
    if (addId && next.nodes[addId] && next.nodes[addId].y < flowPosition.y + SB_GAP_Y) {
      next.nodes[addId] = {
        x: next.nodes[addId].x,
        y: flowPosition.y + SB_GAP_Y,
      }
    }
    return next
  }
  if (!hasLayoutNodes(layout)) return layout
  if (!hasEpisodeSavedStoryboardLayout(layout, episode, newSb.id)) return layout

  const boards = sortedStoryboards(episode)
  const idx = Number.isInteger(index)
    ? Math.max(0, Math.min(index, boards.length ? boards.length - 1 : 0))
    : boards.findIndex((s) => Number(s.id) === Number(newSb.id))
  const at = idx < 0 ? boards.length : idx
  const next = cloneLayout(layout)

  const isAppend = at >= boards.filter((s) => Number(s.id) !== Number(newSb.id)).length
    || at === boards.length - 1
    || at === boards.length

  if (isAppend) {
    const others = boards.filter((s) => Number(s.id) !== Number(newSb.id))
    const last = others[others.length - 1]
    const lastPos = last ? next.nodes[`sb:${last.id}`] : null
    const origin = lastPos && Number.isFinite(lastPos.y)
      ? { x: Number.isFinite(lastPos.x) ? lastPos.x : 360, y: lastPos.y + SB_GAP_Y }
      : { x: 360, y: 200 }
    writeRowAt(next.nodes, newSb, origin, { useFirstLastFrame })
    const addId = episode?.id != null ? `add:storyboard:${episode.id}` : null
    if (addId) {
      const prevAdd = next.nodes[addId]
      next.nodes[addId] = {
        x: Number.isFinite(prevAdd?.x) ? prevAdd.x : origin.x,
        y: origin.y + SB_GAP_Y,
      }
    }
    return next
  }

  const occupant = boards.find((s, i) => i >= at && Number(s.id) !== Number(newSb.id) && next.nodes[`sb:${s.id}`])
    || boards[at + 1]
  const occupantPos = occupant ? next.nodes[`sb:${occupant.id}`] : null
  const originY = occupantPos && Number.isFinite(occupantPos.y) ? occupantPos.y : 200
  const originX = occupantPos && Number.isFinite(occupantPos.x) ? occupantPos.x : 360

  const fromIndex = boards.findIndex((s) => occupant && Number(s.id) === Number(occupant.id))
  const shiftFrom = fromIndex >= 0 ? fromIndex : at
  for (let i = shiftFrom; i < boards.length; i++) {
    if (Number(boards[i].id) === Number(newSb.id)) continue
    shiftStoryboardRow(next.nodes, boards[i], SB_GAP_Y, { useFirstLastFrame })
  }
  const addId = episode?.id != null ? `add:storyboard:${episode.id}` : null
  if (addId) shiftNode(next.nodes, addId, SB_GAP_Y)

  writeRowAt(next.nodes, newSb, { x: originX, y: originY }, { useFirstLastFrame })
  return next
}

export function removeStoryboardLayout(layout, storyboardId) {
  if (!hasLayoutNodes(layout) || storyboardId == null) return layout
  const next = cloneLayout(layout)
  for (const key of Object.keys(next.nodes)) {
    if (nodeKeyMatchesStoryboard(key, storyboardId)) delete next.nodes[key]
  }
  return next
}

function rowAnchorY(nodes, sbId) {
  const sbPos = nodes[`sb:${sbId}`]
  if (sbPos && Number.isFinite(sbPos.y)) return sbPos.y
  let minY = Infinity
  for (const [key, pos] of Object.entries(nodes)) {
    if (nodeKeyMatchesStoryboard(key, sbId) && Number.isFinite(pos?.y)) {
      minY = Math.min(minY, pos.y)
    }
  }
  return Number.isFinite(minY) ? minY : null
}

/** 只交换两行节点组的 Y，保留各自手工 X */
export function swapStoryboardLayoutRows(layout, storyboardIdA, storyboardIdB) {
  if (!hasLayoutNodes(layout) || storyboardIdA == null || storyboardIdB == null) return layout
  const next = cloneLayout(layout)
  const yA = rowAnchorY(next.nodes, storyboardIdA)
  const yB = rowAnchorY(next.nodes, storyboardIdB)
  if (yA == null || yB == null) return layout
  const dA = yB - yA
  const dB = yA - yB
  for (const key of Object.keys(next.nodes)) {
    if (nodeKeyMatchesStoryboard(key, storyboardIdA)) shiftNode(next.nodes, key, dA)
    else if (nodeKeyMatchesStoryboard(key, storyboardIdB)) shiftNode(next.nodes, key, dB)
  }
  return next
}

export { SB_GAP_Y, MEDIA_OFFSET_X, MEDIA_GAP_X, MEDIA_Y_OFFSET }
