import { onBeforeUnmount, onMounted, ref } from 'vue'

function isTypingTarget(el) {
  if (!el || typeof el.closest !== 'function') return false
  const tag = (el.tagName || '').toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (el.isContentEditable) return true
  return !!el.closest('.el-input, .el-textarea, .el-select, .el-message-box, [contenteditable="true"]')
}

/**
 * 画布快捷键。输入框聚焦时不触发。
 */
export function useCanvasShortcuts(handlers) {
  const spaceHeld = ref(false)
  const helpOpen = ref(false)

  function onKeyDown(e) {
    if (e.repeat && e.code !== 'Space') return
    if (isTypingTarget(e.target)) return
    const key = e.key
    const code = e.code
    const mod = e.ctrlKey || e.metaKey

    if (mod && key.toLowerCase() === 's') {
      e.preventDefault()
      handlers.save?.()
      return
    }
    if (mod && e.shiftKey && key.toLowerCase() === 'z') {
      e.preventDefault()
      handlers.redo?.()
      return
    }
    if (mod && key.toLowerCase() === 'z') {
      e.preventDefault()
      handlers.undo?.()
      return
    }

    if (key === 'Escape') {
      e.preventDefault()
      helpOpen.value = false
      handlers.escape?.()
      return
    }
    if (key === '?' || (e.shiftKey && key === '/')) {
      e.preventDefault()
      helpOpen.value = !helpOpen.value
      return
    }
    if (key === 'F' || key === 'f' || key === '1') {
      e.preventDefault()
      handlers.fitView?.()
      return
    }
    if (key === '0') {
      e.preventDefault()
      handlers.zoomTo100?.()
      return
    }
    if (key === '+' || key === '=' || code === 'NumpadAdd') {
      e.preventDefault()
      handlers.zoomIn?.()
      return
    }
    if (key === '-' || key === '_' || code === 'NumpadSubtract') {
      e.preventDefault()
      handlers.zoomOut?.()
      return
    }
    if (key === 'Delete' || key === 'Backspace') {
      e.preventDefault()
      handlers.deleteFocused?.()
      return
    }
    if (code === 'Space') {
      e.preventDefault()
      spaceHeld.value = true
    }
  }

  function onKeyUp(e) {
    if (e.code === 'Space') spaceHeld.value = false
  }

  function onBlur() {
    spaceHeld.value = false
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onBlur)
  })

  return { spaceHeld, helpOpen }
}

export const CANVAS_SHORTCUT_ROWS = [
  { keys: 'Esc', desc: '关闭 Inspector / 菜单 / 框选' },
  { keys: 'F / 1', desc: '适应画布' },
  { keys: '0', desc: '缩放到 100%' },
  { keys: '+ / -', desc: '放大 / 缩小' },
  { keys: 'Delete', desc: '删除当前焦点分镜' },
  { keys: 'Space + 拖拽', desc: '平移画布' },
  { keys: 'Ctrl+S', desc: '立即保存布局' },
  { keys: 'Ctrl+Z', desc: '撤销布局' },
  { keys: 'Ctrl+Shift+Z', desc: '重做布局' },
]
