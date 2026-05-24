/**
 * URL 自愈 — 失效 URL 从浏览器缓存重新上传拿新 URL
 *
 * 触发场景: 提交能力请求前 HEAD 探测发现 URL 已失效(404 / 403 / CORS),
 * 但浏览器 Cache API 里还有 blob → 用 blob 重新调上传接口拿新 URL,
 * 替换 body + 同步节点 data,提交继续走。
 *
 * 输入:
 *  - url       失效的原 URL
 *  - uploader  platform 注入的 Uploader 实例(实现 uploadFile(file, opts))
 * 输出:
 *  - 新 URL(string)
 * 错误:
 *  - 缓存未命中 → throw CacheMissError(用户感知:必须重传)
 *  - 上传失败  → throw 上传层抛的原始 Error(用户能看到 HTTP 状态码 / 错误正文)
 *
 * 与 cache 的关系:
 *  本函数不 cacheDelete 旧 URL —— 旧 URL 的 cache entry 留着(老画布刷新打开时
 *  Renderer 走 cacheMatch 命中能立即显示)。新 URL 的 cache 由后续 useMediaSource
 *  正常加载时写入。
 */

import { cacheMatch } from './mediaCache/cache'
import { entries } from './mediaCache/db'
import { inferFileNameFromUrl } from './fileInfo'

export class CacheMissError extends Error {
  constructor(url) {
    super(`URL 已失效且浏览器缓存中也没有备份: ${url}`)
    this.name = 'CacheMissError'
    this.url = url
  }
}

/**
 * 单个 URL 自愈
 * @param {string} url
 * @param {{ uploadFile: (file: File, opts?: object) => Promise<{ url: string }> }} uploader
 * @returns {Promise<string>} 新 URL
 */
export async function selfHealUrl(url, uploader) {
  if (!url) throw new CacheMissError(url)

  const cached = await cacheMatch(url).catch(() => null)
  if (!cached) throw new CacheMissError(url)

  const blob = await cached.blob().catch(() => null)
  if (!blob || blob.size === 0) throw new CacheMissError(url)

  // 从 entries 表读 fileName/mimeType,缺失走兜底
  let entry = null
  try { entry = await entries.get(url) } catch { /* ignore */ }

  const fileName = entry?.fileName || inferFileNameFromUrl(url)
  const mimeType = entry?.mimeType || blob.type || 'application/octet-stream'

  const file = new File([blob], fileName, { type: mimeType })
  const result = await uploader.uploadFile(file)
  if (!result?.url) {
    throw new Error('上传成功但未返回 url')
  }
  return result.url
}

/**
 * 批量自愈 —— 对多个失效 URL 并行调 selfHealUrl,返回 Map<oldUrl, newUrl> 与失败列表
 *
 * @param {string[]} urls
 * @param {object} uploader
 * @param {{ concurrency?: number }} opts
 * @returns {Promise<{ success: Map<string, string>, failures: Array<{ url: string, error: Error }> }>}
 */
export async function selfHealUrlsBatch(urls, uploader, opts = {}) {
  const { concurrency = 2 } = opts
  const success = new Map()
  const failures = []
  if (!Array.isArray(urls) || urls.length === 0) {
    return { success, failures }
  }

  let cursor = 0
  async function worker() {
    while (true) {
      const idx = cursor++
      if (idx >= urls.length) return
      const url = urls[idx]
      try {
        const newUrl = await selfHealUrl(url, uploader)
        success.set(url, newUrl)
      } catch (err) {
        failures.push({ url, error: err })
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, urls.length) }, () => worker()),
  )
  return { success, failures }
}
