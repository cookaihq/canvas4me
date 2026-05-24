/**
 * prompt 内 edge placeholder 展开 —— 文本端口「连入 + 手输」兼容模式的运行时拼接 helper。
 *
 * 用户在 TextInputWithEdges 里编辑出来的 prompt 字符串形如:
 *   "请总结 {{ai-canvas:edge:node_3a2b}} 写 100 字"
 *
 * builder 取到这个 prompt 后调本 helper, placeholder 被替换成对应源节点的 content.text:
 *   "请总结 (这是源节点 node_3a2b 的完整文字) 写 100 字"
 *
 * placeholder 用 {{ai-canvas:edge:<sourceNodeId>}} 包裹,与项目已有的 RichPromptEditor
 * 「@图像N」机制属于同一类「string + placeholder」模式。
 *
 * 旧数据(纯文本 prompt,无 placeholder)调本 helper 等同 identity, 零迁移成本。
 *
 * @param {string} prompt           — 含 placeholder 的 prompt 字符串
 * @param {object} collectedInputs  — useRunCapability 收集的所有端口连入快照 { portId: input | input[] }
 *                                     单端: { nodeId, content, ... }
 *                                     多端: [{ nodeId, content, ... }, ...]
 * @param {string} portId           — 该 prompt 字段对应的输入端口 id (例 'prompt' / 'system-prompt')
 * @returns {string}                — 展开后的 prompt
 */
const PLACEHOLDER_RE = /\{\{ai-canvas:edge:([^}]+)\}\}/g

export function expandPromptPlaceholders(prompt, collectedInputs, portId) {
  if (typeof prompt !== 'string' || !prompt) return prompt || ''
  if (!prompt.includes('{{ai-canvas:edge:')) return prompt

  const inputAtPort = collectedInputs?.[portId]
  const inputArr = Array.isArray(inputAtPort)
    ? inputAtPort
    : inputAtPort
      ? [inputAtPort]
      : []

  const textBySourceId = new Map()
  for (const it of inputArr) {
    if (it?.nodeId) {
      textBySourceId.set(it.nodeId, it?.content?.text || '')
    }
  }

  return prompt.replace(PLACEHOLDER_RE, (_match, sourceId) => {
    return textBySourceId.has(sourceId) ? textBySourceId.get(sourceId) : ''
  })
}

export { PLACEHOLDER_RE as EDGE_PLACEHOLDER_RE }
