/**
 * 工具 connect —— 在两个节点间连一条线(source 输出端口 → target 输入端口)。
 *
 * 校验(给 agent 清晰错误):
 *   - source / target 节点必须存在。
 *   - sourceHandle 必须是 source 的某个输出端口;省略时,若 source 只有一个输出端口则自动取它,
 *     多个则报错要求指明。targetHandle 同理(对 target 的输入端口)。
 *   - 端口推导复用 nodeShape 的 resolveNodePorts(capability 按 mode 解析、content 单输出=subType、
 *     输出节点单输入='input')。
 *   - 通过画布标准 isValidConnection 兜底(类型匹配 / 自环 / 重复等)。
 *
 * 落地复用画布标准 onConnect(经 ctx.connect):写边 + 同步 target 的 portConnections +
 * 折叠能力源端口代理,使命令连线与手动拉线完全一致。不裸 addEdges。
 */
import { resolveNodePorts } from './_shared/nodeShape'
import { assertEditable, requireNode } from './_shared/guards'

/**
 * 解析一个端口 id:给定可选 handle + 该侧端口列表,返回确定的 handle 或抛错。
 * @param {string|undefined} handle 入参里的 handle(可选)
 * @param {object[]} ports 该侧端口列表([{id,...}])
 * @param {string} side 'source' | 'target'(错误信息用)
 * @param {string} nodeId 节点 id(错误信息用)
 */
function resolveHandle(handle, ports, side, nodeId) {
  if (handle != null) {
    if (!ports.some((p) => p.id === handle)) {
      const avail = ports.map((p) => p.id).join(', ') || '(无)'
      throw new Error(`${side} 节点 ${nodeId} 没有端口 "${handle}";可用端口: ${avail}`)
    }
    return handle
  }
  if (ports.length === 0) throw new Error(`${side} 节点 ${nodeId} 没有可用端口`)
  if (ports.length > 1) {
    const avail = ports.map((p) => p.id).join(', ')
    throw new Error(`${side} 节点 ${nodeId} 有多个端口,请指明 ${side}Handle;可用端口: ${avail}`)
  }
  return ports[0].id
}

/** @type {import('./index').AgentTool} */
export const connect = {
  name: 'connect',
  description:
    '在两个节点间连线(source 输出 → target 输入)。sourceHandle/targetHandle 可省略' +
    '(端口唯一时自动选取);端口不存在或非法连接会报错。',
  inputSchema: {
    type: 'object',
    properties: {
      source: { type: 'string', description: '源节点 id(提供输出)' },
      target: { type: 'string', description: '目标节点 id(接收输入)' },
      sourceHandle: { type: 'string', description: '源输出端口 id(可省略,端口唯一时自动取)' },
      targetHandle: { type: 'string', description: '目标输入端口 id(可省略,端口唯一时自动取)' },
    },
    required: ['source', 'target'],
    additionalProperties: false,
  },
  handler: (args, ctx) => {
    assertEditable(ctx)
    const sourceNode = requireNode(ctx, args?.source)
    const targetNode = requireNode(ctx, args?.target)

    const sourcePorts = resolveNodePorts(sourceNode).outputs
    const targetPorts = resolveNodePorts(targetNode).inputs
    const sourceHandle = resolveHandle(args?.sourceHandle, sourcePorts, 'source', sourceNode.id)
    const targetHandle = resolveHandle(args?.targetHandle, targetPorts, 'target', targetNode.id)

    const connection = {
      source: sourceNode.id,
      sourceHandle,
      target: targetNode.id,
      targetHandle,
    }

    // 画布标准校验兜底(类型不匹配 / 自环 / 同端点重复等)。
    if (ctx.isValidConnection && ctx.isValidConnection(connection) === false) {
      throw new Error(`非法连接:${sourceNode.id}.${sourceHandle} → ${targetNode.id}.${targetHandle}`)
    }

    ctx.connect(connection)
    return { ok: true, ...connection }
  },
}
