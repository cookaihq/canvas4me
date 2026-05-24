/**
 * 后台预下载 — 打开画布时把所有引用 URL 拉进 Cache API
 *
 * 时机:画布加载完成后立即调用一次,与 React 渲染并行;不阻塞任何 UI。
 * 价值:
 *  - 让用户立刻打开画布就能看到所有图(不需要逐个 Renderer 触发 fetch)
 *  - **关键**:为 URL 自愈机制提供"原料"。提交时 URL 已失效,但缓存里还有 blob,
 *    自愈层可以从 cache 取出来重新上传拿新 url。预下载是自愈的前置保障。
 *
 * 策略:
 *  - cacheMatch 命中 → 跳过(不重复拉)
 *  - 黑名单 URL → 跳过(避免反复触发 CORS 失败)
 *  - 配额已达 80% → 跳过写入(让 LRU 先淘汰旧的)
 *  - fetch 失败 → 拉黑该 URL
 *  - 限并发 3 个,priority='low' 让浏览器排在前台请求之后
 *
 * 与 useMediaSource 关系:两者写缓存的格式严格一致(bytes/type/fileName/mimeType),
 * 任一路径写的缓存,自愈层都能正常解读。
 */

import { cacheMatch, cachePut } from './cache'
import { recordUrlCached } from './canvasIndex'
import { isBlacklisted, blacklistUrl } from './corsGate'
import { isCacheableUrl } from './extractUrls'
import { shouldAllowWrite, postWriteQuotaCheck } from './quota'
import { inferFileNameFromUrl } from '../fileInfo'
import { getProxyUrl } from '@/utils/proxyUrl'

/**
 * @param {string} canvasId
 * @param {string[]} urls
 * @param {{ concurrency?: number }} opts
 * @returns {Promise<{ hit: number, fetched: number, failed: number, skipped: number }>}
 */
export async function prefetchCanvasMedia(canvasId, urls, opts = {}) {
  const { concurrency = 3 } = opts
  const filtered = [...new Set((urls || []).filter(u => isCacheableUrl(u) && !isBlacklisted(u)))]
  if (filtered.length === 0) {
    return { hit: 0, fetched: 0, failed: 0, skipped: 0 }
  }

  const stats = { hit: 0, fetched: 0, failed: 0, skipped: 0 }
  let cursor = 0

  async function worker() {
    while (true) {
      const idx = cursor++
      if (idx >= filtered.length) return
      const url = filtered[idx]
      try {
        const existing = await cacheMatch(url).catch(() => null)
        if (existing) {
          stats.hit++
          continue
        }
        if (!(await shouldAllowWrite())) {
          stats.skipped++
          continue
        }
        // dev 环境把 OSS URL 改写到 /oss-proxy 同源路径绕开 CORS；cache key 仍用原 url
        const resp = await fetch(getProxyUrl(url), { mode: 'cors', priority: 'low' })
        // SW 介入时 type 可能是 'basic',只要不是 opaque + ok 就接受
        if (resp.type === 'opaque' || !resp.ok) {
          blacklistUrl(url)
          stats.failed++
          continue
        }
        const cacheCopy = resp.clone()
        const blob = await resp.blob()
        if (!blob || blob.size === 0) {
          stats.failed++
          continue
        }
        await cachePut(url, cacheCopy)
        await recordUrlCached(canvasId, url, {
          bytes: blob.size,
          type: inferTypeFromMime(blob.type),
          fileName: inferFileNameFromUrl(url),
          mimeType: blob.type || resp.headers.get('Content-Type') || null,
          backgroundFetched: true,
        })
        stats.fetched++
      } catch {
        blacklistUrl(url)
        stats.failed++
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, filtered.length) }, () => worker()),
  )

  if (stats.fetched > 0) {
    postWriteQuotaCheck().catch(() => {})
    console.log(
      `[BackgroundPrefetch] canvas=${canvasId} 预下载完成: hit=${stats.hit} fetched=${stats.fetched} failed=${stats.failed} skipped=${stats.skipped}`,
    )
  }
  return stats
}

function inferTypeFromMime(mime) {
  if (!mime) return 'unknown'
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'unknown'
}
