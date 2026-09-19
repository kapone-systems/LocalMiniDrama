import { imagesAPI } from '@/api/images'
import { storyboardsAPI } from '@/api/storyboards'

export function frameTypeForSlot(slot) {
  return slot === 'last' ? 'storyboard_last' : 'storyboard_first'
}

export async function getCachedFramePromptFromDb(sbId, slot) {
  const frameType = slot === 'last' ? 'last' : 'first'
  try {
    const res = await storyboardsAPI.getFramePrompts(sbId)
    const row = (res?.frame_prompts || []).find((r) => r.frame_type === frameType)
    return row?.prompt?.trim() || ''
  } catch (_) {
    return ''
  }
}

/**
 * 优先读缓存 / 调 frame-prompt 接口，失败则回退 fallbackPrompt。
 */
export async function ensureProfessionalFramePrompt(sb, slot, options = {}) {
  const frameType = slot === 'last' ? 'last' : 'first'
  const { forceRegenerate = false, fallbackPrompt = '', pollTask } = options
  if (!sb?.id) return fallbackPrompt || ''
  if (!forceRegenerate) {
    const cached = await getCachedFramePromptFromDb(sb.id, slot)
    if (cached) return cached
  }
  try {
    const genRes = await storyboardsAPI.generateFramePrompt(sb.id, { frame_type: frameType })
    if (!genRes?.task_id) throw new Error('帧提示词任务未创建')
    if (typeof pollTask !== 'function') {
      throw new Error('缺少 pollTask')
    }
    const pollRes = await pollTask(genRes.task_id)
    if (pollRes?.status !== 'completed') {
      throw new Error(pollRes?.error || '帧提示词生成失败')
    }
    const fromTask = pollRes.result?.response?.single_frame?.prompt
    if (fromTask && String(fromTask).trim()) return String(fromTask).trim()
    const cached2 = await getCachedFramePromptFromDb(sb.id, slot)
    if (cached2) return cached2
  } catch (e) {
    if (fallbackPrompt) return fallbackPrompt
    throw e
  }
  return fallbackPrompt || ''
}

export async function saveStoryboardFramePrompt(sbId, slot, prompt) {
  const frameType = slot === 'last' ? 'last' : 'first'
  return storyboardsAPI.saveFramePrompt(sbId, frameType, { prompt })
}

/**
 * 列表与画布共用的首/尾帧生图。
 */
export async function generateStoryboardFrameImage(opts) {
  const {
    dramaId,
    sb,
    slot,
    prompt,
    style,
    aspectRatio,
    characterIds,
    referenceImages,
    useFirstFrameLayoutLock,
    pollTask,
  } = opts
  if (!dramaId || !sb?.id) throw new Error('缺少项目或分镜')
  const isLast = slot === 'last'
  if (Array.isArray(characterIds)) {
    try {
      await storyboardsAPI.update(sb.id, { character_ids: characterIds })
    } catch (e) {
      throw new Error(e?.message || '保存分镜角色失败')
    }
  }
  const res = await imagesAPI.create({
    storyboard_id: sb.id,
    drama_id: dramaId,
    prompt: prompt || '',
    style: style || undefined,
    frame_type: frameTypeForSlot(slot),
    aspect_ratio: aspectRatio || '16:9',
    reference_images: referenceImages,
    use_first_frame_layout_lock: isLast ? !!useFirstFrameLayoutLock : undefined,
  })
  if (res?.task_id && typeof pollTask === 'function') {
    const polled = await pollTask(res.task_id)
    if (polled?.status && polled.status !== 'completed') {
      throw new Error(polled.error || (isLast ? '尾帧生成失败' : '首帧生成失败'))
    }
    return { ...res, polled }
  }
  return res
}

export async function generateStoryboardFramePair(opts) {
  const { hasFirst, generateOne } = opts
  if (typeof generateOne !== 'function') throw new Error('缺少 generateOne')
  if (!hasFirst) {
    await generateOne('first')
  }
  await generateOne('last')
}

export async function linkTailFrameToNext(sbId, dramaId) {
  return storyboardsAPI.linkTailFrame(sbId, { drama_id: dramaId })
}

export async function reusePrevTailAsFirst({ dramaId, sb, prevSb, prevLastImg }) {
  if (!dramaId || !sb?.id || !prevLastImg) throw new Error('缺少上镜尾帧')
  return imagesAPI.upload({
    storyboard_id: sb.id,
    drama_id: dramaId,
    image_url: prevLastImg.image_url || '',
    local_path: prevLastImg.local_path || undefined,
    prompt: `上镜尾帧（直接复用 #${prevSb?.storyboard_number ?? prevSb?.id ?? ''} 尾帧高清原图）`,
    frame_type: 'storyboard_first',
  })
}
