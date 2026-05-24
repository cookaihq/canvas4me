import { CAPABILITY_BUILDERS } from '../../../registry/nodeTypes'
import { buildDefaultImageRequestBody } from './shared'

/**
 * Image builder 查询入口。
 * 各 image capability 在自己 register.js 里通过 registerCapability({ build, ... })
 * 把 builder 注入到 CAPABILITY_BUILDERS.image。
 */
export function getImageCapabilityBuilder(capability) {
  return CAPABILITY_BUILDERS.image[capability] || null
}

export { buildDefaultImageRequestBody }
