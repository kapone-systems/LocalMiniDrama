import { taskAPI } from '@/api/task'
import { imagesAPI } from '@/api/images'
import { videosAPI } from '@/api/videos'
import { applyVideoPromptAdaptCache } from '@/composables/useVideoPromptAdapt'
import request from '@/utils/request'
import { storyboardImageUrl } from '@/utils/mediaUrl'
import {
  DEFAULT_PIPELINE,
  findStoryboardInDrama,
  getDramaGenerationOptions,
  toAbsoluteMediaUrl,
} from '@/utils/canvasWorkflow'
import {
  dramaUsesFirstLastFrame,
  hasStoryboardImage,
  hasStoryboardVideo,
  sbVideoFirstLastUrls,
} from '@/utils/storyboardMedia'
import { planWorkflowSteps } from '@/utils/planWorkflowSteps'
import {
  ensureProfessionalFramePrompt,
  generateStoryboardFrameImage,
} from '@/composables/filmCreate/storyboardFrameGenerate'

async function pollTaskSimple(taskId, options = {}) {
  if (!taskId) return { status: 'failed', error: '缺少 task_id' }
  const maxAttempts = options.maxAttempts ?? 450
  const interval = options.interval ?? 2000
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, interval))
    try {
      const t = await taskAPI.get(taskId)
      if (t.status === 'completed') return { status: 'completed', result: t.result }
      if (t.status === 'failed') {
        return { status: 'failed', error: t.error?.message || t.error || '任务失败' }
      }
    } catch (e) {
      if (i === maxAttempts - 1) return { status: 'failed', error: e.message || '轮询失败' }
    }
  }
  return { status: 'timeout', error: '任务超时' }
}

function storyboardCharacterIds(sb) {
  const list = Array.isArray(sb?.characters) ? sb.characters : (Array.isArray(sb?.character_ids) ? sb.character_ids : [])
  return list
    .map((c) => Number(typeof c === 'object' && c != null ? c.id : c))
    .filter((n) => Number.isFinite(n))
}

export async function runImageStep(drama, sb, genOpts) {
  const useFirstLast = dramaUsesFirstLastFrame(drama) && sb?.creation_mode !== 'universal'
  if (useFirstLast) {
    const slots = genOpts?.frameSlot ? [genOpts.frameSlot] : ['first', 'last']
    const fallback = (sb.polished_prompt || sb.image_prompt || sb.description || sb.action || '').trim()
    for (const slot of slots) {
      const prompt = await ensureProfessionalFramePrompt(sb, slot, {
        fallbackPrompt: fallback,
        pollTask: pollTaskSimple,
      })
      await generateStoryboardFrameImage({
        dramaId: drama.id,
        sb,
        slot,
        prompt,
        style: genOpts.style,
        aspectRatio: genOpts.aspectRatio,
        characterIds: storyboardCharacterIds(sb),
        referenceImages: genOpts.referenceImages,
        pollTask: pollTaskSimple,
      })
    }
    return
  }
  const prompt = sb.polished_prompt || sb.image_prompt || sb.description || sb.action || ''
  if (!prompt.trim()) throw new Error(`分镜 #${sb.storyboard_number ?? sb.id} 缺少图片提示词`)
  const payload = {
    storyboard_id: sb.id,
    drama_id: drama.id,
    prompt,
    style: genOpts.style || undefined,
    aspect_ratio: genOpts.aspectRatio,
  }
  if (Array.isArray(genOpts.referenceImages)) {
    payload.reference_images = genOpts.referenceImages
  }
  const res = await imagesAPI.create(payload)
  if (res?.task_id) {
    const polled = await pollTaskSimple(res.task_id)
    if (polled.status !== 'completed') throw new Error(polled.error || '分镜图生成失败')
  }
}

export async function runVideoStep(drama, sb, genOpts) {
  const useFirstLast = dramaUsesFirstLastFrame(drama)
  const imagesBySbId = genOpts?.imagesBySbId || {}
  const { first, last } = sbVideoFirstLastUrls(sb, imagesBySbId, useFirstLast)
  const imgPath = first || storyboardImageUrl(sb)
  if (!imgPath && !sb.video_prompt && !last) {
    throw new Error(`分镜 #${sb.storyboard_number ?? sb.id} 缺少分镜图，无法生成视频`)
  }
  const absoluteFirst = toAbsoluteMediaUrl(imgPath)
  const absoluteLast = last ? toAbsoluteMediaUrl(last) : undefined
  const prompt = sb.video_prompt || sb.polished_prompt || sb.image_prompt || sb.description || ''
  let payload = {
    drama_id: drama.id,
    storyboard_id: sb.id,
    prompt,
    image_url: absoluteFirst || undefined,
    first_frame_url: absoluteFirst || undefined,
    last_frame_url: absoluteLast,
    style: genOpts.style || undefined,
    aspect_ratio: genOpts.aspectRatio,
    resolution: genOpts.videoResolution || undefined,
    duration: sb.duration || undefined,
  }
  if (genOpts?.adaptPrompt === false) {
    payload.adapt_prompt = false
  } else {
    payload = applyVideoPromptAdaptCache(payload, sb)
  }
  const res = await videosAPI.create(payload)
  if (res?.task_id) {
    const polled = await pollTaskSimple(res.task_id)
    if (polled.status !== 'completed') throw new Error(polled.error || '视频生成失败')
  }
}

export async function runAudioStep(sb) {
  const text = (sb.dialogue || '').trim()
  if (!text) return { skipped: true, reason: '无对白' }
  await request.post('/audio/extract', {
    storyboard_id: sb.id,
    text,
    tts_kind: 'dialogue',
  })
  return { skipped: false }
}

function mediaFlagsFor(drama, sb, genOpts) {
  return {
    hasImage: hasStoryboardImage(sb, genOpts?.imagesBySbId || {}, drama),
    hasVideo: hasStoryboardVideo(sb, genOpts?.videosBySbId || {}),
    hasAudio: !!(sb?.audio_local_path),
  }
}

function nodeIdForStep(sbId, step, drama, sb) {
  if (step === 'video') return `sbvid:${sbId}`
  if (step === 'audio') return `sbaud:${sbId}:dialogue`
  if (dramaUsesFirstLastFrame(drama) && sb?.creation_mode !== 'universal') return `sbimg-first:${sbId}`
  return `sbimg:${sbId}`
}

/**
 * 对单个分镜按 pipeline 顺序执行生成
 * @param {'image'|'video'|'audio'}[] pipeline
 */
export async function runStoryboardPipeline(drama, storyboardId, pipeline, hooks = {}) {
  const found = findStoryboardInDrama(drama, storyboardId)
  if (!found) throw new Error(`找不到分镜 ${storyboardId}`)
  let { storyboard: sb } = found
  const genOpts = {
    ...getDramaGenerationOptions(drama),
    ...(hooks.generationOptions || {}),
  }
  const steps = pipeline?.length ? pipeline : DEFAULT_PIPELINE
  const flags = {
    skipExistingImage: !!hooks.skipExisting,
    skipExistingVideo: !!hooks.skipExisting,
    skipExistingAudio: !!hooks.skipExisting,
  }
  const plan = planWorkflowSteps(sb, steps, flags, mediaFlagsFor(drama, sb, genOpts))
  const results = []

  for (const item of plan) {
    const nodeId = nodeIdForStep(storyboardId, item.step, drama, sb)
    if (item.action === 'skip') {
      hooks.onStepSkip?.({ storyboardId, step: item.step, reason: item.reason, sb, nodeId })
      results.push({ step: item.step, skipped: true, reason: item.reason })
      continue
    }
    hooks.onStepStart?.({ storyboardId, step: item.step, sb, nodeId })
    try {
      if (item.step === 'image') {
        await runImageStep(drama, sb, genOpts)
        if (hooks.reloadStoryboard) {
          sb = (await hooks.reloadStoryboard(storyboardId)) || sb
        }
      } else if (item.step === 'video') {
        await runVideoStep(drama, sb, genOpts)
        if (hooks.reloadStoryboard) {
          sb = (await hooks.reloadStoryboard(storyboardId)) || sb
        }
      } else if (item.step === 'audio') {
        const audioRes = await runAudioStep(sb)
        results.push({ step: item.step, ...audioRes })
      }
      hooks.onStepComplete?.({ storyboardId, step: item.step, sb, nodeId })
    } catch (err) {
      hooks.onStepError?.({ storyboardId, step: item.step, error: err, nodeId })
      throw err
    }
  }
  return results
}

/** 按工作流组顺序执行（组内分镜按 storyboard_ids 顺序） */
export async function runWorkflowGroup(drama, group, hooks = {}) {
  const pipeline = group.pipeline || DEFAULT_PIPELINE
  const ids = group.storyboard_ids || []
  const summary = { groupId: group.id, ok: [], skipped: [], failed: [] }
  const stopOnError = hooks.stopOnError !== false ? !!hooks.stopOnError : false

  for (const sbId of ids) {
    hooks.onStoryboardStart?.({ group, storyboardId: sbId })
    try {
      const stepResults = await runStoryboardPipeline(drama, sbId, pipeline, hooks)
      const allSkipped = stepResults.length && stepResults.every((r) => r.skipped)
      if (allSkipped) summary.skipped.push(sbId)
      else summary.ok.push(sbId)
      hooks.onStoryboardComplete?.({ group, storyboardId: sbId, skipped: allSkipped })
    } catch (err) {
      summary.failed.push({ storyboardId: sbId, error: err.message || String(err) })
      hooks.onStoryboardError?.({ group, storyboardId: sbId, error: err })
      if (stopOnError) break
    }
  }
  return summary
}

export { pollTaskSimple }
