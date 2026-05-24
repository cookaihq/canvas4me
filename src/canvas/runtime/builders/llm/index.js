import { CAPABILITY_BUILDERS } from '../../../registry/nodeTypes'

/**
 * LLM builder 查询入口。
 * 各 LLM capability 必须在 register.js 里通过 registerCapability({ build, ... })
 * 把 builder 注入到 CAPABILITY_BUILDERS.llm —— 不再提供默认 builder。
 */
export function getLlmCapabilityBuilder(capability) {
  return CAPABILITY_BUILDERS.llm[capability] || null
}
