/**
 * 视频模型提示词 Skill 注册表。
 * 匹配当前视频配置的协议/模型族，决定生成前用哪套官方改写规则。
 * 默认正文在 promptI18n（key = video_skill.<id>），本文件不含长文案。
 */

const OVERRIDE_KEY_PREFIX = 'video_skill.';

const VIDEO_PROMPT_SKILLS = [
  {
    id: 'minimax_h3',
    label: 'MiniMax H3 官方提示词',
    description: '图/文生视频提交前，改写成 MiniMax-H3 官方结构（运镜方括号标签、动作为主、不改首帧外貌）',
    protocols: ['minimax_h3'],
    models: [/^minimax[-_]?h3\b/i],
    priority: 100,
    skipIf: null,
    phase1Skip: false,
    maxOutputChars: 7000,
  },
  {
    id: 'kling_omni',
    label: '可灵 Omni 提示词',
    description: '可灵 Omni 提交前整形：保真 @图片N、行结构与秒数；不替代「润色全能提示词」。',
    protocols: ['kling_omni'],
    models: [/kling-video-o1|kling.*omni|kling-v3-omni/i],
    priority: 90,
    skipIf: null,
    phase1Skip: false,
    maxOutputChars: 4000,
  },
  {
    id: 'seedance_omni',
    label: 'Seedance 全能提示词',
    description: '方舟多参考图全能提交前整形：保真 @图片N 与单镜头完整画幅，禁止成片模仿宫格。',
    protocols: ['volcengine_omni'],
    models: [/seedance-2/i],
    priority: 90,
    skipIf: null,
    phase1Skip: false,
    maxOutputChars: 4000,
  },
  {
    id: 'minimax_hailuo',
    label: '海螺 02/2.3 提示词',
    description: 'MiniMax 海螺 V1 图生视频。与 H3 分开，不用 H3 方括号运镜标签。',
    protocols: ['minimax_hailuo'],
    models: [/hailuo/i],
    priority: 80,
    skipIf: 'universal_omni',
    phase1Skip: false,
    maxOutputChars: 2000,
  },
  {
    id: 'kling',
    label: '可灵 I2V 提示词',
    description: '可灵经典图生视频（非 Omni）。电影中文，强调运动过程。',
    protocols: ['kling'],
    models: [/^kling(?!.*o1)/i],
    priority: 70,
    skipIf: 'universal_omni',
    phase1Skip: false,
    maxOutputChars: 2500,
  },
  {
    id: 'wan',
    label: '通义万象 / Wan 提示词',
    description: 'DashScope 或硅基 Wan 图生视频。中文主体+运动+镜头。',
    protocols: ['dashscope', 'siliconflow'],
    models: [/wan/i],
    priority: 70,
    skipIf: 'universal_omni',
    phase1Skip: false,
    requireModelMatch: true,
    maxOutputChars: 2500,
  },
  {
    id: 'seedance',
    label: 'Seedance 经典提示词',
    description: '火山 Seedance 经典首尾帧链路（非全能）。',
    protocols: ['volcengine'],
    models: [/seedance/i],
    priority: 70,
    skipIf: 'universal_omni',
    phase1Skip: false,
    requireModelMatch: true,
    maxOutputChars: 2500,
  },
  {
    id: 'sora',
    label: 'Sora 提示词',
    description: 'OpenAI Sora / 中转 multipart。英文镜头句，I2V 不改外貌。',
    protocols: ['sora', 'sora_official'],
    models: [/sora/i],
    priority: 60,
    skipIf: 'universal_omni',
    phase1Skip: false,
    maxOutputChars: 2500,
  },
  {
    id: 'grok',
    label: 'Grok Imagine 提示词',
    description: 'grok2api / xAI Imagine 视频。英文、短、运动明确。',
    protocols: ['grok2api', 'xai'],
    models: [/^grok-imagine-video/i],
    priority: 60,
    skipIf: 'universal_omni',
    phase1Skip: false,
    maxOutputChars: 1200,
  },
  {
    id: 'veo3',
    label: 'Veo 提示词',
    description: 'Veo3 / Gemini 视频。英文 cinematic action，图已锁定外貌。',
    protocols: ['veo3'],
    models: [/veo/i],
    priority: 60,
    skipIf: 'universal_omni',
    phase1Skip: false,
    maxOutputChars: 2000,
  },
  {
    id: 'generic',
    label: '通用视频提示词',
    description: '模型无关的电影化图生视频改写，作兜底。也用于「润色通用视频词」。',
    protocols: [],
    models: [],
    priority: 0,
    skipIf: null,
    phase1Skip: false,
    isFallback: true,
    maxOutputChars: 3600,
  },
];

function overrideKey(skillId) {
  return OVERRIDE_KEY_PREFIX + String(skillId || '');
}

function firstModelName(config, modelHint) {
  if (modelHint && String(modelHint).trim()) return String(modelHint).trim();
  if (config && config.default_model && String(config.default_model).trim()) {
    return String(config.default_model).trim();
  }
  const m = config && config.model;
  if (Array.isArray(m) && m[0]) return String(m[0]).trim();
  if (m != null && String(m).trim()) return String(m).trim();
  return '';
}

function protocolOf(config, modelHint) {
  try {
    const videoClient = require('./videoClient');
    if (typeof videoClient.resolveVideoProtocol === 'function') {
      return String(videoClient.resolveVideoProtocol(config || {}, modelHint) || '').toLowerCase();
    }
  } catch (_) {}
  const explicit = String((config && config.api_protocol) || '').trim().toLowerCase();
  if (explicit) return explicit;
  return String((config && config.provider) || '').trim().toLowerCase();
}

function modelMatches(skill, modelName) {
  const name = String(modelName || '');
  if (!skill.models || !skill.models.length) return false;
  return skill.models.some((re) => re.test(name));
}

function protocolMatches(skill, protocol) {
  const p = String(protocol || '').toLowerCase();
  if (!p || !skill.protocols || !skill.protocols.length) return false;
  return skill.protocols.includes(p);
}

function skillMatches(skill, protocol, modelName) {
  if (skill.isFallback) return false;
  const protoHit = protocolMatches(skill, protocol);
  const modelHit = modelMatches(skill, modelName);
  if (skill.requireModelMatch) return protoHit && modelHit;
  return protoHit || modelHit;
}

function isUniversalOmniContext(ctx, protocol) {
  const mode = ctx && ctx.creationMode;
  const proto = String(protocol || '').toLowerCase();
  if (mode !== 'universal') return false;
  return proto === 'kling_omni' || proto === 'volcengine_omni';
}

/**
 * @param {object} config ai_service_configs 行（视频）
 * @param {object} [ctx]
 * @param {string} [ctx.model]
 * @param {string} [ctx.protocol] 已解析协议；缺省则从 config 推断
 * @param {string} [ctx.creationMode] classic | universal
 * @returns {object|null} skill 定义；全能 Omni 豁免时返回 null
 */
function resolveVideoPromptSkill(config, ctx = {}) {
  const modelName = firstModelName(config, ctx.model);
  const protocol = String(ctx.protocol || protocolOf(config, modelName) || '').toLowerCase();
  const universalOmni = isUniversalOmniContext(ctx, protocol);

  const ranked = VIDEO_PROMPT_SKILLS
    .filter((s) => !s.isFallback)
    .slice()
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

  for (const skill of ranked) {
    if (!skillMatches(skill, protocol, modelName)) continue;
    if (skill.phase1Skip) continue;
    if (skill.skipIf === 'universal_omni' && universalOmni) continue;
    return skill;
  }

  // 全能提交禁止走 generic，以免打掉 @图片N
  const creationMode = ctx && ctx.creationMode;
  if (universalOmni || creationMode === 'universal') return null;

  return VIDEO_PROMPT_SKILLS.find((s) => s.isFallback) || null;
}

function getSkillById(id) {
  return VIDEO_PROMPT_SKILLS.find((s) => s.id === id) || null;
}

function listSkills() {
  return VIDEO_PROMPT_SKILLS.map((s) => ({
    id: s.id,
    label: s.label,
    description: s.description,
    override_key: overrideKey(s.id),
    protocols: s.protocols.slice(),
    is_fallback: !!s.isFallback,
    phase1_skip: !!s.phase1Skip,
    max_output_chars: s.maxOutputChars,
  }));
}

function clipText(value, maxLen) {
  if (value == null) return '';
  const t = String(value).trim();
  if (!t) return '';
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen)}…`;
}

function inferVideoAdaptMode(row) {
  if (!row || typeof row !== 'object') return 't2v';
  const first = String(row.first_frame_url || row.image_url || '').trim();
  const last = String(row.last_frame_url || '').trim();
  let refs = [];
  if (row.reference_image_urls) {
    try {
      const parsed = typeof row.reference_image_urls === 'string'
        ? JSON.parse(row.reference_image_urls)
        : row.reference_image_urls;
      if (Array.isArray(parsed)) refs = parsed.filter(Boolean);
    } catch (_) {}
  }
  if (Array.isArray(row.reference_urls)) {
    refs = refs.concat(row.reference_urls.filter(Boolean));
  }
  const refCount = refs.length;
  if (first && last) return 'first_last';
  if (refCount > 1 && !last) return 'reference';
  if (first || refCount > 0) return 'i2v';
  return 't2v';
}

function countReferences(row) {
  if (!row) return 0;
  let n = 0;
  if (String(row.first_frame_url || row.image_url || '').trim()) n += 1;
  if (String(row.last_frame_url || '').trim()) n += 1;
  try {
    const parsed = typeof row.reference_image_urls === 'string'
      ? JSON.parse(row.reference_image_urls)
      : row.reference_image_urls;
    if (Array.isArray(parsed)) n = Math.max(n, parsed.filter(Boolean).length);
  } catch (_) {}
  return n;
}

/**
 * 所有 Skill 共用的 user 消息骨架。
 */
function buildAdaptUserMessage(opts = {}) {
  const skillId = opts.skillId || 'generic';
  const mode = opts.mode || 'i2v';
  const duration = opts.durationSec != null ? String(opts.durationSec) : '';
  const ratio = opts.ratio || '';
  const hasFirst = !!opts.hasFirstFrame;
  const hasLast = !!opts.hasLastFrame;
  const refCount = opts.referenceCount != null ? Number(opts.referenceCount) : 0;
  const canonical = String(opts.canonicalPrompt || '').trim() || '(empty)';
  const fields = String(opts.storyboardFields || '').trim() || '(empty)';
  const anchor = String(opts.firstFrameAnchor || '').trim() || '(无图侧文本；仅依据分镜字段与剧本推断画面)';
  const layout = String(opts.layoutAnchor || '').trim();
  const omni = opts.omniMeta && typeof opts.omniMeta === 'object' ? opts.omniMeta : null;

  const parts = [
    'TASK: ADAPT_STORYBOARD_PROMPT_FOR_VIDEO_MODEL',
    `SKILL_ID: ${skillId}`,
    `MODE: ${mode}`,
    `DURATION_SEC: ${duration || '(unknown)'}`,
    `RATIO: ${ratio || '(unknown)'}`,
    `HAS_FIRST_FRAME: ${hasFirst}`,
    `HAS_LAST_FRAME: ${hasLast}`,
    `REFERENCE_COUNT: ${refCount}`,
    '',
    'CANONICAL_VIDEO_PROMPT:',
    canonical,
    '',
    'STORYBOARD_FIELDS:',
    fields,
    '',
    'FIRST_FRAME_ANCHOR:',
    clipText(anchor, 980),
  ];
  if (layout) {
    parts.push('', 'LAYOUT_ANCHOR:', clipText(layout, 600));
  }
  if (omni) {
    parts.push(
      '',
      'IMAGE_SLOT_MAP:',
      String(omni.imageSlotMap || '(none)').trim() || '(none)',
      '',
      'LINE3_REQUIRED:',
      String(omni.line3Required || '(none)').trim() || '(none)',
      `TOTAL_CLIP_SECONDS: ${omni.totalClipSeconds != null ? omni.totalClipSeconds : duration || '(unknown)'}`,
      '',
      'CURRENT_OMNI_DRAFT:',
      String(omni.currentOmniDraft || canonical).trim() || '(empty)'
    );
  }
  parts.push(
    '',
    'CONSTRAINTS:',
    '- 不要编造剧本没有的情节',
    '- 对白原意不可改',
    '- 时长秒数不可改',
    '- 只输出最终提示词正文，无标题、无 Markdown、无「优化说明」'
  );
  return parts.join('\n');
}

function storyboardFieldsBlock(sb) {
  if (!sb) return '';
  const pairs = [
    ['SHOT_NUM', sb.storyboard_number],
    ['TITLE', sb.title],
    ['LOCATION', sb.location],
    ['TIME', sb.time],
    ['DURATION_SEC', sb.duration],
    ['ACTION', sb.action],
    ['DIALOGUE', sb.dialogue],
    ['NARRATION', sb.narration],
    ['RESULT', sb.result],
    ['ATMOSPHERE', sb.atmosphere],
    ['EMOTION', sb.emotion],
    ['SHOT_TYPE', sb.shot_type],
    ['MOVEMENT', sb.movement],
    ['ANGLE', sb.angle],
    ['CREATION_MODE', sb.creation_mode],
    ['LAYOUT_DESCRIPTION', sb.layout_description],
  ];
  return pairs
    .map(([k, v]) => {
      if (v == null || v === '') return null;
      const s = String(v).trim();
      return s ? `${k}: ${s}` : null;
    })
    .filter(Boolean)
    .join('\n');
}

function sanitizeAdaptedOutput(raw, maxChars) {
  const cap = Number(maxChars) > 0 ? Number(maxChars) : 3600;
  let t = String(raw || '').trim();
  if (!t) return null;
  t = t.replace(/^```(?:[\w-]+)?\s*/i, '').replace(/\s*```$/i, '').trim();
  t = t.replace(/^(?:好的[，,。]?|以下是(?:最终)?提示词[：:]|最终提示词[：:]|优化后[：:]|改写后[：:])\s*/i, '');
  t = t.trim();
  if (t.length < 12) return null;
  if (/^(我(无法|不能)|作为一名?|sorry[,.]?\s|i (?:am|cannot)\b)/i.test(t)) return null;
  if (/^OUTPUT:/i.test(t) && t.length < 40) return null;
  if (t.length > cap) t = t.slice(0, cap);
  return t;
}

function hashCanonical(text) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex').slice(0, 16);
}

module.exports = {
  OVERRIDE_KEY_PREFIX,
  VIDEO_PROMPT_SKILLS,
  overrideKey,
  firstModelName,
  protocolOf,
  resolveVideoPromptSkill,
  getSkillById,
  listSkills,
  inferVideoAdaptMode,
  countReferences,
  buildAdaptUserMessage,
  storyboardFieldsBlock,
  sanitizeAdaptedOutput,
  hashCanonical,
  clipText,
  isUniversalOmniContext,
};
