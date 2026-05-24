/**
 * 画布内节点序号 —— 派生属性, 渲染时即时计算
 *
 * 用途: 节点卡片左上角与面板 header 显示 "#N", 便于多个相似节点之间区分
 *
 * 规则 (V2):
 *   - 不持久化(数据层不再写 node.data.canvasSeq)
 *   - 渲染时按节点创建时间从 1 开始连续赋号
 *   - 删除节点后剩余节点重新连续编号(删 #2 后原 #3 变 #2)
 *
 * 旧 API (getNextCanvasSeq / withCanvasSeq / backfillCanvasSeq) 保留为 no-op
 * 兼容包装, 调用点逐步迁移到 computeNodeSeqMap; 加载历史画布时仍可读取旧 canvasSeq
 * 字段, 但渲染最终以即时计算结果为准.
 */

// 节点 id 形如 "${prefix}-${Date.now()}-${counter}" (也有 "-paste-"/"-dup-" 等变体),
// 取首个 >1e12 的数字作为创建时间戳; 找不到时落回 0 (这些节点会排在最前).
function extractTs(id) {
  const parts = String(id).split('-')
  for (const p of parts) {
    const n = Number(p)
    if (Number.isFinite(n) && n > 1e12) return n
  }
  return 0
}

/**
 * 计算节点编号 Map (派生属性, 不持久化)
 *
 * 实现: 按 id 时间戳升序排序, 从 1 连续赋号
 *
 * 折叠形态(form 2)下被折叠的输出节点不参与编号 - 通过 opts.excludeIds 传入.
 * 这些节点视觉上不显示, 也就不该占用编号槽位.
 *
 * @param {Array} nodes - React Flow 节点数组
 * @param {object} [opts]
 * @param {Set<string>} [opts.excludeIds] - 不参与编号的节点 id 集合
 * @returns {Map<string, number>} nodeId -> seq (从 1 开始, 被排除的节点不在 Map 里)
 */
export function computeNodeSeqMap(nodes, opts = {}) {
  const seqMap = new Map()
  if (!Array.isArray(nodes) || nodes.length === 0) return seqMap
  const exclude = opts.excludeIds
  // 排序时不要改变原数组顺序 (引用稳定性影响 React Flow), 复制再排
  let pool = nodes
  if (exclude && exclude.size > 0) {
    pool = nodes.filter(n => !exclude.has(n.id))
  }
  const sorted = [...pool].sort((a, b) => extractTs(a.id) - extractTs(b.id))
  sorted.forEach((n, idx) => {
    seqMap.set(n.id, idx + 1)
  })
  return seqMap
}

// ─── 向后兼容 API (deprecated, 改派生属性后调用点应逐步移除) ───

/**
 * @deprecated 编号改为派生属性后, 不再需要"分配下一个序号"的概念.
 * 保留是为了不破坏现存调用点; 新代码不应使用.
 * 仍按 max+1 计算返回值, 让旧调用点持久化的 canvasSeq 字段保持单调递增
 * (避免冲撞 / 不影响 React Flow 内部 diff). 渲染层会用 computeNodeSeqMap 覆盖.
 */
export function getNextCanvasSeq(nodes) {
  if (!Array.isArray(nodes)) return 1
  let max = 0
  for (const n of nodes) {
    const seq = n?.data?.canvasSeq
    if (typeof seq === 'number' && seq > max) max = seq
  }
  return max + 1
}

/**
 * @deprecated 编号改为派生属性后, 不再向 data.canvasSeq 写入. 直接返回原节点
 */
export function withCanvasSeq(node, _seq) {
  return node
}

/**
 * @deprecated 编号改为派生属性后, 加载历史画布无需回填. 直接返回原节点数组
 */
export function backfillCanvasSeq(nodes) {
  return nodes
}
