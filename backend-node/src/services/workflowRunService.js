const path = require('path');
const taskService = require('./taskService');
const imageService = require('./imageService');
const videoService = require('./videoService');
const { planWorkflowSteps, normalizeConcurrency, runPool } = require('./workflowRunPlanner');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseMeta(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

function usesFirstLast(meta) {
  return !!(meta && meta.storyboard_use_first_last_frame);
}

function isRunCancelled(db, taskId) {
  const t = taskService.getTask(db, taskId);
  return !!(t && t.status === 'failed');
}

async function waitForTask(db, subTaskId, runTaskId, { maxMs = 15 * 60 * 1000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (isRunCancelled(db, runTaskId)) {
      const err = new Error('cancelled');
      err.code = 'CANCELLED';
      throw err;
    }
    const t = taskService.getTask(db, subTaskId);
    if (!t) throw new Error('子任务不存在');
    if (t.status === 'completed') return t;
    if (t.status === 'failed') throw new Error(t.error || '子任务失败');
    await sleep(2000);
  }
  throw new Error('子任务超时');
}

function storyboardHasImage(db, sb, firstLast) {
  if (sb.creation_mode === 'universal') return true;
  if (sb.local_path || sb.image_url) return true;
  if (firstLast && sb.first_frame_image_id) return true;
  const row = db.prepare(
    `SELECT id FROM image_generations
     WHERE storyboard_id = ? AND deleted_at IS NULL AND status = 'completed'
       AND (COALESCE(image_url,'') != '' OR COALESCE(local_path,'') != '')
     LIMIT 1`
  ).get(sb.id);
  return !!row;
}

function storyboardHasVideo(db, sb) {
  if (sb.video_url || sb.local_path) return true;
  const row = db.prepare(
    `SELECT id FROM video_generations
     WHERE storyboard_id = ? AND deleted_at IS NULL AND status = 'completed'
       AND (COALESCE(video_url,'') != '' OR COALESCE(local_path,'') != '')
     LIMIT 1`
  ).get(sb.id);
  return !!row;
}

function getDramaOpts(db, dramaId) {
  const row = db.prepare('SELECT metadata, style FROM dramas WHERE id = ? AND deleted_at IS NULL').get(Number(dramaId));
  const meta = parseMeta(row?.metadata);
  return {
    meta,
    aspectRatio: meta.aspect_ratio || '16:9',
    style: meta.style_prompt_en || meta.style_prompt_zh || row?.style || '',
    videoResolution: meta.video_resolution || '480p',
    firstLast: usesFirstLast(meta),
  };
}

function imagePrompt(sb) {
  return (sb.polished_prompt || sb.image_prompt || sb.description || sb.action || '').trim();
}

function videoPrompt(sb) {
  return (sb.video_prompt || sb.polished_prompt || sb.image_prompt || sb.description || '').trim();
}

function latestImageUrl(db, sb, firstLast) {
  if (firstLast) {
    if (sb.first_frame_image_id) {
      const ig = db.prepare('SELECT local_path, image_url FROM image_generations WHERE id = ?').get(sb.first_frame_image_id);
      if (ig) return ig.local_path || ig.image_url;
    }
  }
  if (sb.local_path || sb.image_url) return sb.local_path || sb.image_url;
  const row = db.prepare(
    `SELECT local_path, image_url FROM image_generations
     WHERE storyboard_id = ? AND deleted_at IS NULL AND status = 'completed'
     ORDER BY id DESC LIMIT 1`
  ).get(sb.id);
  return row ? (row.local_path || row.image_url) : '';
}

function lastFrameUrl(db, sb) {
  if (sb.last_frame_image_id) {
    const ig = db.prepare('SELECT local_path, image_url FROM image_generations WHERE id = ?').get(sb.last_frame_image_id);
    if (ig) return ig.local_path || ig.image_url;
  }
  const row = db.prepare(
    `SELECT local_path, image_url FROM image_generations
     WHERE storyboard_id = ? AND deleted_at IS NULL AND status = 'completed' AND frame_type IN ('storyboard_last','last')
     ORDER BY id DESC LIMIT 1`
  ).get(sb.id);
  return row ? (row.local_path || row.image_url) : '';
}

function isRateLimitError(err) {
  const msg = String(err?.message || err || '');
  return msg.includes('429') || /rate limit/i.test(msg);
}

async function withRetry(fn) {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (e.code === 'CANCELLED') throw e;
      if (i < 2 && isRateLimitError(e)) {
        await sleep(1500 * (i + 1));
        continue;
      }
      throw e;
    }
  }
  throw last;
}

async function runImage(db, log, dramaId, sb, opts, runTaskId) {
  const prompt = imagePrompt(sb);
  if (!prompt) throw new Error(`分镜 #${sb.storyboard_number ?? sb.id} 缺少图片提示词`);
  if (opts.firstLast && sb.creation_mode !== 'universal') {
    for (const frameType of ['storyboard_first', 'storyboard_last']) {
      const rec = imageService.create(db, log, {
        storyboard_id: sb.id,
        drama_id: dramaId,
        prompt,
        style: opts.style,
        aspect_ratio: opts.aspectRatio,
        frame_type: frameType,
      });
      if (rec?.task_id) await waitForTask(db, rec.task_id, runTaskId);
    }
    return;
  }
  const rec = imageService.create(db, log, {
    storyboard_id: sb.id,
    drama_id: dramaId,
    prompt,
    style: opts.style,
    aspect_ratio: opts.aspectRatio,
  });
  if (rec?.task_id) await waitForTask(db, rec.task_id, runTaskId);
}

async function runVideo(db, log, dramaId, sb, opts, runTaskId) {
  const first = latestImageUrl(db, sb, opts.firstLast);
  const last = opts.firstLast ? lastFrameUrl(db, sb) : '';
  if (!first && !videoPrompt(sb) && !last) {
    throw new Error(`分镜 #${sb.storyboard_number ?? sb.id} 缺少分镜图，无法生成视频`);
  }
  const rec = videoService.createAndStart(db, log, {
    drama_id: dramaId,
    storyboard_id: sb.id,
    prompt: videoPrompt(sb),
    image_url: first || undefined,
    first_frame_url: first || undefined,
    last_frame_url: last || undefined,
    style: opts.style,
    aspect_ratio: opts.aspectRatio,
    resolution: opts.videoResolution,
    duration: sb.duration || undefined,
  });
  if (rec?.task_id) await waitForTask(db, rec.task_id, runTaskId);
}

async function runAudio(db, log, sb) {
  const text = (sb.dialogue || '').trim();
  if (!text) return { skipped: true, reason: '无对白' };
  const ttsService = require('./ttsService');
  const loadConfig = require('../config').loadConfig;
  const cfg = loadConfig();
  const storagePath = path.isAbsolute(cfg.storage?.local_path)
    ? cfg.storage.local_path
    : path.join(process.cwd(), cfg.storage?.local_path || './data/storage');
  const result = await ttsService.synthesize(db, log, {
    text,
    storyboard_id: sb.id,
    storage_base: storagePath,
  });
  if (result?.local_path) {
    const now = new Date().toISOString();
    db.prepare('UPDATE storyboards SET audio_local_path = ?, updated_at = ? WHERE id = ?').run(
      result.local_path, now, sb.id,
    );
  }
  return { skipped: false };
}

function startWorkflowRun(db, log, dramaId, body = {}) {
  const drama = db.prepare('SELECT id, metadata FROM dramas WHERE id = ? AND deleted_at IS NULL').get(Number(dramaId));
  if (!drama) {
    const err = new Error('剧本不存在');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const ids = [...new Set((body.storyboard_ids || []).map(Number).filter(Number.isFinite))];
  if (!ids.length && body.group_id) {
    const meta = parseMeta(drama.metadata);
    const group = (meta.workflow_groups || []).find((g) => g.id === body.group_id);
    if (group) ids.push(...(group.storyboard_ids || []).map(Number));
  }
  if (!ids.length) {
    const err = new Error('请至少选择一个分镜');
    err.code = 'BAD_REQUEST';
    throw err;
  }
  const pipeline = Array.isArray(body.pipeline) && body.pipeline.length ? body.pipeline : ['image', 'video', 'audio'];
  const skipExisting = body.skip_existing !== false;
  const stopOnError = !!body.stop_on_error;
  const linkTailFrames = !!body.link_tail_frames;
  const concurrency = normalizeConcurrency(body.concurrency, linkTailFrames);
  const task = taskService.createTask(db, log, 'workflow_run', String(dramaId));
  const snapshot = {
    group_id: body.group_id || null,
    storyboard_ids: ids,
    pipeline,
    flags: { skipExistingImage: skipExisting, skipExistingVideo: skipExisting, skipExistingAudio: skipExisting, stopOnError, concurrency, linkTailFrames },
    current: { index: 0, total: ids.length },
    items: [],
    summary: { ok: [], skipped: [], failed: [] },
  };
  taskService.updateTaskSnapshot(db, task.id, { status: 'processing', progress: 1, message: '准备执行', result: snapshot });
  setImmediate(() => {
    processWorkflowRun(db, log, Number(dramaId), task.id, snapshot).catch((e) => {
      log.error('workflow run failed', { error: e.message, task_id: task.id });
      taskService.updateTaskError(db, task.id, e.message || '工作流失败');
    });
  });
  return { task_id: task.id, status: 'processing' };
}

async function processWorkflowRun(db, log, dramaId, taskId, snapshot) {
  const opts = getDramaOpts(db, dramaId);
  const flags = snapshot.flags;
  let stopped = false;
  const shouldStop = () => stopped || isRunCancelled(db, taskId);

  const worker = async (sbId, index) => {
    if (shouldStop()) return;
    const sb = db.prepare('SELECT * FROM storyboards WHERE id = ? AND deleted_at IS NULL').get(Number(sbId));
    if (!sb) {
      snapshot.summary.failed.push({ storyboardId: sbId, error: '分镜不存在' });
      return;
    }
    snapshot.current = {
      storyboardId: sb.id,
      storyboardNumber: sb.storyboard_number,
      index: index + 1,
      total: snapshot.storyboard_ids.length,
      step: '',
    };
    const media = {
      hasImage: storyboardHasImage(db, sb, opts.firstLast),
      hasVideo: storyboardHasVideo(db, sb),
      hasAudio: !!sb.audio_local_path,
    };
    const plan = planWorkflowSteps(sb, snapshot.pipeline, flags, media);
    try {
      let ran = false;
      for (const item of plan) {
        if (shouldStop()) {
          const err = new Error('cancelled');
          err.code = 'CANCELLED';
          throw err;
        }
        snapshot.current.step = item.step;
        taskService.updateTaskSnapshot(db, taskId, {
          status: 'processing',
          progress: Math.round(((index) / snapshot.storyboard_ids.length) * 100),
          message: `#${sb.storyboard_number ?? sb.id} ${item.step}`,
          result: snapshot,
        });
        if (item.action === 'skip') {
          snapshot.items.push({ storyboardId: sb.id, step: item.step, status: 'skipped', reason: item.reason });
          continue;
        }
        ran = true;
        await withRetry(async () => {
          if (item.step === 'image') await runImage(db, log, dramaId, sb, opts, taskId);
          else if (item.step === 'video') await runVideo(db, log, dramaId, sb, opts, taskId);
          else if (item.step === 'audio') await runAudio(db, log, sb);
        });
        snapshot.items.push({ storyboardId: sb.id, step: item.step, status: 'ok' });
      }
      if (ran) snapshot.summary.ok.push(sb.id);
      else snapshot.summary.skipped.push(sb.id);
    } catch (e) {
      if (e.code === 'CANCELLED') {
        stopped = true;
        return;
      }
      snapshot.items.push({ storyboardId: sb.id, step: snapshot.current.step, status: 'failed', error: e.message });
      snapshot.summary.failed.push({ storyboardId: sb.id, error: e.message });
      if (flags.stopOnError) stopped = true;
    }
  };

  const indexed = snapshot.storyboard_ids.map((id, i) => ({ id, i }));
  await runPool(indexed, flags.concurrency, async ({ id, i }) => worker(id, i), { shouldStop });

  const finalCancelled = isRunCancelled(db, taskId);
  if (finalCancelled) {
    taskService.updateTaskSnapshot(db, taskId, { status: 'failed', progress: 100, message: '已停止', result: snapshot });
    return;
  }
  taskService.updateTaskResult(db, taskId, snapshot);
}

module.exports = {
  startWorkflowRun,
  planWorkflowSteps,
  storyboardHasImage,
  storyboardHasVideo,
};
