<template>
  <div class="drama-canvas-page">
    <AppHeader subtitle="画布模式" :sticky="false" :logo-click="() => router.push('/')">
      <template #center>
        <span class="breadcrumb-sep">›</span>
        <span class="page-title">{{ drama?.title || '加载中…' }}</span>

        <el-select
          v-model="filterEpisodeId"
          class="episode-select"
          placeholder="全部集数"
          clearable
          size="small"
          style="width: 150px"
        >
          <el-option
            v-for="ep in (drama?.episodes || [])"
            :key="ep.id"
            :label="ep.title || '第' + (ep.episode_number || 0) + '集'"
            :value="ep.id"
          />
        </el-select>

        <span v-if="layoutSaveState === 'saving'" class="layout-status saving">保存中…</span>
        <span v-else-if="layoutSaveState === 'saved'" class="layout-status saved">已保存</span>
        <span v-else-if="layoutSaveState === 'error'" class="layout-status error">保存失败</span>
        <span v-if="selectedStoryboardIds.length" class="wf-hint">已选 {{ selectedStoryboardIds.length }} 个分镜</span>
      </template>

      <template #actions>
        <el-button size="small" type="warning" plain @click="focusScriptNode">剧本</el-button>
        <el-dropdown trigger="click" @command="openCreateDialog">
          <el-button size="small">
            新建
            <el-icon class="el-icon--right"><Plus /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="storyboard">分镜</el-dropdown-item>
              <el-dropdown-item command="character">角色</el-dropdown-item>
              <el-dropdown-item command="scene">场景</el-dropdown-item>
              <el-dropdown-item command="prop">道具</el-dropdown-item>
              <el-dropdown-item command="episode">集</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button size="small" :loading="aligningNodes" @click="onAlignNodes">
          <el-icon><Grid /></el-icon>
          对齐节点
        </el-button>
        <el-button size="small" :disabled="!filterEpisodeId" @click="onMergeEpisode">合成本集</el-button>
        <el-button size="small" @click="toolsDrawerOpen = !toolsDrawerOpen">
          生成 / 工作流
        </el-button>
        <el-button type="primary" plain @click="goListMode">
          <el-icon><List /></el-icon>
          列表模式
        </el-button>
      </template>

      <div v-show="toolsDrawerOpen" class="canvas-tools-drawer">
        <div class="workflow-bar">
          <span class="wf-hint">已选 {{ selectedStoryboardIds.length }} 个分镜</span>
          <el-checkbox-group v-model="pipelineSteps" size="small" class="wf-steps">
            <el-checkbox value="image">生图</el-checkbox>
            <el-checkbox value="video">生视频</el-checkbox>
            <el-checkbox value="audio">配音</el-checkbox>
          </el-checkbox-group>
          <el-checkbox v-model="skipExisting" size="small">跳过已有</el-checkbox>
          <el-checkbox v-model="continueOnError" size="small">失败后继续</el-checkbox>
          <el-checkbox v-model="linkTailFrames" size="small">按镜序衔接首帧</el-checkbox>
          <span class="wf-hint">并发</span>
          <el-input-number v-model="runConcurrency" size="small" :min="1" :max="4" :disabled="linkTailFrames" style="width: 90px" />
          <el-button size="small" :disabled="selectedStoryboardIds.length === 0" @click="onCreateWorkflowGroup">
            创建工作流
          </el-button>
          <el-select
            v-model="activeGroupId"
            size="small"
            placeholder="选择工作流"
            clearable
            style="width: 160px"
          >
            <el-option
              v-for="g in workflowGroups"
              :key="g.id"
              :label="`${g.title} (${(g.storyboard_ids || []).length}镜)`"
              :value="g.id"
            />
          </el-select>
          <el-button
            size="small"
            type="primary"
            :loading="workflowRunning"
            :disabled="!activeGroupId"
            @click="onRunActiveGroup"
          >
            整组重跑
          </el-button>
          <el-button size="small" :disabled="!workflowRunning" @click="stopRun">停止</el-button>
          <el-button size="small" :disabled="!failedItems.length" @click="onRetryFailed">只重跑失败</el-button>
          <el-button size="small" type="danger" plain :disabled="!activeGroupId" @click="onDeleteActiveGroup">
            删除工作流
          </el-button>
        </div>

        <div v-if="progressLabel" class="workflow-progress">
          {{ progressLabel }}
          <button
            v-for="item in failedItems"
            :key="item.storyboardId"
            type="button"
            class="fail-chip"
            @click="locateFailed(item)"
          >
            #{{ item.number || item.storyboardId }} 失败
          </button>
        </div>

        <div class="generate-bar">
          <span class="gen-label">本集生成</span>
          <el-button
            size="small"
            type="primary"
            :loading="episodeGenerating"
            :disabled="!filterEpisodeId || workflowRunning"
            @click="aiGenerateStoryboards"
          >
            AI 生成分镜
          </el-button>
          <el-button
            size="small"
            :loading="episodeGenerating"
            :disabled="!filterEpisodeId || workflowRunning"
            @click="batchGenerateImages"
          >
            批量生图
          </el-button>
          <el-button
            size="small"
            :loading="episodeGenerating"
            :disabled="!filterEpisodeId || workflowRunning"
            @click="batchGenerateVideos"
          >
            批量生视频
          </el-button>
          <el-button size="small" :disabled="!filterEpisodeId" @click="onMergeEpisode">合成本集</el-button>
          <span class="gen-hint" title="完整创作流水线">剧本 → 提取角色/场景/道具 → 分镜 → 生图 → 视频</span>
        </div>
        <div v-if="episodeGenProgress" class="workflow-progress episode-gen">{{ episodeGenProgress }}</div>
        <div v-if="mergeProgress" class="workflow-progress">{{ mergeProgress }}</div>
      </div>
    </AppHeader>

    <div v-loading="loading" class="canvas-shell">
      <aside v-if="drama" class="canvas-sidebar" :class="{ collapsed: sidebarCollapsed }">
        <button type="button" class="sidebar-toggle" :title="sidebarCollapsed ? '展开侧栏' : '折叠侧栏'" @click="sidebarCollapsed = !sidebarCollapsed">
          {{ sidebarCollapsed ? '›' : '‹' }}
        </button>
        <div v-show="!sidebarCollapsed">
          <div class="sidebar-section sidebar-script">
            <div class="sec-label sec-label-row">
              <span>📜 剧本</span>
              <el-button link size="small" type="warning" @click="focusScriptNode">编辑</el-button>
            </div>
            <p class="sidebar-script-tip">从头创作：先写剧本，再提取左侧素材</p>
          </div>
          <div class="sidebar-title">
            素材库
            <el-button v-if="highlightAssetId" link size="small" @click="clearAssetHighlight">清除</el-button>
          </div>
          <div class="sidebar-section">
            <div class="sec-label sec-label-row">
              <span>角色 {{ (drama.characters || []).length }}</span>
              <el-button link size="small" type="primary" @click="openCreateDialog('character')">+</el-button>
            </div>
            <div
              v-for="c in (drama.characters || [])"
              :key="'c-' + c.id"
              class="sidebar-item"
              :class="{ active: highlightAssetId === 'char:' + c.id }"
              @click="selectSidebarAsset('char:' + c.id)"
            >
              {{ c.name || '未命名' }}
            </div>
          </div>
          <div class="sidebar-section">
            <div class="sec-label sec-label-row">
              <span>场景 {{ (drama.scenes || []).length }}</span>
              <el-button link size="small" type="primary" @click="openCreateDialog('scene')">+</el-button>
            </div>
            <div
              v-for="s in (drama.scenes || [])"
              :key="'s-' + s.id"
              class="sidebar-item"
              :class="{ active: highlightAssetId === 'scene:' + s.id }"
              @click="selectSidebarAsset('scene:' + s.id)"
            >
              {{ s.location || '未命名' }}
            </div>
          </div>
          <div class="sidebar-section">
            <div class="sec-label sec-label-row">
              <span>道具 {{ (drama.props || []).length }}</span>
              <el-button link size="small" type="primary" @click="openCreateDialog('prop')">+</el-button>
            </div>
            <div
              v-for="p in (drama.props || [])"
              :key="'p-' + p.id"
              class="sidebar-item"
              :class="{ active: highlightAssetId === 'prop:' + p.id }"
              @click="selectSidebarAsset('prop:' + p.id)"
            >
              {{ p.name || '未命名' }}
            </div>
          </div>

          <div class="sidebar-section workflow-list">
            <div class="sec-label">工作流 {{ workflowGroups.length }}</div>
            <div
              v-for="g in workflowGroups"
              :key="g.id"
              class="sidebar-item workflow-item"
              :class="{ active: activeGroupId === g.id }"
              @click="activeGroupId = g.id"
            >
              <div class="wf-item-title">{{ g.title }}</div>
              <div class="wf-item-meta">{{ (g.storyboard_ids || []).length }} 镜 · {{ (g.pipeline || []).join('→') }}</div>
            </div>
            <div v-if="!workflowGroups.length" class="sidebar-empty">框选分镜后点「创建工作流」</div>
          </div>
        </div>
      </aside>

      <div class="canvas-center">
        <div ref="canvasMainRef" class="canvas-main">
          <VueFlow
            v-if="nodes.length"
            v-model:nodes="nodes"
            v-model:edges="edges"
            :node-types="nodeTypes"
            :default-viewport="initialViewport"
            :min-zoom="CANVAS_MIN_ZOOM"
            :max-zoom="CANVAS_MAX_ZOOM"
            :nodes-connectable="false"
            :elements-selectable="true"
            :selection-key-code="spaceHeld ? false : true"
            :pan-on-drag="spaceHeld ? [0, 1, 2] : [1, 2]"
            :pan-on-scroll="false"
            :zoom-on-scroll="true"
            :zoom-on-pinch="true"
            :only-render-visible-elements="true"
            :fit-view-on-init="!hasSavedViewport"
            class="vue-flow-canvas"
            @node-double-click="onNodeDoubleClick"
            @node-click="onNodeClick"
            @pane-click="onPaneClick"
            @pane-context-menu="onPaneContextMenu"
            @node-context-menu="onNodeContextMenu"
            @node-drag-start="onNodeDragStart"
            @node-drag-stop="scheduleLayoutSave"
            @viewport-change="onViewportChange"
            @move-end="scheduleLayoutSave"
            @selection-change="onSelectionChange"
          >
            <CanvasFlowAligner />
            <CanvasZoomControls />
            <Background pattern-color="#3f3f46" :gap="20" />
            <div
              class="canvas-minimap"
              :class="{ expanded: minimapExpanded }"
              @mouseenter="minimapExpanded = true"
              @mouseleave="minimapExpanded = false"
              @click="minimapExpanded = true"
            >
              <MiniMap pannable zoomable />
            </div>
          </VueFlow>
          <el-empty v-else-if="!loading" description="暂无画布数据" />
          <CanvasFloatingToolbar v-if="drama && nodes.length" />
        </div>
        <CanvasLightbox
          :open="lightboxOpen"
          :cells="lightboxCells"
          :focused-sb-id="focusedStoryboardId"
          @close="lightboxUserClosed = true"
          @select="onLightboxSelect"
        />
      </div>

      <CanvasInspector :node="focusedFlowNode" />
    </div>

    <CanvasCreateDialog
      v-model="createDialogVisible"
      :type="createDialogType"
      :episodes="drama?.episodes || []"
      :need-episode-select="needCreateEpisodeSelect"
      :on-submit="onCreateSubmit"
    />
    <CanvasContextMenu
      :visible="contextMenuVisible"
      :x="contextMenuX"
      :y="contextMenuY"
      :mode="contextMenuMode"
      @select="onContextMenuSelect"
      @close="closeContextMenu"
    />
    <CanvasHelpOverlay :open="helpOpen" @close="helpOpen = false" />
  </div>
</template>

<script setup>
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { VueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { MiniMap } from '@vue-flow/minimap'
import { List, Plus, Grid } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/minimap/dist/style.css'

import { dramaAPI } from '@/api/drama'
import { taskAPI } from '@/api/task'
import { useFilmStore } from '@/stores/film'
import { useDramaMutations } from '@/composables/useDramaMutations'
import AppHeader from '@/components/AppHeader.vue'
import { runImageStep, runVideoStep, runAudioStep } from '@/composables/useCanvasWorkflowRunner'
import { CANVAS_CONTEXT_KEY } from '@/composables/useCanvasContext'
import { useCanvasStoryboardMedia } from '@/composables/useCanvasStoryboardMedia'
import { useCanvasCrud } from '@/composables/useCanvasCrud'
import { useCanvasEpisodeGenerate } from '@/composables/useCanvasEpisodeGenerate'
import { useCanvasScript, scriptNodeId } from '@/composables/useCanvasScript'
import { createCanvasNodeStatusStore } from '@/composables/useCanvasNodeStatus'
import { useCanvasShortcuts } from '@/composables/useCanvasShortcuts'
import { createCanvasLayoutHistory } from '@/composables/useCanvasLayoutHistory'
import { useCanvasWorkflowExecution } from '@/composables/useCanvasWorkflowExecution'
import {
  applyCanvasHighlight,
  buildDramaCanvasGraph,
  computeAutoLayoutPositions,
  getStoryboardRefFromNode,
  stampEdgeBaseStyles,
} from '@/utils/dramaCanvasAdapter'
import {
  CANVAS_MAX_ZOOM,
  CANVAS_MIN_ZOOM,
  buildCanvasLayoutPayload,
  parseCanvasLayout,
  parseDramaMetadata,
  resolveViewport,
} from '@/utils/canvasLayout'
import {
  createWorkflowGroup,
  deleteWorkflowGroup,
  findStoryboardInDrama,
  normalizePipeline,
  parseWorkflowGroups,
  storyboardIdFromNodeId,
  getDramaGenerationOptions,
} from '@/utils/canvasWorkflow'
import {
  dramaUsesFirstLastFrame,
  hasStoryboardImage,
  hasStoryboardVideo,
  imageRecordUrl,
  resolveSbFirstImageRecord,
  resolveSbMainImageRecord,
  videoRecordUrl,
  resolveSbVideoRecord,
} from '@/utils/storyboardMedia'
import { storyboardImageUrl, storyboardVideoUrl } from '@/utils/mediaUrl'
import { CANVAS_NODE_STATUS_LABELS } from '@/composables/useCanvasNodeStatus'

import CanvasLabelNode from '@/components/dramaCanvas/CanvasLabelNode.vue'
import CanvasDramaHeaderNode from '@/components/dramaCanvas/CanvasDramaHeaderNode.vue'
import CanvasAssetNode from '@/components/dramaCanvas/CanvasAssetNode.vue'
import CanvasEpisodeNode from '@/components/dramaCanvas/CanvasEpisodeNode.vue'
import CanvasScriptNode from '@/components/dramaCanvas/CanvasScriptNode.vue'
import CanvasStoryboardNode from '@/components/dramaCanvas/CanvasStoryboardNode.vue'
import CanvasMediaNode from '@/components/dramaCanvas/CanvasMediaNode.vue'
import CanvasCreateDialog from '@/components/dramaCanvas/CanvasCreateDialog.vue'
import CanvasContextMenu from '@/components/dramaCanvas/CanvasContextMenu.vue'
import CanvasAddButtonNode from '@/components/dramaCanvas/CanvasAddButtonNode.vue'
import CanvasFloatingToolbar from '@/components/dramaCanvas/CanvasFloatingToolbar.vue'
import CanvasFlowAligner from '@/components/dramaCanvas/CanvasFlowAligner.vue'
import CanvasZoomControls from '@/components/dramaCanvas/CanvasZoomControls.vue'
import CanvasInspector from '@/components/dramaCanvas/CanvasInspector.vue'
import CanvasLightbox from '@/components/dramaCanvas/CanvasLightbox.vue'
import CanvasHelpOverlay from '@/components/dramaCanvas/CanvasHelpOverlay.vue'
import CanvasGroupFrameNode from '@/components/dramaCanvas/CanvasGroupFrameNode.vue'

const route = useRoute()
const router = useRouter()
const store = useFilmStore()
const { drama } = storeToRefs(store)
const mutations = useDramaMutations()
const { imagesBySbId, videosBySbId, loadForDrama } = useCanvasStoryboardMedia()

const loading = ref(false)
const nodes = ref([])
const edges = ref([])
const filterEpisodeId = ref(null)
const highlightAssetId = ref(null)
const layoutCache = ref(null)
const workflowGroups = ref([])
const activeGroupId = ref(null)
const selectedStoryboardIds = ref([])
const pipelineSteps = ref(['image', 'video', 'audio'])
const skipExisting = ref(true)
const continueOnError = ref(true)
const linkTailFrames = ref(false)
const runConcurrency = ref(2)
const layoutSaveState = ref('idle')
const layoutDirty = ref(false)
const currentViewport = ref({ x: 0, y: 0, zoom: 0.75 })
const focusedNodeId = ref(null)
const canvasMainRef = ref(null)
const contextMenuVisible = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)
const contextMenuFlowPos = ref(null)
const contextMenuMode = ref('pane')
const contextMenuStoryboard = ref(null)
const paneClickSuppressed = ref(false)
const nodeStatus = createCanvasNodeStatusStore()
const aligningNodes = ref(false)
const canvasFlowApi = ref(null)
const toolsDrawerOpen = ref(false)
const sidebarCollapsed = ref(false)
const minimapExpanded = ref(false)
const lightboxUserClosed = ref(false)
const expandedEpisodeId = ref(null)
const flashNodeIds = ref([])
const mergeProgress = ref('')
const layoutHistory = createCanvasLayoutHistory()

const PANEL_NODE_TYPES = new Set(['canvasStoryboard', 'canvasMedia', 'canvasAsset', 'canvasScript'])

let saveTimer = null
let savedHintTimer = null
let pollTimer = null
let paneClickSuppressTimer = null
let flashTimer = null
let rightDrag = null

const nodeTypes = {
  canvasLabel: markRaw(CanvasLabelNode),
  canvasDramaHeader: markRaw(CanvasDramaHeaderNode),
  canvasAsset: markRaw(CanvasAssetNode),
  canvasEpisode: markRaw(CanvasEpisodeNode),
  canvasScript: markRaw(CanvasScriptNode),
  canvasStoryboard: markRaw(CanvasStoryboardNode),
  canvasMedia: markRaw(CanvasMediaNode),
  canvasAddButton: markRaw(CanvasAddButtonNode),
  canvasGroupFrame: markRaw(CanvasGroupFrameNode),
}

const dramaId = computed(() => Number(route.params.id))
const savedLayout = computed(() => layoutCache.value || parseCanvasLayout(drama.value?.metadata))
const initialViewport = computed(() => {
  const v = resolveViewport(savedLayout.value)
  return { x: v.x, y: v.y, zoom: v.zoom }
})
const hasSavedViewport = computed(() => Boolean(savedLayout.value?.viewport))
const focusedFlowNode = computed(() => nodes.value.find((n) => n.id === focusedNodeId.value) || null)
const focusedStoryboardId = computed(() => {
  const n = focusedFlowNode.value
  return n?.data?.storyboard?.id || null
})
const lightboxOpen = computed(() => !!filterEpisodeId.value && !lightboxUserClosed.value)
const lightboxCells = computed(() => {
  if (!filterEpisodeId.value || !drama.value) return []
  const ep = (drama.value.episodes || []).find((e) => e.id === filterEpisodeId.value)
  const boards = [...(ep?.storyboards || [])].sort((a, b) => (a.storyboard_number || 0) - (b.storyboard_number || 0))
  return boards.map((sb) => {
    const useFL = dramaUsesFirstLastFrame(drama.value) && sb.creation_mode !== 'universal'
    const img = useFL
      ? imageRecordUrl(resolveSbFirstImageRecord(sb, imagesBySbId.value))
      : (imageRecordUrl(resolveSbMainImageRecord(sb, imagesBySbId.value)) || storyboardImageUrl(sb))
    const vid = videoRecordUrl(resolveSbVideoRecord(sb, videosBySbId.value)) || storyboardVideoUrl(sb)
    return {
      id: sb.id,
      storyboardId: sb.id,
      number: sb.storyboard_number,
      duration: sb.duration || 5,
      imageUrl: img,
      videoUrl: vid,
      empty: !img,
    }
  })
})

const {
  workflowRunning,
  workflowProgress,
  progressLabel,
  failedItems,
  startRun,
  stopRun,
  resumeIfNeeded,
  locateFailed,
  stopPoll: stopWorkflowPoll,
} = useCanvasWorkflowExecution({
  drama,
  dramaId,
  nodeStatus,
  refreshCanvas: (...args) => refreshCanvas(...args),
  locateStoryboard: (sbId) => locateStoryboard(sbId),
})

function syncWorkflowFromDrama() {
  workflowGroups.value = parseWorkflowGroups(drama.value?.metadata)
  if (activeGroupId.value && !workflowGroups.value.some((g) => g.id === activeGroupId.value)) {
    activeGroupId.value = null
  }
}

function rebuildGraph() {
  if (!drama.value) {
    nodes.value = []
    edges.value = []
    return
  }
  const allEps = drama.value.episodes || []
  let collapsedEpisodeIds = []
  if (!filterEpisodeId.value && allEps.length > 1) {
    const keep = expandedEpisodeId.value || allEps[0]?.id
    collapsedEpisodeIds = allEps.filter((ep) => ep.id !== keep).map((ep) => ep.id)
  }
  const graph = buildDramaCanvasGraph(drama.value, {
    episodeId: filterEpisodeId.value,
    savedLayout: savedLayout.value,
    workflowGroups: workflowGroups.value,
    imagesBySbId: imagesBySbId.value,
    videosBySbId: videosBySbId.value,
    collapsedEpisodeIds,
  })
  let nextNodes = graph.nodes
  let nextEdges = stampEdgeBaseStyles(graph.edges)
  if (highlightAssetId.value) {
    const highlighted = applyCanvasHighlight(nextNodes, nextEdges, highlightAssetId.value, drama.value)
    nextNodes = highlighted.nodes
    nextEdges = highlighted.edges
  }
  nodes.value = nextNodes
  edges.value = nextEdges
}

function applyHighlight() {
  if (!nodes.value.length) return
  const highlighted = applyCanvasHighlight(
    nodes.value.map((n) => ({ ...n, class: undefined, data: { ...n.data, highlighted: false, dimmed: false } })),
    edges.value,
    highlightAssetId.value,
    drama.value,
  )
  nodes.value = highlighted.nodes
  edges.value = highlighted.edges
}

function selectSidebarAsset(assetNodeId) {
  highlightAssetId.value = highlightAssetId.value === assetNodeId ? null : assetNodeId
  applyHighlight()
}

function setHighlightAsset(assetNodeId) {
  highlightAssetId.value = assetNodeId
  applyHighlight()
}

async function refreshLocal(preserveFocus = true) {
  const keepId = preserveFocus ? focusedNodeId.value : null
  layoutCache.value = parseCanvasLayout(drama.value?.metadata) || layoutCache.value
  syncWorkflowFromDrama()
  rebuildGraph()
  if (keepId) focusedNodeId.value = keepId
}

async function refreshDrama(preserveFocus = true) {
  const keepId = preserveFocus ? focusedNodeId.value : null
  await store.loadDrama(dramaId.value)
  await loadForDrama(drama.value, filterEpisodeId.value)
  await refreshLocal(false)
  if (keepId) focusedNodeId.value = keepId
}

async function refreshCanvas(preserveFocus = true) {
  await refreshDrama(preserveFocus)
}

function suppressPaneClick(ms = 350) {
  paneClickSuppressed.value = true
  if (paneClickSuppressTimer) clearTimeout(paneClickSuppressTimer)
  paneClickSuppressTimer = setTimeout(() => {
    paneClickSuppressed.value = false
    paneClickSuppressTimer = null
  }, ms)
}

function screenToFlowPosition(clientX, clientY) {
  const el = canvasMainRef.value
  if (!el) return null
  const rect = el.getBoundingClientRect()
  const vp = currentViewport.value
  return {
    x: (clientX - rect.left - vp.x) / vp.zoom,
    y: (clientY - rect.top - vp.y) / vp.zoom,
  }
}

function onPanePointerDownCapture(event) {
  if (event.button !== 2) return
  if (contextMenuVisible.value) closeContextMenu()
  rightDrag = { x: event.clientX, y: event.clientY, moved: false }
}

function onWindowPointerMove(event) {
  if (!rightDrag) return
  if (Math.hypot(event.clientX - rightDrag.x, event.clientY - rightDrag.y) > 4) {
    rightDrag.moved = true
  }
}

function onWindowPointerUp() {
  setTimeout(() => { rightDrag = null }, 0)
}

function onPaneContextMenu(payload) {
  const event = payload?.event || payload
  if (event?.preventDefault) event.preventDefault()
  if (rightDrag?.moved) return
  const flowPos = payload?.flowPosition || screenToFlowPosition(event.clientX, event.clientY)
  contextMenuFlowPos.value = flowPos
  contextMenuX.value = event.clientX
  contextMenuY.value = event.clientY
  contextMenuMode.value = 'pane'
  contextMenuStoryboard.value = null
  contextMenuVisible.value = true
}

function closeContextMenu() {
  contextMenuVisible.value = false
  contextMenuFlowPos.value = null
  contextMenuStoryboard.value = null
  contextMenuMode.value = 'pane'
}

function onNodeContextMenu({ event, node }) {
  const ev = event?.event || event
  if (ev?.preventDefault) ev.preventDefault()
  if (node?.type !== 'canvasStoryboard' || !node.data?.storyboard) return
  contextMenuMode.value = 'storyboard'
  contextMenuStoryboard.value = node.data.storyboard
  contextMenuFlowPos.value = null
  contextMenuX.value = ev.clientX
  contextMenuY.value = ev.clientY
  contextMenuVisible.value = true
}

async function onContextMenuSelect(type) {
  if (type === 'insert-before' && contextMenuStoryboard.value) {
    try {
      const sb = await mutations.insertStoryboardBefore(contextMenuStoryboard.value)
      await refreshLocal()
      if (sb?.id) focusedNodeId.value = `sb:${sb.id}`
      ElMessage.success('已在前方插入分镜')
    } catch (e) {
      ElMessage.error(e?.message || '插入失败')
    }
    closeContextMenu()
    return
  }
  if (type === 'insert-after' && contextMenuStoryboard.value) {
    try {
      const found = findStoryboardInDrama(drama.value, contextMenuStoryboard.value.id)
      const boards = [...(found?.episode?.storyboards || [])].sort(
        (a, b) => (Number(a.storyboard_number) || 0) - (Number(b.storyboard_number) || 0),
      )
      const idx = boards.findIndex((s) => Number(s.id) === Number(contextMenuStoryboard.value.id))
      const nextSb = idx >= 0 ? boards[idx + 1] : null
      const created = nextSb
        ? await mutations.insertStoryboardBefore(nextSb)
        : await mutations.createStoryboard({ episodeId: found?.episode?.id })
      await refreshLocal()
      if (created?.id) focusedNodeId.value = `sb:${created.id}`
      ElMessage.success('已追加分镜')
    } catch (e) {
      ElMessage.error(e?.message || '追加失败')
    }
    closeContextMenu()
    return
  }
  pendingFlowPosition.value = contextMenuFlowPos.value
  openCreateDialog(type, contextMenuFlowPos.value)
  closeContextMenu()
}

async function onCreateSubmit(form) {
  try {
    await submitCreate(form)
  } catch (e) {
    ElMessage.error(e?.message || '创建失败')
  }
}

function getCanvasGenerationOptions() {
  return {
    ...getDramaGenerationOptions(drama.value),
    imagesBySbId: imagesBySbId.value,
    videosBySbId: videosBySbId.value,
  }
}

function flashNodes(ids) {
  flashNodeIds.value = ids || []
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => { flashNodeIds.value = [] }, 1600)
}

async function generateMediaNode(nodeId, data) {
  const sb = data?.storyboard
  const d = drama.value
  if (!sb || !d) return
  const step = data.kind === 'video' ? 'video' : data.kind === 'audio' ? 'audio' : 'image'
  const msg = CANVAS_NODE_STATUS_LABELS[step] || '处理中…'
  nodeStatus.setBusy(nodeId, { step, message: msg })
  try {
    const genOpts = {
      ...getCanvasGenerationOptions(),
      frameSlot: data.frameKind === 'first' || data.frameKind === 'last' ? data.frameKind : undefined,
    }
    if (step === 'image') await runImageStep(d, sb, genOpts)
    else if (step === 'video') {
      if (sb.creation_mode !== 'universal' && !hasStoryboardImage(sb, imagesBySbId.value, d)) {
        throw new Error(`分镜 #${sb.storyboard_number ?? sb.id} 缺少分镜图，无法生成视频`)
      }
      await runVideoStep(d, sb, genOpts)
    }
    else {
      const res = await runAudioStep(sb)
      if (res?.skipped) {
        ElMessage.info(res.reason || '已跳过')
        nodeStatus.clear(nodeId)
        return
      }
    }
    nodeStatus.setOk(nodeId, { step, message: '完成' })
    ElMessage.success('生成完成')
    await refreshCanvas(true)
  } catch (e) {
    nodeStatus.setError(nodeId, { step, message: e?.message || '失败' })
    ElMessage.error(e?.message || '生成失败')
  }
}

async function reorderWorkflowGroup(groupId, storyboardIds) {
  workflowGroups.value = workflowGroups.value.map((g) => (
    g.id === groupId ? { ...g, storyboard_ids: storyboardIds } : g
  ))
  await persistCanvasState({ groupsOnly: true })
  rebuildGraph()
}

function locateStoryboard(sbId) {
  const nodeId = `sb:${sbId}`
  focusedNodeId.value = nodeId
  const node = nodes.value.find((n) => n.id === nodeId)
  if (node && canvasFlowApi.value?.setCenter) {
    canvasFlowApi.value.setCenter(node.position.x + 100, node.position.y + 60, { duration: 280, zoom: currentViewport.value.zoom })
  }
}

function onLightboxSelect(sbId) {
  locateStoryboard(sbId)
}

const scriptActionsHolder = {}

provide(CANVAS_CONTEXT_KEY, {
  focusedNodeId,
  drama,
  imagesBySbId,
  videosBySbId,
  getGenerationOptions: getCanvasGenerationOptions,
  setFocusedNode: (nodeId) => { focusedNodeId.value = nodeId },
  clearFocusedNode: () => { focusedNodeId.value = null },
  setHighlightAsset,
  refresh: refreshCanvas,
  refreshDrama,
  suppressPaneClick,
  nodeStatus,
  openCreateDialog: (...args) => openCreateDialog(...args),
  scriptActions: scriptActionsHolder,
  currentViewport,
  canvasFlowApi,
  registerCanvasFlowApi: (api) => { canvasFlowApi.value = api },
  generateMediaNode,
  flashNodes,
  flashNodeIds,
  activeGroupId,
  reorderWorkflowGroup,
  runWorkflowById: (id) => {
    activeGroupId.value = id
    onRunActiveGroup()
  },
  openShortcutHelp: () => { helpOpen.value = true },
})

function clearAssetHighlight() {
  highlightAssetId.value = null
  applyHighlight()
}

function onSelectionChange({ nodes: selectedNodes }) {
  selectedStoryboardIds.value = (selectedNodes || [])
    .filter((n) => n.type === 'canvasStoryboard' && n.data?.storyboard?.id)
    .map((n) => n.data.storyboard.id)
}

function onViewportChange(viewport) {
  currentViewport.value = { x: viewport.x, y: viewport.y, zoom: viewport.zoom }
}

function onNodeDragStart() {
  layoutHistory.push(nodes.value, currentViewport.value)
}

function applyLayoutSnapshot(snap) {
  if (!snap) return
  nodes.value = nodes.value.map((n) => {
    const pos = snap.nodes[n.id]
    return pos ? { ...n, position: { x: pos.x, y: pos.y } } : n
  })
  if (snap.viewport && canvasFlowApi.value?.setViewport) {
    canvasFlowApi.value.setViewport(snap.viewport)
    currentViewport.value = { ...snap.viewport }
  }
  layoutCache.value = {
    version: 1,
    nodes: { ...(layoutCache.value?.nodes || {}), ...snap.nodes },
    viewport: snap.viewport,
  }
  scheduleLayoutSave()
}

function undoLayout() {
  const snap = layoutHistory.takeUndoAndRememberCurrent(nodes.value, currentViewport.value)
  applyLayoutSnapshot(snap)
}

function redoLayout() {
  const snap = layoutHistory.takeRedoAndRememberCurrent(nodes.value, currentViewport.value)
  applyLayoutSnapshot(snap)
}

function scheduleLayoutSave() {
  layoutDirty.value = true
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    persistCanvasState({ layoutOnly: true })
  }, 700)
}

async function persistCanvasState({ layoutOnly = false, groupsOnly = false } = {}) {
  if (!dramaId.value) return

  let layoutPayload = null
  if (!groupsOnly) {
    layoutPayload = buildCanvasLayoutPayload(nodes.value, currentViewport.value, layoutCache.value)
    if (layoutOnly && layoutPayload) layoutCache.value = layoutPayload
  }
  const groupsPayload = groupsOnly || !layoutOnly ? workflowGroups.value : undefined

  layoutSaveState.value = 'saving'
  try {
    const updated = await dramaAPI.saveCanvasLayout(dramaId.value, layoutPayload, groupsPayload)
    const meta = parseDramaMetadata(updated.metadata)
    if (meta.canvas_layout) layoutCache.value = meta.canvas_layout
    if (meta.workflow_groups) workflowGroups.value = meta.workflow_groups
    const patch = {}
    if (layoutPayload) patch.canvas_layout = meta.canvas_layout || layoutPayload
    if (groupsPayload !== undefined) patch.workflow_groups = meta.workflow_groups ?? groupsPayload
    if (updated?.updated_at) patch.updated_at = updated.updated_at
    if (Object.keys(patch).length) store.patchMetadata(patch)
    layoutSaveState.value = 'saved'
    layoutDirty.value = false
    if (savedHintTimer) clearTimeout(savedHintTimer)
    savedHintTimer = setTimeout(() => {
      if (layoutSaveState.value === 'saved') layoutSaveState.value = 'idle'
    }, 2000)
  } catch (e) {
    layoutSaveState.value = 'error'
    ElMessage.error(e?.message || '保存失败')
  }
}

const {
  createDialogVisible,
  createDialogType,
  pendingFlowPosition,
  openCreateDialog,
  submitCreate,
} = useCanvasCrud({
  drama,
  filterEpisodeId,
  layoutCache,
  focusedNodeId,
  refreshCanvas,
  persistCanvasState,
  refreshLocal,
})

const needCreateEpisodeSelect = computed(() => {
  const types = ['storyboard', 'character', 'scene', 'prop']
  if (!types.includes(createDialogType.value)) return false
  const eps = drama.value?.episodes || []
  if (eps.length <= 1) return false
  return !filterEpisodeId.value
})

const {
  episodeGenerating,
  episodeGenProgress,
  aiGenerateStoryboards,
  batchGenerateImages,
  batchGenerateVideos,
} = useCanvasEpisodeGenerate({
  drama,
  filterEpisodeId,
  imagesBySbId,
  videosBySbId,
  refreshCanvas,
  nodeStatus,
})

Object.assign(
  scriptActionsHolder,
  useCanvasScript({
    drama,
    dramaId,
    refreshCanvas: refreshDrama,
    nodeStatus,
  }),
)

const { spaceHeld, helpOpen } = useCanvasShortcuts({
  save: () => persistCanvasState({ layoutOnly: true }),
  undo: undoLayout,
  redo: redoLayout,
  escape: () => {
    focusedNodeId.value = null
    closeContextMenu()
    selectedStoryboardIds.value = []
  },
  fitView: () => canvasFlowApi.value?.fitView?.(),
  zoomTo100: () => canvasFlowApi.value?.zoomTo?.(1),
  zoomIn: () => canvasFlowApi.value?.zoomIn?.(),
  zoomOut: () => canvasFlowApi.value?.zoomOut?.(),
  deleteFocused: () => deleteFocusedStoryboard(),
})

async function deleteFocusedStoryboard() {
  const node = focusedFlowNode.value
  const sb = node?.data?.storyboard
  if (!sb?.id) return
  try {
    await ElMessageBox.confirm('确定删除该分镜？此操作不可恢复。', '删除分镜', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    await mutations.deleteStoryboard(sb.id)
    focusedNodeId.value = null
    ElMessage.success('分镜已删除')
    await refreshLocal()
  } catch (e) {
    if (e === 'cancel') return
    if (e?.message) ElMessage.error(e.message)
  }
}

function focusScriptNode() {
  let epId = filterEpisodeId.value
  if (!epId) {
    const eps = drama.value?.episodes || []
    if (eps.length === 1) epId = eps[0].id
  }
  if (!epId) {
    ElMessage.warning('请先选择或新建集数')
    return
  }
  if (!filterEpisodeId.value) filterEpisodeId.value = epId
  focusedNodeId.value = scriptNodeId(epId)
}

async function onAlignNodes() {
  if (!drama.value || !nodes.value.length || aligningNodes.value) return
  layoutHistory.push(nodes.value, currentViewport.value)
  aligningNodes.value = true
  focusedNodeId.value = null
  try {
    const { positions } = computeAutoLayoutPositions(drama.value, {
      episodeId: filterEpisodeId.value,
      workflowGroups: workflowGroups.value,
      imagesBySbId: imagesBySbId.value,
      videosBySbId: videosBySbId.value,
    })
    nodes.value = nodes.value.map((n) => {
      const pos = positions[n.id]
      return pos ? { ...n, position: { x: pos.x, y: pos.y } } : n
    })
    layoutCache.value = {
      version: 1,
      nodes: { ...positions },
      viewport: layoutCache.value?.viewport,
    }
    await nextTick()
    const flowApi = canvasFlowApi.value
    if (flowApi?.fitView) {
      await flowApi.fitView({
        padding: 0.14,
        duration: 380,
        includeHiddenNodes: false,
      })
      await new Promise((r) => setTimeout(r, 400))
      const vp = flowApi.getViewport?.()
      if (vp) currentViewport.value = { x: vp.x, y: vp.y, zoom: vp.zoom }
    }
    await persistCanvasState({ layoutOnly: true })
    ElMessage.success('节点已按规则对齐并适配当前视图')
  } catch (e) {
    ElMessage.error(e?.message || '对齐失败')
  } finally {
    aligningNodes.value = false
  }
}

async function loadDrama(silent = false) {
  if (!dramaId.value) return
  if (!silent) loading.value = true
  try {
    await store.loadDrama(dramaId.value)
    layoutCache.value = parseCanvasLayout(drama.value?.metadata)
    syncWorkflowFromDrama()
    const vp = resolveViewport(layoutCache.value)
    currentViewport.value = vp
    if (route.query.episode) filterEpisodeId.value = Number(route.query.episode)
    if (!expandedEpisodeId.value && drama.value?.episodes?.[0]) {
      expandedEpisodeId.value = drama.value.episodes[0].id
    }
    await loadForDrama(drama.value, filterEpisodeId.value)
    rebuildGraph()
  } catch (e) {
    if (!silent) ElMessage.error(e?.message || '加载项目失败')
  } finally {
    if (!silent) loading.value = false
  }
}

async function onCreateWorkflowGroup() {
  if (!selectedStoryboardIds.value.length) {
    ElMessage.warning('请先框选或 Ctrl 点击选择分镜节点')
    return
  }
  try {
    const { value } = await ElMessageBox.prompt('工作流名称', '创建工作流', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputValue: `工作流 ${workflowGroups.value.length + 1}`,
    })
    workflowGroups.value = createWorkflowGroup(workflowGroups.value, {
      title: value?.trim() || undefined,
      storyboardIds: selectedStoryboardIds.value,
      pipeline: normalizePipeline(pipelineSteps.value),
    })
    activeGroupId.value = workflowGroups.value[workflowGroups.value.length - 1]?.id || null
    await persistCanvasState({ groupsOnly: true })
    rebuildGraph()
    ElMessage.success('工作流已创建')
  } catch (_) {}
}

async function onDeleteActiveGroup() {
  if (!activeGroupId.value) return
  try {
    await ElMessageBox.confirm('确定删除该工作流？', '删除工作流', { type: 'warning' })
    workflowGroups.value = deleteWorkflowGroup(workflowGroups.value, activeGroupId.value)
    activeGroupId.value = workflowGroups.value[0]?.id || null
    await persistCanvasState({ groupsOnly: true })
    rebuildGraph()
    ElMessage.success('已删除')
  } catch (_) {}
}

async function onRunActiveGroup(overrideIds) {
  const group = workflowGroups.value.find((g) => g.id === activeGroupId.value)
  if (!group && !overrideIds) {
    ElMessage.warning('请先选择工作流')
    return
  }
  const ids = overrideIds || group.storyboard_ids || []
  const pipeline = normalizePipeline(group?.pipeline?.length ? group.pipeline : pipelineSteps.value)
  try {
    await ElMessageBox.confirm(
      `将对 ${ids.length} 个分镜执行：${pipeline.join(' → ')}\n跳过已有：${skipExisting.value ? '是' : '否'}；失败后继续：${continueOnError.value ? '是' : '否'}`,
      '整组重跑',
      { type: 'warning', confirmButtonText: '开始执行' },
    )
  } catch {
    return
  }
  try {
    await startRun({
      group_id: group?.id,
      storyboard_ids: ids,
      pipeline,
      skip_existing: skipExisting.value,
      stop_on_error: !continueOnError.value,
      concurrency: runConcurrency.value,
      link_tail_frames: linkTailFrames.value,
    })
  } catch (e) {
    ElMessage.error(e?.message || '工作流执行失败')
  }
}

function onRetryFailed() {
  const ids = failedItems.value.map((x) => x.storyboardId).filter(Boolean)
  if (!ids.length) return
  onRunActiveGroup(ids)
}

async function onMergeEpisode() {
  const epId = filterEpisodeId.value
  if (!epId) {
    ElMessage.warning('请先筛选某一集')
    return
  }
  const ep = (drama.value?.episodes || []).find((e) => e.id === epId)
  const boards = ep?.storyboards || []
  const missing = boards.filter((sb) => !hasStoryboardVideo(sb, videosBySbId.value))
  if (missing.length) {
    const nums = missing.map((s) => `#${s.storyboard_number ?? s.id}`).join('、')
    try {
      await ElMessageBox.confirm(
        `缺 ${missing.length} 镜视频：${nums}。仅合成已有镜？`,
        '合成本集',
        { type: 'warning', confirmButtonText: '仅合成已有镜', cancelButtonText: '取消' },
      )
    } catch {
      return
    }
  }
  const meta = parseDramaMetadata(drama.value?.metadata)
  mergeProgress.value = '正在提交合成…'
  try {
    const result = await dramaAPI.finalizeEpisode(epId, {
      burn_narration_subtitles: !!meta.burn_narration_subtitles,
      burn_dialogue_audio: !!meta.burn_dialogue_audio,
      watermark_text: meta.watermark_text || '',
    })
    if (!result?.task_id) {
      ElMessage.warning(result?.message || '没有可合成的视频')
      mergeProgress.value = ''
      return
    }
    mergeProgress.value = '合成中…'
    for (let i = 0; i < 450; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      const t = await taskAPI.get(result.task_id)
      if (t.status === 'completed') {
        ElMessage.success('合成本集完成')
        mergeProgress.value = '合成完成，可在列表模式播放'
        await refreshCanvas(true)
        return
      }
      if (t.status === 'failed') throw new Error(t.error?.message || t.error || '合成失败')
    }
    throw new Error('合成超时')
  } catch (e) {
    ElMessage.error(e?.message || '合成失败')
    mergeProgress.value = ''
  }
}

function hasProcessingStoryboards() {
  for (const ep of drama.value?.episodes || []) {
    for (const sb of ep.storyboards || []) {
      if (sb.status === 'processing') return true
    }
  }
  return false
}

function startStatusPoll() {
  stopStatusPoll()
  if (!hasProcessingStoryboards()) return
  pollTimer = setInterval(() => {
    if (hasProcessingStoryboards()) loadDrama(true)
    else stopStatusPoll()
  }, 8000)
}

function stopStatusPoll() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function goListMode() {
  const query = filterEpisodeId.value ? { episode: String(filterEpisodeId.value) } : {}
  const sbId = focusedStoryboardId.value
  router.push({
    path: `/film/${dramaId.value}`,
    query,
    hash: sbId ? `#sb-${sbId}` : undefined,
  })
}

function navigateToStoryboard(episodeId, storyboardId) {
  router.push({
    path: `/film/${dramaId.value}`,
    query: episodeId ? { episode: String(episodeId) } : {},
    hash: storyboardId ? `#sb-${storyboardId}` : undefined,
  })
}

function onNodeDoubleClick({ node }) {
  if (node.type === 'canvasStoryboard') {
    navigateToStoryboard(node.data.episodeId || node.data.storyboard?.episode_id, node.data.storyboard?.id)
    return
  }
  const ref = getStoryboardRefFromNode(node)
  if (ref?.storyboardId) navigateToStoryboard(ref.episodeId, ref.storyboardId)
}

function onPaneClick(event) {
  if (paneClickSuppressed.value) return
  const target = event?.event?.target || event?.target
  if (target?.closest?.('.canvas-inspector') || target?.closest?.('.el-popper') || target?.closest?.('.canvas-context-menu')) {
    return
  }
  focusedNodeId.value = null
  closeContextMenu()
}

function onNodeClick({ node, event }) {
  if (node.type === 'canvasAddButton') {
    event?.stopPropagation?.()
    openCreateDialog(node.data?.assetType || 'storyboard')
    return
  }
  if (node.type === 'canvasEpisode') {
    if (node.data?.collapsed || node.data?.stub) {
      expandedEpisodeId.value = node.data.episode?.id || null
      rebuildGraph()
    }
    return
  }
  if (node.type === 'canvasGroupFrame') {
    activeGroupId.value = node.data?.group?.id || activeGroupId.value
    return
  }
  if (PANEL_NODE_TYPES.has(node.type)) {
    focusedNodeId.value = node.id
  }
  if (node.type === 'canvasAsset') {
    const prefix = node.data.kind === 'character' ? 'char' : node.data.kind === 'scene' ? 'scene' : 'prop'
    selectSidebarAsset(`${prefix}:${node.data.entity.id}`)
    return
  }
  const sbId = storyboardIdFromNodeId(node.id)
  if (sbId) activeGroupId.value = workflowGroups.value.find((g) => (g.storyboard_ids || []).includes(sbId))?.id || activeGroupId.value
}

watch(filterEpisodeId, async (val) => {
  lightboxUserClosed.value = false
  if (!val) {
    const first = (drama.value?.episodes || [])[0]
    if (first && expandedEpisodeId.value == null) expandedEpisodeId.value = first.id
  }
  if (drama.value) await loadForDrama(drama.value, val)
  rebuildGraph()
  const query = { ...route.query }
  if (val != null) query.episode = String(val)
  else delete query.episode
  router.replace({ query }).catch(() => {})
})

watch(() => route.params.id, async () => {
  highlightAssetId.value = null
  layoutCache.value = null
  activeGroupId.value = null
  selectedStoryboardIds.value = []
  focusedNodeId.value = null
  await loadDrama()
  resumeIfNeeded()
}, { immediate: true })

watch(drama, () => startStatusPoll())

watch(() => store.revision, () => {
  if (!drama.value) return
  if (layoutSaveState.value === 'saving') return
  const parsed = parseCanvasLayout(drama.value.metadata)
  if (parsed) layoutCache.value = parsed
  syncWorkflowFromDrama()
  rebuildGraph()
})

watch(() => store.mediaEpoch, async () => {
  if (!drama.value) return
  await loadForDrama(drama.value, filterEpisodeId.value)
  rebuildGraph()
})

function onCanvasContextMenu(event) {
  if (event.target?.closest?.('.vue-flow__node, .canvas-inspector, .canvas-zoom-controls, .canvas-fab, .el-popper')) return
  onPaneContextMenu({ event })
}

onMounted(() => {
  canvasMainRef.value?.addEventListener?.('pointerdown', onPanePointerDownCapture, true)
  canvasMainRef.value?.addEventListener?.('contextmenu', onCanvasContextMenu)
  window.addEventListener('pointermove', onWindowPointerMove)
  window.addEventListener('pointerup', onWindowPointerUp)
})

onBeforeUnmount(() => {
  if (saveTimer) clearTimeout(saveTimer)
  if (savedHintTimer) clearTimeout(savedHintTimer)
  if (paneClickSuppressTimer) clearTimeout(paneClickSuppressTimer)
  if (flashTimer) clearTimeout(flashTimer)
  stopStatusPoll()
  stopWorkflowPoll()
  window.removeEventListener('pointermove', onWindowPointerMove)
  window.removeEventListener('pointerup', onWindowPointerUp)
  canvasMainRef.value?.removeEventListener?.('pointerdown', onPanePointerDownCapture, true)
  canvasMainRef.value?.removeEventListener?.('contextmenu', onCanvasContextMenu)
  if (layoutDirty.value) persistCanvasState({ layoutOnly: true })
})
</script>

<style scoped>
.drama-canvas-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-page, #0f0f12);
  color: var(--text-primary, #e4e4e7);
  overflow: hidden;
}

.canvas-tools-drawer {
  border-top: 1px solid rgba(63, 63, 70, 0.35);
}

.workflow-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 20px 10px;
  flex-wrap: wrap;
}

.wf-hint {
  font-size: 12px;
  color: var(--text-subtle, #71717a);
}

.wf-steps {
  display: flex;
  gap: 4px;
}

.workflow-progress {
  padding: 0 20px 8px;
  font-size: 12px;
  color: #60a5fa;
}

.workflow-progress.episode-gen {
  color: #34d399;
}

.fail-chip {
  margin-left: 8px;
  appearance: none;
  border: 1px solid rgba(248, 113, 113, 0.45);
  background: rgba(248, 113, 113, 0.12);
  color: #fca5a5;
  border-radius: 999px;
  font-size: 11px;
  padding: 1px 8px;
  cursor: pointer;
}

.generate-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px 10px;
  flex-wrap: wrap;
  border-top: 1px solid rgba(63, 63, 70, 0.35);
  margin-top: 2px;
  padding-top: 8px;
}

.gen-label {
  font-size: 12px;
  font-weight: 600;
  color: #a1a1aa;
  margin-right: 4px;
}

.gen-hint {
  font-size: 11px;
  color: #52525b;
  flex: 1;
  min-width: 200px;
}

.breadcrumb-sep { color: var(--text-faint, #52525b); }

.page-title {
  font-size: 14px;
  color: var(--text-muted, #a1a1aa);
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.layout-status { font-size: 12px; }
.layout-status.saving { color: #60a5fa; }
.layout-status.saved { color: #34d399; }
.layout-status.error { color: #f87171; }

.canvas-shell {
  flex: 1;
  display: flex;
  min-height: 0;
}

.canvas-sidebar {
  width: 220px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-color, #27272a);
  background: var(--bg-card, #18181b);
  padding: 14px 12px;
  overflow-y: auto;
  position: relative;
  transition: width 0.2s;
}
.canvas-sidebar.collapsed {
  width: 48px;
  padding: 14px 8px;
  overflow: hidden;
}
.sidebar-toggle {
  position: sticky;
  top: 0;
  margin-bottom: 8px;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid #3f3f46;
  background: transparent;
  color: #d4d4d8;
  cursor: pointer;
}

.sidebar-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 12px;
  color: var(--text-bright, #fafafa);
}

.sidebar-section { margin-bottom: 14px; }
.sidebar-script {
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border-color, #27272a);
}
.sidebar-script-tip {
  margin: 0;
  font-size: 10px;
  line-height: 1.45;
  color: var(--text-subtle, #71717a);
}

.sec-label {
  font-size: 11px;
  color: var(--text-subtle, #71717a);
  margin-bottom: 6px;
}

.sec-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sidebar-item {
  font-size: 12px;
  padding: 6px 8px;
  border-radius: 6px;
  color: var(--text-primary, #e4e4e7);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s;
}
.sidebar-item:hover { background: rgba(129, 140, 248, 0.12); }
.sidebar-item.active { background: rgba(52, 211, 153, 0.16); color: #6ee7b7; }

.workflow-item { white-space: normal; }
.wf-item-title { font-weight: 600; }
.wf-item-meta { font-size: 10px; color: var(--text-faint, #52525b); margin-top: 2px; }
.sidebar-empty { font-size: 11px; color: var(--text-faint, #52525b); padding: 4px 0; }

.canvas-center {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.canvas-main {
  flex: 1;
  min-width: 0;
  position: relative;
}

.vue-flow-canvas {
  width: 100%;
  height: 100%;
  background: #0c0c0f;
}

.canvas-minimap {
  position: absolute;
  right: 16px;
  bottom: 16px;
  width: 92px;
  height: 68px;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid #3f3f46;
  z-index: 6;
  transition: width 0.15s, height 0.15s;
}
.canvas-minimap.expanded {
  width: 200px;
  height: 140px;
}

:deep(.vue-flow__minimap) {
  background: rgba(24, 24, 27, 0.92);
  border: 0;
  width: 100% !important;
  height: 100% !important;
}

:deep(.vue-flow__node.selected) {
  box-shadow: 0 0 0 2px rgba(129, 140, 248, 0.8);
}
</style>

<style>
html.light .drama-canvas-page { background: var(--bg-page); }
html.light .vue-flow-canvas { background: #eef2ff; }
</style>
