// src/capabilities/tool/capcut-draft/components/TrackClip.jsx
// 轨道上的片段块。支持:拖动位置、拖右边缘改时长、视频首帧预览。
// 布局:顶部一条文件名(不盖缩略图) + 中段缩略图 + 右下角悬浮 timecode + 右上角 × 删除按钮。
import { useRef } from 'react'
import MaterialCover from './MaterialCover'
import { formatTimecode } from '../utils'

const PX_PER_SEC = 14

export default function TrackClip({ segment, material, onUpdate, onDragEnd, onRemove, naturalDurationCap, fps }) {
  const dragStateRef = useRef(null)
  // 保存本次拖动注册的 handler 引用,确保 removeEventListener 能精确移除同一函数
  const handlersRef = useRef({})

  const onMouseDown = (e) => {
    if (e.target.classList.contains('capcut-clip-resize')) {
      // 拖右边缘 → 改时长
      dragStateRef.current = { kind: 'resize', startX: e.clientX, baseDur: segment.durationSec }
    } else {
      // 拖整体 → 改位置
      dragStateRef.current = { kind: 'move', startX: e.clientX, baseStart: segment.startSec }
    }
    e.preventDefault()

    const handleMove = (ev) => {
      const s = dragStateRef.current
      if (!s) return
      const deltaSec = (ev.clientX - s.startX) / PX_PER_SEC
      if (s.kind === 'resize') {
        let nextDur = Math.max(0.1, s.baseDur + deltaSec)
        if (naturalDurationCap != null) nextDur = Math.min(nextDur, naturalDurationCap)
        onUpdate({ ...segment, durationSec: nextDur, sourceDurationSec: nextDur })
      } else {
        const nextStart = Math.max(0, s.baseStart + deltaSec)
        onUpdate({ ...segment, startSec: nextStart })
      }
    }

    const handleUp = () => {
      dragStateRef.current = null
      document.removeEventListener('mousemove', handlersRef.current.handleMove)
      document.removeEventListener('mouseup', handlersRef.current.handleUp)
      onDragEnd?.()
    }

    handlersRef.current = { handleMove, handleUp }
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }

  if (!material) return null
  const cls = `capcut-clip capcut-clip--${material.type === 'image' ? 'video' : material.type}`
  const displayLabel = material.displayName || material.label || material.filename
  const timecode = formatTimecode(segment.durationSec, fps)
  return (
    <div
      className={cls}
      style={{
        left: segment.startSec * PX_PER_SEC,
        width: segment.durationSec * PX_PER_SEC,
      }}
      onMouseDown={onMouseDown}
      title="拖动调整位置 / 拖右边缘改时长"
    >
      <div className="capcut-clip-name" title={displayLabel}>{displayLabel}</div>
      <div className="capcut-clip-body">
        {(material.type === 'video' || material.type === 'image') && (
          <div className="capcut-clip-thumb"><MaterialCover material={material} /></div>
        )}
        <span className="capcut-clip-time">{timecode}</span>
      </div>
      <button
        type="button"
        className="capcut-clip-remove"
        title="移除片段"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onRemove?.(segment.id) }}
      >×</button>
      <span className="capcut-clip-resize" />
    </div>
  )
}
