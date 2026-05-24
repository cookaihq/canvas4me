// src/canvas/components/MediaPreviewModal.jsx
// 统一的全屏预览组件 — 支持图片 / 视频 / 音频 / 文字四种媒体类型。
//
// 调用方:
//   <MediaPreviewModal
//     open
//     onClose={() => ...}
//     mediaType="video"     // 'image' | 'video' | 'audio' | 'text'
//     url="https://..."     // image/video/audio 用
//     text="..."            // text 用
//     title="可选标题"
//   />
//
// 实现细节:
//   - image: 用 antd Image 的 preview 控制器(隐藏的 Image 实例承载预览态),
//     得到原生缩放/旋转/方向键切换的体验
//   - video / audio: antd Modal + 原生 <video>/<audio controls autoPlay>
//   - text: antd Modal + 可滚动 <pre>(保留换行),适合脚本/字幕等长文本预览

import { Image } from 'antd'
import { Modal } from '@/canvas/components/AntdWrappers'
import { useMediaSource } from '../hooks/useMediaSource'

const TITLE_BY_TYPE = {
  image: '查看图片',
  video: '播放视频',
  audio: '播放音频',
  text: '查看文字',
}

function ModalVideo({ url, ...rest }) {
  const { displayUrl, markError } = useMediaSource(url, { kind: 'video', strategy: 'eager' })
  return <video {...rest} src={displayUrl} onError={markError} />
}

function ModalAudio({ url, ...rest }) {
  const { displayUrl, markError } = useMediaSource(url, { kind: 'audio' })
  return <audio {...rest} src={displayUrl} onError={markError} />
}

export default function MediaPreviewModal({ open, onClose, mediaType, url, text, title }) {
  if (mediaType === 'image') {
    return (
      <Image
        src={url}
        style={{ display: 'none' }}
        preview={{
          visible: open,
          onVisibleChange: (v) => { if (!v) onClose?.() },
          src: url,
        }}
      />
    )
  }

  const headerTitle = title || TITLE_BY_TYPE[mediaType] || '预览'

  if (mediaType === 'video') {
    return (
      <Modal
        open={open}
        onCancel={onClose}
        footer={null}
        width="80vw"
        centered
        destroyOnHidden
        title={headerTitle}
        styles={{ body: { padding: 0, background: '#000' } }}
      >
        <ModalVideo
          url={url}
          controls
          autoPlay
          style={{ width: '100%', maxHeight: '75vh', display: 'block' }}
        />
      </Modal>
    )
  }

  if (mediaType === 'audio') {
    return (
      <Modal
        open={open}
        onCancel={onClose}
        footer={null}
        width={480}
        centered
        destroyOnHidden
        title={headerTitle}
      >
        <div style={{ padding: '24px 0', display: 'flex', justifyContent: 'center' }}>
          <ModalAudio url={url} controls autoPlay style={{ width: '100%' }} />
        </div>
      </Modal>
    )
  }

  if (mediaType === 'text') {
    return (
      <Modal
        open={open}
        onCancel={onClose}
        footer={null}
        width={640}
        centered
        destroyOnHidden
        title={headerTitle}
      >
        <pre
          style={{
            margin: 0,
            maxHeight: '60vh',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: 'inherit',
            fontSize: 13,
            lineHeight: 1.6,
            color: '#333',
          }}
        >
          {text || ''}
        </pre>
      </Modal>
    )
  }

  return null
}
