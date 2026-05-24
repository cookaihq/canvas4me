import { basenameFromUrl, secondsToMicros, sanitizeDraftName, randomDraftName } from './utils.js'

// 从素材推断文件扩展名(含点,如 `.mp4`);拿不到返回空串。
// 优先级:filename 末段 > URL pathname 末段。
export function getFileExtension(material) {
  const pick = (s) => {
    if (typeof s !== 'string' || !s) return ''
    const m = s.match(/\.[a-z0-9]+$/i)
    return m ? m[0] : ''
  }
  const ext1 = pick(material?.filename)
  if (ext1) return ext1
  if (typeof material?.url === 'string') {
    try {
      return pick(new URL(material.url).pathname)
    } catch {
      return pick(material.url.split('?')[0])
    }
  }
  return ''
}

// 为素材列表生成「不带后缀的默认显示名」,同名按出现顺序加 ` (2)` / ` (3)`...
// 用于素材库 label 默认值和 /drafts spec 的 filename 主体。
export function buildDefaultDisplayNames(materials) {
  const seen = new Map()
  const result = new Map()
  for (const m of materials) {
    const raw = (typeof m.label === 'string' && m.label.trim())
      ? m.label.trim()
      : (m.type || 'material')
    const base = raw.replace(/\.[a-z0-9]+$/i, '')
    const count = seen.get(base) ?? 0
    result.set(m.id, count === 0 ? base : `${base} (${count + 1})`)
    seen.set(base, count + 1)
  }
  return result
}

const REQUIRED_TRACKS = [
  { id: 'track-video-1', type: 'video', uiKind: 'video' },
  { id: 'track-image-1', type: 'video', uiKind: 'image' },
  { id: 'track-audio-1', type: 'audio', uiKind: 'audio' },
  { id: 'track-text-1',  type: 'text',  uiKind: 'text'  },
]

// 兼容老版本 stored timeline:补齐缺失的轨道(尤其是图片轨道),并按 REQUIRED_TRACKS 顺序排列。
export function ensureAllTracks(timeline) {
  const existing = Array.isArray(timeline?.tracks) ? timeline.tracks : []
  const merged = [...existing]
  for (const req of REQUIRED_TRACKS) {
    if (!merged.find(t => (t.uiKind || t.type) === req.uiKind)) {
      merged.push({ ...req, segments: [] })
    }
  }
  const order = new Map(REQUIRED_TRACKS.map((t, i) => [t.uiKind, i]))
  merged.sort((a, b) => (order.get(a.uiKind || a.type) ?? 99) - (order.get(b.uiKind || b.type) ?? 99))
  return { ...timeline, tracks: merged }
}

// 从连入内容节点的 (nodeId + content + name/label) 抽出 material 描述。
// subType: 'video' | 'audio' | 'image' | 'text' | 其他(返回 null 丢弃)。
// label 字段优先级:
//   1. contentNode.data.name(用户在节点上起的名,如 input "image (1).png")
//   2. opts.parentName(若 contentNode 是 output 节点,调用方反查到的所属 capability 的 name,
//      例如折叠态 capability 外壳上的 "3-1"。output 节点本身的 name 通常为空)
//   3. contentNode.data.label(节点类型默认名,如 "数字人视频 输出")
// 调用方负责传 parentName —— 它需要 nodes/edges 上下文,这里不耦合。
export function materialFromContent(nodeId, contentNode, opts = {}) {
  const subType = contentNode?.subType
  const content = contentNode?.content || {}
  const label = contentNode?.name || opts.parentName || contentNode?.label || ''
  if (subType === 'text') {
    return {
      id: `mat-${nodeId}`,
      sourceNodeId: nodeId,
      type: 'text',
      url: null,
      filename: null,
      label,
      naturalDurationSec: null,
      textContent: content.text || '',
    }
  }
  const url = typeof content.url === 'string' ? content.url : null
  if (!url || (subType !== 'video' && subType !== 'audio' && subType !== 'image')) return null
  return {
    id: `mat-${nodeId}`,
    sourceNodeId: nodeId,
    type: subType,
    url,
    filename: content.fileName || basenameFromUrl(url) || `material-${nodeId}`,
    label,
    naturalDurationSec: typeof content.duration === 'number' && content.duration > 0 ? content.duration : null,
    textContent: null,
  }
}

const DEFAULT_IMAGE_TEXT_DURATION_SEC = 3

// 默认 segment 时长(秒):
//   - video / audio:用素材自然时长;缺失返回 null(调用方必须先判,不再 5s 兜底)
//   - image / text:3s 默认
export function defaultSegmentDuration(material) {
  if (material.type === 'video' || material.type === 'audio') {
    return material.naturalDurationSec ?? null
  }
  return DEFAULT_IMAGE_TEXT_DURATION_SEC
}

let _segSeq = 0
function nextSegId() {
  _segSeq += 1
  return `seg-${Date.now()}-${_segSeq}`
}

// 打开模态框时的初始 timeline:
//   - 四种轨道(视频/图片/音频/文字)各创建一条骨架
//   - video/audio:有自然时长才铺,缺失跳过(等探测回填触发重铺)
//   - image/text:按连入顺序铺,各段 3s
//   - 四种类型各自独立 cursor,互不影响
//   - track.type:capcut spec 字段(video/audio/text);track.uiKind:UI 展示类别
//   - 图片轨 type='video' uiKind='image',数据上仍是视频轨,UI 上独立展示
export function buildInitialTimeline({ draftName, allowReplace = false, canvas, materials }) {
  const tracks = [
    { id: 'track-video-1', type: 'video', uiKind: 'video', segments: [] },
    { id: 'track-image-1', type: 'video', uiKind: 'image', segments: [] },
    { id: 'track-audio-1', type: 'audio', uiKind: 'audio', segments: [] },
    { id: 'track-text-1',  type: 'text',  uiKind: 'text',  segments: [] },
  ]
  const trackByKind = { video: tracks[0], image: tracks[1], audio: tracks[2], text: tracks[3] }
  const cursors = { video: 0, image: 0, audio: 0, text: 0 }

  for (const m of materials) {
    const kind = m.type
    const track = trackByKind[kind]
    if (!track) continue
    // video/audio 缺时长 → 不参与自动铺,等探测回填后下一轮 effect 再铺
    if ((kind === 'video' || kind === 'audio') && m.naturalDurationSec == null) continue

    const dur = defaultSegmentDuration(m)
    track.segments.push({
      id: nextSegId(),
      materialId: m.id,
      startSec: cursors[kind],
      durationSec: dur,
      ...(kind === 'video' || kind === 'audio' ? { sourceDurationSec: dur } : {}),
    })
    cursors[kind] += dur
  }
  return { draftName, allowReplace, canvas, tracks }
}

// 把内部 timeline state 转成 capcut_helper 接受的 spec(微秒单位 + 信封字段)。
// materials 是 timeline.tracks[].segments[].materialId 引用的素材列表;若元素带
// `displayName` / `ext` 字段(见 buildDefaultDisplayNames / getFileExtension),
// 则 spec 里的 filename 取 `displayName + ext`,否则退回原 m.filename。
export function toCapcutSpec(timeline, materials) {
  const matById = new Map(materials.map(m => [m.id, m]))
  const resolveFilename = (m) => {
    if (m.displayName) {
      const ext = typeof m.ext === 'string' ? m.ext : getFileExtension(m)
      return `${m.displayName}${ext || ''}`
    }
    return m.filename
  }
  const tracks = []
  for (const track of timeline.tracks || []) {
    const segments = []
    for (const seg of track.segments || []) {
      const m = matById.get(seg.materialId)
      if (!m) continue
      const tlStart = secondsToMicros(seg.startSec)
      const tlDur = secondsToMicros(seg.durationSec)
      if (track.type === 'text') {
        segments.push({
          timeline: { start: tlStart, duration: tlDur },
          text: { content: m.textContent || '', style: {} },
        })
      } else if (m.type === 'video' || m.type === 'audio') {
        // 视频/音频:source.start=0,source.duration 同 timeline.duration(裁尾)
        const srcDur = secondsToMicros(seg.sourceDurationSec ?? seg.durationSec)
        segments.push({
          material: { url: m.url, type: m.type, filename: resolveFilename(m) },
          timeline: { start: tlStart, duration: tlDur },
          source: { start: 0, duration: srcDur },
        })
      } else if (m.type === 'image') {
        segments.push({
          material: { url: m.url, type: 'image', filename: resolveFilename(m) },
          timeline: { start: tlStart, duration: tlDur },
        })
      }
    }
    if (segments.length > 0) {
      tracks.push({ type: track.type, segments })
    }
  }
  const spec = {
    draft_name: sanitizeDraftName(timeline.draftName),
    canvas: {
      width: timeline.canvas.width,
      height: timeline.canvas.height,
      fps: timeline.canvas.fps,
    },
    tracks,
  }
  if (timeline.allowReplace) spec.allow_replace = true
  return spec
}

// 计算模态打开 / materials 变化时的 timeline 状态。
//   - stored?.userEdited === true:已编辑路径,原样返回 stored(补齐轨道骨架)
//   - 否则:未编辑路径,基于 materials 重铺;保留 stored 里的 draftName / canvas /
//     allowReplace / materialFilenames(用户已经改过的非轨道字段不被重置)
//   - stored 无 userEdited 字段(老节点)等同 userEdited=false → 重铺
export function computeInitialTimeline(stored, materials) {
  if (stored?.userEdited === true) {
    return ensureAllTracks(stored)
  }
  const fresh = buildInitialTimeline({
    draftName: randomDraftName(),
    canvas: { width: 1920, height: 1080, fps: 30 },
    materials,
  })
  return ensureAllTracks({
    ...fresh,
    draftName: stored?.draftName ?? fresh.draftName,
    canvas: stored?.canvas ?? fresh.canvas,
    allowReplace: stored?.allowReplace ?? fresh.allowReplace,
    materialFilenames: stored?.materialFilenames ?? {},
    userEdited: false,
  })
}

// 提交前校验。返回错误消息数组(空数组表示合法)。
export function validateTimeline(timeline) {
  const errors = []
  const name = sanitizeDraftName(timeline.draftName)
  if (!name) {
    errors.push('草稿名不能为空')
  } else if (typeof timeline.draftName === 'string' && /[/\\]/.test(timeline.draftName)) {
    errors.push('草稿名不能包含 / 或 \\')
  }
  const c = timeline.canvas || {}
  if (!(c.width > 0) || !(c.height > 0) || !(c.fps > 0)) {
    errors.push('画布尺寸必须 > 0')
  }
  const hasAnySegment = (timeline.tracks || []).some(t => t.segments?.length > 0)
  if (!hasAnySegment) errors.push('至少要把一个素材放到轨道上')
  const hasBadDuration = (timeline.tracks || []).some(t =>
    (t.segments || []).some(s => !(s.durationSec > 0))
  )
  if (hasBadDuration) errors.push('有片段时长不合法')
  return errors
}

// 把单个素材追加到对应类型轨道的末尾。pending/failed 素材由调用方过滤。
// 规则:
//   - video → uiKind='video' 轨道; image → uiKind='image' 轨道; audio/text 同名
//   - startSec = 该轨道现有 segments 中最大的右端;空轨道从 0 开始
//   - video/audio 缺自然时长一律拒收(返回原 timeline);image/text 用 3s 默认
//   - 同一素材允许重复追加(连点多次叠加)
export function appendMaterialToTrack(timeline, material) {
  const dur = defaultSegmentDuration(material)
  if (dur == null) return timeline
  const uiKind = material.type   // video / image / audio / text
  const tracks = (timeline.tracks || []).map(t => {
    if ((t.uiKind || t.type) !== uiKind) return t
    const segs = t.segments || []
    const cursor = segs.reduce((acc, s) => Math.max(acc, (s.startSec || 0) + (s.durationSec || 0)), 0)
    const newSeg = {
      id: nextSegId(),
      materialId: material.id,
      startSec: cursor,
      durationSec: dur,
      ...(uiKind === 'video' || uiKind === 'audio' ? { sourceDurationSec: dur } : {}),
    }
    return { ...t, segments: [...segs, newSeg] }
  })
  return { ...timeline, tracks }
}

// 全部加载到轨道上:清空所有轨道,按 materials 顺序在四种轨道独立 cursor 上重铺。
// 等价于初始 buildInitialTimeline 的轨道部分,但保留当前 timeline 的 draftName / canvas /
// allowReplace / materialFilenames 等非轨道字段。
export function reloadAllToTracks(timeline, materials) {
  const fresh = buildInitialTimeline({
    draftName: timeline.draftName,
    allowReplace: timeline.allowReplace,
    canvas: timeline.canvas,
    materials,
  })
  return {
    ...timeline,
    tracks: fresh.tracks,
  }
}

// 探测调度纯函数:给定 materials 和当前 probeState,返回这一轮需要启动探测的 materialId 数组。
// 规则:
//   - 仅对 video/audio 探测
//   - 已有 naturalDurationSec(非空)的跳过
//   - 已在 probeState 里的(pending/failed/done)跳过(failed 等用户主动点重试再清出)
export function planProbes(materials, probeState) {
  const result = []
  for (const m of materials) {
    if (m.type !== 'video' && m.type !== 'audio') continue
    if (m.naturalDurationSec != null) continue
    if (probeState.has(m.id)) continue
    result.push(m.id)
  }
  return result
}
