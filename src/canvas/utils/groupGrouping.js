import { createGroupNode } from './nodeFactory'
import { computeGroupBox, toRelative, toAbsolute } from './groupGeometry'

/**
 * 纯函数:给定全部节点 + 选中成员 id 集合 + padding, 算"成组后的新节点数组"。
 * - 新建 group(几何=成员包围盒+padding), 排数组最前(父在子前, spec §9.4)。
 * - 选中成员设 parentId=group.id, position 转相对 group 原点, 清 selected。
 * - 其余节点原样保留。不碰 store; 调用方拿返回值走 facade.batchUpdateNodes。
 * @returns {{ nodes, groupId }}
 */
export function buildGroupedNodes(prevNodes, memberIdSet, padding) {
  const members = prevNodes.filter(n => memberIdSet.has(n.id))
  const box = computeGroupBox(members, padding)
  const group = createGroupNode(box)
  const origin = { x: box.x, y: box.y }
  const rest = prevNodes.map(n => {
    if (!memberIdSet.has(n.id)) return n
    return { ...n, parentId: group.id, position: toRelative(n.position, origin), selected: false }
  })
  return { nodes: [group, ...rest], groupId: group.id }
}

/**
 * 解组纯函数:删掉 group 节点, 其成员清 parentId、position 由相对转回绝对。其余不动。
 * @returns 新节点数组
 */
export function buildUngroupedNodes(prevNodes, groupId) {
  const group = prevNodes.find(n => n.id === groupId)
  if (!group) return prevNodes
  const origin = { x: group.position.x, y: group.position.y }
  const out = []
  for (const n of prevNodes) {
    if (n.id === groupId) continue                            // 删 group
    if (n.parentId === groupId) {
      out.push({ ...n, parentId: undefined, position: toAbsolute(n.position, origin) })
    } else {
      out.push(n)
    }
  }
  return out
}

/**
 * 把待删 id 集合扩展为"删 group 连带其全部成员, 成员里折叠能力节点连带其 output"。
 * 供删除两轨(onBeforeDelete / deleteSelected)共用。纯函数。
 */
export function expandGroupDeletion(prevNodes, toDeleteIds, { isFoldedCapability, isOutputNodeType }) {
  const ids = new Set(toDeleteIds)
  // 1. group → 其成员
  for (const n of prevNodes) {
    if (n.parentId && ids.has(n.parentId)) ids.add(n.id)
  }
  // 2. 成员(及任何待删)里的折叠能力 → 其 output
  const byId = new Map(prevNodes.map(n => [n.id, n]))
  for (const id of Array.from(ids)) {
    const n = byId.get(id)
    if (n?.type !== 'capability' || !isFoldedCapability(n.data?.capability)) continue
    for (const m of prevNodes) {
      if (isOutputNodeType(m.type) && (m.data?.sourceCapabilityId ?? m.data?.sourceAbilityId) === id) ids.add(m.id)
    }
  }
  return ids
}

/**
 * 把选中集合扩展到"折叠能力节点的 output 一起进组"(spec §3.1.4 / §9.1)。
 * @returns Set<string>
 */
export function expandMembersWithFoldedOutputs(prevNodes, selectedIds, { isFoldedCapability, isOutputNodeType }) {
  const ids = new Set(selectedIds)
  const byId = new Map(prevNodes.map(n => [n.id, n]))
  for (const id of Array.from(ids)) {
    const n = byId.get(id)
    if (n?.type !== 'capability' || !isFoldedCapability(n.data?.capability)) continue
    for (const m of prevNodes) {
      if (isOutputNodeType(m.type) && (m.data?.sourceCapabilityId ?? m.data?.sourceAbilityId) === id) ids.add(m.id)
    }
  }
  return ids
}
