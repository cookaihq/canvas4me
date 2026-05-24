// src/capabilities/tool/capcut-draft/utils/collectMaterials.js
// 把连入 capcut-draft 节点 materials 端口的所有上游素材, 收集 + 按类型分组 + 算总时长.
// 节点本体缩略图网格 (view.jsx) 和 DockedPanel 摘要 chip 共用这份数据.
//
// 字段契约 (与 timelineSpec.js 一致):
//   - 视频/音频/图片/文件 source 节点的 data.content.url + content.duration(秒) + content.fileName
//   - 文字 source 节点的 data.content.text

import { expandPortInputs } from '@/canvas/runtime/expandPortInputs'

const MATERIAL_PORT_ID = 'materials'

/**
 * 收集剪映草稿节点的素材摘要.
 *
 * @param {object} args
 * @param {string} args.nodeId    capcut-draft 节点 id
 * @param {Array}  args.edges     React Flow edges
 * @param {Array}  args.nodes     React Flow nodes
 * @returns {{
 *   items: Array<{ url: string|null, type: string, name: string, durationSec: number|null, textLength: number|null, uploading: boolean, sourceNodeId: string|null }>,
 *   counts: { video: number, image: number, audio: number, text: number, total: number },
 *   totalDurationSec: number|null,
 * }}
 */
export function collectMaterials({ nodeId, edges, nodes }) {
  const raw = expandPortInputs({
    targetNodeId: nodeId,
    targetHandle: MATERIAL_PORT_ID,
    edges,
    nodes,
  })

  const items = raw.map(item => {
    const sourceNode = nodes.find(n => n.id === item.sourceNodeId)
    const content = sourceNode?.data?.content || {}
    const type = normalizeType(item.type)
    return {
      url: item.url,
      type,
      name: item.name || content.fileName || '',
      durationSec: typeof content.duration === 'number' && content.duration > 0 ? content.duration : null,
      textLength: type === 'text' && typeof content.text === 'string' ? content.text.length : null,
      uploading: !!item.uploading,
      sourceNodeId: item.sourceNodeId,
    }
  })

  const counts = { video: 0, image: 0, audio: 0, text: 0, total: items.length }
  let totalDurationSec = 0
  let hasAnyDuration = false
  for (const it of items) {
    if (counts[it.type] !== undefined) counts[it.type] += 1
    if (it.durationSec != null) {
      totalDurationSec += it.durationSec
      hasAnyDuration = true
    }
  }

  return {
    items,
    counts,
    totalDurationSec: hasAnyDuration ? totalDurationSec : null,
  }
}

// 把 expandPortInputs 返回的原始 type (input.subType) 收敛到 4 类.
// 未知类型当 'unknown' (不计入 counts, 仍在 items 中, 渲染层降级为占位 icon).
function normalizeType(rawType) {
  if (rawType === 'video' || rawType === 'image' || rawType === 'audio' || rawType === 'text') {
    return rawType
  }
  return 'unknown'
}

/**
 * 把秒数格式化为 "M:SS" 或 "H:MM:SS" (用于 footer 总时长展示).
 * 非法或 0 → null (调用方决定是否显示).
 */
export function formatShortDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  if (h > 0) {
    const mm = String(m).padStart(2, '0')
    return `${h}:${mm}:${ss}`
  }
  return `${m}:${ss}`
}
