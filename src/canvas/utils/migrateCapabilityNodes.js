import { CAPABILITIES } from '../registry/nodeTypes'
import { extractModeDefaults } from '../registry/extractModeDefaults'

/**
 * 能力节点数据结构对齐（pass-through 为主）
 *
 * 新数据模型见 concepts.md §和输入端口的关系：
 *   - data.modeParams: { [mode]: { ...form params } }
 *   - data.portConnections: { [handle]: { source, sourceHandle } | [...] }
 *
 * 老画布的 data.config 已废弃。由于产品决策要求用户清空历史画布重新开始，
 * 本函数不做字段级迁移，只做最小兼容：缺字段的能力节点补 modeParams / portConnections，
 * 以及把无效 mode 重置为 defaultMode（防止 capability 被删后 mode id 悬空）。
 *
 * 同时给当前 mode 桶按 commonParams.defaultValue 补齐缺失字段（用户已设值优先）,
 * 让 UI 显示 / modeParams 真值 / builder 读到的值始终一致 —— 见
 * extractModeDefaults.js 头部对 defaultValue 「source of truth」语义的说明。
 *
 * 不再读 / 不再处理：config、sub_model、model 等旧字段。
 */
export function migrateCapabilityNodes(nodes) {
  if (!Array.isArray(nodes)) {
    return { nodes, migrated: false, affectedLabels: [] }
  }

  const affectedLabels = []
  const nextNodes = nodes.map(rawNode => {
    // 老画布 type: 'ability' → 'capability' 内存升级（保存后持久化到新值）
    const node = rawNode?.type === 'ability'
      ? { ...rawNode, type: 'capability' }
      : rawNode
    if (node?.type !== 'capability') return node
    const data = node.data || {}
    const capabilityId = data.capability
    if (!capabilityId) return node

    const capDef = CAPABILITIES[capabilityId]
    if (!capDef) return node

    const modeValid = data.mode && capDef.modes?.[data.mode]
    const needsDataShape = !data.modeParams || !data.portConnections
    const finalMode = modeValid ? data.mode : capDef.defaultMode

    // 当前 mode 桶是否缺 commonParams.defaultValue 字段
    const existingBucket = data.modeParams?.[finalMode] || {}
    const defaults = extractModeDefaults(capabilityId, finalMode)
    const needsDefaultsBackfill = Object.keys(defaults).some(
      k => existingBucket[k] === undefined
    )

    if (modeValid && !needsDataShape && !needsDefaultsBackfill) return node

    if (!modeValid) {
      affectedLabels.push(capDef.label || capabilityId)
    }

    // 用户已设值优先, 默认值仅填充缺失字段
    const mergedBucket = { ...defaults, ...existingBucket }

    return {
      ...node,
      data: {
        ...data,
        mode: finalMode,
        modeParams: {
          ...(data.modeParams || {}),
          [finalMode]: mergedBucket,
        },
        portConnections: data.portConnections || {},
      },
    }
  })

  return {
    nodes: nextNodes,
    migrated: affectedLabels.length > 0,
    affectedLabels,
  }
}
