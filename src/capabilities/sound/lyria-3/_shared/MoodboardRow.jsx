import { useCallback, useRef, useState } from 'react'
import { Image, Tooltip } from 'antd'
import { Loader2, ImagePlus, Plus, X as XIcon, Eye } from '@/canvas/icons'
import { useMediaSource } from '@/canvas/hooks/useMediaSource'

function ReferenceThumb({ item, alt }) {
  const { displayUrl, markError } = useMediaSource(item.url, { kind: 'image' })
  return <img src={displayUrl} alt={alt} onError={markError} />
}

/**
 * 情绪板参考图缩略图行（单行水平紧凑形态，52×52 缩略 + 右上角 ✕ + 末尾 +）。
 * fork 自 gpt-image-2 DockedReferenceRow，去掉「插入到 prompt」(情绪板不按序号内联引用)。
 *
 * items 由父组件用 expandPortInputs 合并端口连入:
 *   { url, source:'edge', edgeId, sourceNodeId, name?, uploading? }
 */
export default function MoodboardRow({
  items = [],
  max = 10,
  showAddButton = true,
  showDeleteButton = true,
  disabled = false,
  onPickFiles,
  onDelete,
  label = '情绪板参考图',
}) {
  const inputRef = useRef(null)
  const isFull = items.length >= max
  const [previewUrl, setPreviewUrl] = useState(null)

  const handleAddClick = useCallback(() => {
    if (disabled || isFull) return
    inputRef.current?.click()
  }, [disabled, isFull])

  const handleFilesChange = useCallback((e) => {
    if (e.target.files && e.target.files.length > 0) {
      onPickFiles?.(e.target.files)
    }
    e.target.value = ''
  }, [onPickFiles])

  return (
    <div className="dpr-row" data-disabled={disabled || undefined}>
      <div className="dpr-label">
        <ImagePlus size={14} className="dpr-label-icon" />
        <span>{label}</span>
      </div>
      <div className="dpr-thumbs">
        {items.map((item, i) => {
          const globalIndex = i + 1
          const showHoverActions = !disabled && !item.uploading && !!item.url
          return (
            <div
              key={`${item.source}-${item.edgeId || item.sourceNodeId || i}`}
              className={`dpr-thumb${item.uploading ? ' dpr-thumb-uploading' : ''}`}
            >
              {item.uploading ? (
                <div className="dpr-thumb-uploading-inner">
                  <Loader2 size={14} className="icon-spin" />
                </div>
              ) : item.url ? (
                <ReferenceThumb item={item} alt={item.name || `情绪板 ${globalIndex}`} />
              ) : (
                <div className="dpr-thumb-empty"><ImagePlus size={18} /></div>
              )}

              {showHoverActions && (
                <div className="dpr-thumb-hover-actions">
                  <Tooltip title="查看大图">
                    <button
                      type="button"
                      className="dpr-thumb-action"
                      onClick={() => setPreviewUrl(item.url)}
                      aria-label="查看大图"
                    >
                      <Eye size={14} />
                    </button>
                  </Tooltip>
                </div>
              )}

              {!disabled && showDeleteButton && (
                <Tooltip title={item.uploading ? '取消上传' : '断开连线'}>
                  <button
                    type="button"
                    className="dpr-thumb-x"
                    onClick={() => onDelete?.(item)}
                    aria-label="删除情绪板"
                  >
                    <XIcon size={10} />
                  </button>
                </Tooltip>
              )}
            </div>
          )
        })}
        {showAddButton && !isFull && !disabled && (
          <Tooltip title="添加情绪板">
            <button
              type="button"
              className="dpr-thumb dpr-thumb-add"
              onClick={handleAddClick}
              aria-label="添加情绪板"
            >
              <Plus size={18} />
            </button>
          </Tooltip>
        )}
        {showAddButton && (
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleFilesChange}
          />
        )}
      </div>

      {previewUrl && (
        <Image
          width={0}
          height={0}
          style={{ display: 'none' }}
          src={previewUrl}
          preview={{
            visible: true,
            src: previewUrl,
            onVisibleChange: (v) => { if (!v) setPreviewUrl(null) },
          }}
        />
      )}
    </div>
  )
}
