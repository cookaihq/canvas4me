/**
 * fabric builder —— 单 mode(generate-video)。
 * 直接发 model(fabric-1.0 / fabric-1.0-fast),必发 model / image_url / audio_url / resolution。
 * 素材只从端口取（A 类）。project_id / node_id 由全局/路由层按版本剥离。
 */
const FABRIC_MODELS = new Set(['fabric-1.0', 'fabric-1.0-fast'])

export function buildFabricRequestBody({ modeParams, collectedInputs, canvasId, nodeId }) {
  const body = { project_id: canvasId, node_id: nodeId }
  body.model = FABRIC_MODELS.has(modeParams.model) ? modeParams.model : 'fabric-1.0'

  const imageUrl = pickPortUrl(collectedInputs.image)
  const audioUrl = pickPortUrl(collectedInputs.audio)
  if (imageUrl) body.image_url = imageUrl
  if (audioUrl) body.audio_url = audioUrl
  body.resolution = modeParams.resolution || '720p'

  return { body, urlFields: ['image_url', 'audio_url'] }
}

function pickPortUrl(input) {
  if (!input) return null
  if (Array.isArray(input)) {
    for (const item of input) {
      const url = item?.content?.url
      if (url) return url
    }
    return null
  }
  return input.content?.url || null
}
