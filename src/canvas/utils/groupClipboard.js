import { genId, sanitizeClonedNodeData } from './nodeFactory'

/** 复制集合含 group 时, 连带其成员一起复制。纯函数。 */
export function expandCopyWithGroupMembers(prevNodes, selectedIds) {
  const ids = new Set(selectedIds)
  for (const n of prevNodes) {
    if (n.parentId && ids.has(n.parentId)) ids.add(n.id)
  }
  return ids
}

/**
 * 粘贴后重映射 parentId:旧 groupId→新 groupId(idMap[旧]);若父不在 idMap(没一起复制组)→清 parentId 变独立。
 * @param {Array} newNodes 已重映射 id 的新节点
 * @param {Object} idMap 旧 id → 新 id
 */
export function remapParentIds(newNodes, idMap) {
  return newNodes.map(n => {
    if (!n.parentId) return n
    const mapped = idMap[n.parentId]
    return { ...n, parentId: mapped || undefined }
  })
}

/**
 * 就地复制一个 group 连带成员: 克隆 group + 全部成员(含折叠 output) + 内部边,
 * 新 id、parentId/sourceCapabilityId 重映射、顶层(group)偏移 +20、成员相对不变。纯函数。
 *
 * 注: 克隆细节(idMap/sanitize/offset/edges)与 useCanvasActions.paste 重叠 —— 待抽公共
 * cloneNodesWithRemap 共享, 见 docs/BACKLOG.md。
 * @param {Object} group 选中的 group 节点
 * @param {Array} allNodes 全量节点
 * @param {Array} allEdges 全量边
 * @returns {{nodes:Array, edges:Array}} 待 addNodes/addEdges 的克隆结果(均 selected:true)
 */
export function buildGroupDuplicate(group, allNodes, allEdges) {
  const ids = expandCopyWithGroupMembers(allNodes, new Set([group.id]))
  const srcNodes = allNodes.filter(n => ids.has(n.id))
  const idMap = {}
  for (const n of srcNodes) idMap[n.id] = genId(n.id.split('-')[0])

  const cloned = srcNodes.map(n => {
    const baseData = { ...JSON.parse(JSON.stringify(n.data)), locked: false, portConnections: {}, canvasSeq: undefined }
    // 折叠输出的 sourceCapabilityId 跟着重指向同批克隆的新能力节点, 否则副本反查到原节点串号
    if (baseData.sourceCapabilityId && idMap[baseData.sourceCapabilityId]) {
      baseData.sourceCapabilityId = idMap[baseData.sourceCapabilityId]
    }
    return {
      ...n,
      id: idMap[n.id],
      // 偏移仅施加于顶层(group); 成员 position 是相对父的, 保持不变(整组随 group 平移)
      position: n.parentId ? { ...n.position } : { x: n.position.x + 20, y: n.position.y + 20 },
      selected: true,
      data: n.type === 'capability'
        ? sanitizeClonedNodeData({ ...baseData, runStatus: 'idle', lastRunSnapshot: null, userTouched: {} })
        : sanitizeClonedNodeData(baseData),
    }
  })
  const remapped = remapParentIds(cloned, idMap)

  const newEdges = allEdges
    .filter(e => idMap[e.source] && idMap[e.target])
    .map(e => ({ ...e, id: genId('edge-dup'), source: idMap[e.source], target: idMap[e.target], selected: true }))

  return { nodes: remapped, edges: newEdges }
}
