/**
 * Kling v3 builder — resolves port URLs + prompt, then delegates to assembleKlingV3Body.
 *
 * 端口 → 字段映射:
 *   text-to-video    : prompt
 *   image-to-video   : prompt, start_image → image_url
 *   first-last-frame : prompt, start_image → image_url, end_image → image_tail_url
 *   motion-control   : character_image → image_url, motion_video → video_url
 *
 * prompt 优先级: 端口 collectedInputs.prompt > modeParams.prompt
 * URL 优先级: 端口 collectedInputs.<portId> > modeParams.<field>
 */

import { expandPromptPlaceholders } from '@/canvas/runtime/builders/expandPromptPlaceholders'
import { assembleKlingV3Body } from './_shared/assembleBody'

function pickUrl(portValue) {
  if (!portValue) return null
  if (Array.isArray(portValue)) {
    for (const item of portValue) {
      const url = item?.content?.url
      if (url) return url
    }
    return null
  }
  return portValue?.content?.url || null
}

export function buildKlingV3RequestBody({ mode, modeParams = {}, collectedInputs = {}, canvasId, nodeId }) {
  // prompt: 端口优先, 面板兜底 (expandPromptPlaceholders 处理占位符替换)
  const promptInput = collectedInputs.prompt
  const portPromptText = Array.isArray(promptInput)
    ? promptInput[0]?.content?.text
    : promptInput?.content?.text

  const prompt = portPromptText || expandPromptPlaceholders(modeParams.prompt || '', collectedInputs, 'prompt')

  // multi_prompt: 仅面板显式配置时传递
  const multiPrompt =
    Array.isArray(modeParams.multi_prompt) && modeParams.multi_prompt.length > 0
      ? modeParams.multi_prompt
      : null

  // urls: 各 mode 的 url 字段, 端口优先于面板
  const urls = {}
  if (mode === 'image-to-video') {
    urls.image_url = pickUrl(collectedInputs.start_image) || modeParams.image_url || undefined
  } else if (mode === 'first-last-frame') {
    urls.image_url = pickUrl(collectedInputs.start_image) || modeParams.image_url || undefined
    urls.image_tail_url = pickUrl(collectedInputs.end_image) || modeParams.image_tail_url || undefined
  } else if (mode === 'motion-control') {
    urls.image_url = pickUrl(collectedInputs.character_image) || modeParams.image_url || undefined
    urls.video_url = pickUrl(collectedInputs.motion_video) || modeParams.video_url || undefined
  }

  const body = assembleKlingV3Body({ mode, projectId: canvasId, nodeId, prompt, multiPrompt, urls, modeParams })
  return { body, urlFields: [] }
}
