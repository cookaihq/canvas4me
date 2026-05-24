import { CAPABILITIES } from '@/canvas/registry/nodeTypes'

/**
 * 翻转节点的 userTouched 标记（粗粒度）。
 *
 * 单值端口：userTouched[mode][fieldId].__field = true
 * 多值端口：userTouched[mode][fieldId].__array_touched = true
 *
 * 幂等：已标记的 key 不会重复写入（节点引用不变）。
 * 支持 fieldIds 数组，一次 setNodes 调用批量处理。
 *
 * @param {object} opts
 * @param {string} opts.nodeId
 * @param {string} opts.capability
 * @param {string} opts.mode
 * @param {string|string[]} opts.fieldIds  单个 fieldId 或多个 fieldId 数组
 * @param {Function} applyNodes
 */
export function markUserTouched({ nodeId, capability, mode, fieldIds }, applyNodes) {
  const cap = CAPABILITIES[capability]
  if (!cap) return

  const ids = Array.isArray(fieldIds) ? fieldIds : [fieldIds]
  const modeInputs = cap?.modes?.[mode]?.inputs || []

  const updates = []
  for (const fieldId of ids) {
    const inputSchema = modeInputs.find(i => i.id === fieldId)
    if (!inputSchema) continue
    const key = inputSchema.multiple ? '__array_touched' : '__field'
    updates.push({ fieldId, key })
  }
  if (updates.length === 0) return

  applyNodes(nds => nds.map(n => {
    if (n.id !== nodeId) return n
    const prevTouched = n.data.userTouched || {}
    const prevModeTouched = prevTouched[mode] || {}
    let nextModeTouched = prevModeTouched
    let changed = false

    for (const { fieldId, key } of updates) {
      const prevFieldTouched = nextModeTouched[fieldId] || {}
      if (prevFieldTouched[key] === true) continue
      nextModeTouched = { ...nextModeTouched, [fieldId]: { ...prevFieldTouched, [key]: true } }
      changed = true
    }
    if (!changed) return n
    return {
      ...n,
      data: {
        ...n.data,
        userTouched: { ...prevTouched, [mode]: nextModeTouched },
      },
    }
  }))
}
