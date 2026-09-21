import test from 'node:test'
import assert from 'node:assert/strict'
import {
  patchStoryboard,
  upsertStoryboard,
  removeStoryboard,
  pruneWorkflowGroups,
  collectStoryboardIds,
  swapStoryboardNumbers,
} from '../src/utils/dramaDocumentPatch.js'

function dramaFixture() {
  return {
    id: 1,
    title: 'd',
    metadata: {
      workflow_groups: [
        { id: 'wg-1', title: 'g1', storyboard_ids: [1, 2, 3] },
      ],
    },
    characters: [{ id: 8, name: 'A' }],
    episodes: [
      {
        id: 10,
        storyboards: [
          {
            id: 1,
            storyboard_number: 1,
            title: '镜1',
            dialogue: '你好',
            characters: [8],
            first_frame_image_id: 11,
            first_frame_image_url: 'a.png',
            last_frame_image_id: 12,
          },
          {
            id: 2,
            storyboard_number: 2,
            title: '镜2',
            dialogue: '再见',
            characters: [8],
          },
        ],
      },
    ],
  }
}

test('patchStoryboard shallow-merges and keeps characters / first_frame_*', () => {
  const d = dramaFixture()
  const next = patchStoryboard(d, 10, 1, { title: '新标题', dialogue: '改了' })
  const sb = next.episodes[0].storyboards[0]
  assert.equal(sb.title, '新标题')
  assert.equal(sb.dialogue, '改了')
  assert.deepEqual(sb.characters, [8])
  assert.equal(sb.first_frame_image_id, 11)
  assert.equal(sb.first_frame_image_url, 'a.png')
  assert.equal(sb.last_frame_image_id, 12)
  assert.equal(d.episodes[0].storyboards[0].title, '镜1')
})

test('upsertStoryboard inserts at index without dropping siblings', () => {
  const d = dramaFixture()
  const next = upsertStoryboard(d, 10, { id: 99, title: '新镜', storyboard_number: 2 }, { index: 1 })
  const ids = next.episodes[0].storyboards.map((s) => s.id)
  assert.deepEqual(ids, [1, 99, 2])
})

test('removeStoryboard drops the row', () => {
  const d = dramaFixture()
  const next = removeStoryboard(d, 2)
  assert.deepEqual(next.episodes[0].storyboards.map((s) => s.id), [1])
})

test('pruneWorkflowGroups drops deleted storyboard ids', () => {
  const d = removeStoryboard(dramaFixture(), 2)
  const pruned = pruneWorkflowGroups(d, collectStoryboardIds(d))
  assert.deepEqual(pruned.metadata.workflow_groups[0].storyboard_ids, [1])
})

test('swapStoryboardNumbers exchanges numbers and reorders the episode array', () => {
  const next = swapStoryboardNumbers(dramaFixture(), 1, 2)
  const boards = next.episodes[0].storyboards
  assert.equal(boards[0].id, 2)
  assert.equal(boards[0].storyboard_number, 1)
  assert.equal(boards[1].id, 1)
  assert.equal(boards[1].storyboard_number, 2)
})
