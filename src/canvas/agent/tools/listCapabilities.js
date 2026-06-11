/**
 * 工具 list_capabilities —— 枚举注册表里的全部能力(能力 → mode → 参数 + 端口)。
 *
 * 外部 agent 据此知道:有哪些能力、每个能力有哪些 mode、每个 mode 需要哪些输入端口
 * (做 connect 用)、可调哪些参数(做 add_node / set_params 用)。
 *
 * 数据全部来自能力注册表(模块级 import,无需 ctx),handler 只读。
 */
import { describeAllCapabilities } from './_shared/capabilityShape'

/** @type {import('./index').AgentTool} */
export const listCapabilities = {
  name: 'list_capabilities',
  description: '枚举全部能力(每个能力的 mode、参数与输入/输出端口),供据此新建能力节点与连线。',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  handler: () => ({ capabilities: describeAllCapabilities() }),
}
