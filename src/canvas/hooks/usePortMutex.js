import { useMemo } from 'react'
import { getConnectedSources, isPortReplaceable } from '../utils/portMutex'

/**
 * 端口互斥 Hook
 *
 * 为视图组件提供简便的端口连线占用检查：
 * - isEdgeOccupied(portId) — 该端口是否因连线而需要"替代"面板输入（face-off 语义）
 * - hasAnyEdge(portId) — 该端口是否有任何入边（与互斥语义无关）
 * - getSourceNodes(portId) — 获取连入该端口的源节点
 *
 * 仅"可替代型"端口（非 context、非 multiple）才会报 isEdgeOccupied = true；
 * 其他端口（context / multi）即使有入边也返回 false，保持面板输入启用。
 *
 * @param {string} nodeId - 当前能力节点 ID
 * @param {Array} edges - 画布所有连线
 * @param {Array} nodes - 画布所有节点
 * @param {Array} [inputDefs] - 端口定义数组（resolveInputs 的结果）；不传时按"全部可替代"退化到旧行为
 */
export default function usePortMutex(nodeId, edges, nodes, inputDefs) {
  // 缓存当前节点的入边
  const incomingEdges = useMemo(() => {
    if (!edges || !nodeId) return []
    return edges.filter(e => e.target === nodeId)
  }, [edges, nodeId])

  // 被连线占用的端口 ID 集合
  const occupiedPorts = useMemo(() => {
    return new Set(incomingEdges.map(e => e.targetHandle))
  }, [incomingEdges])

  // portId → portDef 查找表
  const portDefMap = useMemo(() => {
    const m = {}
    if (Array.isArray(inputDefs)) {
      for (const d of inputDefs) m[d.id] = d
    }
    return m
  }, [inputDefs])

  return {
    /** 该端口是否因连线需要"替代"面板输入（仅可替代型端口） */
    isEdgeOccupied: (portId) => {
      if (!occupiedPorts.has(portId)) return false
      return isPortReplaceable(portDefMap[portId])
    },

    /** 该端口上是否有任何入边（无视互斥语义） */
    hasAnyEdge: (portId) => occupiedPorts.has(portId),

    /** 获取连入某端口的源节点列表 */
    getSourceNodes: (portId) => getConnectedSources(edges, nodes, nodeId, portId),
  }
}
