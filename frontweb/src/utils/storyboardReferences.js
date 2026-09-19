import { assetImageUrl } from './mediaUrl'

function asIdList(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => Number(typeof item === 'object' && item != null ? item.id : item))
    .filter((n) => Number.isFinite(n))
}

/**
 * 分镜将使用的角色/场景/道具参考图（只读展示 + 可勾选）。
 */
export function collectStoryboardReferenceImages(drama, sb) {
  if (!drama || !sb) return []
  const refs = []
  const characters = drama.characters || []
  const scenes = drama.scenes || []
  const props = drama.props || []

  for (const id of asIdList(sb.characters || sb.character_ids)) {
    const c = characters.find((x) => Number(x.id) === id)
    if (!c) continue
    const url = assetImageUrl(c)
    if (!url) continue
    refs.push({
      key: `char:${id}`,
      kind: 'character',
      name: c.name || '角色',
      url,
      entityId: id,
    })
  }

  const sceneId = sb.scene_id != null ? Number(sb.scene_id) : null
  if (sceneId) {
    const s = scenes.find((x) => Number(x.id) === sceneId)
    if (s) {
      const url = assetImageUrl(s)
      if (url) {
        refs.push({
          key: `scene:${sceneId}`,
          kind: 'scene',
          name: s.location || '场景',
          url,
          entityId: sceneId,
        })
      }
    }
  }

  for (const id of asIdList(sb.prop_ids)) {
    const p = props.find((x) => Number(x.id) === id)
    if (!p) continue
    const url = assetImageUrl(p) || p.ref_image || ''
    if (!url) continue
    refs.push({
      key: `prop:${id}`,
      kind: 'prop',
      name: p.name || '道具',
      url,
      entityId: id,
    })
  }

  return refs
}
