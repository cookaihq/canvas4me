import { expandPromptPlaceholders } from '../expandPromptPlaceholders'

export function buildDefaultSoundRequestBody({ capability, mode, modeParams, collectedInputs, canvasId, nodeId }) {
  // 通用 fallback：单模式 capability（mode='default'）model=capability；多模式应由专属 builder 按 mode 映射 model
  const defaultModel = mode && mode !== 'default' ? mode : capability
  const body = {
    project_id: canvasId,
    node_id: nodeId,
    capability,
    mode,
    model: defaultModel,
  }

  // 端口优先(老 view 行为不变); 面板兜底走 helper expand placeholder
  const promptInput = collectedInputs.prompt
  body.prompt = promptInput?.content?.text
    || expandPromptPlaceholders(modeParams.prompt || '', collectedInputs, 'prompt')

  // body.config 是后端 API 契约字段名（承载透传的面板参数），保持不变
  body.config = { ...modeParams }
  delete body.config.prompt

  return body
}
