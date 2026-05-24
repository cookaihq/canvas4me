import { CAPABILITY_CONTENT_RESOLVERS } from '../registry/nodeTypes'

/**
 * 按 sourceCapability 派发到对应 capability 的 resolveContent。
 * 未注册 resolver → 返回 null + console.warn（不提供通用兜底，符合"每个节点单独写"原则）。
 */
export function resolveContentByCapability(capability, result) {
  if (!capability) return null
  const resolver = CAPABILITY_CONTENT_RESOLVERS[capability]
  if (!resolver) {
    console.warn(`[ai-canvas] no resolveContent registered for capability "${capability}"`)
    return null
  }
  return resolver(result)
}
