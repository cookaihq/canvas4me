import { memo, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { Handle, Position, NodeResizer, useReactFlow } from '@xyflow/react'
import { Loader2, Image, RotateCw, Clock } from '@/canvas/icons'
import { useCanvasFacade } from '@/canvas/state/canvasFacade'
import OutputModeBadge from '@/canvas/components/nodes/OutputModeBadge'
import ImageRenderer from '@/canvas/renderers/content/ImageRenderer'
import { getContentTypeColor } from '@/canvas/utils/designTokens'
import NodeMetaRow from '@/canvas/components/NodeMetaRow'
import OutputHandles from '@/canvas/components/nodes/OutputHandles'
import { useCapabilityRuntime } from '@/canvas/contexts/CapabilityRuntimeContext'
import { formatBytes } from '@/canvas/utils/fileInfo'

/**
 * GPT Image 2 输出节点（与 nano-banana 输出节点结构一致，复用 nb-output-* 全局样式）
 *
 * runStatus 分支：
 *   - polling / running / undefined → Processing 布局
 *   - done                           → Completed 布局 + 绿色 Done 徽章
 *   - transfer_failed                → Completed 布局 + 橙色 "转存失败 N/5" 徽章
 *   - error                          → Completed 布局 + 红色 Error 徽章
 *
 * 一节点一图: 卡片 body 渲染 <ImageRenderer>, 自适应节点高度到图片实际宽高比.
 * num_outputs > 1 由 expandRuns 拆到多个独立产物节点 (每节点 1 张), 不在单节点内做宫格.
 * content.placeholder=true 表示该节点对应的 slot 上游漏返, 渲染"未生成"占位.
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

function GptImage2Output({ id, data, selected }) {
  const typeColor = getContentTypeColor('image')
  const runStatus = data.runStatus
  const isDone = runStatus === 'done'
  const isError = runStatus === 'error'
  const isTransferFailed = runStatus === 'transfer_failed'
  const isProcessing = !isDone && !isError && !isTransferFailed

  const isPlaceholder = data.content?.placeholder === true

  const { getNode } = useReactFlow()
  const facade = useCanvasFacade()

  // 图片元数据 (分辨率·大小) — ImageRenderer 加载完后回写到 data._mediaWidth/_mediaHeight
  // /_mediaFileSize, 这里读出格式化为 NodeMetaRow 的 info 文本
  const metaInfo = useMemo(() => {
    const w = data?._mediaWidth
    const h = data?._mediaHeight
    const bytes = data?._mediaFileSize
    const parts = []
    if (w && h) parts.push(`${w}×${h}`)
    if (typeof bytes === 'number' && bytes > 0) parts.push(formatBytes(bytes))
    return parts.length > 0 ? parts.join(' · ') : null
  }, [data?._mediaWidth, data?._mediaHeight, data?._mediaFileSize])

  // 探测图片真实宽高比
  const [imageAspect, setImageAspect] = useState(null) // w / h（未加载时为 null）
  const representativeUrl = (isDone || isTransferFailed) && !isPlaceholder ? data.content?.url || null : null
  useEffect(() => {
    if (!representativeUrl) return
    const img = new window.Image()
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setImageAspect(img.naturalWidth / img.naturalHeight)
      }
    }
    img.src = representativeUrl
  }, [representativeUrl])

  // 有效比例：未加载前默认 3:2（gpt-image 最常见的比例）避免高度等图加载完才能算
  const effectiveAspect = imageAspect || 1.5

  // 节点宽度（作为高度同步的依赖，用户拖拽改宽度时要重算高度）
  const rawW = getNode(id)?.style?.width
  const nodeWidth = typeof rawW === 'number' ? rawW : parseFloat(rawW) || 200

  // 高度同步：按图片真实比例
  useLayoutEffect(() => {
    if (!(isDone || isTransferFailed) || isPlaceholder) return
    const node = getNode(id)
    if (!node) return
    const desiredHeight = Math.round(nodeWidth / effectiveAspect)
    const currentH = typeof node.style?.height === 'number'
      ? node.style.height
      : parseFloat(node.style?.height) || 0
    if (Math.abs(currentH - desiredHeight) < 1) return
    facade.batchUpdateNodes((nodes) => nodes.map((n) =>
      n.id === id ? { ...n, style: { ...n.style, height: desiredHeight } } : n
    ))
  }, [isDone, isTransferFailed, isPlaceholder, effectiveAspect, nodeWidth, id, getNode, facade])

  // 耗时计时：运行中持续自增，完成/失败后定格
  const { timerStartedAt, timerFinishedAt } = data
  useEffect(() => {
    if (isProcessing && !timerStartedAt) {
      facade.batchUpdateNodes(nds => nds.map(n =>
        n.id === id ? { ...n, data: { ...n.data, timerStartedAt: Date.now() } } : n
      ))
    } else if (!isProcessing && timerStartedAt && !timerFinishedAt) {
      facade.batchUpdateNodes(nds => nds.map(n =>
        n.id === id ? { ...n, data: { ...n.data, timerFinishedAt: Date.now() } } : n
      ))
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
        minWidth={120}
        minHeight={80}
        isVisible={selected}
        // 一节点一图: 锁定图片宽高比 (Done/transfer_failed 且非占位时)
        keepAspectRatio={(isDone || isTransferFailed) && !isPlaceholder}
        lineClassName="node-resize-line"
        handleClassName="node-resize-handle"
      />

      <NodeMetaRow
        nodeId={id}
        name={data.name}
        info={metaInfo}
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
      className="gi2-output-timer"
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
  const label = data.label || 'GPT Image 2 输出'

  return (
    <div
      className={`nb-output-card nb-output-processing${selected ? ' selected' : ''}`}
      style={{ '--type-color': typeColor }}
    >
      <OutputModeBadge capability={data.sourceCapability} mode={data.sourceMode} />
      <div className="nb-output-hover-label">{label}</div>
      <div className="nb-output-proc-header">
        <span className="nb-output-proc-status">
          {statusLabel} · {percent}%
        </span>
        <Image className="nb-output-proc-icon" />
      </div>
      <div className="nb-output-proc-body">
        <Loader2 className="nb-output-proc-spinner icon-spin" />
      </div>
    </div>
  )
}

function CompletedCard({ data, selected, nodeId, typeColor, isError, isTransferFailed, isPlaceholder }) {
  const label = data.label || 'GPT Image 2 输出'
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
        <Image className="nb-output-done-icon" />
        <span className="nb-output-done-type">Image</span>
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
            <Image className="nb-output-placeholder-icon" />
            <span className="nb-output-placeholder-text">未生成</span>
          </div>
        ) : data.content?.url ? (
          <ImageRenderer data={data} nodeId={nodeId} />
        ) : (
          <Image className="nb-output-done-placeholder" />
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

export default memo(GptImage2Output)
