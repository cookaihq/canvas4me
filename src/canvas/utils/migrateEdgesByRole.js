/**
 * 跨 capability / mode 切换时, 按 role + canAcceptRoles 把老入边迁到新端口集.
 *
 * 协议: 见 docs/reference/port-role-convention.md + docs/archive/20260513-folded-node-edit-semantics.md §4.2 / §4.3
 *
 * 匹配规则 (Phase 5 起严格执行, 过渡期 accept 降级已删除):
 *  - 严格 role 匹配: new.canAcceptRoles ?? [new.role] 包含 old.role
 *  - 任一端缺 role → 失败 (前置 lint 已保证 22 能力 register 端口都有 role, 这里只兜底)
 *  - 按 newInputs 声明顺序找第一个能接的端口 (能力作者通过排序控制优先级)
 *  - 多选 / 单选自适应: 单选端口被前面 edge 占了 → 该 edge 失败
 *
 * 入参:
 *  - edges: 当前画布所有 edges (含 isDraft)
 *  - nodeId: 目标能力节点 id (要迁的是 target === nodeId 的入边)
 *  - oldInputs: 老 capability/mode 的 inputs spec 数组
 *  - newInputs: 新 capability/mode 的 inputs spec 数组
 *
 * 出参:
 *  - migratedEdges: 更新后的全部 edges 数组 (targetHandle 已改; 失败 edge 的 targetHandle 保留原值)
 *  - failedEdgeIds: 失败 edge 的 id 数组 (用于 UI 标红虚线)
 */
export function migrateEdgesByRole({ edges, nodeId, oldInputs, newInputs }) {
  if (!Array.isArray(edges) || !nodeId) {
    return { migratedEdges: edges || [], failedEdgeIds: [] }
  }
  const safeOld = Array.isArray(oldInputs) ? oldInputs : []
  const safeNew = Array.isArray(newInputs) ? newInputs : []

  const oldByHandle = new Map()
  for (const i of safeOld) {
    if (i?.id) oldByHandle.set(i.id, i)
  }

  // 单选端口占用计数 (按新端口 id 计数, 单选端口 count >= 1 时拒绝后续 edge)
  const occupied = new Map()
  const failedEdgeIds = []

  const migratedEdges = edges.map((edge) => {
    if (!edge || edge.target !== nodeId) return edge
    const oldPort = oldByHandle.get(edge.targetHandle)
    const matched = pickNewPort({ oldPort, newInputs: safeNew, occupied })
    if (!matched) {
      failedEdgeIds.push(edge.id)
      return edge
    }
    // 占用计数: 单选端口接了 1 根后, 后续 edge 不能再接同一端口
    if (!matched.multiple) occupied.set(matched.id, (occupied.get(matched.id) || 0) + 1)
    if (matched.id === edge.targetHandle) return edge
    return { ...edge, targetHandle: matched.id }
  })

  return { migratedEdges, failedEdgeIds }
}

/**
 * 在 newInputs 里按声明顺序找第一个能接老端口的端口.
 *
 * 1. 单选端口被占用 → 跳过
 * 2. 双方都有 role 且 newPort.canAcceptRoles ?? [newPort.role] 包含 oldPort.role → 匹配
 * 3. 任一端缺 role → 跳过该端口 (Phase 5 起严格匹配; registerCapability lint 已确保
 *    所有能力端口都有 role, 这里只兜底缺失情况)
 */
function pickNewPort({ oldPort, newInputs, occupied }) {
  const oldRole = oldPort?.role
  if (!oldRole) return null

  for (const np of newInputs) {
    if (!np?.id) continue
    if (!np.multiple && (occupied.get(np.id) || 0) > 0) continue

    const newRole = np.role
    if (!newRole) continue

    const canAccept = Array.isArray(np.canAcceptRoles) ? np.canAcceptRoles : [newRole]
    if (canAccept.includes(oldRole)) return np
  }

  return null
}
