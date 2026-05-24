/**
 * Seedance R2V chip prompt 序列化工具 — 见 docs/capabilities/video/seedance-2.md §2.7.1
 *
 * segments 结构:
 *   [{ type: 'text', text }
 *  | { type: 'asset', anchor: 'image-1' | 'video-2' | 'audio-3' }
 *  | { type: 'edge', sourceNodeId }]   ← 文本端口连入 chip, 跟 LLM/GPT-Image-2 一致
 *
 * anchor 命名: <type>-<index>, index 从 1 开始, 对应素材列表的序号.
 * edge segment 序列化为 {{ai-canvas:edge:<sid>}} placeholder 字面, builder 调
 * expandPromptPlaceholders helper 展开为源节点 text.
 */

const ASSET_TYPES = new Set(['image', 'video', 'audio'])

// 中英文 + 大小写 都识别: @Image1 @image1 @图像1 @Video2 @视频2 @Audio3 @音频3
const REFERENCE_TOKEN_PATTERN = /@(?:Image|Video|Audio|图像|视频|音频)\d+/gi
// 文本端口 edge placeholder
const EDGE_PLACEHOLDER_PATTERN = /\{\{ai-canvas:edge:([^}]+)\}\}/g

const toInt = (value) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function compactTextSegments(segments = []) {
  const result = []
  segments.forEach((segment) => {
    if (!segment) return
    if (segment.type === 'asset') {
      if (!segment.anchor) return
      result.push({ type: 'asset', anchor: segment.anchor })
      return
    }
    if (segment.type === 'edge') {
      if (!segment.sourceNodeId) return
      result.push({ type: 'edge', sourceNodeId: segment.sourceNodeId })
      return
    }
    const text = String(segment.text || '')
    if (!text) return
    const prev = result[result.length - 1]
    if (prev?.type === 'text') {
      prev.text += text
    } else {
      result.push({ type: 'text', text })
    }
  })
  return result
}

// anchor → 上游序列化字符串 (英文): image-1 → @Image1
export function anchorToSeedancePromptReference(anchor = '') {
  const [type, rawIndex] = String(anchor).split('-')
  const index = toInt(rawIndex)
  if (!index || !ASSET_TYPES.has(type)) return anchor
  if (type === 'image') return `@Image${index}`
  if (type === 'video') return `@Video${index}`
  return `@Audio${index}`
}

// anchor → DOM chip 显示文本 (中文, 仅 UI): image-1 → @图像1
export function anchorToSeedancePromptDisplayText(anchor = '') {
  const [type, rawIndex] = String(anchor).split('-')
  const index = toInt(rawIndex)
  if (!index || !ASSET_TYPES.has(type)) return anchor
  if (type === 'image') return `@图像${index}`
  if (type === 'video') return `@视频${index}`
  return `@音频${index}`
}

// 反向: @Image1 / @图像1 / @Video2 ... → image-1 / video-2 ... (识别失败返回 null)
export function promptReferenceToSeedanceAnchor(token = '') {
  const normalized = String(token || '').trim()
  const matched = normalized.match(/^@?(Image|Video|Audio|图像|视频|音频)(\d+)$/i)
  if (!matched) return null
  const [, type, rawIndex] = matched
  const lower = type.toLowerCase()
  const nextType = (lower === 'image' || type === '图像') ? 'image'
    : (lower === 'video' || type === '视频') ? 'video'
    : 'audio'
  return `${nextType}-${rawIndex}`
}

export function buildSeedancePromptText(segments = []) {
  return compactTextSegments(segments)
    .map((segment) => {
      if (segment.type === 'asset') return anchorToSeedancePromptReference(segment.anchor)
      if (segment.type === 'edge') return `{{ai-canvas:edge:${segment.sourceNodeId}}}`
      return segment.text
    })
    .join('')
    .replace(/ /g, ' ')
}

// 解析: 字符串 / segments 数组 → segments 数组
// text 段里的 @图像N / @Image1 / {{ai-canvas:edge:N}} 都会自动转成对应 chip segment
export function parseSeedancePromptSegments(value) {
  if (Array.isArray(value)) {
    const normalized = value
      .map((segment) => {
        if (!segment) return null
        if (segment.type === 'asset') {
          const anchor = String(segment.anchor || '').trim()
          if (!anchor) return null
          return { type: 'asset', anchor }
        }
        if (segment.type === 'edge') {
          const sid = String(segment.sourceNodeId || '').trim()
          if (!sid) return null
          return { type: 'edge', sourceNodeId: sid }
        }
        return { type: 'text', text: String(segment.text || '') }
      })
      .filter(Boolean)

    const refCheck = /@(?:Image|Video|Audio|图像|视频|音频)\d+/i
    const edgeCheck = /\{\{ai-canvas:edge:/
    const needsReParse = normalized.some((s) => s.type === 'text' && (refCheck.test(s.text) || edgeCheck.test(s.text)))
    if (!needsReParse) return compactTextSegments(normalized)

    const fullText = normalized
      .map((s) => {
        if (s.type === 'asset') return anchorToSeedancePromptReference(s.anchor)
        if (s.type === 'edge') return `{{ai-canvas:edge:${s.sourceNodeId}}}`
        return s.text
      })
      .join('')
    return parseSeedancePromptSegments(fullText)
  }

  const prompt = String(value || '')
  if (!prompt) return []

  // 同时匹配 @图像N / @Image1 (asset) 和 {{ai-canvas:edge:N}} (edge), 按 offset 排序合并
  const matches = []
  prompt.replace(REFERENCE_TOKEN_PATTERN, (token, offset) => {
    matches.push({ kind: 'asset', token, offset, length: token.length })
    return token
  })
  prompt.replace(EDGE_PLACEHOLDER_PATTERN, (match, sid, offset) => {
    matches.push({ kind: 'edge', sid, offset, length: match.length })
    return match
  })
  matches.sort((a, b) => a.offset - b.offset)

  const segments = []
  let cursor = 0
  for (const m of matches) {
    if (m.offset > cursor) {
      segments.push({ type: 'text', text: prompt.slice(cursor, m.offset) })
    }
    if (m.kind === 'asset') {
      const anchor = promptReferenceToSeedanceAnchor(m.token)
      if (anchor) segments.push({ type: 'asset', anchor })
      else segments.push({ type: 'text', text: m.token })
    } else {
      segments.push({ type: 'edge', sourceNodeId: m.sid })
    }
    cursor = m.offset + m.length
  }
  if (cursor < prompt.length) {
    segments.push({ type: 'text', text: prompt.slice(cursor) })
  }
  return compactTextSegments(segments)
}

// 收集 segments 中 unique 的 anchor 列表 (按出现顺序)
export function collectSeedanceReferencedAnchors(segments = []) {
  const anchors = []
  const seen = new Set()
  compactTextSegments(segments).forEach((segment) => {
    if (segment.type !== 'asset' || !segment.anchor) return
    if (seen.has(segment.anchor)) return
    seen.add(segment.anchor)
    anchors.push(segment.anchor)
  })
  return anchors
}

// 给定一个 anchor 集合 ({ image: Set, video: Set, audio: Set }), 找出 segments 里
// 引用了但实际不存在的 anchor (悬空引用, UI 标 ⚠)
export function findOrphanAnchors(segments, available) {
  const orphans = []
  collectSeedanceReferencedAnchors(segments).forEach((anchor) => {
    const [type] = String(anchor).split('-')
    const set = available?.[type]
    if (!set || !set.has(anchor)) orphans.push(anchor)
  })
  return orphans
}
