import { formatBytes } from './fileInfo'

/** 秒 → m:ss(无效返回 null) */
export function formatMediaDuration(sec) {
  const n = typeof sec === 'number' ? sec : Number(sec)
  if (!Number.isFinite(n) || n <= 0) return null
  const total = Math.round(n)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * 媒体元信息行(节点角标 / 媒体卡通用,保证两处一致):
 *   图 / 视频 → `宽×高 · 大小`
 *   音频     → `时长 · 大小`
 *   文件     → `大小`
 * 无可用信息返回 null。
 */
export function formatMediaMeta(subType, { width, height, fileSize, duration } = {}) {
  const parts = []
  if (subType === 'image') {
    if (width && height) parts.push(`${width}×${height}`)
    if (typeof fileSize === 'number' && fileSize > 0) parts.push(formatBytes(fileSize))
  } else if (subType === 'video') {
    if (width && height) parts.push(`${width}×${height}`)
    const d = formatMediaDuration(duration)
    if (d) parts.push(d)
    if (typeof fileSize === 'number' && fileSize > 0) parts.push(formatBytes(fileSize))
  } else if (subType === 'audio') {
    const d = formatMediaDuration(duration)
    if (d) parts.push(d)
    if (typeof fileSize === 'number' && fileSize > 0) parts.push(formatBytes(fileSize))
  } else if (subType === 'file') {
    if (typeof fileSize === 'number' && fileSize > 0) parts.push(formatBytes(fileSize))
  }
  return parts.length > 0 ? parts.join(' · ') : null
}
