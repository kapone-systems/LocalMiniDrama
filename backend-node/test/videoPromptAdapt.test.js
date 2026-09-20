const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const aiClient = require('../src/services/aiClient');
const adapt = require('../src/services/videoPromptAdaptService');

function fakeDb({ setting = true, storyboard = null } = {}) {
  return {
    prepare(sql) {
      const s = String(sql);
      return {
        get() {
          if (s.includes('global_settings')) {
            if (setting === undefined) return null;
            return { value: JSON.stringify(setting) };
          }
          if (s.includes('FROM storyboards')) return storyboard;
          return null;
        },
        run() {
          return { changes: 1 };
        },
      };
    },
  };
}

const silentLog = { info() {}, warn() {}, error() {} };

describe('videoPromptAdaptService', () => {
  let origGenerate;

  beforeEach(() => {
    origGenerate = aiClient.generateText;
  });

  afterEach(() => {
    aiClient.generateText = origGenerate;
  });

  it('skips when global switch is off', async () => {
    aiClient.generateText = async () => {
      throw new Error('should not be called');
    };
    const out = await adapt.maybeAdaptVideoGenerationPrompt(fakeDb({ setting: false }), silentLog, {
      row: { prompt: '场景：室内。动作：转身看向窗外。', storyboard_id: 1 },
      config: { api_protocol: 'minimax_h3', model: ['MiniMax-H3'] },
      adaptRequested: null,
    });
    assert.equal(out.adapted, false);
    assert.equal(out.skippedReason, 'disabled');
    assert.match(out.prompt, /转身/);
  });

  it('rewrites with H3 skill when enabled', async () => {
    aiClient.generateText = async () => '女主缓缓转身看向窗外[推镜]，窗帘被风吹起[跟随]。';
    const out = await adapt.maybeAdaptVideoGenerationPrompt(fakeDb({ setting: true }), silentLog, {
      row: {
        prompt: '场景：室内。动作：转身看向窗外。',
        storyboard_id: 1,
        first_frame_url: 'http://x/a.png',
      },
      config: { api_protocol: 'minimax_h3', model: ['MiniMax-H3'], default_model: 'MiniMax-H3' },
      adaptRequested: 1,
    });
    assert.equal(out.adapted, true);
    assert.equal(out.skillId, 'minimax_h3');
    assert.match(out.prompt, /\[推镜\]/);
  });

  it('keeps original when model returns junk', async () => {
    aiClient.generateText = async () => '短';
    const out = await adapt.maybeAdaptVideoGenerationPrompt(fakeDb({ setting: true }), silentLog, {
      row: { prompt: '场景：室内。动作：转身看向窗外然后微笑。', first_frame_url: 'http://x/a.png' },
      config: { api_protocol: 'minimax_h3', model: ['MiniMax-H3'] },
      adaptRequested: 1,
    });
    assert.equal(out.adapted, false);
    assert.equal(out.skippedReason, 'sanitize_failed');
    assert.match(out.prompt, /转身看向窗外/);
  });

  it('throws when text model throws (caller must catch)', async () => {
    aiClient.generateText = async () => {
      throw new Error('未配置文本模型');
    };
    await assert.rejects(
      () => adapt.maybeAdaptVideoGenerationPrompt(fakeDb({ setting: true }), silentLog, {
        row: { prompt: '场景：室内。动作：转身看向窗外然后微笑。', first_frame_url: 'http://x/a.png' },
        config: { api_protocol: 'minimax_h3', model: ['MiniMax-H3'] },
        adaptRequested: 1,
      }),
      /未配置文本模型/
    );
  });

  it('hailuo rewrite has no H3 bracket camera tags', async () => {
    aiClient.generateText = async () => '女主缓缓转身看向窗外，镜头跟随她走到窗边，窗帘被风吹起。';
    const out = await adapt.maybeAdaptVideoGenerationPrompt(fakeDb({ setting: true }), silentLog, {
      row: { prompt: '场景：室内。动作：转身看向窗外然后走到窗边。', first_frame_url: 'http://x/a.png' },
      config: { api_protocol: 'minimax_hailuo', model: ['MiniMax-Hailuo-2.3'] },
      adaptRequested: 1,
    });
    assert.equal(out.adapted, true);
    assert.equal(out.skillId, 'minimax_hailuo');
    assert.equal(out.prompt.includes('[推镜]'), false);
    assert.equal(out.prompt.includes('[跟随]'), false);
    assert.match(out.prompt, /跟随|推近|转身/);
  });

  it('uses storyboard cache when skill and hash match', async () => {
    aiClient.generateText = async () => {
      throw new Error('should not call text model on cache hit');
    };
    const source = '场景：室内。动作：转身看向窗外。';
    const skills = require('../src/services/videoPromptSkills');
    const hash = skills.hashCanonical(source);
    const sb = {
      id: 9,
      creation_mode: 'classic',
      adapted_video_prompt: '缓存的海螺词，女主转身看向窗外镜头跟随。',
      adapted_video_skill_id: 'minimax_hailuo',
      adapted_video_source_hash: hash,
    };
    const out = await adapt.maybeAdaptVideoGenerationPrompt(
      fakeDb({ setting: true, storyboard: sb }),
      silentLog,
      {
        row: { prompt: source, storyboard_id: 9, first_frame_url: 'http://x/a.png' },
        config: { api_protocol: 'minimax_hailuo', model: ['MiniMax-Hailuo-2.3'] },
        adaptRequested: 1,
      }
    );
    assert.equal(out.adapted, true);
    assert.equal(out.skippedReason, 'cache_hit');
    assert.equal(out.prompt, sb.adapted_video_prompt);
  });

  it('omni skill keeps original when rewrite drops @图片 tokens', async () => {
    const omni = `画面风格和类型: 真人写实, 电影风格, 高清画质
生成一个由以下1个分镜组成的视频。
环境参考 @图片1 ，人物从 @图片2 起。
分镜1： 5秒: @图片2 女主抬眼看向窗外。`;
    aiClient.generateText = async () => '女主抬眼看向窗外，没有指图。';
    const out = await adapt.maybeAdaptVideoGenerationPrompt(
      fakeDb({ setting: true, storyboard: { id: 3, creation_mode: 'universal', duration: 5 } }),
      silentLog,
      {
        row: { prompt: omni, storyboard_id: 3 },
        config: { api_protocol: 'kling_omni', model: ['kling-video-o1'] },
        adaptRequested: 1,
      }
    );
    assert.equal(out.adapted, false);
    assert.equal(out.skippedReason, 'omni_format_lost');
    assert.equal(out.prompt, omni);
  });
});
