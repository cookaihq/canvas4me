/**
 * Lyria 3 builder —— 见原型「7 区 · Builder 白名单」。
 *
 * 请求体（服务端与 foxapi 字段一致，无 transformBody）:
 *   { project_id, node_id, model, prompt, image_urls?, negative_prompt? }
 *   - project_id / node_id: 服务端包装字段（直连 foxapi 时翻译层 strip）
 *   - model: lyria-3 / lyria-3-pro（modeParams.model）
 *   - prompt: 端口 placeholder 展开后的文本
 *   - image_urls: 情绪板 URL（来自 images 端口连入；为空数组时不发送）
 *   - negative_prompt: 反向提示词（高级参数；为空/纯空白时不发送）
 */
import { DEFAULT_MODEL, MAX_MOODBOARD_IMAGES } from './_shared/constants'
import { expandPromptPlaceholders } from '@/canvas/runtime/builders/expandPromptPlaceholders'

export function buildLyria3RequestBody({ modeParams, collectedInputs, canvasId, nodeId }) {
  const body = {
    project_id: canvasId,
    node_id: nodeId,
    model: modeParams.model || DEFAULT_MODEL,
  }

  // prompt: modeParams.prompt 含 {{ai-canvas:edge:N}} placeholder，提交前展开为源节点文本
  body.prompt = expandPromptPlaceholders(modeParams.prompt || '', collectedInputs, 'prompt')

  // negative_prompt: 高级参数；为空/纯空白时不发送（对齐契约「为空不传给上游」）
  const negativePrompt = (modeParams.negative_prompt || '').trim()
  if (negativePrompt) body.negative_prompt = negativePrompt

  // image_urls: 情绪板来自端口连入（multi）。端口 id 仍为 images，请求体字段名为 image_urls
  const imageInputs = collectedInputs.images
  const edgeImages = Array.isArray(imageInputs) ? imageInputs : imageInputs ? [imageInputs] : []
  const urls = edgeImages.map(img => img.content?.url).filter(Boolean).slice(0, MAX_MOODBOARD_IMAGES)
  if (urls.length > 0) body.image_urls = urls

  return { body, urlFields: ['image_urls'] }
}
