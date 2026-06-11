/**
 * 工具 set_params —— 修改能力节点当前 mode 的表单参数(浅合并)。
 *
 * 写入目标:data.modeParams[当前 mode]。当前 mode = resolveModeId(capability, data.mode)。
 * 用 patchModeParams 把传入的 params 浅合并进该 mode 桶——而不是 updateNodeData({modeParams}),
 * 后者会整体替换 modeParams 对象、抹掉其他 mode 的桶。
 *
 * 校验:目标须是 capability 节点;锁定 / 运行中的节点不允许改参;参数里不接受 base64/blob url。
 *
 * 节点写入只走 facade.batchUpdateNodes(浅合并需要读到旧 data,故用 updater 形式)。
 */
import { resolveModeId } from '@/canvas/registry/nodeTypes'
import { patchModeParams } from '@/canvas/utils/capabilityNodeData'
import { assertEditable, requireNode, assertNotLocked, assertNotRunning, assertNoLocalUrls } from './_shared/guards'

/** @type {import('./index').AgentTool} */
export const setParams = {
  name: 'set_params',
  description: '修改能力节点当前 mode 的表单参数(浅合并进该 mode 桶,不影响其他 mode)。',
  inputSchema: {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: '能力节点 id' },
      params: {
        type: 'object',
        description: '要合并写入的参数(键见 list_capabilities 的 param.key);url 类参数须为远端 http(s) url',
      },
    },
    required: ['nodeId', 'params'],
    additionalProperties: false,
  },
  handler: (args, ctx) => {
    assertEditable(ctx)
    const node = requireNode(ctx, args?.nodeId)
    if (node.type !== 'capability') {
      throw new Error(`set_params 只能用于能力节点,节点 ${node.id} 类型为 ${node.type}`)
    }
    assertNotLocked(node)
    assertNotRunning(node, ctx)

    const params = args?.params
    if (!params || typeof params !== 'object' || Array.isArray(params)) {
      throw new Error('set_params 需要对象入参 params')
    }
    assertNoLocalUrls(params, 'params')

    const mode = resolveModeId(node.data?.capability, node.data?.mode)
    if (!mode) throw new Error(`节点 ${node.id} 未选子能力,无法定位参数桶`)

    ctx.facade.batchUpdateNodes((nds) =>
      nds.map((n) => (n.id === node.id ? { ...n, data: patchModeParams(n.data, mode, params) } : n))
    )
    return { ok: true, nodeId: node.id, mode, params: { ...params } }
  },
}
