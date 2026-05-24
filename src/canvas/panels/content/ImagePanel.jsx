import { useRef } from 'react'
import { Button, Descriptions, Image, Progress } from 'antd'
import { Upload } from '@/canvas/icons'
import useContentUpload from '../../hooks/useContentUpload'

/**
 * 图片面板 — 大图预览 + 文件信息 + 上传/替换（走 OSS）
 *
 * 上传用原生 <input type="file" hidden>（不依赖 antd Upload 的内部 click 转发）。
 */
export default function ImagePanel({ node }) {
  const content = node.data?.content || {}
  const { url, fileName, fileSize, mimeType } = content
  const locked = node.data?.locked

  const { handleFile, uploading, progress, uploadError } = useContentUpload(node.id)
  const inputRef = useRef(null)

  const handleBtnClick = () => {
    if (uploading) return
    inputRef.current?.click()
  }

  const handleFilesChange = (e) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = '' // 允许再次选同一文件
  }

  const formatSize = (bytes) => {
    if (!bytes) return '-'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="panel-content-image">
      {url ? (
        <div className="panel-image-preview">
          <Image
            src={url}
            alt={fileName || '图片'}
            style={{ maxWidth: '100%', borderRadius: 4 }}
          />
        </div>
      ) : (
        <div className="panel-image-empty">
          <span style={{ color: '#bfbfbf' }}>暂无图片</span>
        </div>
      )}

      <Descriptions
        column={1}
        size="small"
        style={{ marginTop: 12 }}
        items={[
          { key: 'name', label: '文件名', children: fileName || '-' },
          { key: 'size', label: '大小', children: formatSize(fileSize) },
          { key: 'type', label: '类型', children: mimeType || '-' },
        ]}
      />

      {!locked && (
        <>
          <Button
            icon={<Upload size={14} />}
            style={{ marginTop: 8 }}
            onClick={handleBtnClick}
            loading={uploading}
            disabled={uploading}
          >
            {uploading ? '上传中…' : (url ? '替换图片' : '上传图片')}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFilesChange}
          />
          {uploading && (
            <Progress percent={progress} size="small" style={{ marginTop: 8 }} />
          )}
          {uploadError && !uploading && (
            <div style={{ color: '#ff4d4f', marginTop: 8, fontSize: 12 }}>
              {uploadError}
            </div>
          )}
        </>
      )}
    </div>
  )
}
