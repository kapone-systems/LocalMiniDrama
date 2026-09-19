const MAX_STACK = 30

function cloneSnapshot(nodes, viewport) {
  const positions = {}
  for (const node of nodes || []) {
    if (!node?.id || !node.position) continue
    positions[node.id] = { x: node.position.x, y: node.position.y }
  }
  return {
    nodes: positions,
    viewport: {
      x: Number(viewport?.x) || 0,
      y: Number(viewport?.y) || 0,
      zoom: Number(viewport?.zoom) || 0.75,
    },
  }
}

/**
 * 只撤销坐标与视口（最多 30 步）。
 */
export function createCanvasLayoutHistory() {
  const undoStack = []
  const redoStack = []

  function push(nodes, viewport) {
    undoStack.push(cloneSnapshot(nodes, viewport))
    if (undoStack.length > MAX_STACK) undoStack.shift()
    redoStack.length = 0
  }

  function undo() {
    if (!undoStack.length) return null
    return undoStack.pop()
  }

  function takeUndoAndRememberCurrent(nodes, viewport) {
    if (!undoStack.length) return null
    const prev = undoStack.pop()
    redoStack.push(cloneSnapshot(nodes, viewport))
    return prev
  }

  function takeRedoAndRememberCurrent(nodes, viewport) {
    if (!redoStack.length) return null
    const next = redoStack.pop()
    undoStack.push(cloneSnapshot(nodes, viewport))
    return next
  }

  function canUndo() {
    return undoStack.length > 0
  }

  function canRedo() {
    return redoStack.length > 0
  }

  return { push, undo, takeUndoAndRememberCurrent, takeRedoAndRememberCurrent, canUndo, canRedo }
}
