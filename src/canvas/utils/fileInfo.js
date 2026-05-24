/**
 * 文件信息工具：URL 后缀推断格式、HEAD 请求拿文件大小、字节格式化
 * 供 ImageRenderer / VideoRenderer / AudioRenderer / FileRenderer 共用
 */

const MIME_EXT_MAP = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/ogg': 'ogg',
  'application/pdf': 'pdf',
}

// 节点卡片支持的预览扩展名（image / video / audio / pdf）
// FileRenderer 据此选择预览 UI；上传/拖入流程据此判断是否拉高节点
export const PREVIEWABLE_EXT_MAP = {
  jpg: 'image', jpeg: 'image', png: 'image', webp: 'image', gif: 'image', svg: 'image',
  mp4: 'video', webm: 'video', mov: 'video',
  mp3: 'audio', wav: 'audio', m4a: 'audio', ogg: 'audio',
  pdf: 'pdf',
}

export function getExtFromName(name) {
  if (!name) return ''
  const m = name.match(/\.([a-zA-Z0-9]+)$/)
  return m?.[1]?.toLowerCase() || ''
}

export function isPreviewableFile({ url, fileName, mimeType } = {}) {
  const ext = getExtFromUrl(url) || getExtFromName(fileName) || (mimeType ? MIME_EXT_MAP[mimeType.toLowerCase()] : '')
  return !!(ext && PREVIEWABLE_EXT_MAP[ext])
}

/**
 * 从 URL 提取文件后缀（小写，不含点）
 * 支持 data:image/png;base64,... → png
 */
export function getExtFromUrl(url) {
  if (!url) return ''
  if (url.startsWith('data:')) {
    const m = url.match(/^data:([^;,]+)/)
    const mime = m?.[1]?.toLowerCase()
    return MIME_EXT_MAP[mime] || ''
  }
  const m = url.match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/)
  return m?.[1]?.toLowerCase() || ''
}

/**
 * 从 URL 推断文件名(URL 路径最后一段)
 * - 失败或路径为空时返回 `file.{ext}` 作兜底,扩展名走 getExtFromUrl 推断
 * - data:/blob: 也支持(走兜底分支)
 *
 * 用途:URL 自愈时把 cache blob 重新上传需要 multipart 文件名,
 * 缓存里没存原文件名时(老数据 / 任务产物 URL)用本函数兜底。
 */
export function inferFileNameFromUrl(url) {
  const ext = getExtFromUrl(url) || 'bin'
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) {
    return `file.${ext}`
  }
  try {
    const u = new URL(url)
    const segs = u.pathname.split('/').filter(Boolean)
    const last = segs[segs.length - 1]
    if (last) return decodeURIComponent(last)
  } catch (_e) {
    /* fall through */
  }
  return `file.${ext}`
}

/**
 * 格式化字节为人类可读
 * 1024 → "1.0K", 2411724 → "2.3M", 123 → "123B"
 */
export function formatBytes(bytes) {
  if (bytes == null || isNaN(bytes)) return ''
  const n = Number(bytes)
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}K`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)}M`
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)}G`
}

const sizeCache = new Map()

/**
 * 异步获取 URL 文件大小（字节数）
 * - data:/blob: 协议直接本地计算
 * - http(s) 发 HEAD 请求读 Content-Length，带超时保护；仅对超时重试一次
 * - 跨域 / 真实错误 / 重试耗尽返回 null（不影响媒体本身渲染，仅 overlay 缺大小字段）
 * 结果缓存到内存避免重复请求
 */
export async function fetchFileSize(url, { timeout = 8000, retries = 1 } = {}) {
  if (!url) return null
  if (sizeCache.has(url)) return sizeCache.get(url)

  let size = null

  if (url.startsWith('data:')) {
    const comma = url.indexOf(',')
    const meta = url.slice(5, comma)
    const payload = url.slice(comma + 1)
    size = meta.includes('base64')
      ? Math.floor(payload.length * 0.75)
      : decodeURIComponent(payload).length
    sizeCache.set(url, size)
    return size
  }

  if (url.startsWith('blob:')) {
    try {
      const resp = await fetch(url)
      const blob = await resp.blob()
      size = blob.size
    } catch (_e) { size = null }
    sizeCache.set(url, size)
    return size
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    try {
      const resp = await fetch(url, { method: 'HEAD', signal: controller.signal })
      clearTimeout(timer)
      const len = resp.headers.get('content-length')
      if (len) size = Number(len)
      break
    } catch (err) {
      clearTimeout(timer)
      // 只对超时（AbortError）重试
      if (err?.name !== 'AbortError' || attempt === retries) break
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt))
    }
  }

  sizeCache.set(url, size)
  return size
}
