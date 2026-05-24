/**
 * ensureVideoCached - 把视频下载并写入 Cache API（幂等 + 并发去重）
 *
 * 卡片(useMediaSource lazy 模式)和面板(useMediaSource eager 模式)共用此函数：
 *  - 模块级 inflight Map 按 url 去重：同一 url 并发调用复用同一 Promise
 *  - 下载一旦开始会跑完（不接收 AbortSignal）；调用方用自己的 alive 标记决定是否采纳结果
 *  - priority 决定 fetch 请求优先级：'low' 卡片后台，'high' 面板前台
 *
 * 返回：
 *  - true  缓存已具备（原本命中 / 本次写入成功）
 *  - false 跳过/失败（>500MB / CORS 黑名单 / HEAD+GET 均失败 / 配额已满）
 */

import { cacheMatch, cachePut } from './cache'
import { recordUrlCached } from './canvasIndex'
import { isBlacklisted, blacklistUrl } from './corsGate'
import { shouldAllowWrite, postWriteQuotaCheck } from './quota'
import { inferFileNameFromUrl } from '../fileInfo'
import { getProxyUrl } from '@/utils/proxyUrl'

export const VIDEO_SIZE_LIMIT = 500 * 1024 * 1024

const inflight = new Map()

/**
 * @param {string} url
 * @param {string} canvasId
 * @param {{ priority?: 'high' | 'low' }} [options]
 * @returns {Promise<boolean>}
 */
export function ensureVideoCached(url, canvasId, { priority = 'low' } = {}) {
  if (!url) return Promise.resolve(false)
  if (inflight.has(url)) return inflight.get(url)

  const task = (async () => {
    try {
      if (isBlacklisted(url)) return false

      const existing = await cacheMatch(url).catch(() => null)
      if (existing) return true

      try {
        // dev 环境把 OSS URL 改写到 /oss-proxy 同源路径绕开 CORS；cache key 仍用原 url
        const head = await fetch(getProxyUrl(url), { method: 'HEAD', mode: 'cors' })
        if (head.ok) {
          const len = Number(head.headers.get('content-length') || 0)
          if (len > VIDEO_SIZE_LIMIT) {
            console.log(`[VideoCache] 跳过 ${formatMB(len)} 视频（>500MB）`, url)
            return false
          }
        }
      } catch {
        // HEAD 失败不阻塞，继续尝试 GET
      }

      const resp = await fetch(getProxyUrl(url), { mode: 'cors', priority })
      // 注册了 Service Worker 时，fetch 走 SW 返回的 Response.type 会是 'basic' 而不是 'cors'
      // 只要不是 opaque（no-cors 返回、body 不可读），且 ok，就接受
      if (resp.type === 'opaque' || !resp.ok) {
        blacklistUrl(url)
        return false
      }
      const cacheCopy = resp.clone()
      const blob = await resp.blob()
      if (!blob || blob.size === 0) return false
      if (blob.size > VIDEO_SIZE_LIMIT) {
        console.log(`[VideoCache] 下载完成但超过限制，跳过存入`, url)
        return false
      }
      if (!(await shouldAllowWrite())) {
        console.log('[VideoCache] 配额已达上限，跳过写入', url)
        return false
      }
      await cachePut(url, cacheCopy)
      await recordUrlCached(canvasId, url, {
        bytes: blob.size,
        type: 'video',
        // fileName/mimeType 用于 URL 自愈时还原 multipart File
        fileName: inferFileNameFromUrl(url),
        mimeType: blob.type || resp.headers.get('Content-Type') || null,
        backgroundFetched: priority === 'low',
      })
      postWriteQuotaCheck().catch(() => {})
      return true
    } catch {
      blacklistUrl(url)
      return false
    } finally {
      inflight.delete(url)
    }
  })()

  inflight.set(url, task)
  return task
}

function formatMB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}
