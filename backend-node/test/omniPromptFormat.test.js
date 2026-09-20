const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isOmniFormatted,
  extractOmniLine3,
  collectAtImageTokens,
  extractOmniBeatSeconds,
} = require('../src/services/omniPromptFormat');

const FIXTURE = `画面风格和类型: 真人写实, 电影风格, 高清画质
生成一个由以下2个分镜组成的视频。
环境参考 @图片1 ，人物从 @图片2 起，单镜头完整画幅禁止分屏宫格。
分镜1： 3秒: @图片2 女主抬眼看向窗外，镜头缓缓推近。
分镜2： 2秒: @图片2 她转身对 @图片3 开口：「我们走。」`;

describe('omniPromptFormat', () => {
  it('detects omni multi-beat block', () => {
    assert.equal(isOmniFormatted(FIXTURE), true);
    assert.equal(isOmniFormatted('场景：室内。动作：转身。'), false);
  });

  it('extracts line 3 after the M-count line', () => {
    assert.equal(
      extractOmniLine3(FIXTURE),
      '环境参考 @图片1 ，人物从 @图片2 起，单镜头完整画幅禁止分屏宫格。'
    );
  });

  it('collects @图片N in index order', () => {
    assert.deepEqual(collectAtImageTokens(FIXTURE), ['@图片1', '@图片2', '@图片3']);
  });

  it('sums beat seconds', () => {
    assert.deepEqual(extractOmniBeatSeconds(FIXTURE), [3, 2]);
  });

  it('preservation accepts same slots/line3/seconds', () => {
    const { omniPreservationError } = require('../src/services/omniPromptFormat');
    const rewritten = FIXTURE.replace('镜头缓缓推近', '镜头轻轻推近');
    assert.equal(omniPreservationError(FIXTURE, rewritten), null);
  });

  it('preservation rejects dropped @图片 tokens', () => {
    const { omniPreservationError } = require('../src/services/omniPromptFormat');
    const bad = FIXTURE.replace(/@图片3/g, '@图片2');
    assert.equal(omniPreservationError(FIXTURE, bad), 'omni_at_image_lost');
  });
});
