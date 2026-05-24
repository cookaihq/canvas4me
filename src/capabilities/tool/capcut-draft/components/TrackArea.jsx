// src/capabilities/tool/capcut-draft/components/TrackArea.jsx
// 右侧多轨道时间线区。每条轨道一行,支持拖入素材生成片段。
// 刻度尺最大秒数动态计算:max(40, ceil((最右端片段秒数 + 10) / 5) * 5)。
// 仅在 drop / 删除 / 拖动结束 三种"操作完成"时机重算,拖动过程中保持稳定。
import { useEffect, useMemo, useRef, useState } from 'react'
import TrackClip from './TrackClip'
import { defaultSegmentDuration } from '../timelineSpec'

const PX_PER_SEC = 14
const TICK_STEP = 5
const PADDING_SEC = 10
const MIN_MAX_SEC = 40

function calcMaxSec(timeline) {
  let maxRight = 0
  for (const t of timeline.tracks || []) {
    for (const seg of t.segments || []) {
      const right = (seg.startSec || 0) + (seg.durationSec || 0)
      if (right > maxRight) maxRight = right
    }
  }
  return Math.max(MIN_MAX_SEC, Math.ceil((maxRight + PADDING_SEC) / TICK_STEP) * TICK_STEP)
}

let _segCounter = 0
function nextSegId() {
  _segCounter += 1
  return `seg-${Date.now()}-${_segCounter}`
}

export default function TrackArea({ timeline, materials, onTimelineChange }) {
  const matById = new Map(materials.map(m => [m.id, m]))
  const [maxSec, setMaxSec] = useState(() => calcMaxSec(timeline))
  const ticks = []
  for (let s = 0; s <= maxSec; s += TICK_STEP) ticks.push(s)

  // 拖动 mouseup 的 onDragEnd 闭包定格在 mousedown 时,通过 ref 拿到最新 timeline。
  const timelineRef = useRef(timeline)
  timelineRef.current = timeline

  // 仅在 segment id 集合变化(新增/删除/外部重铺)时同步 maxSec;
  // 拖动期间只改 startSec/durationSec, 签名不变, maxSec 保持稳定。
  const segIdSignature = useMemo(
    () => (timeline.tracks || []).flatMap(t => (t.segments || []).map(s => `${t.id}/${s.id}`)).join('|'),
    [timeline]
  )
  useEffect(() => {
    setMaxSec(calcMaxSec(timeline))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segIdSignature])

  const updateSegment = (trackId, updated) => {
    onTimelineChange({
      ...timeline,
      tracks: timeline.tracks.map(t =>
        t.id === trackId
          ? { ...t, segments: t.segments.map(s => s.id === updated.id ? updated : s) }
          : t
      ),
    })
  }

  const removeSegment = (trackId, segId) => {
    const next = {
      ...timeline,
      tracks: timeline.tracks.map(t =>
        t.id === trackId ? { ...t, segments: t.segments.filter(s => s.id !== segId) } : t
      ),
    }
    onTimelineChange(next)
    setMaxSec(calcMaxSec(next))
  }

  const handleDrop = (uiKind, trackId, e) => {
    e.preventDefault()
    const materialId = e.dataTransfer.getData('application/x-capcut-material')
    if (!materialId) return
    const m = matById.get(materialId)
    if (!m) return
    // 类型匹配规则:按 uiKind 严格匹配素材类型
    if (uiKind === 'video' && m.type !== 'video') return
    if (uiKind === 'image' && m.type !== 'image') return
    if (uiKind === 'audio' && m.type !== 'audio') return
    if (uiKind === 'text' && m.type !== 'text') return
    // 落点 x 换算 startSec
    const rect = e.currentTarget.getBoundingClientRect()
    const startSec = Math.max(0, (e.clientX - rect.left) / PX_PER_SEC)
    const dur = defaultSegmentDuration(m)
    if (dur == null) return   // 缺时长 video/audio 拒收(防御);正常路径会被 MaterialLibrary draggable=false 阻止
    const newSeg = {
      id: nextSegId(),
      materialId: m.id,
      startSec,
      durationSec: dur,
      sourceDurationSec: (m.type === 'video' || m.type === 'audio') ? dur : undefined,
    }
    const next = {
      ...timeline,
      tracks: timeline.tracks.map(t =>
        t.id === trackId ? { ...t, segments: [...t.segments, newSeg] } : t
      ),
    }
    onTimelineChange(next)
    setMaxSec(calcMaxSec(next))
  }

  const handleDragEnd = () => {
    setMaxSec(calcMaxSec(timelineRef.current))
  }

  return (
    <div className="capcut-tracks">
      <div className="capcut-ruler">
        {ticks.map(s => (
          <span key={s} style={{ width: TICK_STEP * PX_PER_SEC }}>{s}s</span>
        ))}
      </div>
      {timeline.tracks.map(track => {
        const uiKind = track.uiKind || track.type
        const trackLabel = { video: '视频', image: '图片', audio: '音频', text: '文字' }[uiKind] || uiKind
        const laneCls = `capcut-track-lane${(uiKind === 'video' || uiKind === 'image') ? ` capcut-track-lane--${uiKind}` : ''}`
        return (
          <div key={track.id} className="capcut-track-row">
            <span className="capcut-track-label">{trackLabel}</span>
            <div
              className={laneCls}
              style={{ flex: `0 0 ${(maxSec + TICK_STEP) * PX_PER_SEC}px` }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
              onDrop={(e) => handleDrop(uiKind, track.id, e)}
            >
              {track.segments.map(seg => (
                <TrackClip
                  key={seg.id}
                  segment={seg}
                  material={matById.get(seg.materialId)}
                  fps={timeline?.canvas?.fps}
                  onUpdate={(updated) => updateSegment(track.id, updated)}
                  onDragEnd={handleDragEnd}
                  onRemove={() => removeSegment(track.id, seg.id)}
                  naturalDurationCap={
                    (() => {
                      const m = matById.get(seg.materialId)
                      return (m?.type === 'video' || m?.type === 'audio') && m.naturalDurationSec
                        ? m.naturalDurationSec
                        : null
                    })()
                  }
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
