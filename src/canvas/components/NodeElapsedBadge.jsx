import { memo, useEffect, useState } from 'react'
import { Tooltip } from 'antd'
import { AlertTriangle, Zap } from '@/canvas/icons'

function formatElapsed(ms) {
  if (!Number.isFinite(ms) || ms < 0) return ''
  return `${(ms / 1000).toFixed(1)}s`
}

/**
 * 节点耗时 chip —— 由 NodeMetaRow 渲染在 meta 行右侧
 *
 * - 仅在进行态(running/polling/streaming/validating)渲染；done/error 时返回 null
 * - 进行态：每 100ms 重算，实时跳动
 * - timedOut=true：橙色 + ⚠ + tooltip，停止跳秒
 * - 缺 startedAt 时不渲染
 */
function NodeElapsedBadge({ startedAt, finishedAt, runStatus, timedOut = false }) {
  const isProcessing = runStatus === 'running' || runStatus === 'polling' || runStatus === 'streaming' || runStatus === 'validating'
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!isProcessing || !startedAt || timedOut) return
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [isProcessing, startedAt, timedOut])

  if (!startedAt || !isProcessing) return null

  const endTs = timedOut ? (finishedAt || now) : now
  const text = formatElapsed(endTs - startedAt)
  if (!text) return null

  const className = `node-elapsed-chip${timedOut ? ' is-timed-out' : ''}`
  const content = (
    <span className={className}>
      {timedOut ? <AlertTriangle size={10} /> : <Zap size={10} />}
      {text}
    </span>
  )

  if (!timedOut) return content
  return (
    <Tooltip title="客户端已停止接收 · 刷新页面可续传" placement="top">
      {content}
    </Tooltip>
  )
}

export default memo(NodeElapsedBadge)
