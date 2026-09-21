import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SB_GAP_Y,
  insertStoryboardLayout,
  mediaNodeIdsForStoryboard,
  removeStoryboardLayout,
  rowOffsets,
  swapStoryboardLayoutRows,
} from '../src/utils/canvasLayoutInsert.js'

function pos(x, y) {
  return { x, y }
}

function classicIds(id) {
  return [`sb:${id}`, `sbtxt:${id}`, `sbimg:${id}`, `sbvid:${id}`, `sbaud:${id}:dialogue`]
}

function layoutWithThreeRows() {
  const nodes = {}
  const rows = [
    { id: 1, y: 200 },
    { id: 2, y: 480 },
    { id: 3, y: 760 },
  ]
  for (const row of rows) {
    nodes[`sb:${row.id}`] = pos(360, row.y)
    nodes[`sbtxt:${row.id}`] = pos(360 + 228, row.y + 8)
    nodes[`sbimg:${row.id}`] = pos(360 + 228 + 188, row.y + 8)
    nodes[`sbvid:${row.id}`] = pos(360 + 228 + 2 * 188, row.y + 8)
    nodes[`sbaud:${row.id}:dialogue`] = pos(360 + 228 + 3 * 188, row.y + 8)
  }
  return { version: 1, nodes }
}

function episodeWith(boards) {
  return {
    id: 10,
    storyboards: boards,
  }
}

function sb(id, extra = {}) {
  return { id, storyboard_number: id, creation_mode: 'classic', title: `镜${id}`, ...extra }
}

test('mediaNodeIdsForStoryboard covers classic / first-last / universal', () => {
  assert.deepEqual(
    mediaNodeIdsForStoryboard(sb(5), {}),
    ['sbtxt:5', 'sbimg:5', 'sbvid:5', 'sbaud:5:dialogue'],
  )
  assert.deepEqual(
    mediaNodeIdsForStoryboard(sb(5), { useFirstLastFrame: true }),
    ['sbtxt:5', 'sbimg-first:5', 'sbimg-last:5', 'sbvid:5', 'sbaud:5:dialogue'],
  )
  assert.deepEqual(
    mediaNodeIdsForStoryboard(sb(5, { creation_mode: 'universal' })),
    ['sbuni:5', 'sbvid:5', 'sbaud:5:dialogue'],
  )
})

test('rowOffsets match adapter MEDIA_OFFSET_X / MEDIA_GAP_X', () => {
  const off = rowOffsets(sb(1))
  assert.equal(off['sbtxt:1'].x, 228)
  assert.equal(off['sbimg:1'].x, 228 + 188)
  assert.equal(off['sbvid:1'].y, 8)
})

test('insert before shot 2 shifts later rows by SB_GAP_Y and places new row at old Y', () => {
  const layout = layoutWithThreeRows()
  const newSb = sb(99, { storyboard_number: 2 })
  const episode = episodeWith([
    sb(1, { storyboard_number: 1 }),
    newSb,
    sb(2, { storyboard_number: 3 }),
    sb(3, { storyboard_number: 4 }),
  ])
  const next = insertStoryboardLayout(layout, episode, newSb, 1, {})
  assert.equal(next.nodes['sb:99'].y, 480)
  assert.equal(next.nodes['sb:99'].x, 360)
  assert.equal(next.nodes['sb:1'].y, 200)
  assert.equal(next.nodes['sbimg:1'].y, 208)
  assert.equal(next.nodes['sb:2'].y, 480 + SB_GAP_Y)
  assert.equal(next.nodes['sbimg:2'].y, 488 + SB_GAP_Y)
  assert.equal(next.nodes['sb:3'].y, 760 + SB_GAP_Y)
  assert.equal(next.nodes['sbimg:3'].y, 768 + SB_GAP_Y)
  for (const id of ['sbtxt:99', 'sbimg:99', 'sbvid:99', 'sbaud:99:dialogue']) {
    assert.ok(next.nodes[id], `missing ${id}`)
    assert.equal(next.nodes[id].y, 480 + 8)
  }
})

test('insert writes first-last media ids', () => {
  const layout = layoutWithThreeRows()
  const newSb = sb(99)
  const episode = episodeWith([sb(1), newSb, sb(2), sb(3)])
  const next = insertStoryboardLayout(layout, episode, newSb, 1, { useFirstLastFrame: true })
  assert.ok(next.nodes['sbimg-first:99'])
  assert.ok(next.nodes['sbimg-last:99'])
  assert.equal(next.nodes['sbimg:99'], undefined)
})

test('insert writes universal media ids', () => {
  const layout = layoutWithThreeRows()
  const newSb = sb(99, { creation_mode: 'universal' })
  const episode = episodeWith([sb(1), newSb, sb(2), sb(3)])
  const next = insertStoryboardLayout(layout, episode, newSb, 1, {})
  assert.ok(next.nodes['sbuni:99'])
  assert.ok(next.nodes['sbvid:99'])
  assert.equal(next.nodes['sbtxt:99'], undefined)
  assert.equal(next.nodes['sbimg:99'], undefined)
})

test('append places new row SB_GAP_Y below last saved sb', () => {
  const layout = layoutWithThreeRows()
  const newSb = sb(6, { storyboard_number: 4 })
  const episode = episodeWith([sb(1), sb(2), sb(3), newSb])
  const next = insertStoryboardLayout(layout, episode, newSb, 3, {})
  assert.equal(next.nodes['sb:6'].y, 760 + SB_GAP_Y)
  assert.equal(next.nodes['sb:1'].y, 200)
  assert.equal(next.nodes['sb:3'].y, 760)
})

test('remove drops all keys for that id and leaves others', () => {
  const layout = layoutWithThreeRows()
  const next = removeStoryboardLayout(layout, 2)
  for (const key of classicIds(2)) {
    assert.equal(next.nodes[key], undefined)
  }
  assert.equal(next.nodes['sb:1'].y, 200)
  assert.equal(next.nodes['sbimg:1'].x, layout.nodes['sbimg:1'].x)
  assert.equal(next.nodes['sb:3'].y, 760)
  assert.equal(next.nodes['sbimg:3'].y, 768)
})

test('empty layout is left untouched (no coordinates written)', () => {
  const empty = { version: 1, nodes: {} }
  const newSb = sb(99)
  const episode = episodeWith([sb(1), newSb])
  const next = insertStoryboardLayout(empty, episode, newSb, 1, {})
  assert.deepEqual(next.nodes, {})
  assert.equal(insertStoryboardLayout(null, episode, newSb, 0, {}), null)
})

test('layout without this episode sb nodes is not written', () => {
  const layout = { version: 1, nodes: { 'char:1': pos(48, 80) } }
  const newSb = sb(99)
  const episode = episodeWith([newSb])
  const next = insertStoryboardLayout(layout, episode, newSb, 0, {})
  assert.equal(next.nodes['sb:99'], undefined)
  assert.deepEqual(next.nodes['char:1'], pos(48, 80))
})

test('swapStoryboardLayoutRows exchanges Y and keeps X', () => {
  const layout = layoutWithThreeRows()
  const next = swapStoryboardLayoutRows(layout, 1, 3)
  assert.equal(next.nodes['sb:1'].y, 760)
  assert.equal(next.nodes['sb:1'].x, 360)
  assert.equal(next.nodes['sb:3'].y, 200)
  assert.equal(next.nodes['sbimg:1'].y, 768)
  assert.equal(next.nodes['sbimg:3'].y, 208)
  assert.equal(next.nodes['sb:2'].y, 480)
})
