import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Progress } from 'antd'
import { Headphones } from '@/canvas/icons'
import { useMediaSource } from '@/canvas/hooks/useMediaSource'
import { useCanvasFacade } from '@/canvas/state/canvasFacade'
import { normalizeRunStatus } from '@/canvas/utils/designTokens'
import FailedCard from '@/canvas/components/FailedCard'
import { getCapabilityErrorSummary } from '@/canvas/utils/errorFormatter'
import { useCapabilityRuntime } from '@/canvas/contexts/CapabilityRuntimeContext'

/**
 * 折叠形态(form 'folded')的音频产物预览卡 — Runner 通用积木
 *
 * 适用 capability: 任何产物类型为 audio 的 form 'folded' 能力 (minimax-speech 等).
 *
 * 节点固定尺寸 348 × 146 (NODE_SIZE_PRESETS.audio.fixedHeight), 无 aspect 联动.
 *
 * 渲染逻辑:
 *   - 状态以下游 outputNode.data.runStatus 为准, 退化为本能力节点 data.runStatus
 *   - Ready  : 一行音频图标 + 文案 ("点击 Run 开始生成")
 *   - Running: 进度条 + Generating audio...
 *   - Done   : 播放按钮 + 30 根波形 bar + 当前时间/总时长; 下方 caption 行展示 meta
 *   - Failed : 错误信息 + 重试按钮
 *
 * Done 态写回 outputNode.data._mediaDuration: 拿到音频 duration 后回写,
 * 供 FoldedNodeMeta 右段显示时长 meta (沿用 video 折叠的约定).
 *
 * 波形 bar 视觉: 30 根固定高度数组占位 (与原型一致), 不接入真实 webaudio 采样
 * (放 backlog).
 */

// 30 根固定波形条高度 (百分比, 0-1) — 视觉占位, 与原型 MN7RG 的 30 条等高
const WAVEFORM_BARS = Array.from({ length: 30 }, (_, i) => {
  // 用伪随机但确定性的高度 (基于 sin), 比纯等高有节奏感
  return 0.35 + 0.6 * Math.abs(Math.sin(i * 1.7 + 1))
})

function formatDuration(sec) {
  if (!sec || !isFinite(sec)) return '00:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function FoldedAudioPreviewCard({
  nodeId,
  data,
  downstreamOutputNode,
  readyHint = '连接提示词或输入文本后点击 Run',
  buildCaption,
}) {
  const outputData = downstreamOutputNode?.data
  const runStatus = outputData?.runStatus || data?.runStatus
  const status = normalizeRunStatus(runStatus)

  const content = outputData?.content || null
  const url = content?.url || null
  const isPlaceholder = content?.placeholder === true

  const rawError = outputData?.content?.rawError
    ?? outputData?.content?.error
    ?? outputData?.error
    ?? data?.error
    ?? null

  const { runCapability } = useCapabilityRuntime()
  const capabilityId = data?.capability
  const summary = status === 'Failed'
    ? getCapabilityErrorSummary(capabilityId, rawError)
    : ''
  const onRetry = (status === 'Failed' && nodeId)
    ? () => runCapability?.(nodeId, 1)
    : undefined

  return (
    <div className="folded-audio-preview" style={{ height: '100%' }}>
      {status === 'Ready' && <ReadyView hint={readyHint} />}
      {(status === 'Running' || status === 'Polling' || status === 'Streaming') && (
        <RunningView pollProgress={outputData?.pollProgress} />
      )}
      {status === 'Done' && isPlaceholder && <PlaceholderView />}
      {status === 'Done' && !isPlaceholder && url && (
        <DoneView
          url={url}
          content={content}
          modeParams={data?.modeParams?.[data?.mode]}
          outputNodeId={downstreamOutputNode?.id}
          buildCaption={buildCaption}
        />
      )}
      {status === 'Done' && !isPlaceholder && !url && <ReadyView hint="未找到产物 URL" />}
      {status === 'Failed' && (
        <FailedCard summary={summary} rawError={rawError} onRetry={onRetry} />
      )}
    </div>
  )
}

function ReadyView({ hint }) {
  return (
    <div className="folded-audio-preview-empty">
      <Headphones className="folded-audio-preview-empty-icon" />
      <span className="folded-audio-preview-empty-text">{hint}</span>
    </div>
  )
}

function RunningView({ pollProgress }) {
  const percent = Number.isFinite(pollProgress?.progress)
    ? Math.max(0, Math.min(100, pollProgress.progress))
    : 0
  return (
    <div className="folded-audio-preview-running">
      <Headphones className="folded-audio-preview-running-icon" />
      <div className="folded-audio-preview-running-text">Generating audio... {percent}%</div>
      <Progress
        percent={percent}
        size="small"
        showInfo={false}
        strokeColor="#3B82F6"
        className="folded-audio-preview-running-progress"
      />
    </div>
  )
}

function PlaceholderView() {
  return (
    <div className="folded-audio-preview-placeholder">
      <Headphones className="folded-audio-preview-placeholder-icon" />
      <span className="folded-audio-preview-placeholder-text">未生成</span>
    </div>
  )
}

function DoneView({ url, content, modeParams, outputNodeId, buildCaption }) {
  const { displayUrl, ready } = useMediaSource(url, { kind: 'audio' })
  const audioRef = useRef(null)
  const facade = useCanvasFacade()

  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(content?.duration || 0)

  const handlePlayToggle = useCallback((e) => {
    e.stopPropagation()
    const a = audioRef.current
    if (!a) return
    if (a.paused) a.play().catch(() => {})
    else a.pause()
  }, [])

  const handleMeta = useCallback((e) => {
    const d = e.target.duration
    if (!(d > 0)) return
    setDuration(d)
    if (!outputNodeId) return
    facade.batchUpdateNodes(nds => nds.map(n => {
      if (n.id !== outputNodeId) return n
      const sameDur = Math.abs((n.data?._mediaDuration || 0) - d) < 0.05
      if (sameDur) return n
      return { ...n, data: { ...n.data, _mediaDuration: d } }
    }))
  }, [outputNodeId, facade])

  useEffect(() => {
    setPlaying(false)
    setCurrentTime(0)
  }, [url])

  // 波形 bar 当前进度百分比
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0

  // caption 文案: 由 capability 提供 buildCaption(modeParams, content); 缺省回退到 mimeType
  const caption = buildCaption
    ? buildCaption({ modeParams, content })
    : (content?.mimeType ? content.mimeType.toUpperCase() : '')

  return (
    <div className="folded-audio-preview-done">
      {ready && displayUrl && (
        <audio
          ref={audioRef}
          src={displayUrl}
          preload="metadata"
          onLoadedMetadata={handleMeta}
          onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />
      )}

      <div className="folded-audio-preview-audio-row">
        <button
          type="button"
          className="folded-audio-preview-play-btn"
          onClick={handlePlayToggle}
          onMouseDown={(e) => e.stopPropagation()}
          aria-label={playing ? '暂停' : '播放'}
        >
          {playing ? (
            <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
              <rect x="1" y="1" width="3.5" height="12" rx="1" fill="currentColor" />
              <rect x="7.5" y="1" width="3.5" height="12" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true">
              <path d="M3 1.5 L12 8 L3 14.5 Z" fill="currentColor" />
            </svg>
          )}
        </button>

        <div className="folded-audio-preview-waveform" aria-hidden="true">
          {WAVEFORM_BARS.map((h, i) => {
            const barProgress = (i + 1) / WAVEFORM_BARS.length
            const played = barProgress <= progress
            return (
              <span
                key={i}
                className={`folded-audio-preview-bar${played ? ' is-played' : ''}`}
                style={{ height: `${Math.round(h * 100)}%` }}
              />
            )
          })}
        </div>

        <span className="folded-audio-preview-time">
          {formatDuration(currentTime)} / {formatDuration(duration)}
        </span>
      </div>

      {caption && (
        <div className="folded-audio-preview-caption-row">
          <Headphones className="folded-audio-preview-caption-icon" />
          <span className="folded-audio-preview-caption-text" title={caption}>{caption}</span>
        </div>
      )}
    </div>
  )
}

export default memo(FoldedAudioPreviewCard)
