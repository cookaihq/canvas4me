import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { getExtFromUrl, formatBytes, fetchFileSize } from '../../utils/fileInfo'
import { probeUrl } from '../../utils/urlCheck'
import { onRetryAll } from '../../utils/retryBus'
import { useMediaSource } from '../../hooks/useMediaSource'
import LoadFailedPlaceholder from '../LoadFailedPlaceholder'
import LoadingPlaceholder from '../LoadingPlaceholder'
import UploadFailedPlaceholder from '../UploadFailedPlaceholder'
import { retryNode, hasRetry } from '../../state/dragUploadStore'

const WAVE_HEIGHTS = [0.40, 0.75, 0.55, 1.00, 0.45, 0.85, 0.30, 0.70, 0.50, 0.90]

function formatDuration(sec) {
  if (!sec || !isFinite(sec)) return ''
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * 音频渲染器
 * - 通过 useMediaSource 拿到可直接用的 displayUrl（cache 命中时为 blob URL）
 */
function AudioRenderer({ nodeId, data }) {
  const url = data.content?.url
  const uploading = !!data.content?.uploading
  const uploadError = data.content?.uploadError
  const uploadProgress = typeof data.content?.progress === 'number' ? data.content.progress : null
  const fileName = data.content?.fileName
  const locked = data.locked

  const { displayUrl, ready, reload, markError } = useMediaSource(url, { kind: 'audio' })

  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [size, setSize] = useState(null)
  const [errorReason, setErrorReason] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setErrorReason(null)
    setDuration(0)
    setCurrentTime(0)
    setPlaying(false)
    setLoaded(false)
  }, [url])

  useEffect(() => {
    if (!url) return
    let alive = true
    fetchFileSize(url).then((b) => { if (alive) setSize(b) })
    return () => { alive = false }
  }, [url])

  const handleError = useCallback(async () => {
    const result = await probeUrl(url)
    setErrorReason(result.ok ? 'media-error' : (result.reason || 'unknown'))
  }, [url])

  const handleRetry = useCallback(() => {
    setErrorReason(null)
    setDuration(0)
    setLoaded(false)
    reload()
  }, [reload])

  useEffect(() => {
    if (!errorReason) return
    return onRetryAll(handleRetry)
  }, [errorReason, handleRetry])

  if (!url) {
    if (uploading || uploadError) {
      return (
        <div className={`renderer-audio${locked ? ' renderer-locked' : ''}`}>
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
    return (
      <div className="renderer-audio renderer-empty">
        <span className="renderer-placeholder">{locked ? '无音频' : '拖入音频文件'}</span>
      </div>
    )
  }

  const togglePlay = (e) => {
    e.stopPropagation()
    const a = audioRef.current
    if (!a) return
    if (a.paused) a.play().catch(() => {})
    else a.pause()
  }

  const ext = getExtFromUrl(url)
  const info = [
    size != null && formatBytes(size),
    ext && ext.toUpperCase(),
  ].filter(Boolean).join('·')

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0
  const showAudio = ready && displayUrl && !errorReason

  return (
    <div className={`renderer-audio${locked ? ' renderer-locked' : ''}${playing ? ' is-playing' : ''}`}>
      {showAudio && (
        <audio
          ref={audioRef}
          src={displayUrl}
          preload="metadata"
          onLoadedMetadata={(e) => {
            setDuration(e.target.duration)
            setLoaded(true)
          }}
          onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={(e) => { markError(); handleError(e) }}
        />
      )}

      {(!ready || (!loaded && !errorReason)) && <LoadingPlaceholder />}

      {!errorReason && loaded && (
        <>
          <div className="renderer-audio-wave" aria-hidden="true">
            {WAVE_HEIGHTS.map((h, i) => (
              <span
                key={i}
                className="renderer-audio-bar"
                style={{ height: `${Math.round(h * 100)}%` }}
              />
            ))}
          </div>

          <button
            className="renderer-audio-play-btn"
            onClick={togglePlay}
            aria-label={playing ? '暂停' : '播放'}
            type="button"
          >
            {playing ? (
              <svg width="8" height="10" viewBox="0 0 8 10" aria-hidden="true">
                <rect x="0" y="0" width="2.5" height="10" fill="#1A1A2E" />
                <rect x="5.5" y="0" width="2.5" height="10" fill="#1A1A2E" />
              </svg>
            ) : (
              <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden="true">
                <path d="M2 1 L9 6 L2 11 Z" fill="#1A1A2E" />
              </svg>
            )}
          </button>

          {duration > 0 && (
            <div className="renderer-audio-progress">
              <div className="renderer-audio-progress-fill" style={{ width: `${progress * 100}%` }} />
            </div>
          )}

          {info && !playing && <div className="renderer-audio-info">{info}</div>}
          {duration > 0 && (
            <div className="renderer-audio-duration">
              {playing
                ? `${formatDuration(currentTime)} / ${formatDuration(duration)}`
                : formatDuration(duration)}
            </div>
          )}
        </>
      )}

      {errorReason && (
        <LoadFailedPlaceholder reason={errorReason} onRetry={handleRetry} />
      )}

      {locked && <div className="renderer-lock-badge">🔒</div>}
    </div>
  )
}

export default memo(AudioRenderer)
