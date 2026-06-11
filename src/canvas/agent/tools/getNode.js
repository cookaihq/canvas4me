/**
 * 工具 get_node —— 取单个节点的完整 dump:端口 / modeParams / content / runStatus /
 * lastRunSnapshot / portConnections / 几何。节点不存在时抛错让 agent 纠错。
 *
 * dump 结构见 _shared/nodeShape.js 的 dumpNode。handler 只读。
 */
import { dumpNode } from './_shared/nodeShape'

/** @type {import('./index').AgentTool} */
export const getNode = {
  name: 'get_node',
  description: '取单个节点的完整详情(端口、参数、产物、运行状态、连线落点、几何)。',
  inputSchema: {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: '节点 id' },
    },
    required: ['nodeId'],
    additionalProperties: false,
  },
  handler: (args, ctx) => {
    const { facade } = ctx
    const nodeId = args?.nodeId
    if (!nodeId || typeof nodeId !== 'string') throw new Error('get_node 需要字符串入参 nodeId')
    const node = facade.getNodes().find((n) => n.id === nodeId)
    if (!node) throw new Error(`节点不存在: ${nodeId}`)
    return dumpNode(node)
  },
}
