import { useRef } from 'react'
import { Button, Descriptions, Progress } from 'antd'
import { Loader2, Upload } from '@/canvas/icons'
import useContentUpload from '../../hooks/useContentUpload'
import { useMediaSource } from '../../hooks/useMediaSource'

/**
 * 视频面板 — 视频播放器 + 文件信息 + 上传/替换（走 OSS）
 *
 * 播放器走 useMediaSource(strategy: 'eager')：面板打开即立即下载并以 blob URL 喂给
 * <video>，绕开后端 Content-Type 不规范（例如 application/octet-stream）导致原生
 * <video> 不肯播放的问题。下载期间显示加载占位。
 */
export default function VideoPanel({ node }) {
  const content = node.data?.content || {}
  const { url, fileName, fileSize, mimeType } = content
  const locked = node.data?.locked

  const { handleFile, uploading, progress, uploadError } = useContentUpload(node.id)
  const { displayUrl, markError } = useMediaSource(url, { kind: 'video', strategy: 'eager' })
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
    <div className="panel-content-video">
      {url ? (
        displayUrl ? (
          <video
            controls
            src={displayUrl}
            onError={markError}
            style={{ width: '100%', borderRadius: 4, background: '#000' }}
          >
            浏览器不支持视频播放
          </video>
        ) : (
          <div
            style={{
              width: '100%',
              minHeight: 180,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              background: '#000',
              borderRadius: 4,
              color: '#bfbfbf',
              fontSize: 13,
            }}
          >
            <Loader2 size={14} className="capability-card-spinner" /> 加载中…
          </div>
        )
      ) : (
        <div style={{ color: '#bfbfbf', textAlign: 'center', padding: 16 }}>
          暂无视频
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
            {uploading ? '上传中…' : (url ? '替换视频' : '上传视频')}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
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
