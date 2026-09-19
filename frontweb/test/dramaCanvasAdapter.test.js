import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDramaCanvasGraph } from '../src/utils/dramaCanvasAdapter.js'

function classicFixture(extraSb = {}) {
  return {
    id: 1,
    title: 'fixture',
    metadata: {},
    characters: [],
    scenes: [],
    props: [],
    episodes: [
      {
        id: 10,
        episode_number: 1,
        title: '第1集',
        storyboards: [
          {
            id: 101,
            storyboard_number: 1,
            title: '镜1',
            creation_mode: 'classic',
            action: '走路',
            dialogue: '',
            ...extraSb,
          },
        ],
      },
    ],
  }
}

test('classic empty storyboard still has sbtxt / sbimg / sbvid / sbaud', () => {
  const { nodes } = buildDramaCanvasGraph(classicFixture())
  const ids = nodes.map((n) => n.id)
  assert.ok(ids.includes('sbtxt:101'))
  assert.ok(ids.includes('sbimg:101'))
  assert.ok(ids.includes('sbvid:101'))
  assert.ok(ids.includes('sbaud:101:dialogue'))
  const img = nodes.find((n) => n.id === 'sbimg:101')
  const vid = nodes.find((n) => n.id === 'sbvid:101')
  const aud = nodes.find((n) => n.id === 'sbaud:101:dialogue')
  assert.equal(img.data.empty, true)
  assert.equal(vid.data.empty, true)
  assert.equal(aud.data.empty, true)
  assert.equal(aud.data.skippedReason, '无对白')
})

test('first-last mode always has sbimg-first and sbimg-last even without URLs', () => {
  const drama = classicFixture()
  drama.metadata = { storyboard_use_first_last_frame: true }
  const { nodes } = buildDramaCanvasGraph(drama, { useFirstLastFrame: true })
  const ids = nodes.map((n) => n.id)
  assert.ok(ids.includes('sbtxt:101'))
  assert.ok(ids.includes('sbimg-first:101'))
  assert.ok(ids.includes('sbimg-last:101'))
  assert.ok(ids.includes('sbvid:101'))
  assert.ok(!ids.includes('sbimg:101'))
  const first = nodes.find((n) => n.id === 'sbimg-first:101')
  const last = nodes.find((n) => n.id === 'sbimg-last:101')
  assert.equal(first.data.empty, true)
  assert.equal(first.data.frameKind, 'first')
  assert.equal(last.data.empty, true)
  assert.equal(last.data.frameKind, 'last')
})

test('universal empty prompt still occupies sbuni then sbvid, no classic image slot', () => {
  const drama = classicFixture({
    id: 202,
    creation_mode: 'universal',
    universal_segment_text: '',
    video_prompt: '',
    description: '',
  })
  drama.episodes[0].storyboards[0].id = 202
  const { nodes } = buildDramaCanvasGraph(drama)
  const ids = nodes.map((n) => n.id)
  assert.ok(ids.includes('sbuni:202'))
  assert.ok(ids.includes('sbvid:202'))
  assert.ok(!ids.includes('sbtxt:202'))
  assert.ok(!ids.includes('sbimg:202'))
  const uni = nodes.find((n) => n.id === 'sbuni:202')
  assert.equal(uni.data.empty, true)
})

test('media node ids stay stable when urls exist', () => {
  const drama = classicFixture({
    image_url: 'http://example.test/a.png',
    local_path: 'images/a.png',
    video_url: 'http://example.test/a.mp4',
    audio_local_path: 'audio/a.wav',
    dialogue: '你好',
  })
  const { nodes } = buildDramaCanvasGraph(drama)
  const ids = nodes.map((n) => n.id)
  assert.ok(ids.includes('sbimg:101'))
  assert.ok(ids.includes('sbvid:101'))
  assert.ok(ids.includes('sbaud:101:dialogue'))
  assert.equal(nodes.find((n) => n.id === 'sbimg:101').data.empty, false)
})

test('collapsed episode keeps stub and does not emit storyboard pipeline nodes', () => {
  const drama = classicFixture()
  drama.episodes.push({
    id: 11,
    episode_number: 2,
    title: '第2集',
    storyboards: [
      { id: 201, storyboard_number: 1, title: '二集镜1', creation_mode: 'classic', action: 'a' },
    ],
  })
  const { nodes } = buildDramaCanvasGraph(drama, { collapsedEpisodeIds: [11] })
  const ids = nodes.map((n) => n.id)
  assert.ok(ids.includes('episode:10'))
  assert.ok(ids.includes('sb:101'))
  assert.ok(ids.includes('episode:11'))
  assert.ok(ids.includes('episode-stub:11'))
  assert.ok(!ids.includes('sb:201'))
  assert.ok(!ids.includes('sbimg:201'))
  const stub = nodes.find((n) => n.id === 'episode-stub:11')
  assert.equal(stub.data.collapsed, true)
})
