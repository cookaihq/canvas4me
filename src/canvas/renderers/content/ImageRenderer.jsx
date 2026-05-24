import { memo, useCallback, useEffect, useState } from 'react'
import { fetchFileSize } from '../../utils/fileInfo'
import { useCanvasFacade } from '../../state/canvasFacade'
import { probeUrl } from '../../utils/urlCheck'
import { onRetryAll } from '../../utils/retryBus'
import { useMediaSource } from '../../hooks/useMediaSource'
import LoadFailedPlaceholder from '../LoadFailedPlaceholder'
import LoadingPlaceholder from '../LoadingPlaceholder'
import UploadFailedPlaceholder from '../UploadFailedPlaceholder'
import { retryNode, hasRetry } from '../../state/dragUploadStore'

/**
 * 图片渲染器
 * - 通过 useMediaSource 拿到可直接用的 displayUrl（cache 命中时为 blob URL）
 * - <img> 始终用 displayUrl；其他逻辑（大小/格式/probe）仍使用原始 url
 * - 加载完成后把分辨率/文件大小回写到 node.data._mediaWidth/_mediaHeight/_mediaFileSize,
 *   供 NodeMetaRow / FoldedNodeMeta 显示文件元数据 (无 in-node 浮层)
 */
function ImageRenderer({ nodeId, data }) {
  const url = data.content?.url
  const fileName = data.content?.fileName
  const uploading = !!data.content?.uploading
  const uploadError = data.content?.uploadError
  const localPreviewUrl = data.content?.localPreviewUrl
  const progress = typeof data.content?.progress === 'number' ? data.content.progress : null
  const locked = data.locked

  const { displayUrl, ready, reload, markError } = useMediaSource(url, { kind: 'image' })
  const facade = useCanvasFacade()

  const [errorReason, setErrorReason] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setErrorReason(null)
    setLoaded(false)
  }, [url])

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
  }, [url, nodeId, facade])

  const handleLoad = useCallback((e) => {
    const w = e.target.naturalWidth
    const h = e.target.naturalHeight
    setLoaded(true)
    if (!nodeId || !(w > 0 && h > 0)) return
    facade.batchUpdateNodes((nds) => nds.map((n) => {
      if (n.id !== nodeId) return n
      if (n.data?._mediaWidth === w && n.data?._mediaHeight === h) return n
      return { ...n, data: { ...n.data, _mediaWidth: w, _mediaHeight: h } }
    }))
  }, [nodeId, facade])

  const handleError = useCallback(async () => {
    const result = await probeUrl(url)
    setErrorReason(result.ok ? 'media-error' : (result.reason || 'unknown'))
  }, [url])

  const handleRetry = useCallback(() => {
    setErrorReason(null)
    setLoaded(false)
    reload()
  }, [reload])

  useEffect(() => {
    if (!errorReason) return
    return onRetryAll(handleRetry)
  }, [errorReason, handleRetry])

  if (!url) {
    // 上传中：有本地预览就叠半透明图，没有就纯 loading；上传失败：错误占位 + 重试
    if (uploading || uploadError || localPreviewUrl) {
      const showPreview = !!localPreviewUrl
      return (
        <div className={`renderer-image${locked ? ' renderer-locked' : ''}`}>
          {showPreview && (
            <img
              src={localPreviewUrl}
              alt={fileName || '上传中'}
              className="renderer-image-img renderer-uploading-preview"
              draggable={false}
            />
          )}
          {uploading && (
            <LoadingPlaceholder
              label="上传中..."
              progress={progress ?? 0}
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
      <div className="renderer-image renderer-empty">
        <span className="renderer-placeholder">{locked ? '无图片' : '拖入图片或点击上传'}</span>
      </div>
    )
  }

  const showImage = ready && displayUrl && !errorReason

  return (
    <div className={`renderer-image${locked ? ' renderer-locked' : ''}`}>
      {showImage && (
        <img
          src={displayUrl}
          alt={fileName || '图片'}
          className="renderer-image-img"
          draggable={false}
          onLoad={handleLoad}
          onError={(e) => { markError(); handleError(e) }}
        />
      )}
      {(!ready || (!loaded && !errorReason)) && <LoadingPlaceholder />}
      {errorReason && (
        <LoadFailedPlaceholder reason={errorReason} onRetry={handleRetry} />
      )}
      {locked && <div className="renderer-lock-badge">🔒</div>}
    </div>
  )
}

export default memo(ImageRenderer)
