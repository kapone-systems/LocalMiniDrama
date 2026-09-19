import test from 'node:test'
import assert from 'node:assert/strict'
import { planWorkflowSteps, normalizeWorkflowConcurrency } from '../src/utils/planWorkflowSteps.js'

test('has image no video → skip image + run video', () => {
  const plan = planWorkflowSteps(
    { id: 1, dialogue: 'hi' },
    ['image', 'video'],
    { skipExistingImage: true, skipExistingVideo: true },
    { hasImage: true, hasVideo: false },
  )
  assert.deepEqual(plan, [
    { step: 'image', action: 'skip', reason: 'has_image' },
    { step: 'video', action: 'run' },
  ])
})

test('universal skips image even without existing media', () => {
  const plan = planWorkflowSteps(
    { creation_mode: 'universal' },
    ['image', 'video', 'audio'],
    { skipExistingImage: true },
    {},
  )
  assert.equal(plan[0].action, 'skip')
  assert.equal(plan[0].reason, 'universal')
  assert.equal(plan[1].action, 'run')
  assert.equal(plan[2].action, 'skip')
  assert.equal(plan[2].reason, 'no_dialogue')
})

test('skip flags off always run image/video when prompt path exists', () => {
  const plan = planWorkflowSteps(
    { dialogue: 'a' },
    ['image', 'video', 'audio'],
    { skipExistingImage: false, skipExistingVideo: false, skipExistingAudio: false },
    { hasImage: true, hasVideo: true, hasAudio: true },
  )
  assert.deepEqual(plan.map((p) => p.action), ['run', 'run', 'run'])
})

test('link tail frames forces concurrency 1', () => {
  assert.equal(normalizeWorkflowConcurrency(4, { linkTailFrames: true }), 1)
  assert.equal(normalizeWorkflowConcurrency(4, { linkTailFrames: false }), 4)
  assert.equal(normalizeWorkflowConcurrency(0), 1)
  assert.equal(normalizeWorkflowConcurrency(99), 4)
  assert.equal(normalizeWorkflowConcurrency(undefined), 2)
})
