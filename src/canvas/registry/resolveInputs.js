import { getModeDef } from './nodeTypes'

/**
 * 根据 (capability, mode) 解析输入端口列表。
 *
 * 只支持静态声明。`required: fn(config)` / `visible: fn(config)` 这类运行时联动
 * 函数在三层结构下已废弃——各 mode 在注册表中各自声明独立的 inputs（见 design.md §4.2）。
 *
 * @param {string} capabilityId
 * @param {string} [mode] - mode id；为空时回退到 CAPABILITIES[cap].defaultMode
 * @returns {Array<{id, label, accept, required, multiple}>}
 */
export function resolveInputs(capabilityId, mode) {
  const modeDef = getModeDef(capabilityId, mode)
  if (!modeDef) return []
  return modeDef.inputs.map(input => ({
    ...input,
    required: Boolean(input.required),
  }))
}
