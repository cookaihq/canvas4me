import { CAPABILITY_BUILDERS } from '../../../registry/nodeTypes'
import { buildDefaultSoundRequestBody } from './shared'

/**
 * Sound builder 查询入口。
 * 各 sound capability 在自己 register.js 里通过 registerCapability({ build, ... })
 * 把 builder 注入到 CAPABILITY_BUILDERS.sound。
 */
export function getSoundCapabilityBuilder(capability) {
  return CAPABILITY_BUILDERS.sound[capability] || null
}

export { buildDefaultSoundRequestBody }
