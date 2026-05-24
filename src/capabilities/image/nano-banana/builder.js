/**
 * Nano Banana builder —— 见 docs/prototype/capabilities/image/20260523-nano-banana/index.html §7
 *
 * 单 mode generate-image；model 来自 modeParams.model（不是 mode id）。
 * 字段以 foxapi 为准：model, prompt, aspect_ratio, resolution, image_urls(≤14),
 *   google_search;output_format 与 image_search 仅 flash 发送（pro 不暴露）。
 * envelope 级（接口 wrapper）：project_id, node_id。
 * ⚠️ 不往 body 塞 capability / mode（非契约字段）；URL 段已带 capability。
 */
import { expandPromptPlaceholders } from '@/canvas/runtime/builders/expandPromptPlaceholders'
import { MODEL_FLASH } from './constants'

export const MAX_REFERENCE_IMAGES = 14

export function buildNanoBananaRequestBody({ modeParams, collectedInputs, canvasId, nodeId }) {
  const model = modeParams.model || MODEL_FLASH

  const body = {
    project_id: canvasId,
    node_id: nodeId,
    model,
  }

  // prompt：端口连入的 {{ai-canvas:edge:N}} placeholder 提交前 expand 成源节点 content.text
  body.prompt = expandPromptPlaceholders(modeParams.prompt || '', collectedInputs, 'prompt')

  // 参考图：全部来自端口连入（multi），上限 14
  const imageInputs = collectedInputs.image
  const edgeImages = Array.isArray(imageInputs) ? imageInputs : imageInputs ? [imageInputs] : []
  const edgeUrls = edgeImages.map(img => img.content?.url).filter(Boolean)
  if (edgeUrls.length) body.image_urls = edgeUrls.slice(0, MAX_REFERENCE_IMAGES)

  if (modeParams.aspect_ratio) body.aspect_ratio = modeParams.aspect_ratio
  if (modeParams.resolution) body.resolution = modeParams.resolution
  if (modeParams.google_search) body.google_search = true
  // output_format / image_search 仅 flash 发送（pro 不暴露:foxapi 建议 pro 不传 output_format,
  // 且 model 是参数非 mode,切到 pro 时 flash 残留值不会清,故 builder 兜底按 model 过滤)
  if (model === MODEL_FLASH && modeParams.output_format) body.output_format = modeParams.output_format
  if (model === MODEL_FLASH && modeParams.image_search) body.image_search = true

  return { body, urlFields: ['image_urls'] }
}
