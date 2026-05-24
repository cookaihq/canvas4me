import {
  buildDefaultImageRequestBody,
  getImageCapabilityBuilder,
} from './builders/image'
import { getLlmCapabilityBuilder } from './builders/llm'
import {
  buildDefaultSoundRequestBody,
  getSoundCapabilityBuilder,
} from './builders/sound'
import {
  buildDefaultVideoRequestBody,
  getVideoCapabilityBuilder,
} from './builders/video'

/**
 * 组装后端提交体（capability builder 优先，缺失时回退到 nodeType 默认 builder）。
 *
 * @param {object} params - 必须包含：
 *   - nodeType: 'llm' | 'image' | 'video' | 'sound'
 *   - capability: string (如 'nano-banana')
 *   - mode: string (如 'gemini-3.1-flash-image-preview')
 *   - modeParams: object (面板表单当前 mode 的参数，来自 data.modeParams[mode]）
 *   - collectedInputs: object (按端口 id 收集的连线输入)
 *   - canvasId, nodeId
 *
 * @returns {{ body: object, urlFields: Array<string | { get, set }>, externalUrls?: string[] }}
 *   统一返回包装形态。
 *   - urlFields 用于提交前 HEAD 探测 + URL 自愈,详见 src/canvas/runtime/urlFieldHelpers.js。
 *   - externalUrls (可选) 列出本次提交体中应被视为"外部 URL"的字符串(如用户粘贴的
 *     YouTube 链接)。useRunCapability 会把它们从健康检查/自愈范围内排除 ——
 *     这些 URL 不在我们 OSS 控制下,HEAD 探测会被 CORS 拦,自愈也无意义。
 *   builder 仍可返回裸 body(向后兼容),本函数自动包装。
 */
export function buildRequestBody(params) {
  const { nodeType, capability } = params

  const capabilityBuilder =
    getLlmCapabilityBuilder(capability) ||
    getImageCapabilityBuilder(capability) ||
    getVideoCapabilityBuilder(capability) ||
    getSoundCapabilityBuilder(capability)

  let raw
  if (capabilityBuilder) {
    raw = capabilityBuilder(params)
  } else {
    switch (nodeType) {
      case 'llm':
        throw new Error(`[buildRequestBody] LLM capability "${capability}" 未注册 build —— 每个 LLM capability 必须在 register.js 里提供 builder`)
      case 'image':
        raw = buildDefaultImageRequestBody(params); break
      case 'video':
        raw = buildDefaultVideoRequestBody(params); break
      case 'sound':
        raw = buildDefaultSoundRequestBody(params); break
      default:
        raw = {
          project_id: params.canvasId,
          node_id: params.nodeId,
          capability: params.capability,
          mode: params.mode,
        }
    }
  }

  // 包装形态: { body, urlFields, externalUrls? }
  if (raw && typeof raw === 'object' && raw.body && typeof raw.body === 'object') {
    return {
      body: raw.body,
      urlFields: Array.isArray(raw.urlFields) ? raw.urlFields : [],
      externalUrls: Array.isArray(raw.externalUrls) ? raw.externalUrls : [],
    }
  }
  // 裸 body 形态: 兼容老 builder, urlFields 为空 (不参与自愈)
  return { body: raw, urlFields: [], externalUrls: [] }
}
