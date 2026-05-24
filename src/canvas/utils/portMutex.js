/**
 * 面板与端口互斥工具
 *
 * 互斥仅针对"可替代型"端口（face-off 关系）：
 * - 面板填了内容 → 画布禁止连线
 * - 画布连了线 → 面板只读展示
 *
 * 以下端口**不参与互斥**：
 * - `context` 端口：专职对话上下文，没有对应的面板字段
 * - `multiple: true` 的端口：面板上传与端口连线合并显示
 */

/**
 * 端口 ID → config 中对应字段的映射
 * 用于判断面板中某个端口是否已有内容
 */
const PORT_CONFIG_FIELDS = {
  'system-prompt': ['systemPrompt'],
  prompt: ['prompt'],
  image: ['images'],
  file: ['files'],
  audio: ['audios'],
  // videoLinks: llm-video 粘贴的 YouTube 链接 (params 数组,不上画布),
  // 跟 videos 一起算作 panel 占用 video 端口的依据
  video: ['videos', 'videoLinks'],
  mask: ['mask'],
  lyrics: ['lyrics'],
}

/**
 * 检查端口是否被面板内容占用
 *
 * @param {object} config - 能力节点的 config
 * @param {string} portId - 端口 ID
 * @returns {boolean}
 */
export function isPortOccupiedByPanel(config, portId) {
  if (!config) return false

  const fields = PORT_CONFIG_FIELDS[portId]
  if (fields) {
    return fields.some(key => {
      const val = config[key]
      if (Array.isArray(val)) return val.length > 0
      if (typeof val === 'string') return val.trim().length > 0
      return !!val
    })
  }

  // 回退：直接检查 config[portId] 或 config[portId + 's']
  const val = config[portId] || config[portId + 's']
  if (Array.isArray(val)) return val.length > 0
  if (typeof val === 'string') return val.trim().length > 0
  return !!val
}

/**
 * 检查端口是否被画布连线占用
 *
 * @param {Array} edges - 当前所有连线
 * @param {string} nodeId - 目标节点 ID
 * @param {string} portId - 端口 ID
 * @returns {boolean}
 */
export function isPortOccupiedByEdge(edges, nodeId, portId) {
  if (!edges || !nodeId || !portId) return false
  return edges.some(e => e.target === nodeId && e.targetHandle === portId)
}

/**
 * 端口是否属于"可替代型"（连线与面板内容互斥的端口）
 *
 * 非可替代型：
 * - `context` 端口：对话上下文，只能端口连入
 * - `multiple: true` 端口：面板上传与端口连线合并显示
 *
 * @param {object} portDef - 端口定义（含 id、multiple 等字段）
 * @returns {boolean}
 */
export function isPortReplaceable(portDef) {
  if (!portDef) return true
  if (portDef.id === 'context') return false
  if (portDef.multiple) return false
  return true
}

/**
 * 获取连入某端口的源节点信息
 *
 * @param {Array} edges - 当前所有连线
 * @param {Array} nodes - 当前所有节点
 * @param {string} nodeId - 目标节点 ID
 * @param {string} portId - 端口 ID
 * @returns {Array} 连入的源节点列表
 */
export function getConnectedSources(edges, nodes, nodeId, portId) {
  if (!edges || !nodes) return []
  return edges
    .filter(e => e.target === nodeId && e.targetHandle === portId)
    .map(e => nodes.find(n => n.id === e.source))
    .filter(Boolean)
}
