import { useCallback, useRef, useState } from 'react'
import { Image, Tooltip } from 'antd'
import { Loader2, ImagePlus, Plus, X as XIcon, Eye } from '@/canvas/icons'
import { useMediaSource } from '@/canvas/hooks/useMediaSource'

function ReferenceThumb({ item, alt }) {
  const { displayUrl, markError } = useMediaSource(item.url, { kind: 'image' })
  return <img src={displayUrl} alt={alt} onError={markError} />
}

/**
 * DockedPanel 用的参考图缩略图行（单行水平紧凑形态）
 *
 * Fork 自 gpt-image-2/_shared/DockedReferenceRow，差异：
 *   - 组件名 NanoBananaReferenceRow
 *   - max 默认 14（gpt-image-2 用 10）
 *   - onInsertToken 保留接口但 nano-banana 不使用（调用方不传即可）
 *
 * items 由父组件合并（端口连入）:
 *   { url, source: 'edge', edgeId, sourceNodeId, name?, uploading? }
 *
 * 末尾 + 按钮策略由 showAddButton 控制（完整版显示 / 精简版不显示）。
 *   末尾 + 点击 → 触发文件选择 → 父组件 onPickFiles 接管
 *
 * 缩略图 hover 浮层（uploading 项不显示）：
 *   - + → onInsertToken(globalIndex) 往 prompt 插入 @图像N（nano-banana 不接）
 *   - 查看 → 弹出大图预览（antd Image.preview）
 *   - x → onDelete(item) 断开连线（uploading 项视为"取消上传"，父组件同时删占位节点）
 */
export default function NanoBananaReferenceRow({
  items = [],
  max = 14,
  showAddButton = true,
  showDeleteButton = true,
  disabled = false,
  onPickFiles,
  onDelete,
  onInsertToken,
  label = '参考图',
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
                <ReferenceThumb item={item} alt={item.name || `参考图 ${globalIndex}`} />
              ) : (
                <div className="dpr-thumb-empty"><ImagePlus size={18} /></div>
              )}

              {showHoverActions && (
                <div className="dpr-thumb-hover-actions">
                  {onInsertToken && (
                    <Tooltip title="插入到 prompt">
                      <button
                        type="button"
                        className="dpr-thumb-action"
                        onClick={() => onInsertToken(globalIndex)}
                        aria-label="插入到 prompt"
                      >
                        <Plus size={14} />
                      </button>
                    </Tooltip>
                  )}
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
                    aria-label="删除参考图"
                  >
                    <XIcon size={10} />
                  </button>
                </Tooltip>
              )}
            </div>
          )
        })}
        {showAddButton && !isFull && !disabled && (
          <Tooltip title="添加参考图">
            <button
              type="button"
              className="dpr-thumb dpr-thumb-add"
              onClick={handleAddClick}
              aria-label="添加参考图"
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

      {/* 受控大图预览：antd Image 的 preview 模式（不渲染缩略图本身，只用预览层） */}
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
