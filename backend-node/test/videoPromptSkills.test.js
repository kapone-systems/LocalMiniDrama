const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveVideoPromptSkill,
  getSkillById,
  listSkills,
  inferVideoAdaptMode,
  sanitizeAdaptedOutput,
  buildAdaptUserMessage,
  overrideKey,
} = require('../src/services/videoPromptSkills');

describe('videoPromptSkills matching', () => {
  it('hits MiniMax-H3 by protocol', () => {
    const skill = resolveVideoPromptSkill(
      { api_protocol: 'minimax_h3', model: ['MiniMax-H3'] },
      { protocol: 'minimax_h3', model: 'MiniMax-H3' }
    );
    assert.equal(skill.id, 'minimax_h3');
  });

  it('hits MiniMax-H3 by model regex when protocol is openai', () => {
    const skill = resolveVideoPromptSkill(
      { api_protocol: 'openai', model: ['MiniMax-H3'] },
      { protocol: 'openai', model: 'MiniMax-H3' }
    );
    assert.equal(skill.id, 'minimax_h3');
  });

  it('does not treat Hailuo as H3', () => {
    const skill = resolveVideoPromptSkill(
      { api_protocol: 'minimax_hailuo', model: ['MiniMax-Hailuo-2.3'] },
      { protocol: 'minimax_hailuo', model: 'MiniMax-Hailuo-2.3' }
    );
    assert.equal(skill.id, 'minimax_hailuo');
  });

  it('universal + kling_omni hits kling_omni skill', () => {
    const skill = resolveVideoPromptSkill(
      { api_protocol: 'kling_omni', model: ['kling-video-o1'] },
      { protocol: 'kling_omni', model: 'kling-video-o1', creationMode: 'universal' }
    );
    assert.equal(skill.id, 'kling_omni');
  });

  it('universal + volcengine_omni hits seedance_omni', () => {
    const skill = resolveVideoPromptSkill(
      { api_protocol: 'volcengine_omni', model: ['doubao-seedance-2-0-260128'] },
      { protocol: 'volcengine_omni', model: 'doubao-seedance-2-0-260128', creationMode: 'universal' }
    );
    assert.equal(skill.id, 'seedance_omni');
  });

  it('universal + H3 still hits minimax_h3', () => {
    const skill = resolveVideoPromptSkill(
      { api_protocol: 'minimax_h3', model: ['MiniMax-H3'] },
      { protocol: 'minimax_h3', model: 'MiniMax-H3', creationMode: 'universal' }
    );
    assert.equal(skill.id, 'minimax_h3');
  });

  it('universal + unknown protocol does not fall through to generic', () => {
    const skill = resolveVideoPromptSkill(
      { api_protocol: 'unknown_proto', model: ['foo'] },
      { protocol: 'unknown_proto', model: 'foo', creationMode: 'universal' }
    );
    assert.equal(skill, null);
  });

  it('classic kling omni hits kling_omni not generic', () => {
    const skill = resolveVideoPromptSkill(
      { api_protocol: 'kling_omni', model: ['kling-video-o1'] },
      { protocol: 'kling_omni', model: 'kling-video-o1', creationMode: 'classic' }
    );
    assert.equal(skill.id, 'kling_omni');
  });

  it('kling-video-o1 does not hit classic kling I2V skill', () => {
    const skill = resolveVideoPromptSkill(
      { api_protocol: 'kling', model: ['kling-video-o1'] },
      { protocol: 'kling', model: 'kling-video-o1', creationMode: 'classic' }
    );
    assert.equal(skill.id, 'kling_omni');
  });

  it('volcengine seedance 1.5 hits seedance not omni', () => {
    const skill = resolveVideoPromptSkill(
      { api_protocol: 'volcengine', model: ['doubao-seedance-1-5-pro-251215'] },
      { protocol: 'volcengine', model: 'doubao-seedance-1-5-pro-251215' }
    );
    assert.equal(skill.id, 'seedance');
  });

  it('sora and grok protocols match their skills', () => {
    assert.equal(
      resolveVideoPromptSkill({ api_protocol: 'sora_official' }, { protocol: 'sora_official', model: 'sora-2' }).id,
      'sora'
    );
    assert.equal(
      resolveVideoPromptSkill(
        { api_protocol: 'grok2api', model: ['grok-imagine-video'] },
        { protocol: 'grok2api', model: 'grok-imagine-video' }
      ).id,
      'grok'
    );
  });

  it('matches wan only when protocol and model both look like Wan', () => {
    const wan = resolveVideoPromptSkill(
      { api_protocol: 'siliconflow', model: ['Wan-AI/Wan2.2-I2V-A14B'] },
      { protocol: 'siliconflow', model: 'Wan-AI/Wan2.2-I2V-A14B' }
    );
    assert.equal(wan.id, 'wan');
    const other = resolveVideoPromptSkill(
      { api_protocol: 'siliconflow', model: ['some-other-video'] },
      { protocol: 'siliconflow', model: 'some-other-video' }
    );
    assert.equal(other.id, 'generic');
  });

  it('explicit protocol wins H3 over hailuo model name mix-up only when protocol is h3', () => {
    const skill = resolveVideoPromptSkill(
      { api_protocol: 'minimax_h3', model: ['MiniMax-Hailuo-02'] },
      { protocol: 'minimax_h3', model: 'MiniMax-Hailuo-02' }
    );
    assert.equal(skill.id, 'minimax_h3');
  });

  it('lists skills with override keys', () => {
    const list = listSkills();
    assert.ok(list.some((s) => s.id === 'minimax_h3' && s.override_key === 'video_skill.minimax_h3'));
    assert.equal(overrideKey('generic'), 'video_skill.generic');
    assert.equal(getSkillById('missing'), null);
  });
});

describe('videoPromptSkills helpers', () => {
  it('infers i2v / first_last / t2v / reference', () => {
    assert.equal(inferVideoAdaptMode({ image_url: 'http://x/a.png' }), 'i2v');
    assert.equal(inferVideoAdaptMode({
      first_frame_url: 'http://x/a.png',
      last_frame_url: 'http://x/b.png',
    }), 'first_last');
    assert.equal(inferVideoAdaptMode({}), 't2v');
    assert.equal(inferVideoAdaptMode({
      reference_image_urls: JSON.stringify(['a', 'b', 'c']),
    }), 'reference');
  });

  it('sanitizes adapted output', () => {
    assert.equal(sanitizeAdaptedOutput('短'), null);
    assert.equal(sanitizeAdaptedOutput('```\n女主抬眼看向窗外然后微笑。\n```').includes('女主抬眼'), true);
    const long = 'x'.repeat(50);
    assert.equal(sanitizeAdaptedOutput(long, 20), 'x'.repeat(20));
    assert.equal(sanitizeAdaptedOutput('我无法完成这个任务，因为'), null);
  });

  it('builds a stable user message skeleton', () => {
    const msg = buildAdaptUserMessage({
      skillId: 'minimax_h3',
      mode: 'i2v',
      durationSec: 5,
      ratio: '16:9',
      hasFirstFrame: true,
      canonicalPrompt: '场景：室内。动作：转身。',
    });
    assert.match(msg, /SKILL_ID: minimax_h3/);
    assert.match(msg, /MODE: i2v/);
    assert.match(msg, /CANONICAL_VIDEO_PROMPT:/);
    assert.match(msg, /转身/);
  });

  it('includes LAYOUT_ANCHOR and omni meta when provided', () => {
    const msg = buildAdaptUserMessage({
      skillId: 'kling_omni',
      canonicalPrompt: '画面风格和类型: 真人写实',
      layoutAnchor: '女主站画面左侧',
      omniMeta: {
        imageSlotMap: '@图片1, @图片2',
        line3Required: '环境参考 @图片1',
        totalClipSeconds: 5,
        currentOmniDraft: '画面风格和类型: 真人写实',
      },
    });
    assert.match(msg, /LAYOUT_ANCHOR:/);
    assert.match(msg, /女主站画面左侧/);
    assert.match(msg, /IMAGE_SLOT_MAP:/);
    assert.match(msg, /LINE3_REQUIRED:/);
    assert.match(msg, /@图片1, @图片2/);
  });
});
