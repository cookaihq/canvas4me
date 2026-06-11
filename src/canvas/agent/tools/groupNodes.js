/**
 * 工具 group_nodes / ungroup —— 把显式给定的一组节点框成一个分组,或解散一个分组。
 *
 * group_nodes(nodeIds, name?):
 *   - 对「显式传入的 id 集合」成组(不依赖当前选中态),与工具栏「选中再成组」解耦。
 *   - 排除分组节点本身、已属某分组的子节点(一个节点只能属一个分组);成员含折叠能力节点时,
 *     连带其常驻 output 一起进组。有效成员 < 2 报错。
 *   - 几何 = 成员包围盒 + padding(buildGroupedNodes 纯函数算),经 facade.batchUpdateNodes 落地。
 *   - 可选 name 写进分组 data.name。
 *
 * ungroup(groupId): 复用画布标准 groupActions.ungroup —— 删分组、成员清 parentId、相对坐标转回绝对。
 *
 * 节点写入只走 facade / 标准 groupActions,不裸 setNodes。
 */
import { isFoldedCapability, isOutputNodeType } from '@/canvas/registry/nodeTypes'
import { GROUP_PADDING } from '@/canvas/constants/group'
import { buildGroupedNodes, expandMembersWithFoldedOutputs } from '@/canvas/utils/groupGrouping'
import { assertEditable } from './_shared/guards'

/** @type {import('./index').AgentTool} */
export const groupNodes = {
  name: 'group_nodes',
  description: '把指定的一组节点(≥2 个)框成一个分组。折叠能力节点的产物节点会一起进组。可选 name。',
  inputSchema: {
    type: 'object',
    properties: {
      nodeIds: {
        type: 'array',
        items: { type: 'string' },
        minItems: 2,
        description: '要成组的节点 id 列表(显式,不依赖选中态)',
      },
      name: { type: 'string', description: '分组名(可选)' },
    },
    required: ['nodeIds'],
    additionalProperties: false,
  },
  handler: (args, ctx) => {
    assertEditable(ctx)
    const ids = args?.nodeIds
    if (!Array.isArray(ids) || ids.length < 2) {
      throw new Error('group_nodes 需要至少 2 个 nodeId')
    }
    const { facade } = ctx
    const all = facade.getNodes()
    const byId = new Map(all.map((n) => [n.id, n]))

    // 校验:每个 id 必须存在;过滤掉 group 节点本身、已属某分组的子节点。
    for (const id of ids) {
      if (!byId.has(id)) throw new Error(`节点不存在: ${id}`)
    }
    const wanted = new Set(
      ids.filter((id) => {
        const n = byId.get(id)
        return n.type !== 'group' && !n.parentId
      })
    )
    if (wanted.size < 2) {
      throw new Error('有效成员不足 2 个(分组节点本身、已在分组内的节点会被排除)')
    }

    // 成组结果(含 groupId)在写入前先用当前快照同步算好,再以「常量更新器」落库。
    // 不在 batchUpdateNodes 的更新器闭包里现算 —— 底层写入是延迟批处理(更新器晚于
    // 本 handler 执行),闭包里赋值的 groupId 此刻还读不到,会回 null。先算后写既保证
    // 返回值可用,也与延迟批处理对同一快照求值的结果一致(命令串行,期间无并发写)。
    const name = typeof args?.name === 'string' ? args.name : null
    const memberIds = expandMembersWithFoldedOutputs(all, wanted, { isFoldedCapability, isOutputNodeType })
    const { nodes: grouped, groupId } = buildGroupedNodes(all, memberIds, GROUP_PADDING)
    const nextNodes = name
      ? grouped.map((n) => (n.id === groupId ? { ...n, data: { ...n.data, name } } : n))
      : grouped
    facade.batchUpdateNodes(() => nextNodes)
    // 返回真实进组成员(展开后,含被连带进组的折叠 output),而非展开前的 wanted —— 让 agent 拿到准确成员。
    return { ok: true, groupId, memberIds: Array.from(memberIds) }
  },
}

/** @type {import('./index').AgentTool} */
export const ungroupNodes = {
  name: 'ungroup',
  description: '解散一个分组:删除分组,成员恢复为自由节点(保留各自绝对位置)。',
  inputSchema: {
    type: 'object',
    properties: {
      groupId: { type: 'string', description: '要解散的分组节点 id' },
    },
    required: ['groupId'],
    additionalProperties: false,
  },
  handler: (args, ctx) => {
    assertEditable(ctx)
    const groupId = args?.groupId
    if (!groupId || typeof groupId !== 'string') throw new Error('ungroup 需要字符串 groupId')
    const group = ctx.facade.getNodes().find((n) => n.id === groupId)
    if (!group) throw new Error(`分组不存在: ${groupId}`)
    if (group.type !== 'group') throw new Error(`节点 ${groupId} 不是分组(type=${group.type})`)
    const groupActions = ctx.groupActions()
    if (!groupActions || typeof groupActions.ungroup !== 'function') {
      throw new Error('分组能力未接通')
    }
    groupActions.ungroup(groupId)
    return { ok: true, groupId, ungrouped: true }
  },
}
