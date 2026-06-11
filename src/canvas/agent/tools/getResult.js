/**
 * 工具 get_result —— 读一个节点的运行结果(产物 + 状态)。供 run_node 之后轮询取结果。
 *
 * 状态归并(三桶):
 *   - Running / Polling / Streaming(含 validating) → 'running'(仍在跑,稍后再查)
 *   - Done                                          → 'done'(content 为产物)
 *   - Failed(error / transfer_failed)              → 'error'(content.error 为错误信息)
 *   - Ready / idle(尚未运行,无产物)               → 'running'(按"还没结果"对待)
 *
 * 能力节点本身恒为 idle,真实状态/产物在它下游的 output 节点上 —— 传入能力节点 id 时
 * 自动反查其 output 读取(resolveStatusNode 统一口径)。content 节点 / 输出节点直接读自身。
 *
 * content 形态按能力而定:{ url } / { urls:[...] } / { text } / ...(原样回传 data.content)。
 * handler 只读。
 */
import { normalizeRunStatus } from '@/canvas/utils/designTokens'
import { requireNode } from './_shared/guards'
import { resolveStatusNode } from './_shared/nodeShape'

/** 把规范化状态(六态)映射到对外三桶。 */
function toBucket(normalized) {
  if (normalized === 'Done') return 'done'
  if (normalized === 'Failed') return 'error'
  // Running / Polling / Streaming / Ready 都归 'running'(尚无最终结果)。
  return 'running'
}

/** @type {import('./index').AgentTool} */
export const getResult = {
  name: 'get_result',
  description: '读节点的运行结果:status(running/done/error)+ content(产物)。配合 run_node 轮询使用。',
  inputSchema: {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: '节点 id(可传能力节点;折叠能力会自动读其产物节点)' },
    },
    required: ['nodeId'],
    additionalProperties: false,
  },
  handler: (args, ctx) => {
    const node = requireNode(ctx, args?.nodeId)

    // 能力节点:状态/产物在它下游的 output 上(resolveStatusNode 统一反查)。
    const stateNode = resolveStatusNode(node, ctx.facade.getNodes())

    const normalized = normalizeRunStatus(stateNode.data?.runStatus)
    const status = toBucket(normalized)
    const content = stateNode.data?.content

    const out = { nodeId: node.id, status, runStatus: normalized }
    // resultNodeId:实际承载产物的节点(折叠时是 output 节点);与查询入参不同才附上,便于调用方定位。
    if (stateNode.id !== node.id) out.resultNodeId = stateNode.id
    if (content && typeof content === 'object') {
      if (status === 'error') {
        out.error = content.error ?? '运行失败'
      } else if (content.url || content.urls || content.text || Object.keys(content).length > 0) {
        out.content = content
      }
    }
    return out
  },
}
