// src/capabilities/tool/capcut-draft/utils.js
// 剪映草稿工具的小工具:单位换算 / 文件名 / 草稿名 sanitize.

export function secondsToMicros(seconds) {
  return Math.round(Number(seconds) * 1_000_000)
}

export function microsToSeconds(micros) {
  return Number(micros) / 1_000_000
}

// 草稿名 sanitize:去掉 / 和 \,两端 trim。capcut_helper §6 校验规则。
export function sanitizeDraftName(name) {
  if (typeof name !== 'string') return ''
  return name.replace(/[/\\]/g, '').trim()
}

// 从 URL 末段取 basename,丢掉 query;失败返回 null。
export function basenameFromUrl(url) {
  if (typeof url !== 'string' || !url) return null
  try {
    const pathname = new URL(url).pathname
    const segs = pathname.split('/').filter(Boolean)
    return segs.length > 0 ? decodeURIComponent(segs[segs.length - 1]) : null
  } catch {
    // URL 解析失败,退化按 / 切分
    const beforeQuery = url.split('?')[0]
    const segs = beforeQuery.split('/').filter(Boolean)
    return segs.length > 0 ? segs[segs.length - 1] : null
  }
}

// 草稿名默认值:`{画布名}_{MMDD}`。画布名缺失/全非法 → `ai-canvas-草稿_{MMDD}`。
export function defaultDraftName(canvasName, date = new Date()) {
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const base = sanitizeDraftName(canvasName) || 'ai-canvas-草稿'
  return `${base}_${mm}${dd}`
}

// 格式化时长:`HH:MM:SS:FF`(剪映同款 timecode,FF = 帧号)。
// seconds 非法或为负 → 当 0 处理;fps 非法 → 用 30 兜底。
export function formatTimecode(seconds, fps = 30) {
  const total = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
  const safeFps = Number.isFinite(fps) && fps > 0 ? Math.round(fps) : 30
  const wholeSec = Math.floor(total)
  const frame = Math.min(safeFps - 1, Math.floor((total - wholeSec) * safeFps))
  const hh = String(Math.floor(wholeSec / 3600)).padStart(2, '0')
  const mm = String(Math.floor((wholeSec % 3600) / 60)).padStart(2, '0')
  const ss = String(wholeSec % 60).padStart(2, '0')
  const ff = String(frame).padStart(2, '0')
  return `${hh}:${mm}:${ss}:${ff}`
}

// 随机草稿名:`{MMDD}_{4位小写字母}`。
export function randomDraftName(date = new Date()) {
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const letters = 'abcdefghijklmnopqrstuvwxyz'
  let suffix = ''
  for (let i = 0; i < 4; i++) {
    suffix += letters[Math.floor(Math.random() * letters.length)]
  }
  return `${mm}${dd}_${suffix}`
}
