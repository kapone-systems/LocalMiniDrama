import test from 'node:test'
import assert from 'node:assert/strict'
import {
  setVideoPromptAdaptCache,
  getVideoPromptAdaptCache,
  applyVideoPromptAdaptCache,
  clearVideoPromptAdaptCache,
} from '../src/composables/useVideoPromptAdapt.js'

test('cache hits only when source prompt is unchanged', () => {
  clearVideoPromptAdaptCache(7)
  setVideoPromptAdaptCache(7, 'minimax_h3', '女主转身[推镜]', '场景：室内。动作：转身。')
  const hit = getVideoPromptAdaptCache(7, '场景：室内。动作：转身。')
  assert.equal(hit.skillId, 'minimax_h3')
  assert.equal(hit.text, '女主转身[推镜]')
  assert.equal(getVideoPromptAdaptCache(7, '场景：室外。'), null)
})

test('applyVideoPromptAdaptCache injects skip-rewrite flags', () => {
  clearVideoPromptAdaptCache(8)
  setVideoPromptAdaptCache(8, 'minimax_h3', '改写后的词', '原稿词')
  const body = applyVideoPromptAdaptCache({
    storyboard_id: 8,
    prompt: '原稿词',
    drama_id: 1,
  }, { id: 8 })
  assert.equal(body.prompt, '改写后的词')
  assert.equal(body.adapt_prompt, false)
  assert.equal(body.adapted_by_skill_id, 'minimax_h3')
})
