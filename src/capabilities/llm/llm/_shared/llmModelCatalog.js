// src/capabilities/llm/llm/_shared/llmModelCatalog.js
/**
 * LLM 模型目录纯逻辑 —— 无 React、无 @/ alias，可用 node --test 直接跑。
 *
 * 数据源（taskClient.listLlmModels）是扁平表：[{ id, capabilities: ['text'|'vision'|'video'|'audio'|'file'] }]
 *   - filterModelsByMode: 按 mode 需要的 capability 过滤
 *   - mergeModelLabels:   叠加可选展示元数据（label/badge/description），缺省兜底 id
 *   - parseModelLabelsEnv: 安全解析 VITE_LLM_MODEL_LABELS（非法/空 → {}）
 */

// mode → 该 mode 需要模型具备的上游 capability（与后端 README capability 映射一致）
const MODE_CAPABILITY = {
  'llm-text': 'text',
  'llm-vision': 'vision',
  'llm-audio': 'audio',
  'llm-video': 'video',
  'llm-custom': 'text', // ≈ 全部（门控由下个 spec 按 capabilities 做）
}

export function filterModelsByMode(list, mode) {
  if (!Array.isArray(list)) return []
  const need = MODE_CAPABILITY[mode]
  if (!need) return list
  return list.filter(m => Array.isArray(m?.capabilities) && m.capabilities.includes(need))
}

export function mergeModelLabels(list, overlay) {
  if (!Array.isArray(list)) return []
  const map = overlay && typeof overlay === 'object' ? overlay : {}
  return list.map(m => {
    const id = m?.id
    const o = map[id] || {}
    return {
      name: id,
      label: o.label || id,
      badge: o.badge || '',
      description: o.description || '',
      capabilities: Array.isArray(m?.capabilities) ? m.capabilities : [],
    }
  })
}

export function parseModelLabelsEnv(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

// 混合模式专用：连入素材的端口类型 → 模型需要具备的能力
export const ATTACHMENT_CAPABILITY = {
  image: 'vision',
  video: 'video',
  audio: 'audio',
  file: 'file',
}

/**
 * 从已连接的素材分组算出当前需要哪些能力（去重）。
 * groups: { image:[], video:[], audio:[], file:[] }，某类有 ≥1 项即视为需要对应能力。
 * videoLinks: string[]（链接也算 video 输入）。
 */
export function getRequiredCapabilities(groups, videoLinks) {
  const req = new Set()
  for (const [kind, cap] of Object.entries(ATTACHMENT_CAPABILITY)) {
    const items = groups?.[kind]
    if (Array.isArray(items) && items.length > 0) req.add(cap)
  }
  if (Array.isArray(videoLinks) && videoLinks.length > 0) req.add(ATTACHMENT_CAPABILITY.video)
  return [...req]
}

/**
 * 给一个模型 + 需求能力列表，返回它缺的能力（空数组 = 兼容）。
 * 模型 capabilities 缺省时视为不具备任何能力 → 返回全部需求。
 */
export function getModelMissingCapabilities(model, requiredCaps) {
  const caps = Array.isArray(model?.capabilities) ? model.capabilities : []
  const need = Array.isArray(requiredCaps) ? requiredCaps : []
  return need.filter(c => !caps.includes(c))
}
