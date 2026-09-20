/**
 * 按当前视频模型 Skill 改写即将提交的提示词。
 * 失败必须抛给调用方捕获后回退原稿，不能让生视频直接失败。
 */

const aiClient = require('./aiClient');
const promptI18n = require('./promptI18n');
const settingsService = require('./settingsService');
const videoClient = require('./videoClient');
const skills = require('./videoPromptSkills');
const omniFmt = require('./omniPromptFormat');

function getSkillSystemPrompt(skillId) {
  if (typeof promptI18n.getVideoSkillSystemPrompt === 'function') {
    return promptI18n.getVideoSkillSystemPrompt(skillId);
  }
  const key = skills.overrideKey(skillId);
  const body = promptI18n.getDefaultPromptBody(key);
  const locked = promptI18n.getLockedSuffix(key);
  return locked ? `${body}\n\n${locked}` : body;
}

function isAdaptEnabled(db, adaptRequested) {
  if (adaptRequested === 0 || adaptRequested === false) return false;
  if (adaptRequested === 1 || adaptRequested === true) return true;
  const v = settingsService.getGlobalSetting(db, 'adapt_video_prompt', true);
  return v !== false && v !== 0 && v !== 'false';
}

function loadStoryboard(db, storyboardId) {
  if (!storyboardId) return null;
  try {
    return db.prepare('SELECT * FROM storyboards WHERE id = ? AND deleted_at IS NULL').get(Number(storyboardId));
  } catch (_) {
    return null;
  }
}

function resolveSkillForVideoConfig(config, row, sb) {
  const modelHint = (row && row.model) || undefined;
  const protocol = videoClient.resolveVideoProtocol(config || {}, modelHint);
  return skills.resolveVideoPromptSkill(config, {
    model: modelHint || skills.firstModelName(config),
    protocol,
    creationMode: sb && sb.creation_mode,
  });
}

function isCacheEnabled(db) {
  const v = settingsService.getGlobalSetting(db, 'adapt_video_prompt_cache', true);
  return v !== false && v !== 0 && v !== 'false';
}

function writeAdaptedCache(db, storyboardId, skillId, prompt, sourceHash) {
  const sbId = Number(storyboardId);
  if (!Number.isFinite(sbId) || sbId <= 0 || !prompt) return false;
  const now = new Date().toISOString();
  try {
    db.prepare(
      `UPDATE storyboards SET adapted_video_prompt = ?, adapted_video_skill_id = ?, adapted_video_source_hash = ?, adapted_video_prompt_at = ? WHERE id = ? AND deleted_at IS NULL`
    ).run(prompt, skillId || null, sourceHash || '', now, sbId);
    return true;
  } catch (_) {
    return false;
  }
}

function clearAdaptedCache(db, storyboardId) {
  const sbId = Number(storyboardId);
  if (!Number.isFinite(sbId) || sbId <= 0) return;
  try {
    db.prepare(
      `UPDATE storyboards SET adapted_video_prompt = NULL, adapted_video_skill_id = NULL, adapted_video_source_hash = NULL, adapted_video_prompt_at = NULL WHERE id = ? AND deleted_at IS NULL`
    ).run(sbId);
  } catch (_) {}
}

function saveAdaptedCacheForStoryboard(db, storyboardId, { prompt, skillId, sourcePrompt } = {}) {
  const text = String(prompt || '').trim();
  if (text.length < 12) return { ok: false, error: '改写结果过短' };
  const hash = skills.hashCanonical(sourcePrompt || '');
  const ok = writeAdaptedCache(db, storyboardId, skillId, text, hash);
  return ok ? { ok: true, skill_id: skillId, source_hash: hash } : { ok: false, error: '写入缓存失败（可能尚未迁移列）' };
}

function buildContextFromRow(row, sb, skill) {
  const mode = skills.inferVideoAdaptMode(row);
  const canonical = String((row && row.prompt) || (sb && (sb.universal_segment_text || sb.video_prompt)) || '').trim();
  const firstAnchor =
    (sb && (sb.polished_prompt || sb.image_prompt)) || '';
  const ctx = {
    skillId: skill.id,
    mode,
    durationSec: (sb && sb.duration) || (row && row.duration) || '',
    ratio: (row && row.aspect_ratio) || '',
    hasFirstFrame: !!(row && (row.first_frame_url || row.image_url)),
    hasLastFrame: !!(row && row.last_frame_url),
    referenceCount: skills.countReferences(row),
    canonicalPrompt: canonical,
    storyboardFields: skills.storyboardFieldsBlock(sb),
    firstFrameAnchor: firstAnchor,
    layoutAnchor: (sb && sb.layout_description) || '',
  };
  if (skill.id === 'kling_omni' || skill.id === 'seedance_omni') {
    ctx.omniMeta = {
      imageSlotMap: omniFmt.collectAtImageTokens(canonical).join(', ') || '(none in canonical)',
      line3Required: omniFmt.extractOmniLine3(canonical) || '(none)',
      totalClipSeconds: (sb && sb.duration) || (row && row.duration) || '',
      currentOmniDraft: canonical,
    };
  }
  return ctx;
}

async function runAdapt(db, log, skill, userMessage, streamOnDelta) {
  const systemPrompt = getSkillSystemPrompt(skill.id);
  const options = {
    scene_key: 'video_prompt_skill',
    max_tokens: 2000,
    temperature: 0.28,
    silence_timeout_ms: 180000,
  };
  let raw = '';
  if (typeof streamOnDelta === 'function') {
    raw = await aiClient.streamGenerateText(
      db,
      log,
      'text',
      userMessage,
      systemPrompt,
      options,
      streamOnDelta
    );
  } else {
    raw = await aiClient.generateText(db, log, 'text', userMessage, systemPrompt, options);
  }
  return skills.sanitizeAdaptedOutput(raw, skill.maxOutputChars);
}

/**
 * 生成链路：按需改写 video_generations.prompt。
 * @returns {{ prompt: string, skillId: string|null, adapted: boolean, skippedReason?: string }}
 */
async function maybeAdaptVideoGenerationPrompt(db, log, { row, config, adaptRequested }) {
  const original = String((row && row.prompt) || '').trim();
  if (!isAdaptEnabled(db, adaptRequested)) {
    return { prompt: original, skillId: null, adapted: false, skippedReason: 'disabled' };
  }
  const sb = loadStoryboard(db, row && row.storyboard_id);
  const skill = resolveSkillForVideoConfig(config, row, sb);
  if (!skill) {
    return { prompt: original, skillId: null, adapted: false, skippedReason: 'no_skill' };
  }
  if (!original || original.length < 4) {
    return { prompt: original, skillId: skill.id, adapted: false, skippedReason: 'empty_prompt' };
  }
  const sourceHash = skills.hashCanonical(original);
  if (isCacheEnabled(db) && sb) {
    const cached = String(sb.adapted_video_prompt || '').trim();
    const sameSkill = String(sb.adapted_video_skill_id || '') === String(skill.id);
    const sameHash = String(sb.adapted_video_source_hash || '') === sourceHash;
    if (cached.length >= 12 && sameSkill && sameHash) {
      if (log && log.info) {
        log.info('[VideoPromptSkill] cache hit', { skill: skill.id, storyboard_id: sb.id, hash: sourceHash });
      }
      return { prompt: cached, skillId: skill.id, adapted: true, skippedReason: 'cache_hit' };
    }
  }
  const userMessage = skills.buildAdaptUserMessage(buildContextFromRow(row, sb, skill));
  const started = Date.now();
  const adapted = await runAdapt(db, log, skill, userMessage);
  const elapsed = Date.now() - started;
  if (!adapted) {
    if (log && log.warn) {
      log.warn('[VideoPromptSkill] sanitize failed, keep original', {
        skill: skill.id,
        in: original.length,
        elapsed,
      });
    }
    return { prompt: original, skillId: skill.id, adapted: false, skippedReason: 'sanitize_failed' };
  }
  if (skill.id === 'kling_omni' || skill.id === 'seedance_omni') {
    const preserveErr = omniFmt.omniPreservationError(original, adapted);
    if (preserveErr) {
      if (log && log.warn) {
        log.warn('[VideoPromptSkill] omni preservation failed, keep original', {
          skill: skill.id,
          reason: preserveErr,
        });
      }
      return { prompt: original, skillId: skill.id, adapted: false, skippedReason: preserveErr };
    }
  }
  if (log && log.info) {
    log.info('[VideoPromptSkill] adapted', {
      skill: skill.id,
      in: original.length,
      out: adapted.length,
      elapsed,
      preview: adapted.slice(0, 80),
    });
  }
  if (isCacheEnabled(db) && row && row.storyboard_id) {
    writeAdaptedCache(db, row.storyboard_id, skill.id, adapted, sourceHash);
  }
  return { prompt: adapted, skillId: skill.id, adapted: true };
}

async function streamAdaptForStoryboard(db, log, storyboardId, body, writeNd) {
  const sbId = Number(storyboardId);
  const sb = loadStoryboard(db, sbId);
  if (!sb) {
    writeNd({ type: 'error', message: '分镜不存在' });
    return { ok: false };
  }
  const draftRaw = body && body.draft_video_prompt != null ? String(body.draft_video_prompt) : '';
  const canonical =
    draftRaw.trim() ||
    String(sb.universal_segment_text || '').trim() ||
    String(sb.video_prompt || '').trim();
  if (!canonical || canonical.length < 4) {
    writeNd({ type: 'error', message: '请先填写视频提示词或分镜动作后再优化' });
    return { ok: false };
  }

  const config = videoClient.getDefaultVideoConfig(db, body && body.model);
  if (!config) {
    writeNd({ type: 'error', message: '未配置视频模型' });
    return { ok: false };
  }
  const skill = resolveSkillForVideoConfig(config, { model: body && body.model, prompt: canonical }, sb);
  if (!skill) {
    writeNd({
      type: 'error',
      message:
        sb.creation_mode === 'universal'
          ? '全能分镜未匹配到专用视频 Skill，已跳过改写以免破坏 @图片N。请将视频协议设为可灵 Omni 或 Seedance 全能。'
          : '当前视频模型没有可用的提示词 Skill',
    });
    return { ok: false };
  }

  const fakeRow = {
    prompt: canonical,
    model: skills.firstModelName(config, body && body.model),
    duration: sb.duration,
    aspect_ratio: (body && body.aspect_ratio) || '',
    image_url: body && body.image_url,
    first_frame_url: body && (body.first_frame_url || body.image_url),
    last_frame_url: body && body.last_frame_url,
    reference_image_urls: body && body.reference_image_urls,
  };
  const userMessage = skills.buildAdaptUserMessage(buildContextFromRow(fakeRow, sb, skill));
  let raw = '';
  try {
    raw = await runAdapt(db, log, skill, userMessage, (delta) => {
      writeNd({ type: 'delta', text: delta });
    });
  } catch (err) {
    writeNd({ type: 'error', message: (err && err.message) || '优化失败' });
    return { ok: false };
  }
  if (!raw) {
    writeNd({ type: 'error', message: 'AI 返回内容过短或无法解析，请检查文本模型配置' });
    return { ok: false };
  }
  writeNd({
    type: 'done',
    adapted_prompt: raw,
    skill_id: skill.id,
    skill_label: skill.label,
  });
  return { ok: true, adapted_prompt: raw, skill_id: skill.id };
}

function resolveSkillSummary(db, { storyboardId, model } = {}) {
  const config = videoClient.getDefaultVideoConfig(db, model);
  if (!config) {
    return { skill: null, reason: 'no_video_config', protocol: '', model: '', config_name: '' };
  }
  const sb = storyboardId ? loadStoryboard(db, storyboardId) : null;
  const modelName = skills.firstModelName(config, model);
  const protocol = videoClient.resolveVideoProtocol(config, modelName);
  const skill = skills.resolveVideoPromptSkill(config, {
    model: modelName,
    protocol,
    creationMode: sb && sb.creation_mode,
  });
  const enabled = isAdaptEnabled(db, null);
  return {
    skill: skill
      ? { id: skill.id, label: skill.label, override_key: skills.overrideKey(skill.id) }
      : null,
    reason: skill ? null : (sb && sb.creation_mode === 'universal' ? 'universal_skip_generic' : 'no_skill'),
    protocol,
    model: modelName,
    config_name: config.name || '',
    adapt_enabled: enabled,
  };
}

module.exports = {
  getSkillSystemPrompt,
  isAdaptEnabled,
  maybeAdaptVideoGenerationPrompt,
  streamAdaptForStoryboard,
  resolveSkillSummary,
  saveAdaptedCacheForStoryboard,
  clearAdaptedCache,
  isCacheEnabled,
  resolveSkillForVideoConfig,
};
