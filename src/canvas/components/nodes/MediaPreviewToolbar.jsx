import { memo, useState, useCallback } from 'react'
import { Tooltip } from 'antd'
import { Maximize2, Download } from '@/canvas/icons'
import { useMediaSource } from '../../hooks/useMediaSource'
import MediaPreviewModal from '../MediaPreviewModal'

const DEFAULT_EXT_BY_MEDIA = {
  image: 'png',
  video: 'mp4',
  audio: 'mp3',
}

/**
 * 媒体节点选中态工具栏 — 由 NodeToolbarPortal 在 media 段调用 (纯展示组件, 不挂 NodeToolbar)
 *
 * 适用: 任何承载 image / video / audio 产物的节点 (folded 能力节点 / 输入节点 / 输出节点 等).
 *      Portal 通过 resolveMediaContext 推断节点是否需要显示本组件.
 *
 * 按钮 (按 components-canvas.html#node-overlays 规范):
 *  - 全屏查看 (image / video): 走 MediaPreviewModal
 *  - 下载: 优先用本地缓存 (useMediaSource 返回的 blob URL); 跨域/未缓存时用原 URL
 *
 * audio 节点内已内嵌播放控件, 全屏 Modal 仅 <audio controls> 冗余, 故只显示"下载".
 *
 * 输出 JSX 结构: 单一 .node-toolbar-group 含 1~2 个按钮; Modal 跟随渲染.
 * 文件名优先级: data.name → content.fileName → image.png / video.mp4 / audio.mp3
 */
function MediaPreviewToolbar({
  url,
  mediaType = 'image', // 'image' | 'video' | 'audio'
  nodeName,            // data.name (用户起的节点名)
  fileName,            // content.fileName (上游回的文件名)
}) {
  // 下载按钮场景:命中本地 cache 直接给 blob URL,未命中给原 URL(让浏览器跟 attachment header 走原生下载)
  const { displayUrl } = useMediaSource(url, { kind: mediaType })
  const [previewOpen, setPreviewOpen] = useState(false)

  const handleDownload = useCallback((e) => {
    e.stopPropagation()
    if (!url) return
    // 优先用本地缓存 blob URL, 没缓存时退回原 URL
    const downloadUrl = displayUrl || url
    const ext = DEFAULT_EXT_BY_MEDIA[mediaType] || 'bin'
    const safeNodeName = (nodeName || '').trim()
    const baseName = safeNodeName || fileName || `${mediaType}.${ext}`
    // 没扩展名兜底补
    const finalName = /\.[a-z0-9]+$/i.test(baseName) ? baseName : `${baseName}.${ext}`

    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = finalName
    a.target = '_blank'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [url, displayUrl, mediaType, nodeName, fileName])

  const handlePreview = useCallback((e) => {
    e.stopPropagation()
    setPreviewOpen(true)
  }, [])

  // audio 节点内已内嵌播放控件, 不显示全屏查看; image/video 才显示
  const showPreviewBtn = mediaType !== 'audio'

  if (!url) return null

  return (
    <>
      <div className="node-toolbar-group">
        {showPreviewBtn && (
          <Tooltip title="全屏查看">
            <button
              type="button"
              className="node-toolbar-btn"
              aria-label="全屏查看"
              onClick={handlePreview}
            >
              <Maximize2 size={14} />
            </button>
          </Tooltip>
        )}
        <Tooltip title="下载">
          <button
            type="button"
            className="node-toolbar-btn"
            aria-label="下载"
            onClick={handleDownload}
          >
            <Download size={14} />
          </button>
        </Tooltip>
      </div>

      <MediaPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        mediaType={mediaType}
        url={displayUrl || url}
      />
    </>
  )
}

export default memo(MediaPreviewToolbar)
