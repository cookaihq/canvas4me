/**
 * 多 mode capability 的端口 / edge mode 归属工具。
 *
 * 设计目标(对应 UX_SPEC §7.1 / §7.2 / §7.3):
 *   - 一个 capability 有多个 mode 时, 同 id + 同 accept + 同 multiple 的端口被视为
 *     "通用端口", 跨 mode 共享, 连到该端口的 edge 标 `data.capabilityMode = '*'`
 *   - mode-specific 端口的 edge 标具体 mode id (如 'llm-vision')
 *   - 切 mode 时, '*' edges 始终显示; mode-specific edges 只在 capabilityMode 与当前
 *     mode 匹配时显示, 其他视觉隐藏 (数据保留)
 *
 * 老画布兼容:
 *   - edge.data.capabilityMode === undefined 视为 '*'  (零迁移)
 *
 * @module canvas/utils/portMode
 */

import { CAPABILITIES, resolveModeId } from '../registry/nodeTypes'

/**
 * 判断某 capability 内的输入端口是否为"通用端口"
 *
 * 规则: 同一 capability 的每个 mode 的 inputs 里都存在该 portId, 且 accept 数组
 *       和 multiple 在所有 mode 之间完全一致 → 通用. 否则 mode-specific.
 *
 * 注意: 暂不处理输出端口(能力节点只渲染主输出, 主输出按 mode 切换语义本就明确,
 *       不需要"通用 vs specific"区分). portKind 参数保留作为未来扩展.
 *
 * @param {string} capabilityId
 * @param {string} portId
 * @param {'input'} [portKind='input']
 * @returns {boolean}
 */
export function isUniversalPort(capabilityId, portId, portKind = 'input') {
  if (portKind !== 'input') return false
  const capability = CAPABILITIES[capabilityId]
  if (!capability) return false
  const modes = capability.modes || {}
  const modeIds = Object.keys(modes)
  if (modeIds.length <= 1) return true   // 单 mode capability: 端口自然通用

  let referencePort = null
  for (const mId of modeIds) {
    const mode = modes[mId]
    const inputs = mode?.inputs || []
    const found = inputs.find((p) => p.id === portId)
    if (!found) return false             // 任一 mode 缺这个端口 → 非通用
    if (!referencePort) {
      referencePort = found
      continue
    }
    if (!areAcceptArraysEqual(referencePort.accept, found.accept)) return false
    if (Boolean(referencePort.multiple) !== Boolean(found.multiple)) return false
  }
  return true
}

/**
 * 解析 edge 创建时应写入的 capabilityMode 标记
 *
 *   - target 不是 capability 节点 → 返回 undefined (IO 节点的 edge 不需要 mode 标记)
 *   - target 是 capability + 端口是通用端口 → '*'
 *   - target 是 capability + 端口是 mode-specific → 当前 mode id
 *
 * @param {object} targetNode  React Flow 节点对象 (含 type / data)
 * @param {string} [targetHandleId]
 * @returns {string|undefined}
 */
export function resolveEdgeCapabilityMode(targetNode, targetHandleId) {
  if (!targetNode || targetNode.type !== 'capability') return undefined
  const capabilityId = targetNode.data?.capability
  if (!capabilityId || !targetHandleId) return undefined
  const modeId = resolveModeId(capabilityId, targetNode.data?.mode)
  if (!modeId) return undefined
  return isUniversalPort(capabilityId, targetHandleId, 'input') ? '*' : modeId
}

/**
 * edge 在当前 mode 下是否应当可见
 *
 *   - 老画布兼容: capabilityMode === undefined → 视为 '*' 通用, 始终可见
 *   - '*' → 通用, 始终可见
 *   - 与当前 mode 一致 → 可见
 *   - 其他 → 隐藏(视觉, 数据保留)
 *
 * @param {object} edge
 * @param {string} currentMode
 * @returns {boolean}
 */
export function isEdgeVisibleInMode(edge, currentMode) {
  const tagged = edge?.data?.capabilityMode
  if (tagged === undefined || tagged === null) return true   // 老 edge 视为通用
  if (tagged === '*') return true
  return tagged === currentMode
}

/**
 * 比较两个 accept 数组是否完全一致 (顺序无关)
 * @param {string[]} a
 * @param {string[]} b
 */
function areAcceptArraysEqual(a, b) {
  if (a === b) return true
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  for (let i = 0; i < sortedA.length; i++) {
    if (sortedA[i] !== sortedB[i]) return false
  }
  return true
}
