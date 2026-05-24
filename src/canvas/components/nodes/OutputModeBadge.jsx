import { memo } from 'react'
import { CAPABILITIES, getModeLabel, isMultiMode } from '../../registry/nodeTypes'

/**
 * 输出节点右上角的 mode badge（见 concepts.md §和输入端口的关系 & design.md §5.5）。
 *
 * 数据源：run 时写入的 data.sourceCapability / data.sourceMode（useRunCapability.js）。
 *
 * 显示规则（与 CapabilityPanel Header 的 mode-badge 保持一致）：
 *   - 未记录 sourceCapability / sourceMode：不显示
 *   - 单模式 capability（只有 default 一个 mode）：不显示
 *   - 多模式 capability：显示 mode 的 label，颜色按 nodeType 取类型色
 */
function OutputModeBadge({ capability, mode }) {
  if (!capability || !mode) return null
  const capDef = CAPABILITIES[capability]
  if (!capDef) return null
  if (!isMultiMode(capability)) return null
  const modeLabel = getModeLabel(capability, mode)
  if (!modeLabel) return null
  const nodeType = capDef.nodeType
  return (
    <span
      className={`output-node-mode-badge panel-capability-mode-badge panel-capability-mode-badge-${nodeType}`}
    >
      {modeLabel}
    </span>
  )
}

export default memo(OutputModeBadge)
