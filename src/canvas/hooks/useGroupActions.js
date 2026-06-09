import { useCallback } from 'react'
import { useCanvasFacade } from '../state/canvasFacade'
import { isFoldedCapability, isOutputNodeType } from '../registry/nodeTypes'
import { GROUP_PADDING } from '../constants/group'
import { buildGroupedNodes, buildUngroupedNodes, expandMembersWithFoldedOutputs } from '../utils/groupGrouping'

/** 分组操作:成组 / 解组等。 */
export default function useGroupActions({ isEditing, triggerSave }) {
  const facade = useCanvasFacade()
  const createGroup = useCallback(() => {
    if (!isEditing) return
    facade.batchUpdateNodes((prev) => {
      // !n.parentId: 排除已属某 group 的子节点(框选 group 会连带选中其子, spec §4.1)——否则
      // buildGroupedNodes 把子节点的相对坐标当绝对坐标算会错位, 且违反 spec §1.2「一个节点只能属于一个分组」
      const selectedIds = new Set(prev.filter(n => n.selected && n.type !== 'group' && !n.parentId).map(n => n.id))
      if (selectedIds.size < 2) return prev // 成组阈值 ≥2(spec 决策 10)
      const memberIds = expandMembersWithFoldedOutputs(prev, selectedIds, { isFoldedCapability, isOutputNodeType })
      const { nodes } = buildGroupedNodes(prev, memberIds, GROUP_PADDING)
      return nodes
    })
    triggerSave?.()
  }, [facade, isEditing, triggerSave])

  const ungroup = useCallback((groupId) => {
    if (!isEditing) return
    // groupId 缺省时, 取当前选中的首个 group
    facade.batchUpdateNodes((prev) => {
      const gid = groupId || prev.find(n => n.selected && n.type === 'group')?.id
      if (!gid) return prev
      return buildUngroupedNodes(prev, gid)
    })
    triggerSave?.()
  }, [facade, isEditing, triggerSave])

  return { createGroup, ungroup }
}
