const cache = new Map()

export function sourceHash(text) {
  return String(text || '').trim()
}

export function setVideoPromptAdaptCache(storyboardId, skillId, adaptedText, sourcePrompt) {
  const id = Number(storyboardId)
  if (!Number.isFinite(id) || id <= 0) return
  cache.set(id, {
    skillId: String(skillId || ''),
    text: String(adaptedText || '').trim(),
    sourceHash: sourceHash(sourcePrompt),
  })
}

export function getVideoPromptAdaptCache(storyboardId, sourcePrompt) {
  const hit = cache.get(Number(storyboardId))
  if (!hit || !hit.text) return null
  if (hit.sourceHash !== sourceHash(sourcePrompt)) return null
  return hit
}

export function clearVideoPromptAdaptCache(storyboardId) {
  cache.delete(Number(storyboardId))
}

/** 若本镜有未过期的预览缓存，生成时跳过二次改写、直接提交改写结果 */
export function applyVideoPromptAdaptCache(body, storyboard) {
  if (!body || !storyboard?.id) return body
  const hit = getVideoPromptAdaptCache(storyboard.id, body.prompt)
  if (!hit) return body
  return {
    ...body,
    prompt: hit.text,
    adapt_prompt: false,
    adapted_by_skill_id: hit.skillId,
  }
}
