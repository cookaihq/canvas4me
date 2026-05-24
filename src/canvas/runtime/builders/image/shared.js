import { expandPromptPlaceholders } from '../expandPromptPlaceholders'

export function buildDefaultImageRequestBody({ capability, mode, modeParams, collectedInputs, canvasId, nodeId }) {
  // 通用 fallback：单模式 capability（mode='default'）model 默认等于 capability id；
  // 多模式 capability 应由专属 builder 按 mode 映射 model，否则直接取 mode 值（nano-banana 这类 mode id 即 model id 的场景）
  const defaultModel = mode && mode !== 'default' ? mode : capability
  const body = {
    project_id: canvasId,
    node_id: nodeId,
    capability,
    mode,
    model: defaultModel,
  }

  // 端口优先(老 view 行为不变); 面板兜底走 helper expand placeholder
  // (view 升级到 TextInputWithEdges 后, placeholder 会出现在 modeParams.prompt 字符串里)
  const promptInput = collectedInputs.prompt
  body.prompt = promptInput?.content?.text
    || expandPromptPlaceholders(modeParams.prompt || '', collectedInputs, 'prompt')

  const imageInputs = collectedInputs.image
  const images = Array.isArray(imageInputs) ? imageInputs : imageInputs ? [imageInputs] : []
  body.image_urls = images.map(img => img.content?.url).filter(Boolean)

  // body.config 是后端 API 契约字段名（承载透传的面板参数），保持不变
  body.config = { ...modeParams }
  delete body.config.prompt

  return body
}
