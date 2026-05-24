// src/capabilities/tool/capcut-draft/components/MaterialCover.jsx
// 单素材封面:视频用 <video> 首帧 / 音频固定图标 / 图片原图 / 文字截断字。
// 视频 src 取值优先级:
//   1. probeBlobUrl — useDurationProbe 探时长时顺手 fetch 出的 blob URL (仅缺时长的
//      素材会触发探测; 已有 naturalDurationSec 的素材 planProbes 直接跳过 → 没有 blob)
//   2. useMediaSource 的 displayUrl — 走画布通用视频缓存 (Cache API 命中转 blob URL;
//      未命中返回原 URL 边下边播)。上游 FoldedVideoPreviewCard 的 useMediaSource 已经
//      把字节写进 Cache API, 这边 cacheMatch 几乎都能命中。
// 不能直接喂原 OSS URL: Content-Disposition: attachment 会让 Chrome 把视频当下载文件
// abort (MediaError code=4) → 封面白板。
import { Headphones, PlayCircle } from '@/canvas/icons'
import { useMediaSource } from '@/canvas/hooks/useMediaSource'

const TEXT_PREVIEW_LEN = 12

// 视频封面单独成组件 — useMediaSource 必须在组件顶层调用。
function VideoCover({ material }) {
  // probeBlobUrl 存在时跳过 useMediaSource 的拉取 (传 null 即只走 idle 分支),
  // 避免对同一字节流走两条路径浪费内存。
  const { displayUrl, markError } = useMediaSource(material.probeBlobUrl ? null : material.url, { kind: 'video' })
  const src = material.probeBlobUrl || displayUrl || undefined
  return (
    <>
      <video
        src={src}
        preload="metadata"
        muted
        playsInline
        onError={markError}
        draggable={false}
      />
      <span className="capcut-library-item__play"><PlayCircle size={24} /></span>
    </>
  )
}

// 图片封面同样走 useMediaSource: 上游 OSS 的 Content-Disposition: attachment
// 会让浏览器把图片当下载处理, 直接渲染会触发 ERR_BLOCKED_BY_RESPONSE。
function ImageCover({ url, alt }) {
  const { displayUrl, markError } = useMediaSource(url, { kind: 'image' })
  return <img src={displayUrl} alt={alt} draggable={false} onError={markError} />
}

export default function MaterialCover({ material }) {
  if (material.type === 'video') {
    return <VideoCover material={material} />
  }
  if (material.type === 'image') {
    return <ImageCover url={material.url} alt={material.label} />
  }
  if (material.type === 'audio') {
    return (
      <div style={{ background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', color: '#22c55e', fontSize: 24 }}>
        <Headphones />
      </div>
    )
  }
  if (material.type === 'text') {
    const preview = (material.textContent || '').slice(0, TEXT_PREVIEW_LEN)
      + ((material.textContent || '').length > TEXT_PREVIEW_LEN ? '…' : '')
    return (
      <div style={{ background: '#faf5ff', color: '#a855f7', fontSize: 10, padding: 4, textAlign: 'left', overflow: 'hidden', lineHeight: 1.3, width: '100%', height: '100%' }}>
        {preview}
      </div>
    )
  }
  return null
}
