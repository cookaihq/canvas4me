/**
 * 从 commonParams spec 提取 defaultValue map
 *
 * 节点创建 / mode 切换 / 旧数据迁移时, 把 spec.defaultValue 写入 modeParams,
 * 这样 UI 显示口径、modeParams 真值、builder 读到的值始终一致。
 *
 * 决策依据见: 2026-05-13 关于 commonParams defaultValue 语义的架构讨论
 *   spec.defaultValue 被定义为「source of truth」语义 —— 节点创建时写入,
 *   而非 UI fallback only。
 *
 * 用法:
 *   const defaults = extractModeDefaults(capability, mode)
 *   modeParams[mode] = { ...defaults, ...userOverrides }
 *
 * 无 defaultValue 的 spec 自动跳过 (如 LLM 的 model 运行时注入,
 * 此时 modeParams 不应预填 model 字段)。
 */
import { CAPABILITIES } from './nodeTypes'

export function extractModeDefaults(capability, mode) {
  const specs = CAPABILITIES[capability]?.modes?.[mode]?.commonParams || []
  const out = {}
  for (const spec of specs) {
    if (spec?.key && spec.defaultValue !== undefined) {
      out[spec.key] = spec.defaultValue
    }
  }
  return out
}
