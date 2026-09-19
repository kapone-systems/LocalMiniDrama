function planWorkflowSteps(sb, pipeline, flags, media) {
  const steps = [];
  const pipe = Array.isArray(pipeline) && pipeline.length ? pipeline : ['image', 'video', 'audio'];
  const isUniversal = sb?.creation_mode === 'universal';
  for (const step of pipe) {
    if (step === 'image') {
      if (isUniversal) steps.push({ step, action: 'skip', reason: 'universal' });
      else if (flags.skipExistingImage && media.hasImage) steps.push({ step, action: 'skip', reason: 'has_image' });
      else steps.push({ step, action: 'run' });
    } else if (step === 'video') {
      if (flags.skipExistingVideo && media.hasVideo) steps.push({ step, action: 'skip', reason: 'has_video' });
      else steps.push({ step, action: 'run' });
    } else if (step === 'audio') {
      const hasDialogue = !!(sb?.dialogue || '').trim();
      if (!hasDialogue) steps.push({ step, action: 'skip', reason: 'no_dialogue' });
      else if (flags.skipExistingAudio && media.hasAudio) steps.push({ step, action: 'skip', reason: 'has_audio' });
      else steps.push({ step, action: 'run' });
    }
  }
  return steps;
}

function normalizeConcurrency(value, linkTailFrames) {
  if (linkTailFrames) return 1;
  const n = Number(value);
  if (!Number.isFinite(n)) return 2;
  return Math.min(4, Math.max(1, Math.round(n)));
}

/**
 * 有上限的并发池。stopOnError 时清空队列并等待已在跑的 worker。
 */
async function runPool(items, concurrency, worker, { shouldStop } = {}) {
  const queue = [...items];
  let active = 0;
  let maxActive = 0;
  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length) {
      if (shouldStop && shouldStop()) {
        queue.length = 0;
        break;
      }
      const item = queue.shift();
      if (!item) break;
      active += 1;
      if (active > maxActive) maxActive = active;
      try {
        await worker(item);
      } finally {
        active -= 1;
      }
    }
  });
  await Promise.all(runners);
  return { maxActive };
}

module.exports = { planWorkflowSteps, normalizeConcurrency, runPool };
