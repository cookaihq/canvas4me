/**
 * creatify-aurora builder —— 单 mode(image-audio-to-video)。
 * 固定 model creatify-aurora;必发 image_url / audio_url / resolution;
 * 可选 prompt / guidance_scale(默认1) / audio_guidance_scale(默认2)。
 * 端口优先、面板直传兜底。严格白名单:不带 duration / aspect_ratio 等(后端 extra=forbid)。
 */
const DEFAULT_GUIDANCE = 1
const DEFAULT_AUDIO_GUIDANCE = 2

export function buildCreatifyAuroraRequestBody({ modeParams = {}, collectedInputs = {}, canvasId, nodeId }) {
  const body = { project_id: canvasId, node_id: nodeId, model: 'creatify-aurora' }

  const imageUrl = pickPortUrl(collectedInputs.image) || modeParams.image_url
  const audioUrl = pickPortUrl(collectedInputs.audio) || modeParams.audio_url
  if (imageUrl) body.image_url = imageUrl
  if (audioUrl) body.audio_url = audioUrl

  body.resolution = modeParams.resolution || '720p'

  const prompt = typeof modeParams.prompt === 'string' ? modeParams.prompt.trim() : ''
  if (prompt) body.prompt = prompt

  body.guidance_scale = numOr(modeParams.guidance_scale, DEFAULT_GUIDANCE)
  body.audio_guidance_scale = numOr(modeParams.audio_guidance_scale, DEFAULT_AUDIO_GUIDANCE)

  return { body, urlFields: ['image_url', 'audio_url'] }
}

function numOr(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function pickPortUrl(input) {
  if (!input) return null
  if (Array.isArray(input)) {
    for (const item of input) { const url = item?.content?.url || item?.url; if (url) return url }
    return null
  }
  return input.content?.url || input.url || null
}
