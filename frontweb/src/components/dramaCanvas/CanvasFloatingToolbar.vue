<template>
  <div class="canvas-fab nodrag nopan">
    <el-popover placement="top-start" :width="220" trigger="click">
      <template #reference>
        <button type="button" class="fab-btn" title="快速新建">+</button>
      </template>
      <div class="fab-menu">
        <el-button size="small" @click="create('storyboard')">分镜</el-button>
        <el-button size="small" @click="create('character')">角色</el-button>
        <el-button size="small" @click="create('scene')">场景</el-button>
        <el-button size="small" @click="create('prop')">道具</el-button>
        <el-button size="small" @click="create('episode')">集</el-button>
      </div>
    </el-popover>
  </div>
</template>

<script setup>
import { useCanvasContext } from '@/composables/useCanvasContext'

const ctx = useCanvasContext()

function create(type) {
  ctx?.openCreateDialog?.(type)
}
</script>

<style scoped>
.canvas-fab {
  position: absolute;
  left: 12px;
  bottom: 12px;
  z-index: 10;
}
.fab-btn {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  border: 1px solid #3f3f46;
  background: rgba(24, 24, 27, 0.94);
  color: #fafafa;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}
.fab-menu {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
