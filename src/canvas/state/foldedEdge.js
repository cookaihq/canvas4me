import { isFoldedCapability, isOutputNodeType, getCapabilityPrimaryOutput, resolveModeId } from '../registry/nodeTypes'

// outputId -> { parentId, parentHandle }
// 复刻 src/canvas/index.jsx 的折叠反查表逻辑(原 296-315),纯函数版。
export function buildFoldedOutputMap(nodeLookup, edges) {
  const map = new Map()
  for (const node of nodeLookup.values()) {
    if (node.type !== 'capability') continue
    if (!isFoldedCapability(node.data?.capability)) continue
    const modeId = resolveModeId(node.data?.capability, node.data?.mode)
    const parentHandle = getCapabilityPrimaryOutput(node.data?.capability, modeId)?.id
    if (!parentHandle) continue
    for (const edge of edges) {
      if (edge.source !== node.id) continue
      const target = nodeLookup.get(edge.target)
      if (target && isOutputNodeType(target.type)) map.set(target.id, { parentId: node.id, parentHandle })
    }
  }
  return map
}

// 一条边在折叠映射下的端点重写 + 是否内部边(parent↔自己被折叠的 output,视觉隐藏)。
export function resolveEdgeEndpoints(edge, foldedMap) {
  const srcRedirect = foldedMap.get(edge.source)
  const tgtRedirect = foldedMap.get(edge.target)
  if (tgtRedirect && tgtRedirect.parentId === edge.source) return { ...edge, hiddenInternal: true }
  if (srcRedirect && srcRedirect.parentId === edge.target) return { ...edge, hiddenInternal: true }
  let { source, sourceHandle, target, targetHandle } = edge
  if (srcRedirect) { source = srcRedirect.parentId; sourceHandle = srcRedirect.parentHandle }
  if (tgtRedirect) { target = tgtRedirect.parentId; targetHandle = tgtRedirect.parentHandle }
  return { ...edge, source, sourceHandle, target, targetHandle, hiddenInternal: false }
}
