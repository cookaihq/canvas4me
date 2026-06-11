/**
 * 工具 focus_node —— 把镜头平移/居中到一个或多个节点。
 *
 * 仅改视口(view state),不经 facade(节点/边不变):用 viewport.panToNodesBounds(ids),
 * 它取这些节点的并集包围盒中心、平移到可见区中心(读 measured 尺寸算视觉真实包围盒)。
 *
 * 入参 nodeId(单个)或 nodeIds(多个),至少给一种。所有 id 必须存在。
 */
import { requireNode } from './_shared/guards'

/** @type {import('./index').AgentTool} */
export const focusNode = {
  name: 'focus_node',
  description: '把画布镜头平移居中到指定节点(单个 nodeId 或多个 nodeIds)。只移动视口,不改画布内容。',
  inputSchema: {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: '单个节点 id' },
      nodeIds: { type: 'array', items: { type: 'string' }, description: '多个节点 id(取并集包围盒居中)' },
    },
    additionalProperties: false,
  },
  handler: (args, ctx) => {
    const ids = []
    if (typeof args?.nodeId === 'string') ids.push(args.nodeId)
    if (Array.isArray(args?.nodeIds)) {
      for (const id of args.nodeIds) if (typeof id === 'string') ids.push(id)
    }
    if (ids.length === 0) throw new Error('focus_node 需要 nodeId 或 nodeIds')

    // 校验存在性(给 agent 清晰错误,而非静默不动)。
    for (const id of ids) requireNode(ctx, id)

    const viewport = ctx.viewport()
    if (!viewport || typeof viewport.panToNodesBounds !== 'function') {
      throw new Error('视口能力未接通')
    }
    viewport.panToNodesBounds(ids)
    return { ok: true, focused: ids }
  },
}
