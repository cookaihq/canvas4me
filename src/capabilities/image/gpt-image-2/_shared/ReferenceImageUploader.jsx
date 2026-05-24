import { useCallback, useRef, useState } from 'react'
import { Tooltip, message, Image } from 'antd'
import { Image as ImageIcon, Plus, X, Eye, Trash2 } from '@/canvas/icons'
import { useUploader } from '@/platform/provider.jsx'
import { useMediaSource } from '@/canvas/hooks/useMediaSource'

function UploaderImage({ url, alt }) {
  const { displayUrl, markError } = useMediaSource(url, { kind: 'image' })
  return <img src={displayUrl} alt={alt} onError={markError} />
}

/**
 * 参考图上传 + 画廊（gpt-image-2 专用）
 *
 * items 合并规则由调用方负责：[...edgeItems, ...panelItems]
 *   edgeItems:  { url, name, source: 'edge', sourceLabel, edgeId }
 *   panelItems: { url, name, source: 'panel', panelIndex }
 *
 * 悬停 3 图标：查看 / 插入 @图像N / 删除（panel 项移除 params，edge 项删除连线）。
 */
export default function ReferenceImageUploader({
  items = [],
  max = 10,
  onUploaded,
  onDelete,
  onInsert,
  insertTooltip,
  disabled,
}) {
  const uploader = useUploader()
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  // 预览控制：点击"查看"图标 → 浮层大图
  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewSrc, setPreviewSrc] = useState('')

  const total = items.length
  const isFull = total >= max
  const isEmpty = total === 0

  const uploadMany = useCallback(
    async (files) => {
      if (!files || files.length === 0) return
      const remain = max - total
      if (remain <= 0) {
        message.warning(`参考图最多 ${max} 张`)
        return
      }
      const accepted = Array.from(files).slice(0, remain)
      if (files.length > remain) {
        message.warning(`最多再添加 ${remain} 张，已丢弃 ${files.length - remain} 张`)
      }
      for (const file of accepted) {
        try {
          const result = await uploader.uploadFile(file)
          onUploaded?.({ url: result.url, name: file.name })
        } catch (err) {
          message.error(`${file.name} 上传失败：${err?.message || '未知错误'}`)
        }
      }
    },
    [max, total, onUploaded]
  )

  const handlePickClick = useCallback(() => {
    if (disabled || isFull) return
    inputRef.current?.click()
  }, [disabled, isFull])

  const handleFilesChange = useCallback(
    (e) => {
      uploadMany(e.target.files)
      e.target.value = ''
    },
    [uploadMany]
  )

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault()
      setDragOver(false)
      if (disabled || isFull) return
      uploadMany(e.dataTransfer.files)
    },
    [disabled, isFull, uploadMany]
  )

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    if (!disabled && !isFull) setDragOver(true)
  }, [disabled, isFull])

  const handleDragLeave = useCallback(() => setDragOver(false), [])

  const handleView = useCallback((item) => {
    if (!item?.url) return
    setPreviewSrc(item.url)
    setPreviewVisible(true)
  }, [])

  if (isEmpty) {
    return (
      <div
        className={`nb-ref-dropzone nb-ref-dropzone-empty${dragOver ? ' drag-over' : ''}${disabled ? ' disabled' : ''}`}
        onClick={handlePickClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <ImageIcon className="nb-ref-dropzone-icon" />
        <div className="nb-ref-dropzone-title">点击或拖拽上传图片</div>
        <div className="nb-ref-dropzone-hint">最多 {max} 张 · JPG / PNG / WebP</div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleFilesChange}
        />
      </div>
    )
  }

  return (
    <div
      className={`nb-ref-dropzone nb-ref-dropzone-filled${dragOver ? ' drag-over' : ''}${disabled ? ' disabled' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <div className="nb-ref-grid">
        {items.map((item, i) => {
          const globalIndex = i + 1
          return (
            <div key={`${item.source}-${i}`} className="nb-ref-tile">
              {item.url && <UploaderImage url={item.url} alt={item.name || ''} />}
              <span className="nb-ref-tile-index">#{globalIndex}</span>

              {/* 悬停操作浮层（查看 / 插入 / 删除） */}
              {!disabled && (
                <div className="gi2-tile-overlay">
                  <Tooltip title="查看">
                    <button
                      type="button"
                      className="gi2-tile-btn"
                      onClick={() => handleView(item)}
                    >
                      <Eye size={14} />
                    </button>
                  </Tooltip>
                  <Tooltip title={insertTooltip ? insertTooltip(globalIndex) : `插入 @图像${globalIndex}`}>
                    <button
                      type="button"
                      className="gi2-tile-btn"
                      onClick={() => onInsert?.(globalIndex)}
                    >
                      <Plus size={14} />
                    </button>
                  </Tooltip>
                  <Tooltip title={item.source === 'edge' ? '删除（将断开画布连线）' : '删除'}>
                    <button
                      type="button"
                      className="gi2-tile-btn danger"
                      onClick={() => onDelete?.(item)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </Tooltip>
                </div>
              )}
            </div>
          )
        })}
        {!isFull && (
          <button
            type="button"
            className="nb-ref-tile nb-ref-tile-add"
            onClick={handlePickClick}
            disabled={disabled}
            title="添加更多"
          >
            <Plus />
          </button>
        )}
      </div>

      {/* antd Image 隐藏容器，用于程序化触发大图预览 */}
      <Image
        style={{ display: 'none' }}
        src={previewSrc}
        preview={{
          visible: previewVisible,
          src: previewSrc,
          onVisibleChange: (v) => setPreviewVisible(v),
        }}
      />

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFilesChange}
      />
    </div>
  )
}
