import { useCallback, useRef, useState } from 'react'
import { Image, Tooltip, message } from 'antd'
import { Loader2, Upload as UploadIcon, X as XIcon, Image as ImageIcon, Eye } from '@/canvas/icons'
import { useUploader } from '@/platform/provider.jsx'
import { useMediaSource } from '@/canvas/hooks/useMediaSource'

function UploaderImage({ url, alt }) {
  const { displayUrl, markError } = useMediaSource(url, { kind: 'image' })
  return <img src={displayUrl} alt={alt} onError={markError} />
}

/**
 * Seedance 2.0 私有 — 单图上传组件 (I2V / FLF 主区使用)
 *
 * 三态:
 *   - 端口已连接 (portConnected = true): 只读, 显示连线缩略图 + "由画布连线提供" hint
 *   - 空: dropzone (拖入 / 点击上传)
 *   - 已上传: 缩略图 + 替换 + 删除
 *
 * 受控接口:
 *   value         = 上传后的 OSS URL (字符串) | null
 *   onChange(url) = 上传成功 / 删除时触发, 参数 string | null
 *   label         = 空态文案前缀 ("上传图片" / "上传首帧" / "上传尾帧")
 *   portConnected = 端口已连接 (true 时整个组件只读, 显示 portThumbUrl)
 *   portThumbUrl  = 端口连线节点的 content.url (仅 portConnected = true 时使用)
 */
const ACCEPT = 'image/jpeg,image/jpg,image/png,image/webp'

export default function SingleImageUploader({
  value,
  onChange,
  label = '上传图片',
  portConnected = false,
  portThumbUrl = null,
  disabled = false,
}) {
  const uploader = useUploader()
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [previewVisible, setPreviewVisible] = useState(false)

  const handlePick = useCallback(() => {
    if (disabled || portConnected || uploading) return
    fileInputRef.current?.click()
  }, [disabled, portConnected, uploading])

  const handleFiles = useCallback(async (files) => {
    if (!files || files.length === 0) return
    if (files.length > 1) {
      message.warning('只能上传 1 张图片，已忽略其余文件')
    }
    const file = files[0]
    if (!file) return

    setUploading(true)
    try {
      const result = await uploader.uploadFile(file)
      if (!result?.url) throw new Error('上传未返回 URL')
      onChange?.(result.url)
    } catch (err) {
      message.error(`图片上传失败: ${err?.message || '未知错误'}`)
    } finally {
      setUploading(false)
    }
  }, [uploader, onChange])

  const handleFileChange = useCallback((e) => {
    handleFiles(e.target.files)
    e.target.value = ''
  }, [handleFiles])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    if (disabled || portConnected || uploading) return
    handleFiles(e.dataTransfer.files)
  }, [disabled, portConnected, uploading, handleFiles])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    if (!disabled && !portConnected && !uploading) setDragOver(true)
  }, [disabled, portConnected, uploading])

  const handleDragLeave = useCallback(() => setDragOver(false), [])

  const handleDelete = useCallback((e) => {
    e?.stopPropagation()
    if (disabled || portConnected) return
    onChange?.(null)
  }, [disabled, portConnected, onChange])

  // 端口连接形态: 只读, 显示连线缩略图
  if (portConnected) {
    return (
      <div className="sd2-single-img sd2-single-img-port">
        <div className="sd2-single-img-thumb">
          {portThumbUrl
            ? <UploaderImage url={portThumbUrl} alt={label} />
            : <div className="sd2-single-img-thumb-empty"><ImageIcon size={20} /></div>}
        </div>
        <div className="sd2-single-img-meta">
          <div className="sd2-single-img-name">{label}</div>
          <div className="sd2-single-img-hint">由画布连线提供 (面板已锁定)</div>
        </div>
      </div>
    )
  }

  // 已上传形态
  if (value) {
    return (
      <div className="sd2-single-img sd2-single-img-filled">
        <div className="sd2-single-img-thumb" onClick={() => setPreviewVisible(true)}>
          <UploaderImage url={value} alt={label} />
          <div className="sd2-single-img-thumb-overlay">
            <Eye size={16} />
          </div>
        </div>
        <div className="sd2-single-img-meta">
          <div className="sd2-single-img-name">{label}</div>
          <div className="sd2-single-img-actions">
            <button type="button" className="sd2-single-img-replace" onClick={handlePick} disabled={uploading}>
              {uploading ? '上传中…' : '替换'}
            </button>
            <Tooltip title="删除">
              <button type="button" className="sd2-single-img-x" onClick={handleDelete} aria-label="删除图片">
                <XIcon size={12} />
              </button>
            </Tooltip>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        {previewVisible && (
          <Image
            width={0}
            height={0}
            style={{ display: 'none' }}
            src={value}
            preview={{
              visible: true,
              src: value,
              onVisibleChange: (v) => { if (!v) setPreviewVisible(false) },
            }}
          />
        )}
      </div>
    )
  }

  // 空态: dropzone
  return (
    <div
      className={`sd2-single-img sd2-single-img-empty${dragOver ? ' drag-over' : ''}${disabled ? ' disabled' : ''}`}
      onClick={handlePick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {uploading ? (
        <>
          <Loader2 size={18} className="icon-spin" />
          <span className="sd2-single-img-empty-text">上传中…</span>
        </>
      ) : (
        <>
          <UploadIcon size={16} />
          <span className="sd2-single-img-empty-text">{label} (JPG / PNG / WebP, ≤ 30MB)</span>
        </>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  )
}
