/**
 * LLM 附件缩略图行 —— vision/video/audio 共用
 *
 * 视觉对照 ozid6 col3 cykYX / col4 bIV8z / col5 QSKRK：
 *   - 一行缩略图 + 末尾 "+" 添加按钮（未满时显示）
 *   - 下方一行 "最多 N 张" 提示（max > 1 时显示）
 *   - 缩略图按 kind 渲染：image=<img>；video=<video>静帧；audio=带文件名的音频片段
 *   - hover 右上角 ×（删除）；image/video 还有"查看"按钮
 *   - mode-accent 色（image=橙、audio=绿、video=红）通过 data-kind 由 CSS 控制
 *
 * 占位 uploading 项渲染 spinner，不可删（只能等上传完成或失败回滚）。
 */
import { useCallback, useRef, useState } from 'react'
import { Image as AntdImage, Tooltip } from 'antd'
import { X, Eye, Loader2, Image, Film, AudioLines, Plus, Upload, Link } from '@/canvas/icons'
import { useMediaSource } from '@/canvas/hooks/useMediaSource'

const KIND_META = {
  image: { icon: Image,      label: '图片' },
  video: { icon: Film,       label: '视频' },
  audio: { icon: AudioLines, label: '音频' },
}

const ACCEPT_BY_KIND = {
  image: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
}

function LlmAttachmentImage({ item }) {
  const { displayUrl, markError } = useMediaSource(item.url, { kind: 'image' })
  return <img src={displayUrl} alt={item.name || ''} onError={markError} />
}

function LlmAttachmentVideoThumb({ item }) {
  const { displayUrl, markError } = useMediaSource(item.url, { kind: 'video' })
  return <video src={displayUrl} muted playsInline preload="metadata" onError={markError} />
}

function LlmAttachmentVideoFullscreen({ url, onClick }) {
  const { displayUrl, markError } = useMediaSource(url, { kind: 'video', strategy: 'eager' })
  return (
    <video
      src={displayUrl}
      controls
      autoPlay
      onClick={onClick}
      onError={markError}
    />
  )
}

export default function LlmAttachmentRow({
  kind = 'image',
  items = [],
  max = 10,
  multiple = true,
  showAddButton = true,
  disabled = false,
  onPickFiles,
  onDelete,
  onPasteLink,  // video kind 专用 — 触发"粘贴链接"分支(由外层弹 URL 输入)
}) {
  const inputRef = useRef(null)
  const isFull = items.length >= max
  const meta = KIND_META[kind] || KIND_META.image
  const Icon = meta.icon
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
    <div className="llm-att-row" data-kind={kind} data-disabled={disabled || undefined}>
      <div className="llm-att-thumbs">
        {items.map((item, i) => {
          const showHoverActions = !disabled && !item.uploading && !!item.url
          return (
            <div
              key={`${item.source}-${item.edgeId || item.sourceNodeId || i}`}
              className={`llm-att-thumb llm-att-thumb-${kind}${item.uploading ? ' uploading' : ''}`}
            >
              {item.uploading ? (
                <div className="llm-att-thumb-inner"><Loader2 size={14} className="icon-spin" /></div>
              ) : kind === 'image' && item.url ? (
                <LlmAttachmentImage item={item} />
              ) : kind === 'video' && item.url ? (
                <LlmAttachmentVideoThumb item={item} />
              ) : kind === 'audio' && item.url ? (
                <div className="llm-att-thumb-audio">
                  <AudioLines size={16} />
                  <span className="llm-att-thumb-audio-name" title={item.name}>{item.name || '音频'}</span>
                </div>
              ) : (
                <div className="llm-att-thumb-inner"><Icon /></div>
              )}

              {showHoverActions && (
                <div className="llm-att-thumb-actions">
                  {(kind === 'image' || kind === 'video') && (
                    <Tooltip title="查看">
                      <button
                        type="button"
                        className="llm-att-thumb-action"
                        onClick={() => setPreviewUrl(item.url)}
                        aria-label="查看"
                      >
                        <Eye size={14} />
                      </button>
                    </Tooltip>
                  )}
                  <Tooltip title="删除">
                    <button
                      type="button"
                      className="llm-att-thumb-action"
                      onClick={() => onDelete?.(item)}
                      aria-label="删除"
                    >
                      <X size={12} />
                    </button>
                  </Tooltip>
                </div>
              )}
            </div>
          )
        })}
        {showAddButton && !isFull && kind === 'video' && (
          <>
            <button
              type="button"
              className="llm-att-thumb llm-att-thumb-add"
              onClick={handleAddClick}
              aria-label="上传视频文件"
              disabled={disabled}
            >
              <Upload size={14} />
              <span className="llm-att-thumb-add-label">上传</span>
            </button>
            {onPasteLink && (
              <button
                type="button"
                className="llm-att-thumb llm-att-thumb-add"
                onClick={() => onPasteLink()}
                aria-label="粘贴视频链接"
                disabled={disabled}
              >
                <Link size={14} />
                <span className="llm-att-thumb-add-label">链接</span>
              </button>
            )}
          </>
        )}
        {showAddButton && !isFull && kind !== 'video' && (
          <button
            type="button"
            className="llm-att-thumb llm-att-thumb-add"
            onClick={handleAddClick}
            aria-label={`添加${meta.label}`}
            disabled={disabled}
          >
            <Plus size={14} />
            <span className="llm-att-thumb-add-label">添加</span>
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_BY_KIND[kind]}
          multiple={multiple}
          style={{ display: 'none' }}
          onChange={handleFilesChange}
        />
      </div>

      {max > 1 && (
        <div className="llm-att-hint">
          {kind === 'video'
            ? `视频来源合并后最多 ${max} 段；Gemini 模型可粘贴 YouTube 链接。`
            : `图片来源按「端口在前、面板上传在后」合并，最多 ${max} 张。`}
        </div>
      )}

      {/* image / video 大图预览(audio 无) */}
      {kind === 'image' && (
        <AntdImage
          style={{ display: 'none' }}
          preview={{
            visible: !!previewUrl,
            src: previewUrl,
            onVisibleChange: (v) => { if (!v) setPreviewUrl(null) },
          }}
        />
      )}
      {kind === 'video' && previewUrl && (
        <div className="llm-att-video-preview" onClick={() => setPreviewUrl(null)} role="presentation">
          <LlmAttachmentVideoFullscreen url={previewUrl} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
