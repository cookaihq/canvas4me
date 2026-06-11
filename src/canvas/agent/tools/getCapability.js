/**
 * 工具 get_capability —— 取单个能力的完整描述(mode / 参数 / 端口),
 * 结构与 list_capabilities 的单条一致。能力不存在时抛错,让 agent 能纠错。
 *
 * 数据来自能力注册表(模块级 import,无需 ctx),handler 只读。
 */
import { describeCapability } from './_shared/capabilityShape'

/** @type {import('./index').AgentTool} */
export const getCapability = {
  name: 'get_capability',
  description: '取单个能力的完整描述(mode、参数、输入/输出端口)。',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '能力 id(如 nano-banana)' },
    },
    required: ['id'],
    additionalProperties: false,
  },
  handler: (args) => {
    const id = args?.id
    if (!id || typeof id !== 'string') throw new Error('get_capability 需要字符串入参 id')
    const cap = describeCapability(id)
    if (!cap) throw new Error(`能力不存在: ${id}`)
    return cap
  },
}
