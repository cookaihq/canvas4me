/**
 * 混合附件行 —— 混合模式专用：一行混排 图片/视频/音频/文件 缩略图，同类相邻成组，
 * 末尾「+」按类型添加（图片/音频/视频/文件/视频链接）。不显示来源角标。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Image as AntdImage, Tooltip } from 'antd'
import { X, Eye, Loader2, Plus, Image, Film, AudioLines, FileText, ExternalLink } from '@/canvas/icons'
import { useMediaSource } from '@/canvas/hooks/useMediaSource'

const TYPE_ORDER = ['image', 'video', 'audio', 'file']
const ACCEPT = { image: 'image/*', video: 'video/*', audio: 'audio/*', file: '.pdf,.txt,.md,.markdown,text/*,application/pdf' }
const TYPE_LABEL = { image: '图片', video: '视频', audio: '音频', file: '文件' }
const ADD_OPTIONS = [
  { kind: 'image', icon: Image, name: '图片', sub: 'JPG / PNG / WebP' },
  { kind: 'audio', icon: AudioLines, name: '音频', sub: 'WAV / MP3 / FLAC' },
  { kind: 'video', icon: Film, name: '视频', sub: 'MP4 文件' },
  { kind: 'file', icon: FileText, name: '文件', sub: 'PDF / 文本 / Markdown' },
  { kind: 'link', icon: ExternalLink, name: '视频链接', sub: '粘贴 YouTube 链接' },
]

function ImageThumb({ item }) {
  const { displayUrl, markError } = useMediaSource(item.url, { kind: 'image' })
  return <img src={displayUrl} alt={item.name || ''} onError={markError} />
}
function VideoThumb({ item }) {
  const { displayUrl, markError } = useMediaSource(item.url, { kind: 'video' })
  return <video src={displayUrl} muted playsInline preload="metadata" onError={markError} />
}

function MixedVideoFullscreen({ url, onClick }) {
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

function badgeIcon(kind) {
  if (kind === 'image') return <Image size={9} />
  if (kind === 'video') return <Film size={9} />
  if (kind === 'audio') return <AudioLines size={9} />
  return <FileText size={9} />
}
function ext(name) {
  if (!name || typeof name !== 'string') return ''
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toUpperCase().slice(0, 4) : ''
}

export default function MixedAttachmentRow({
  groups,
  disabled = false,
  onPickFiles,
  onPasteLink,
  onDelete,
}) {
  const [addOpen, setAddOpen] = useState(false)
  const [preview, setPreview] = useState(null)  // { url, kind } | null
  const inputRef = useRef(null)
  const pendingKind = useRef('image')

  useEffect(() => {
    if (!addOpen) return
    const close = () => setAddOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [addOpen])

  const triggerPick = useCallback((kind) => {
    setAddOpen(false)
    if (kind === 'link') { onPasteLink?.(); return }
    pendingKind.current = kind
    if (inputRef.current) {
      inputRef.current.accept = ACCEPT[kind] || '*/*'
      inputRef.current.click()
    }
  }, [onPasteLink])

  const handleFiles = useCallback((e) => {
    if (e.target.files?.length) onPickFiles?.(pendingKind.current, e.target.files)
    e.target.value = ''
  }, [onPickFiles])

  const counts = TYPE_ORDER.map(k => [k, (groups?.[k] || []).length]).filter(([, n]) => n > 0)

  return (
    <div className="llm-mix-att">
      {counts.length > 0 && (
        <div className="llm-mix-counts">
          {counts.map(([k, n]) => (
            <span key={k} className="llm-mix-pill" data-kind={k}>{TYPE_LABEL[k]} {n}</span>
          ))}
        </div>
      )}

      <div className="llm-mix-strip">
        {TYPE_ORDER.flatMap(kind => (groups?.[kind] || []).map((item, i) => {
          const showActions = !disabled && !item.uploading && !!item.url
          return (
            <div key={`${kind}-${item.edgeId || item.sourceNodeId || i}`} className={`llm-mix-thumb${item.uploading ? ' uploading' : ''}`} data-kind={kind}>
              {item.uploading ? (
                <div className="llm-mix-thumb-inner"><Loader2 size={14} className="icon-spin" /></div>
              ) : kind === 'image' && item.url ? <ImageThumb item={item} />
                : kind === 'video' && item.url ? <VideoThumb item={item} />
                : kind === 'audio' ? <div className="llm-mix-thumb-inner"><AudioLines size={16} /><span className="llm-mix-ext">{ext(item.name)}</span></div>
                : <div className="llm-mix-thumb-inner"><FileText size={16} /><span className="llm-mix-ext">{ext(item.name)}</span></div>}

              <span className="llm-mix-badge" data-kind={kind}>{badgeIcon(kind)}</span>
              {showActions && (
                <div className="llm-mix-actions">
                  {(kind === 'image' || kind === 'video') && (
                    <Tooltip title="查看"><button type="button" className="llm-mix-action" onClick={() => setPreview({ url: item.url, kind })}><Eye size={14} /></button></Tooltip>
                  )}
                  <Tooltip title="删除"><button type="button" className="llm-mix-action" onClick={() => onDelete?.(kind, item)}><X size={12} /></button></Tooltip>
                </div>
              )}
            </div>
          )
        }))}

        <div className="llm-mix-add-anchor" onMouseDown={e => e.stopPropagation()}>
          <button type="button" className="llm-mix-add" onClick={() => setAddOpen(o => !o)} disabled={disabled}>
            <Plus size={16} /><span>添加</span>
          </button>
          {addOpen && (
            <div className="llm-mix-add-pop">
              {ADD_OPTIONS.map(opt => {
                const Icon = opt.icon
                return (
                  <button key={opt.kind} type="button" className="llm-mix-type-opt" data-kind={opt.kind} onClick={() => triggerPick(opt.kind)}>
                    <span className="llm-mix-type-ico"><Icon size={14} /></span>
                    <span className="llm-mix-type-main"><span className="llm-mix-type-name">{opt.name}</span><span className="llm-mix-type-sub">{opt.sub}</span></span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <input ref={inputRef} type="file" multiple style={{ display: 'none' }} onChange={handleFiles} />
      </div>

      <AntdImage style={{ display: 'none' }} preview={{ visible: preview?.kind === 'image', src: preview?.url, onVisibleChange: v => { if (!v) setPreview(null) } }} />
      {preview?.kind === 'video' && (
        <div className="llm-att-video-preview" onClick={() => setPreview(null)} role="presentation">
          <MixedVideoFullscreen url={preview.url} onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
