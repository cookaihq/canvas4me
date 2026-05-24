import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { fetchFileSize } from '../../utils/fileInfo'
import { useCanvasFacade } from '../../state/canvasFacade'
import { probeUrl } from '../../utils/urlCheck'
import { onRetryAll } from '../../utils/retryBus'
import { useMediaSource } from '../../hooks/useMediaSource'
import LoadFailedPlaceholder from '../LoadFailedPlaceholder'
import LoadingPlaceholder from '../LoadingPlaceholder'
import UploadFailedPlaceholder from '../UploadFailedPlaceholder'
import { retryNode, hasRetry } from '../../state/dragUploadStore'

function formatDuration(sec) {
  if (!sec || !isFinite(sec)) return ''
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * 视频渲染器
 * - 真实 <video>（无原生控件），中心自定义「常驻播放」开关按钮
 * - 默认不播；鼠标 hover 进容器才 play，移开 pause（保留当前帧）
 * - 中间按钮为「常驻播放」开关：未点亮显示 ▶（hover 预览也显示 ▶，点一下即钉住），
 *   钉住后显示 ⏸ 且鼠标移开仍继续播；再点 ⏸ 取消钉住并暂停
 * - 底部真实进度条；右下时长/声音控件
 * - 加载完成后把分辨率/时长/文件大小回写到 node.data._mediaWidth/_mediaHeight
 *   /_mediaDuration/_mediaFileSize, 供 NodeMetaRow 显示文件元数据 (无 in-node 浮层)
 * - 加载失败时 probe URL 得到原因 → 展示 LoadFailedPlaceholder（含重试）
 */
function VideoRenderer({ nodeId, data }) {
  const url = data.content?.url
  const uploading = !!data.content?.uploading
  const uploadError = data.content?.uploadError
  const localPreviewUrl = data.content?.localPreviewUrl
  const uploadProgress = typeof data.content?.progress === 'number' ? data.content.progress : null
  const fileName = data.content?.fileName
  const locked = data.locked

  const { displayUrl, containerRef, markError } = useMediaSource(url, { kind: 'video' })
  const facade = useCanvasFacade()

  const videoRef = useRef(null)
  const audioProbedRef = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [errorReason, setErrorReason] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [muted, setMuted] = useState(true)
  const [hasAudio, setHasAudio] = useState(null)

  useEffect(() => {
    setErrorReason(null)
    setDuration(0)
    setCurrentTime(0)
    setPlaying(false)
    setPinned(false)
    setLoaded(false)
    setMuted(true)
    setHasAudio(null)
    audioProbedRef.current = false
  }, [url])

  const probeAudio = useCallback(() => {
    if (audioProbedRef.current) return
    const v = videoRef.current
    if (!v) return
    const webkitBytes = typeof v.webkitAudioDecodedByteCount === 'number'
      ? v.webkitAudioDecodedByteCount
      : null
    const hasMoz = typeof v.mozHasAudio === 'boolean' ? v.mozHasAudio : null
    const trackCount = v.audioTracks && typeof v.audioTracks.length === 'number'
      ? v.audioTracks.length
      : null
    if (webkitBytes === null && hasMoz === null && trackCount === null) return
    if (webkitBytes !== null && webkitBytes === 0 && hasMoz !== true && !trackCount) return
    const detected = (webkitBytes !== null && webkitBytes > 0) || hasMoz === true || (trackCount || 0) > 0
    audioProbedRef.current = true
    setHasAudio(detected)
  }, [])

  const toggleMute = useCallback((e) => {
    e.stopPropagation()
    if (hasAudio === false) return
    setMuted((m) => !m)
  }, [hasAudio])

  // fetchFileSize 写回 node.data._mediaFileSize (供 NodeMetaRow 显示)
  useEffect(() => {
    if (!url || !nodeId) return
    let alive = true
    fetchFileSize(url).then((bytes) => {
      if (!alive || bytes == null) return
      facade.batchUpdateNodes((nds) => nds.map((n) => {
        if (n.id !== nodeId) return n
        if (n.data?._mediaFileSize === bytes) return n
        return { ...n, data: { ...n.data, _mediaFileSize: bytes } }
      }))
    })
    return () => { alive = false }
  }, [url, nodeId, facade, reloadKey])

  const handleLoadedMetadata = useCallback((e) => {
    const target = e.target
    const dur = target.duration
    const w = target.videoWidth
    const h = target.videoHeight
    setDuration(Number.isFinite(dur) && dur > 0 ? dur : 0)
    setLoaded(true)
    probeAudio()
    if (!nodeId) return
    facade.batchUpdateNodes((nds) => nds.map((n) => {
      if (n.id !== nodeId) return n
      const cur = n.data || {}
      const sameW = cur._mediaWidth === w
      const sameH = cur._mediaHeight === h
      const sameDur = Math.abs((cur._mediaDuration || 0) - (dur || 0)) < 0.05
      if (sameW && sameH && sameDur) return n
      return {
        ...n,
        data: {
          ...cur,
          _mediaWidth: w > 0 ? w : cur._mediaWidth,
          _mediaHeight: h > 0 ? h : cur._mediaHeight,
          _mediaDuration: Number.isFinite(dur) && dur > 0 ? dur : cur._mediaDuration,
        },
      }
    }))
  }, [nodeId, facade, probeAudio])

  const handleError = useCallback(async () => {
    const result = await probeUrl(url)
    setErrorReason(result.ok ? 'media-error' : (result.reason || 'unknown'))
  }, [url])

  const handleRetry = useCallback(() => {
    setErrorReason(null)
    setDuration(0)
    setLoaded(false)
    setReloadKey((k) => k + 1)
  }, [])

  useEffect(() => {
    if (!errorReason) return
    return onRetryAll(handleRetry)
  }, [errorReason, handleRetry])

  // hover 进入/离开容器时控制播放 — 必须放在所有 early return 之前,
  // 否则 url 由 undefined → 有值切换时 hook 数量变化, 触发 React #310
  const handleMouseEnter = useCallback(() => {
    videoRef.current?.play().catch(() => {})
  }, [])

  // 已钉住常驻播放时移开鼠标不暂停; 仅 hover 预览态才暂停
  const handleMouseLeave = useCallback(() => {
    if (pinned) return
    videoRef.current?.pause()
  }, [pinned])

  if (!url) {
    // 上传中 / 上传失败 / 还留有本地预览：渲染上传占位（带预览 + 进度条）
    if (uploading || uploadError || localPreviewUrl) {
      return (
        <div className={`renderer-video${locked ? ' renderer-locked' : ''}`}>
          {localPreviewUrl && (
            <video
              src={localPreviewUrl}
              className="renderer-video-player renderer-uploading-preview"
              muted
              playsInline
              preload="metadata"
              draggable={false}
            />
          )}
          {uploading && (
            <LoadingPlaceholder
              label={fileName ? `上传中 · ${fileName}` : '上传中...'}
              progress={uploadProgress ?? 0}
            />
          )}
          {uploadError && !uploading && (
            <UploadFailedPlaceholder
              message={uploadError}
              onRetry={nodeId && hasRetry(nodeId) ? () => retryNode(nodeId) : undefined}
            />
          )}
        </div>
      )
    }
    const isRunning = data.runStatus === 'polling' || data.runStatus === 'running'
    if (isRunning) {
      return (
        <div className="renderer-video">
          <LoadingPlaceholder label="生成中..." />
        </div>
      )
    }
    return (
      <div className="renderer-video renderer-empty">
        <span className="renderer-placeholder">{locked ? '无视频' : '拖入视频文件'}</span>
      </div>
    )
  }

  // 中间按钮 = 「常驻播放」开关: 未钉住则钉住并播放, 已钉住则取消并暂停
  const togglePin = (e) => {
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
  }

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0

  return (
    <div
      ref={containerRef}
      className={`renderer-video${locked ? ' renderer-locked' : ''}${playing ? ' is-playing' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <video
        key={reloadKey}
        ref={videoRef}
        src={displayUrl || undefined}
        className="renderer-video-player"
        muted={muted}
        playsInline
        preload="metadata"
        draggable={false}
        onLoadedMetadata={handleLoadedMetadata}
        onPlaying={probeAudio}
        onTimeUpdate={(e) => {
          setCurrentTime(e.target.currentTime)
          probeAudio()
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setPinned(false) }}
        onError={(e) => { markError(); handleError(e) }}
      />

      {!loaded && !errorReason && <LoadingPlaceholder />}

      {!errorReason && loaded && (
        <>
          <button
            className="renderer-video-play-btn"
            onClick={togglePin}
            aria-label={pinned ? '暂停' : '播放'}
            type="button"
          >
            {pinned ? (
              <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden="true">
                <rect x="0" y="0" width="3" height="12" fill="#1A1A2E" />
                <rect x="7" y="0" width="3" height="12" fill="#1A1A2E" />
              </svg>
            ) : (
              <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
                <path d="M1 1 L11 7 L1 13 Z" fill="#1A1A2E" />
              </svg>
            )}
          </button>

          {duration > 0 && (
            <div className="renderer-video-progress">
              <div className="renderer-video-progress-fill" style={{ width: `${progress * 100}%` }} />
            </div>
          )}

          <div className="renderer-video-bottom-right">
            <button
              className={`renderer-video-volume-btn${hasAudio === false ? ' is-disabled' : ''}`}
              onClick={toggleMute}
              aria-label={hasAudio === false ? '无音频' : (muted ? '取消静音' : '静音')}
              type="button"
              disabled={hasAudio === false}
            >
              {(hasAudio === false || muted) ? (
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
              <div className="renderer-video-duration">
                {playing
                  ? `${formatDuration(currentTime)} / ${formatDuration(duration)}`
                  : formatDuration(duration)}
              </div>
            )}
          </div>
        </>
      )}

      {errorReason && (
        <LoadFailedPlaceholder reason={errorReason} onRetry={handleRetry} />
      )}

      {locked && <div className="renderer-lock-badge">🔒</div>}
    </div>
  )
}

export default memo(VideoRenderer)
