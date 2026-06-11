/**
 * 工具 update_node —— 改一个节点的展示属性或删除它。
 *
 *   - name      → data.name(节点显示名)
 *   - color     → data.color(分组/备注等用)
 *   - position  → facade.moveNode(id, {x,y})(画布坐标系绝对位置)
 *   - delete:true → facade.removeNodes([id])(立即删除,无二次确认)
 *
 * 删除走 facade.removeNodes(deleteElements 路径):会触发 onBeforeDelete 级联,
 * 删折叠能力节点连带其常驻 output、删分组连带成员,与画布删除行为一致。
 * 锁定节点(连入运行中任务的输入)禁止删除,避免破坏在途任务。
 *
 * 名称/颜色改写经 facade.updateNodeData;位置改写经 facade.moveNode。均不裸 setNodes。
 * 至少要传一个可改字段(name/color/position/delete),否则报错。
 */
import { assertEditable, requireNode, assertNotLocked } from './_shared/guards'

/** @type {import('./index').AgentTool} */
export const updateNode = {
  name: 'update_node',
  description: '改节点的名称(name)/颜色(color)/位置(position),或删除节点(delete=true,立即生效)。',
  inputSchema: {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: '节点 id' },
      name: { type: 'string', description: '新的显示名' },
      color: { type: 'string', description: '新的颜色(分组/备注节点用)' },
      position: {
        type: 'object',
        description: '新的绝对位置(画布坐标系)',
        properties: { x: { type: 'number' }, y: { type: 'number' } },
        required: ['x', 'y'],
        additionalProperties: false,
      },
      delete: { type: 'boolean', description: '为 true 时删除该节点(立即,无确认)' },
    },
    required: ['nodeId'],
    additionalProperties: false,
  },
  handler: (args, ctx) => {
    assertEditable(ctx)
    const node = requireNode(ctx, args?.nodeId)
    const { facade } = ctx

    // 删除优先且独占:删了就不再谈改名/移动。
    if (args?.delete === true) {
      // 锁定节点(连入运行中任务的输入节点 data.locked=true)删了会破坏在途任务,禁止删。
      assertNotLocked(node)
      facade.removeNodes([node.id])
      return { ok: true, nodeId: node.id, deleted: true }
    }

    const hasName = typeof args?.name === 'string'
    const hasColor = typeof args?.color === 'string'
    const pos = args?.position
    const hasPos = pos && typeof pos.x === 'number' && typeof pos.y === 'number'
    if (!hasName && !hasColor && !hasPos) {
      throw new Error('update_node 至少要改一个字段:name / color / position / delete')
    }

    const dataPatch = {}
    if (hasName) dataPatch.name = args.name
    if (hasColor) dataPatch.color = args.color
    if (Object.keys(dataPatch).length > 0) facade.updateNodeData(node.id, dataPatch)
    if (hasPos) facade.moveNode(node.id, { x: pos.x, y: pos.y })

    return {
      ok: true,
      nodeId: node.id,
      ...(hasName ? { name: args.name } : {}),
      ...(hasColor ? { color: args.color } : {}),
      ...(hasPos ? { position: { x: pos.x, y: pos.y } } : {}),
    }
  },
}
