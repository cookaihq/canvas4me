import { memo, useCallback, useEffect, useState } from 'react'
import { FileText } from '@/canvas/icons'
import { getExtFromUrl, getExtFromName, formatBytes, fetchFileSize, PREVIEWABLE_EXT_MAP } from '../../utils/fileInfo'
import { probeUrl } from '../../utils/urlCheck'
import { onRetryAll } from '../../utils/retryBus'
import { useMediaSource } from '../../hooks/useMediaSource'
import LoadFailedPlaceholder from '../LoadFailedPlaceholder'
import LoadingPlaceholder from '../LoadingPlaceholder'
import UploadFailedPlaceholder from '../UploadFailedPlaceholder'
import PdfThumbnail from './PdfThumbnail'
import { retryNode, hasRetry } from '../../state/dragUploadStore'

function FileImagePreview({ url, onError, ...rest }) {
  const { displayUrl, markError } = useMediaSource(url, { kind: 'image' })
  const handleError = (e) => {
    markError()
    onError?.(e)
  }
  return <img {...rest} src={displayUrl} onError={handleError} />
}

function FileVideoPreview({ url, onError, ...rest }) {
  const { displayUrl, markError } = useMediaSource(url, { kind: 'video' })
  const handleError = (e) => {
    markError()
    onError?.(e)
  }
  return <video {...rest} src={displayUrl} onError={handleError} />
}

function FileAudioPreview({ url, onError, ...rest }) {
  const { displayUrl, markError } = useMediaSource(url, { kind: 'audio' })
  const handleError = (e) => {
    markError()
    onError?.(e)
  }
  return <audio {...rest} src={displayUrl} onError={handleError} />
}

/**
 * 文件渲染器 — 节点卡片内的文件预览
 * - 可预览（image/video/audio/pdf）：预览铺满 + 左上 icon/badge + 左下文件信息（黑底白字）
 * - 不可预览：左上 icon/badge + 中心 raw 占位圆 + 左下文件信息（白底灰字）
 * - 预览元素加载失败 → probe URL 得到具体原因 → 展示 LoadFailedPlaceholder（含重试）
 */
function FileRenderer({ nodeId, data }) {
  const url = data.content?.url
  const fileName = data.content?.fileName || ''
  const storedSize = data.content?.fileSize
  const uploading = !!data.content?.uploading
  const uploadError = data.content?.uploadError
  const uploadProgress = typeof data.content?.progress === 'number' ? data.content.progress : null
  const locked = data.locked

  const [size, setSize] = useState(storedSize ?? null)
  const [errorReason, setErrorReason] = useState(null)
  const [mediaLoaded, setMediaLoaded] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (storedSize != null) { setSize(storedSize); return }
    if (!url) return
    let alive = true
    fetchFileSize(url).then((b) => { if (alive) setSize(b) })
    return () => { alive = false }
  }, [url, storedSize, reloadKey])

  useEffect(() => {
    setErrorReason(null)
    setMediaLoaded(false)
  }, [url])

  const handleMediaError = useCallback(async () => {
    const result = await probeUrl(url)
    setErrorReason(result.ok ? 'media-error' : (result.reason || 'unknown'))
  }, [url])

  const handleRetry = useCallback(() => {
    setErrorReason(null)
    setMediaLoaded(false)
    setReloadKey((k) => k + 1)
  }, [])

  useEffect(() => {
    if (!errorReason) return
    return onRetryAll(handleRetry)
  }, [errorReason, handleRetry])

  // 上传中 / 上传失败：在 URL 还没拿到之前先渲染上传占位
  if (!url && (uploading || uploadError)) {
    return (
      <div className={`renderer-file renderer-file-plain${locked ? ' renderer-locked' : ''}`}>
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

  if (!url && !fileName) {
    return (
      <div className="renderer-file renderer-empty">
        <span className="renderer-placeholder">{locked ? '无文件' : '拖入文件'}</span>
      </div>
    )
  }

  const ext = getExtFromUrl(url) || getExtFromName(fileName)
  const previewType = ext ? PREVIEWABLE_EXT_MAP[ext] : null
  const displayName = fileName
    || (url ? decodeURIComponent(url.split('/').pop().split('?')[0]) : '')
    || '文件'
  const sizeText = size != null ? formatBytes(size) : ''
  const infoText = [displayName, sizeText].filter(Boolean).join('·')
  const badge = ext ? `.${ext}` : ''

  if (previewType && url) {
    return (
      <div className={`renderer-file renderer-file-preview${locked ? ' renderer-locked' : ''}`}>
        {previewType === 'image' && (
          <FileImagePreview
            key={reloadKey}
            url={url}
            className="renderer-file-preview-media"
            alt={displayName}
            draggable={false}
            onLoad={() => setMediaLoaded(true)}
            onError={handleMediaError}
          />
        )}
        {previewType === 'video' && (
          <FileVideoPreview
            key={reloadKey}
            url={url}
            className="renderer-file-preview-media"
            muted
            playsInline
            preload="metadata"
            draggable={false}
            onLoadedMetadata={() => setMediaLoaded(true)}
            onError={handleMediaError}
          />
        )}
        {previewType === 'pdf' && (
          /* PdfThumbnail 自行处理 loading / 错误占位 / 重试 */
          <PdfThumbnail url={url} />
        )}
        {previewType === 'audio' && (
          <div className="renderer-file-preview-audio-wrap">
            <FileAudioPreview
              key={reloadKey}
              url={url}
              controls
              preload="metadata"
              onLoadedMetadata={() => setMediaLoaded(true)}
              onError={handleMediaError}
            />
          </div>
        )}

        {/* loading / 错误 / 正常三态互斥；PDF 由 PdfThumbnail 内部处理，这里不重复显示 */}
        {previewType !== 'pdf' && !mediaLoaded && !errorReason && <LoadingPlaceholder />}

        {!errorReason && (previewType === 'pdf' || mediaLoaded) && (
          <>
            <div className="renderer-file-topleft">
              <FileText className="renderer-file-preview-icon" />
              {badge && <span className="renderer-file-badge-dark">{badge}</span>}
            </div>
            {infoText && (
              <div className="renderer-file-info-dark" title={displayName}>{infoText}</div>
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

  return (
    <div className={`renderer-file renderer-file-plain${locked ? ' renderer-locked' : ''}`}>
      <div className="renderer-file-topleft">
        <FileText className="renderer-file-plain-icon" />
        {badge && <span className="renderer-file-badge">{badge}</span>}
      </div>

      <div className="renderer-file-raw-circle">raw</div>

      {infoText && (
        <div className="renderer-file-info-plain" title={displayName}>{infoText}</div>
      )}

      {locked && <div className="renderer-lock-badge">🔒</div>}
    </div>
  )
}

export default memo(FileRenderer)
