import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Progress } from 'antd'
import { Film } from '@/canvas/icons'
import { useMediaSource } from '@/canvas/hooks/useMediaSource'
import { useCanvasFacade } from '@/canvas/state/canvasFacade'
import { normalizeRunStatus } from '@/canvas/utils/designTokens'
import FailedCard from '@/canvas/components/FailedCard'
import { getCapabilityErrorSummary } from '@/canvas/utils/errorFormatter'
import { useCapabilityRuntime } from '@/canvas/contexts/CapabilityRuntimeContext'
import { fetchFileSize } from '@/canvas/utils/fileInfo'

/**
 * 折叠形态(form 'folded')的视频产物预览卡 — Runner 通用积木
 *
 * 适用 capability: 任何产物类型为 video 的 form 'folded' 能力 (talking-head 等).
 *
 * 渲染逻辑:
 *   - 状态以下游 outputNode.data.runStatus 为准 (产物运行状态在 outputNode 上)
 *     如果还没建出 outputNode (Ready 时尚未运行), 退化为本能力节点 data.runStatus
 *   - Ready  : 占位提示
 *   - Running: 进度条 (pollProgress.progress) + Generating...
 *   - Done   : <video muted loop playsInline> 默认不播; 鼠标 hover 进节点才 play,
 *             移开 pause (保留当前帧); 中间 ▶/⏸ 按钮为「常驻播放」开关 — 点 ▶ 钉住,
 *             移开仍继续播, 再点 ⏸ 取消. 全屏看由上方 MediaPreviewToolbar 弹 Modal
 *             控制; content.placeholder=true 时渲染 "未生成"占位
 *   - Failed : 错误信息 + 重试按钮
 *
 * 节点尺寸联动:
 *   - header 通过 NodeToolbar 浮在节点物理区外, 节点 = 纯视频, body 高 = 节点高 100%
 *   - Done 单视频: 视频 onLoadedMetadata 后把 aspect (videoWidth / videoHeight) 写回
 *     node.data._imageAspect (字段名复用 image 的存量字段, 实际含义是"产物 aspect"),
 *     CapabilityNode 据此按 aspect 严格联动节点 width/height, 视觉无白边/无裁剪/无变形
 *
 * 与 FoldedImagePreviewCard 的差异:
 *   - 视频走 useMediaSource(kind:'video') 的视频专属分支 (首次原 URL 边下边播, 闲时
 *     后台缓存) 而非图片/音频走的"统一 Cache API + blob URL"分支: 视频 blob URL 会
 *     丢失 Range 请求, 拖进度条要整段下载, 体验差.
 *   - <video> 默认 muted loop, 节点预览只展示画面循环, 声音 / 进度条交给
 *     全屏 Modal (MediaPreviewToolbar). hover 才 play 是为了避免画布上 N 个
 *     视频同时解码占资源.
 */

function FoldedVideoPreviewCard({ nodeId, data, downstreamOutputNode, readyHint = '点击 Run 开始生成' }) {
  // 真实状态: 优先看下游 outputNode (产物的实际状态), 否则退化为能力节点 runStatus
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
    <div className="folded-video-preview" style={{ height: '100%' }}>
      {status === 'Ready' && <ReadyView hint={readyHint} />}
      {(status === 'Running' || status === 'Polling' || status === 'Streaming') && <RunningView pollProgress={outputData?.pollProgress} />}
      {status === 'Done' && isPlaceholder && <PlaceholderView />}
      {status === 'Done' && !isPlaceholder && url && <SingleVideoView url={url} capabilityNodeId={nodeId} />}
      {status === 'Done' && !isPlaceholder && !url && <ReadyView hint="未找到产物 URL" />}
      {status === 'Failed' && (
        <FailedCard summary={summary} rawError={rawError} onRetry={onRetry} />
      )}
    </div>
  )
}

function ReadyView({ hint }) {
  return (
    <div className="folded-video-preview-empty">
      <Film className="folded-video-preview-empty-icon" />
      <span className="folded-video-preview-empty-text">{hint}</span>
    </div>
  )
}

function RunningView({ pollProgress }) {
  const percent = Number.isFinite(pollProgress?.progress)
    ? Math.max(0, Math.min(100, pollProgress.progress))
    : 0
  return (
    <div className="folded-video-preview-running">
      <Progress
        percent={percent}
        size="small"
        showInfo={false}
        strokeColor="#3B82F6"
      />
      <span className="folded-video-preview-running-text">Generating video... {percent}%</span>
    </div>
  )
}

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00'
  const total = Math.floor(sec)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function SingleVideoView({ url, capabilityNodeId }) {
  const { displayUrl, containerRef, markError } = useMediaSource(url, { kind: 'video' })
  const facade = useCanvasFacade()
  const videoRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [muted, setMuted] = useState(true)

  const handleMouseEnter = useCallback(() => {
    videoRef.current?.play().catch(() => {})
  }, [])

  // 已钉住常驻播放时移开鼠标不暂停; 仅 hover 预览态才暂停
  const handleMouseLeave = useCallback(() => {
    if (pinned) return
    videoRef.current?.pause()
  }, [pinned])

  // onLoadedMetadata 把视频真实宽高比写回 capability 节点 data:
  //   _imageAspect — 折叠节点存量约定, CapabilityNode 据此驱动节点尺寸联动
  //   _mediaWidth/_mediaHeight — 供 FoldedNodeMeta 右段显示分辨率
  //   _mediaDuration — 供 FoldedNodeMeta 右段显示时长
  const onMeta = useCallback((e) => {
    const w = e.target.videoWidth
    const h = e.target.videoHeight
    const dur = e.target.duration
    setDuration(Number.isFinite(dur) && dur > 0 ? dur : 0)
    if (!(w > 0 && h > 0)) return
    const aspect = w / h
    if (!capabilityNodeId) return
    facade.batchUpdateNodes(nds => nds.map(n => {
      if (n.id !== capabilityNodeId) return n
      const data = n.data || {}
      const sameAspect = Math.abs((data._imageAspect || 0) - aspect) < 0.001
      const sameSize = data._mediaWidth === w && data._mediaHeight === h
      const sameDur = Math.abs((data._mediaDuration || 0) - (dur || 0)) < 0.05
      if (sameAspect && sameSize && sameDur) return n
      return {
        ...n,
        data: {
          ...data,
          _imageAspect: aspect,
          _mediaWidth: w,
          _mediaHeight: h,
          _mediaDuration: Number.isFinite(dur) && dur > 0 ? dur : data._mediaDuration,
        },
      }
    }))
  }, [facade, capabilityNodeId])

  // fetchFileSize: 对 url 发 HEAD 取 Content-Length, 写回 capability 节点 _mediaFileSize,
  // FoldedNodeMeta 右段据此显示文件大小
  useEffect(() => {
    if (!url || !capabilityNodeId) return
    let alive = true
    fetchFileSize(url).then((bytes) => {
      if (!alive || bytes == null) return
      facade.batchUpdateNodes(nds => nds.map(n => {
        if (n.id !== capabilityNodeId) return n
        if (n.data?._mediaFileSize === bytes) return n
        return { ...n, data: { ...n.data, _mediaFileSize: bytes } }
      }))
    })
    return () => { alive = false }
  }, [url, capabilityNodeId, facade])

  // 中间按钮 = 「常驻播放」开关: 未钉住则钉住并播放, 已钉住则取消并暂停
  const togglePin = useCallback((e) => {
    e.stopPropagation()
    const v = videoRef.current
    if (!v) return
    if (pinned) {
      setPinned(false)
      v.pause()
    } else {
      setPinned(true)
      v.play().catch(() => {})
    }
  }, [pinned])

  const toggleMute = useCallback((e) => {
    e.stopPropagation()
    setMuted((m) => !m)
  }, [])

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0

  return (
    <div
      ref={containerRef}
      className={`folded-video-preview-single${playing ? ' is-playing' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <video
        ref={videoRef}
        src={displayUrl || undefined}
        muted={muted}
        loop
        playsInline
        preload="metadata"
        onLoadedMetadata={onMeta}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
        onError={markError}
        draggable={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />

      <button
        type="button"
        className="folded-video-preview-play-btn"
        onClick={togglePin}
        onMouseDown={(e) => e.stopPropagation()}
        aria-label={pinned ? '暂停' : '播放'}
      >
        {pinned ? (
          <svg width="14" height="16" viewBox="0 0 10 12" aria-hidden="true">
            <rect x="0" y="0" width="3" height="12" fill="#1A1A2E" />
            <rect x="7" y="0" width="3" height="12" fill="#1A1A2E" />
          </svg>
        ) : (
          <svg width="16" height="18" viewBox="0 0 12 14" aria-hidden="true">
            <path d="M1 1 L11 7 L1 13 Z" fill="#1A1A2E" />
          </svg>
        )}
      </button>

      {duration > 0 && (
        <div className="folded-video-preview-progress">
          <div className="folded-video-preview-progress-fill" style={{ width: `${progress * 100}%` }} />
        </div>
      )}

      <div className="folded-video-preview-bottom-right">
        <button
          type="button"
          className="folded-video-preview-volume-btn"
          onClick={toggleMute}
          onMouseDown={(e) => e.stopPropagation()}
          aria-label={muted ? '取消静音' : '静音'}
        >
          {muted ? (
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M7 3 L4 6 H1.5 V10 H4 L7 13 Z" fill="currentColor" />
              <path d="M11 6 L14.5 9.5 M14.5 6 L11 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M7 3 L4 6 H1.5 V10 H4 L7 13 Z" fill="currentColor" />
              <path d="M10.5 5.5 Q12.5 8 10.5 10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
              <path d="M12.5 3.8 Q15.5 8 12.5 12.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
            </svg>
          )}
        </button>
        {duration > 0 && (
          <div className="folded-video-preview-duration">
            {playing
              ? `${formatTime(currentTime)} / ${formatTime(duration)}`
              : formatTime(duration)}
          </div>
        )}
      </div>
    </div>
  )
}

function PlaceholderView() {
  return (
    <div className="folded-video-preview-placeholder">
      <Film className="folded-video-preview-placeholder-icon" />
      <span className="folded-video-preview-placeholder-text">未生成</span>
    </div>
  )
}

export default memo(FoldedVideoPreviewCard)
