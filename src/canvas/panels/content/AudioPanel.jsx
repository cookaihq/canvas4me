import { useRef } from 'react'
import { Button, Descriptions, Progress } from 'antd'
import { Upload } from '@/canvas/icons'
import useContentUpload from '../../hooks/useContentUpload'
import { useMediaSource } from '../../hooks/useMediaSource'

/**
 * 音频面板 — 音频播放器 + 文件信息 + 上传/替换（走 OSS）
 */
export default function AudioPanel({ node }) {
  const content = node.data?.content || {}
  const { url, fileName, fileSize, mimeType } = content
  const locked = node.data?.locked

  const { handleFile, uploading, progress, uploadError } = useContentUpload(node.id)
  const { displayUrl, markError } = useMediaSource(url, { kind: 'audio' })
  const inputRef = useRef(null)

  const handleBtnClick = () => {
    if (uploading) return
    inputRef.current?.click()
  }

  const handleFilesChange = (e) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const formatSize = (bytes) => {
    if (!bytes) return '-'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="panel-content-audio">
      {url ? (
        <audio controls src={displayUrl} onError={markError} style={{ width: '100%' }}>
          浏览器不支持音频播放
        </audio>
      ) : (
        <div style={{ color: '#bfbfbf', textAlign: 'center', padding: 16 }}>
          暂无音频
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
            {uploading ? '上传中…' : (url ? '替换音频' : '上传音频')}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="audio/*"
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
