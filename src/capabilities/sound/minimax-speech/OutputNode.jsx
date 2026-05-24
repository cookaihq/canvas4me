import { memo, useEffect, useState } from 'react'
import { Handle, Position, NodeResizer } from '@xyflow/react'
import { Loader2, Headphones, RotateCw, Clock } from '@/canvas/icons'
import OutputModeBadge from '@/canvas/components/nodes/OutputModeBadge'
import AudioRenderer from '@/canvas/renderers/content/AudioRenderer'
import { getContentTypeColor } from '@/canvas/utils/designTokens'
import NodeMetaRow from '@/canvas/components/NodeMetaRow'
import OutputHandles from '@/canvas/components/nodes/OutputHandles'
import { useCanvasFacade } from '@/canvas/state/canvasFacade'
import { useCapabilityRuntime } from '@/canvas/contexts/CapabilityRuntimeContext'

/**
 * MiniMax Speech 输出节点
 *
 * 折叠形态下: 节点本体由 FoldedAudioPreviewCard 承载, 本组件作为下游 outputNode
 *            被 index.jsx 渲染层过滤掉, 但仍需注册 (React Flow nodeTypes 要求).
 *            debugMode 下可通过 MediaPreviewToolbar "输出" 按钮弹 OutputPanel.
 *
 * 与 talking-head OutputNode 结构同构, 仅渲染器换成 AudioRenderer, 高度固定 100.
 */
const TRANSFER_RETRY_MAX = 5

const STATUS_TEXT = {
  pending: '排队中',
  processing: '处理中',
  transferring: '转存中',
}
const STATUS_FALLBACK = '处理中'

function getStatusLabel(pollProgress) {
  if (pollProgress?.status) return STATUS_TEXT[pollProgress.status] || STATUS_FALLBACK
  return STATUS_FALLBACK
}

function MinimaxSpeechOutput({ id, data, selected }) {
  const typeColor = getContentTypeColor('audio')
  const runStatus = data.runStatus
  const isDone = runStatus === 'done'
  const isError = runStatus === 'error'
  const isTransferFailed = runStatus === 'transfer_failed'
  const isProcessing = !isDone && !isError && !isTransferFailed
  const isPlaceholder = data.content?.placeholder === true

  const facade = useCanvasFacade()

  // 耗时计时
  const { timerStartedAt, timerFinishedAt } = data
  useEffect(() => {
    if (isProcessing && !timerStartedAt) {
      facade.updateNodeData(id, { timerStartedAt: Date.now() })
    } else if (!isProcessing && timerStartedAt && !timerFinishedAt) {
      facade.updateNodeData(id, { timerFinishedAt: Date.now() })
    }
  }, [isProcessing, timerStartedAt, timerFinishedAt, id, facade])

  const [tickNow, setTickNow] = useState(() => Date.now())
  useEffect(() => {
    if (!isProcessing || !timerStartedAt) return
    const interval = setInterval(() => setTickNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [isProcessing, timerStartedAt])

  const elapsedSec = timerStartedAt
    ? Math.max(0, Math.floor(((timerFinishedAt ?? tickNow) - timerStartedAt) / 1000))
    : 0

  return (
    <>
      <NodeResizer
        minWidth={180}
        minHeight={80}
        isVisible={selected}
        keepAspectRatio={false}
        lineClassName="node-resize-line"
        handleClassName="node-resize-handle"
      />

      <NodeMetaRow
        nodeId={id}
        name={data.name}
        runStatus={data.runStatus}
        startedAt={data.startedAt}
        finishedAt={data.finishedAt}
        timedOut={Boolean(data.content?.pollingTimeout || data.content?.sseTimeout)}
      />

      {isProcessing ? (
        <ProcessingCard data={data} selected={selected} nodeId={id} typeColor={typeColor} />
      ) : (
        <CompletedCard
          data={data}
          selected={selected}
          nodeId={id}
          typeColor={typeColor}
          isError={isError}
          isTransferFailed={isTransferFailed}
          isPlaceholder={isPlaceholder}
        />
      )}

      {timerStartedAt != null && (
        <TimerLabel elapsedSec={elapsedSec} isProcessing={isProcessing} />
      )}

      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="node-handle"
        style={{ '--port-color': typeColor, top: '44px' }}
      />
      <OutputHandles nodeId={id} sourceCapability={data.sourceCapability} sourceMode={data.sourceMode} />
    </>
  )
}

function TimerLabel({ elapsedSec, isProcessing }) {
  return (
    <div
      className="ms-output-timer"
      style={{
        position: 'absolute',
        bottom: -26,
        left: 0,
        height: 22,
        padding: '2px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 12,
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
        color: isProcessing ? '#1677ff' : 'var(--ac-text-secondary, rgba(0, 0, 0, 0.55))',
        background: 'var(--ac-bg-card, #fff)',
        border: '1px solid var(--ac-border-default, rgba(0, 0, 0, 0.08))',
        borderRadius: 4,
        zIndex: 11,
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      <Clock className={isProcessing ? 'icon-spin' : ''} size={12} />
      <span>{formatElapsed(elapsedSec)}</span>
    </div>
  )
}

function formatElapsed(sec) {
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

function ProcessingCard({ data, selected, nodeId, typeColor }) {
  const percent = Number.isFinite(data.pollProgress?.progress)
    ? Math.max(0, Math.min(100, data.pollProgress.progress))
    : 0
  const statusLabel = getStatusLabel(data.pollProgress)
  const label = data.label || '语音合成输出'

  return (
    <div
      className={`nb-output-card nb-output-processing${selected ? ' selected' : ''}`}
      style={{ '--type-color': typeColor }}
    >
      <OutputModeBadge capability={data.sourceCapability} mode={data.sourceMode} />
      <div className="nb-output-hover-label">{label}</div>
      <div className="nb-output-proc-header">
        <span className="nb-output-proc-status">{statusLabel} · {percent}%</span>
        <Headphones className="nb-output-proc-icon" />
      </div>
      <div className="nb-output-proc-body">
        <Loader2 className="nb-output-proc-spinner icon-spin" />
      </div>
    </div>
  )
}

function CompletedCard({ data, selected, nodeId, typeColor, isError, isTransferFailed, isPlaceholder }) {
  const label = data.label || '语音合成输出'
  const retryCount = data.transferRetryCount ?? 0
  const retryExhausted = isTransferFailed && retryCount >= TRANSFER_RETRY_MAX

  const { retryTransfer } = useCapabilityRuntime()
  const [retrying, setRetrying] = useState(false)

  const handleManualRetry = async (e) => {
    e.stopPropagation()
    if (retrying) return
    setRetrying(true)
    try {
      await retryTransfer?.(nodeId)
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div
      className={[
        'nb-output-card',
        'nb-output-completed',
        selected && 'selected',
        isError && 'is-error',
        isTransferFailed && 'is-transfer-failed',
      ].filter(Boolean).join(' ')}
      style={{ '--type-color': typeColor }}
    >
      <OutputModeBadge capability={data.sourceCapability} mode={data.sourceMode} />
      <div className="nb-output-hover-label">{label}</div>
      <div className="nb-output-done-header">
        <Headphones className="nb-output-done-icon" />
        <span className="nb-output-done-type">Audio</span>
        {isError && <span className="nb-output-badge nb-output-badge-error">Error</span>}
        {isTransferFailed && (
          <span className="nb-output-badge nb-output-badge-transfer-failed">
            转存失败 {retryCount}/{TRANSFER_RETRY_MAX}
          </span>
        )}
        {!isError && !isTransferFailed && !isPlaceholder && (
          <span className="nb-output-badge nb-output-badge-done">Done</span>
        )}
        {!isError && !isTransferFailed && isPlaceholder && (
          <span className="nb-output-badge nb-output-badge-placeholder">未生成</span>
        )}
      </div>
      <div className="nb-output-done-body">
        {isError ? (
          <div className="nb-output-error-msg">{data.content?.error || '运行失败'}</div>
        ) : isPlaceholder ? (
          <div className="nb-output-placeholder">
            <Headphones className="nb-output-placeholder-icon" />
            <span className="nb-output-placeholder-text">未生成</span>
          </div>
        ) : data.content?.url ? (
          <AudioRenderer data={data} nodeId={nodeId} />
        ) : (
          <Headphones className="nb-output-done-placeholder" />
        )}
      </div>
      {retryExhausted && (
        <div className="nb-output-retry-bar">
          <button
            type="button"
            className="nb-output-retry-btn"
            onClick={handleManualRetry}
            disabled={retrying}
          >
            {retrying ? <Loader2 size={14} className="icon-spin" /> : <RotateCw size={14} />}
            <span>重试转存</span>
          </button>
        </div>
      )}
    </div>
  )
}

export default memo(MinimaxSpeechOutput)
