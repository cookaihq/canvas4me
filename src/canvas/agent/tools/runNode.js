/**
 * 工具 run_node —— 触发一个能力节点运行(取号式)。
 *
 * 取号式语义:await ctx.run(nodeId) 只等到「上游提交完成(任务已建)」就返回,
 * 不阻塞等产物生成。随后立即回 { nodeId, status:'running' }。产物用 get_result 轮询读取。
 *
 * 校验:目标须是 capability 节点且已选子能力;锁定节点(连入运行中任务)不重复触发。
 *
 * 提交自检(关键):标准 run(useRunCapability)有多条「静默早退」分支 —— 缺必需输入、
 * 缺 capability/mode/api 定义、expandRuns 失败等情形会直接 return,既不抛错也不提交,
 * 节点停在 Ready。若此时仍回 { status:'running' },get_result 会把 Ready 永远当 running,
 * 调用方陷入无尽轮询。因此 await 之后立即重读「状态落点节点」(能力节点的状态在它下游
 * output 上,resolveStatusNode 统一反查):提交成功时它已被 run **同步**置为 polling/
 * validating(在内部 await 之前的 batchUpdateNodes 里),据此可靠区分「已提交」与「早退」。
 * 仍为 Ready ⟺ 早退未提交 → 抛清晰错误,而非假报 running。
 *
 * (Ready 节点首跑必在原节点「就地复用」其 output,该 output 会翻成 polling;只有非 Ready
 * 节点才派生新节点 —— 但非 Ready 本就不是 Ready,不会被本自检误判,故判定精确。)
 */
import { assertEditable, requireNode, assertNotLocked } from './_shared/guards'
import { resolveStatusNode } from './_shared/nodeShape'
import { normalizeRunStatus } from '@/canvas/utils/designTokens'

/** @type {import('./index').AgentTool} */
export const runNode = {
  name: 'run_node',
  description: '运行一个能力节点(取号式:确认已提交后立即返回 running,不等产物;用 get_result 取结果)。',
  inputSchema: {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: '要运行的能力节点 id' },
    },
    required: ['nodeId'],
    additionalProperties: false,
  },
  handler: async (args, ctx) => {
    assertEditable(ctx)
    const node = requireNode(ctx, args?.nodeId)
    if (node.type !== 'capability') {
      throw new Error(`run_node 只能运行能力节点,节点 ${node.id} 类型为 ${node.type}`)
    }
    if (!node.data?.capability) {
      throw new Error(`节点 ${node.id} 未选子能力,无法运行`)
    }
    assertNotLocked(node)

    // 取号式:等上游提交完成(run 的 promise resolve 于提交,而非产物完成)。
    await ctx.run(node.id)

    // 提交自检:重读状态落点。仍为 Ready ⟺ run 静默早退、未提交 → 抛错而非假报 running。
    const statusNode = resolveStatusNode(node, ctx.facade.getNodes())
    const normalized = normalizeRunStatus(statusNode.data?.runStatus)
    if (normalized === 'Ready') {
      throw new Error(`运行未启动(可能缺少必需输入/参数或子能力未接入),节点仍为 Ready: ${node.id}`)
    }
    return { nodeId: node.id, status: 'running' }
  },
}
