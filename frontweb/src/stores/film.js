import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { dramaAPI } from '@/api/drama'
import {
  bumpStoryboardNumbersFrom,
  collectStoryboardIds,
  patchEpisode as patchEpisodeDoc,
  patchMetadata as patchMetadataDoc,
  patchStoryboard as patchStoryboardDoc,
  pruneWorkflowGroups as pruneWorkflowGroupsDoc,
  removeAsset as removeAssetDoc,
  removeStoryboard as removeStoryboardDoc,
  replaceEpisodeStoryboards as replaceEpisodeStoryboardsDoc,
  swapStoryboardNumbers as swapStoryboardNumbersDoc,
  upsertAsset as upsertAssetDoc,
  upsertStoryboard as upsertStoryboardDoc,
} from '@/utils/dramaDocumentPatch'

function episodeVideoKey(dramaId, episodeId) {
  if (dramaId == null || episodeId == null) return null
  return `${dramaId}:${episodeId}`
}

export const useFilmStore = defineStore('film', () => {
  const drama = ref(null)
  const currentEpisode = ref(null)
  const storyInput = ref('')
  const scriptContent = ref('')
  const videoResolution = ref('480p')
  /** 按 dramaId:episodeId 存储合成视频进度与状态 */
  const videoStateByKey = ref({})
  const revision = ref(0)
  const mediaEpoch = ref(0)

  const dramaId = computed(() => drama.value?.id ?? null)
  // 角色/道具/场景默认只显示本集资源（随「选择第几集」变化）
  const characters = computed(() => currentEpisode.value?.characters ?? [])
  const scenes = computed(() => currentEpisode.value?.scenes ?? [])
  const props = computed(() => currentEpisode.value?.props ?? [])
  const storyboards = computed(() => currentEpisode.value?.storyboards ?? [])

  const currentVideoKey = computed(() =>
    episodeVideoKey(drama.value?.id ?? null, currentEpisode.value?.id ?? null)
  )

  const videoProgress = computed(() => {
    const k = currentVideoKey.value
    if (!k) return 0
    return videoStateByKey.value[k]?.progress ?? 0
  })

  const videoStatus = computed(() => {
    const k = currentVideoKey.value
    if (!k) return 'idle'
    return videoStateByKey.value[k]?.status ?? 'idle'
  })

  function _ensureVideoState(key) {
    if (!key) return null
    if (!videoStateByKey.value[key]) {
      videoStateByKey.value = {
        ...videoStateByKey.value,
        [key]: { status: 'idle', progress: 0 },
      }
    }
    return videoStateByKey.value[key]
  }

  function syncCurrentEpisode() {
    const d = drama.value
    if (!d) {
      currentEpisode.value = null
      return
    }
    const curId = currentEpisode.value?.id
    if (curId != null) {
      const ep = (d.episodes || []).find((e) => Number(e.id) === Number(curId))
      currentEpisode.value = ep || (d.episodes || [])[0] || null
      return
    }
    if (currentEpisode.value) {
      currentEpisode.value = (d.episodes || [])[0] || null
    }
  }

  function commitDrama(next, { bumpMedia = false } = {}) {
    if (!next) return
    drama.value = next
    revision.value += 1
    if (bumpMedia) mediaEpoch.value += 1
    syncCurrentEpisode()
  }

  function setDrama(d) {
    drama.value = d
    revision.value += 1
    syncCurrentEpisode()
  }

  function setCurrentEpisode(ep) {
    currentEpisode.value = ep
  }

  function setStoryInput(text) {
    storyInput.value = text
  }

  function setScriptContent(text) {
    scriptContent.value = text
  }

  function setVideoProgress(p, dId, eId) {
    const key = episodeVideoKey(
      dId ?? drama.value?.id ?? null,
      eId ?? currentEpisode.value?.id ?? null
    )
    if (!key) return
    const prev = _ensureVideoState(key)
    videoStateByKey.value = {
      ...videoStateByKey.value,
      [key]: { ...prev, progress: p },
    }
  }

  function setVideoStatus(s, dId, eId) {
    const key = episodeVideoKey(
      dId ?? drama.value?.id ?? null,
      eId ?? currentEpisode.value?.id ?? null
    )
    if (!key) return
    const prev = _ensureVideoState(key)
    videoStateByKey.value = {
      ...videoStateByKey.value,
      [key]: { ...prev, status: s },
    }
  }

  function getVideoStatus(dId, eId) {
    const key = episodeVideoKey(dId, eId)
    if (!key) return 'idle'
    return videoStateByKey.value[key]?.status ?? 'idle'
  }

  function applyServerDrama(d, { replaceMedia = false } = {}) {
    commitDrama(d, { bumpMedia: replaceMedia })
  }

  async function loadDrama(id, _opts = {}) {
    const dramaIdToLoad = id ?? drama.value?.id
    if (dramaIdToLoad == null) return null
    const d = await dramaAPI.get(dramaIdToLoad)
    applyServerDrama(d, { replaceMedia: true })
    return d
  }

  function bumpMediaEpoch() {
    mediaEpoch.value += 1
  }

  function patchStoryboard(episodeId, storyboardId, patch) {
    const next = patchStoryboardDoc(drama.value, episodeId, storyboardId, patch)
    if (next !== drama.value) commitDrama(next)
  }

  function upsertStoryboard(episode, storyboard, opts) {
    const next = upsertStoryboardDoc(drama.value, episode, storyboard, opts)
    if (next !== drama.value) commitDrama(next)
  }

  function replaceEpisodeStoryboards(episodeId, storyboardsList) {
    const next = replaceEpisodeStoryboardsDoc(drama.value, episodeId, storyboardsList)
    if (next !== drama.value) commitDrama(next)
  }

  function bumpStoryboardNumbers(episodeId, fromNumber, delta, exceptId) {
    const next = bumpStoryboardNumbersFrom(drama.value, episodeId, fromNumber, delta, exceptId)
    if (next !== drama.value) commitDrama(next)
  }

  function removeStoryboard(storyboardId) {
    const next = removeStoryboardDoc(drama.value, storyboardId)
    if (next !== drama.value) commitDrama(next)
  }

  function upsertAsset(kind, entity) {
    const next = upsertAssetDoc(drama.value, kind, entity)
    if (next !== drama.value) commitDrama(next)
  }

  function removeAsset(kind, id) {
    const next = removeAssetDoc(drama.value, kind, id)
    if (next !== drama.value) commitDrama(next)
  }

  function patchEpisode(episodeId, patch) {
    const next = patchEpisodeDoc(drama.value, episodeId, patch)
    if (next !== drama.value) commitDrama(next)
  }

  function patchMetadata(partialMeta) {
    if (!drama.value || !partialMeta) return
    const next = patchMetadataDoc(drama.value, partialMeta)
    if (partialMeta.updated_at !== undefined) {
      next.updated_at = partialMeta.updated_at
    }
    if (next !== drama.value) commitDrama(next)
  }

  function pruneWorkflowGroups(validSbIds) {
    const ids = validSbIds || collectStoryboardIds(drama.value)
    const next = pruneWorkflowGroupsDoc(drama.value, ids)
    if (next !== drama.value) commitDrama(next)
  }

  function swapStoryboardNumbers(idA, idB) {
    const next = swapStoryboardNumbersDoc(drama.value, idA, idB)
    if (next !== drama.value) commitDrama(next)
  }

  function reset() {
    drama.value = null
    currentEpisode.value = null
    storyInput.value = ''
    scriptContent.value = ''
    revision.value += 1
    // 保留 videoStateByKey：跨剧切换时其它项目的合成状态不丢失
  }

  return {
    drama,
    currentEpisode,
    storyInput,
    scriptContent,
    videoResolution,
    videoStateByKey,
    videoProgress,
    videoStatus,
    dramaId,
    characters,
    scenes,
    props,
    storyboards,
    revision,
    mediaEpoch,
    setDrama,
    setCurrentEpisode,
    setStoryInput,
    setScriptContent,
    setVideoProgress,
    setVideoStatus,
    getVideoStatus,
    loadDrama,
    applyServerDrama,
    bumpMediaEpoch,
    patchStoryboard,
    upsertStoryboard,
    replaceEpisodeStoryboards,
    bumpStoryboardNumbers,
    removeStoryboard,
    upsertAsset,
    removeAsset,
    patchEpisode,
    patchMetadata,
    pruneWorkflowGroups,
    swapStoryboardNumbers,
    reset,
  }
})
