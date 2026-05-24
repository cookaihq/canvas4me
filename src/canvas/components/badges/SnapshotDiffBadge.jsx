import { Tooltip } from 'antd'

export default function SnapshotDiffBadge({ nodeData, variant = 'badge', onViewSnapshot }) {
  const { runStatus, modeParams, mode, lastRunSnapshot } = nodeData || {}
  const currentParams = modeParams?.[mode] || {}

  if (runStatus === 'idle' && !lastRunSnapshot) return null

  const isRunning = runStatus === 'running' || runStatus === 'polling'
  const isConsistent = lastRunSnapshot != null &&
    JSON.stringify(currentParams) === JSON.stringify(lastRunSnapshot)

  let bgColor, textColor, text, dotColor
  if (isRunning) {
    bgColor = 'rgba(16, 185, 129, 0.12)'
    textColor = 'var(--ac-success)'
    dotColor = 'var(--ac-success)'
    text = isConsistent ? '⏵ 正在运行' : '⏵ 正在运行 · 当前草稿已变化'
  } else if (isConsistent) {
    bgColor = 'var(--ac-bg-panel)'
    textColor = 'var(--ac-text-muted)'
    dotColor = 'var(--ac-text-muted)'
    text = '✓ 当前草稿 = 上次运行参数'
  } else {
    bgColor = 'rgba(14, 165, 233, 0.12)'
    textColor = 'var(--ac-info)'
    dotColor = 'var(--ac-info)'
    text = 'ℹ️ 当前草稿已变化（vs 上次运行）'
  }

  const showViewBtn = variant === 'bar' && lastRunSnapshot != null && !isConsistent && !isRunning && onViewSnapshot

  if (variant === 'badge') {
    return (
      <Tooltip title={text} placement="top">
        <span
          className="snapshot-diff-badge snapshot-diff-badge--badge"
          style={{ backgroundColor: bgColor }}
        >
          <span className="snapshot-diff-badge-dot" style={{ backgroundColor: dotColor }} />
        </span>
      </Tooltip>
    )
  }

  return (
    <div
      className="snapshot-diff-badge snapshot-diff-badge--bar"
      style={{ backgroundColor: bgColor, color: textColor }}
    >
      <span className="snapshot-diff-badge-bar-text">{text}</span>
      {showViewBtn && (
        <button
          type="button"
          className="snapshot-diff-badge-view-btn"
          onClick={onViewSnapshot}
        >
          查看运行参数
        </button>
      )}
    </div>
  )
}
