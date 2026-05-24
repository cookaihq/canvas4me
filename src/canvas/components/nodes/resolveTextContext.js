import {
  isFoldedCapability,
  isOutputNodeType,
  getCapabilityPrimaryOutput,
  resolveModeId,
} from '../../registry/nodeTypes'

/**
 * 解析节点的可复制文本 — 返回正文字符串, 无可复制文本时返回 ''
 *
 * 用于节点选中态工具栏「复制文本」按钮的可见性 + 复制数据源.
 * 结构与 resolveMediaContext 对称(媒体走 content.url, 文本走 content.text):
 *   1. 文本输入节点 (input + subType==='text')          : 直接读 data.content.text
 *   2. 独立文本输出节点 (output-* 且持有 content.text)   : 直接读 data.content.text
 *   3. 折叠态文本能力节点 (capability + isFoldedCapability
 *      且主输出 type==='text')                          : 沿出边找下游 outputNode 的 content.text
 *
 * 折叠态能力节点本体不携带正文(content.text 为空), 正文落在被渲染层折叠掉的
 * 下游 outputNode.data.content.text 上 —— 与媒体折叠节点取产物 url 同理.
 *
 * @param {object} node 当前节点
 * @param {Map<string, object>} nodeById id → node 索引(沿边查找下游 output)
 * @param {Array<object>} edges 所有边
 * @returns {string} 可复制的正文; 无则 ''
 */
export function resolveCopyableText(node, nodeById, edges) {
  if (!node) return ''
  const data = node.data || {}

  // 1. 文本输入节点
  if (node.type === 'input' && data.subType === 'text') {
    return pickText(data.content?.text)
  }

  // 2. 独立文本输出节点
  if (isOutputNodeType(node.type)) {
    return pickText(data.content?.text)
  }

  // 3. 折叠态文本能力节点: 找下游 outputNode 拿正文
  if (data.capability && isFoldedCapability(data.capability)) {
    const modeId = resolveModeId(data.capability, data.mode)
    const primaryOutput = getCapabilityPrimaryOutput(data.capability, modeId)
    if (primaryOutput?.type !== 'text') return ''
    for (const e of edges) {
      if (e.source !== node.id) continue
      const target = nodeById.get(e.target)
      if (!target || !isOutputNodeType(target.type)) continue
      const t = pickText(target.data?.content?.text)
      if (t) return t
    }
  }

  return ''
}

// 非空白才算可复制; 返回原文(保留格式)或 ''
function pickText(text) {
  const t = text || ''
  return t.trim() ? t : ''
}
