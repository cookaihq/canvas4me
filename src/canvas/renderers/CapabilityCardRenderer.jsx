import { memo } from 'react'
import { CAPABILITIES, getNodeType } from '../registry/nodeTypes'
import { STATUS_COLORS, normalizeRunStatus } from '../utils/designTokens'
import { NodeTypeIcons } from '@/canvas/icons'

// 四态枚举到展示文案的映射(色板从 STATUS_COLORS 中取规范化键)
const STATUS_MAP = {
  Ready:   { text: '就绪', color: STATUS_COLORS.Ready },
  Running: { text: '运行中', color: STATUS_COLORS.Running },
  Done:    { text: '完成', color: STATUS_COLORS.Done },
  Failed:  { text: '失败', color: STATUS_COLORS.Failed },
}

/**
 * 能力节点通用 fallback 卡片 —— 仅在 data.capability 已选但无 (capability, mode)
 * 专属 Card 文件注册时使用。"未选子能力"状态由 CapabilityCardInitialPicker 承担。
 *
 * 显示：能力类型 icon + 子能力 label + 运行状态
 */
function CapabilityCardRenderer({ data }) {
  const nodeType = getNodeType(data.nodeType ?? data.abilityType)
  const capability = data.capability ? CAPABILITIES[data.capability] : null
  const canonical = normalizeRunStatus(data.runStatus)
  const status = STATUS_MAP[canonical]

  // Icon 状态切换：未运行→节点类型图标，运行后→SVG icon
  const showSvgIcon = canonical !== 'Ready' && capability?.icon
  const TypeIcon = nodeType?.icon || NodeTypeIcons.llm

  return (
    <div className="capability-card">
      <div className="capability-card-icon">
        {showSvgIcon ? (
          <img src={capability.icon} alt="" className="capability-card-svg-icon" />
        ) : (
          <span className="capability-card-emoji"><TypeIcon size={28} /></span>
        )}
      </div>

      <div className="capability-card-info">
        <div className="capability-card-type">{capability?.label || nodeType?.label || '能力'}</div>
      </div>

      <div className="capability-card-status" style={{ color: status.color }}>
        {canonical === 'Running' && <span className="capability-card-spinner" />}
        <span>{status.text}</span>
      </div>
    </div>
  )
}

export default memo(CapabilityCardRenderer)
