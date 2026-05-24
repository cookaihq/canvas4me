/**
 * sync builder —— 单 mode(sync-video)。
 * 必发 model(sync-3 / lipsync-2 / lipsync-2-pro)/ video_url / audio_url;可选 sync_mode。
 * 不发 temperature / active_speaker(UI 不暴露;sync-3 不支持)。
 */
const SYNC_MODELS = new Set(['sync-3', 'lipsync-2', 'lipsync-2-pro'])

export function buildSyncRequestBody({ modeParams, collectedInputs, canvasId, nodeId }) {
  const body = { project_id: canvasId, node_id: nodeId }
  body.model = SYNC_MODELS.has(modeParams.model) ? modeParams.model : 'sync-3'

  const videoUrl = pickPortUrl(collectedInputs.video)
  const audioUrl = pickPortUrl(collectedInputs.audio)
  if (videoUrl) body.video_url = videoUrl
  if (audioUrl) body.audio_url = audioUrl
  if (modeParams.sync_mode && typeof modeParams.sync_mode === 'string') body.sync_mode = modeParams.sync_mode

  return { body, urlFields: ['video_url', 'audio_url'] }
}

function pickPortUrl(input) {
  if (!input) return null
  if (Array.isArray(input)) {
    for (const item of input) { const url = item?.content?.url; if (url) return url }
    return null
  }
  return input.content?.url || null
}
