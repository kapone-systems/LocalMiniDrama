import { DEFAULT_PIPELINE } from './canvasWorkflow.js'

/**
 * 纯函数：根据分镜现有媒体与跳过旗标，规划工作流每一步是 run 还是 skip。
 * @param {object} sb
 * @param {string[]} pipeline
 * @param {{ skipExistingImage?: boolean, skipExistingVideo?: boolean, skipExistingAudio?: boolean }} flags
 * @param {{ hasImage?: boolean, hasVideo?: boolean, hasAudio?: boolean }} media
 * @returns {{ step: string, action: 'run'|'skip', reason?: string }[]}
 */
export function planWorkflowSteps(sb, pipeline, flags = {}, media = {}) {
  const steps = []
  const pipe = Array.isArray(pipeline) && pipeline.length ? pipeline : [...DEFAULT_PIPELINE]
  const isUniversal = sb?.creation_mode === 'universal'

  for (const step of pipe) {
    if (step === 'image') {
      if (isUniversal) {
        steps.push({ step, action: 'skip', reason: 'universal' })
      } else if (flags.skipExistingImage && media.hasImage) {
        steps.push({ step, action: 'skip', reason: 'has_image' })
      } else {
        steps.push({ step, action: 'run' })
      }
    } else if (step === 'video') {
      if (flags.skipExistingVideo && media.hasVideo) {
        steps.push({ step, action: 'skip', reason: 'has_video' })
      } else {
        steps.push({ step, action: 'run' })
      }
    } else if (step === 'audio') {
      const hasDialogue = !!(sb?.dialogue || '').trim()
      if (!hasDialogue) {
        steps.push({ step, action: 'skip', reason: 'no_dialogue' })
      } else if (flags.skipExistingAudio && media.hasAudio) {
        steps.push({ step, action: 'skip', reason: 'has_audio' })
      } else {
        steps.push({ step, action: 'run' })
      }
    }
  }
  return steps
}

export function normalizeWorkflowConcurrency(value, { linkTailFrames = false } = {}) {
  if (linkTailFrames) return 1
  const n = Number(value)
  if (!Number.isFinite(n)) return 2
  return Math.min(4, Math.max(1, Math.round(n)))
}

export function summarizePlan(plan) {
  const summary = { run: [], skipped: [] }
  for (const item of plan || []) {
    if (item.action === 'skip') summary.skipped.push(item)
    else summary.run.push(item)
  }
  return summary
}
