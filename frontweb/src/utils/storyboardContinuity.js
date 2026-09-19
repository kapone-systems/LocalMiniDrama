/**
 * 同一集内按 storyboard_number 找上一镜 / 下一镜。
 */
export function getAdjacentStoryboards(drama, sb) {
  if (!drama || !sb) return { episode: null, list: [], index: -1, prev: null, next: null }
  const episode =
    (drama.episodes || []).find((ep) => ep.id === sb.episode_id)
    || (drama.episodes || []).find((ep) => (ep.storyboards || []).some((s) => s.id === sb.id))
    || null
  const list = [...(episode?.storyboards || [])].sort(
    (a, b) => (a.storyboard_number || 0) - (b.storyboard_number || 0),
  )
  const index = list.findIndex((s) => s.id === sb.id)
  return {
    episode,
    list,
    index,
    prev: index > 0 ? list[index - 1] : null,
    next: index >= 0 && index < list.length - 1 ? list[index + 1] : null,
  }
}
