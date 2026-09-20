const settingsService = require('../services/settingsService');
const response = require('../response');
const { loadConfig } = require('../config');
const { resolveVideoGenerationTimeoutMinutes } = require('../config/videoGeneration');

function getLanguage(cfg) {
  return (req, res) => {
    const language = settingsService.getLanguage(cfg);
    response.success(res, { language });
  };
}

function updateLanguage(cfg, log) {
  return (req, res) => {
    const lang = req.body?.language;
    if (lang !== 'zh' && lang !== 'en') {
      return response.badRequest(res, '语言参数错误，只支持 zh 或 en');
    }
    const out = settingsService.updateLanguage(cfg, log, lang);
    if (!out.ok) return response.badRequest(res, out.error);
    const message = lang === 'en' ? 'Language switched to English' : '语言已切换为中文';
    response.success(res, { message, language: lang });
  };
}

/** GET /settings/generation — 获取生成相关全局设置 */
function getGenerationSettings(db) {
  return (req, res) => {
    const concurrency = settingsService.getGlobalSetting(db, 'pipeline_concurrency', 3);
    const video_concurrency = settingsService.getGlobalSetting(db, 'pipeline_video_concurrency', 3);
    const video_generation_timeout_minutes = resolveVideoGenerationTimeoutMinutes(loadConfig());
    const adapt_video_prompt = settingsService.getGlobalSetting(db, 'adapt_video_prompt', true) !== false;
    const adapt_video_prompt_cache = settingsService.getGlobalSetting(db, 'adapt_video_prompt_cache', true) !== false;
    response.success(res, {
      concurrency,
      video_concurrency,
      video_generation_timeout_minutes,
      adapt_video_prompt,
      adapt_video_prompt_cache,
    });
  };
}

/** PUT /settings/generation — 更新生成相关全局设置 */
function updateGenerationSettings(db) {
  return (req, res) => {
    const { concurrency, video_concurrency, adapt_video_prompt, adapt_video_prompt_cache } = req.body || {};
    if (concurrency !== undefined) {
      const n = Number(concurrency);
      if (!Number.isInteger(n) || n < 1 || n > 20) {
        return response.badRequest(res, '图片并发数需为 1-20 之间的整数');
      }
      settingsService.setGlobalSetting(db, 'pipeline_concurrency', n);
    }
    if (video_concurrency !== undefined) {
      const n = Number(video_concurrency);
      if (!Number.isInteger(n) || n < 1 || n > 20) {
        return response.badRequest(res, '视频并发数需为 1-20 之间的整数');
      }
      settingsService.setGlobalSetting(db, 'pipeline_video_concurrency', n);
    }
    if (adapt_video_prompt !== undefined) {
      settingsService.setGlobalSetting(db, 'adapt_video_prompt', adapt_video_prompt !== false && adapt_video_prompt !== 0);
    }
    if (adapt_video_prompt_cache !== undefined) {
      settingsService.setGlobalSetting(db, 'adapt_video_prompt_cache', adapt_video_prompt_cache !== false && adapt_video_prompt_cache !== 0);
    }
    const saved = settingsService.getGlobalSetting(db, 'pipeline_concurrency', 3);
    const saved_video = settingsService.getGlobalSetting(db, 'pipeline_video_concurrency', 3);
    const video_generation_timeout_minutes = resolveVideoGenerationTimeoutMinutes(loadConfig());
    const saved_adapt = settingsService.getGlobalSetting(db, 'adapt_video_prompt', true) !== false;
    const saved_cache = settingsService.getGlobalSetting(db, 'adapt_video_prompt_cache', true) !== false;
    response.success(res, {
      concurrency: saved,
      video_concurrency: saved_video,
      video_generation_timeout_minutes,
      adapt_video_prompt: saved_adapt,
      adapt_video_prompt_cache: saved_cache,
    });
  };
}

function listVideoPromptSkills(db) {
  return (req, res) => {
    try {
      const videoPromptSkills = require('../services/videoPromptSkills');
      const promptOverridesService = require('../services/promptOverridesService');
      const overrides = promptOverridesService.listOverrides(db);
      const overrideMap = {};
      for (const o of overrides) overrideMap[o.key] = true;
      const skills = videoPromptSkills.listSkills().map((s) => ({
        ...s,
        is_customized: !!overrideMap[s.override_key],
      }));
      const adapt_enabled = settingsService.getGlobalSetting(db, 'adapt_video_prompt', true) !== false;
      response.success(res, { skills, adapt_enabled });
    } catch (err) {
      response.internalError(res, err.message);
    }
  };
}

function resolveVideoPromptSkillRoute(db) {
  return (req, res) => {
    try {
      const videoPromptAdaptService = require('../services/videoPromptAdaptService');
      const summary = videoPromptAdaptService.resolveSkillSummary(db, {
        storyboardId: req.query.storyboard_id,
        model: req.query.model,
      });
      response.success(res, summary);
    } catch (err) {
      response.internalError(res, err.message);
    }
  };
}

module.exports = function settingsRoutes(db, cfg, log) {
  return {
    getLanguage: getLanguage(cfg),
    updateLanguage: updateLanguage(cfg, log),
    getGenerationSettings: getGenerationSettings(db),
    updateGenerationSettings: updateGenerationSettings(db),
    listVideoPromptSkills: listVideoPromptSkills(db),
    resolveVideoPromptSkill: resolveVideoPromptSkillRoute(db),
  };
};
