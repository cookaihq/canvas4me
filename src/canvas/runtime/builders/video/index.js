import { CAPABILITY_BUILDERS } from '../../../registry/nodeTypes'
import { buildDefaultVideoRequestBody } from './shared'

/**
 * Video builder 查询入口。
 * 各 video capability 在自己 register.js 里通过 registerCapability({ build, ... })
 * 把 builder 注入到 CAPABILITY_BUILDERS.video。
 */
export function getVideoCapabilityBuilder(capability) {
  return CAPABILITY_BUILDERS.video[capability] || null
}

export { buildDefaultVideoRequestBody }
