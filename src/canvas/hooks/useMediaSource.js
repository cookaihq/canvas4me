/**
 * useMediaSource - 统一媒体 URL 加载 Hook（图/视/音）
 *
 * 根本目的:绕开 OSS 对象 metadata 强制带 Content-Disposition: attachment +
 * x-oss-force-download 导致原生 <img>/<video>/<audio> 偶发被当成下载文件 abort。
 * 同时统一处理未来可能出现的 301/302 跳转 URL、Content-Type 不规范等问题。
 *
 * 策略:
 *   1. 查 Cache API 命中 → blob URL(最快)
 *   2. 未命中,按 kind/strategy:
 *      - image / audio / { kind: 'video', strategy: 'eager' } → 立即 fetch → blob URL
 *      - { kind: 'video' }(默认 strategy 'lazy') → 返回原 URL 让 <video> 边下边播 +
 *        IntersectionObserver 观察容器,视口停留 3s + 浏览器空闲时后台预拉
 *   3. <media onError> 时调 markError() → hook 立即用原 URL fetch 一份 blob 重试
 *   4. fetch / 写 cache 失败 → 拉黑域名 + 返回原 URL 兜底
 *
 * 返回:
 *   - displayUrl    : 喂给 <img/video/audio src> 的 URL(blob 或原 URL)
 *   - ready         : 加载链路已结束(成功或失败兜底)
 *   - cached        : 当前 displayUrl 是否是 blob URL
 *   - reload()      : 手动重试(清 cache + 重走)
 *   - markError()   : 媒体标签 onError 时调用,触发降级 fetch → blob
 *   - containerRef  : lazy-video 模式下挂在外层容器 div,用 IntersectionObserver 触发预拉
 *
 * 卸载时自动 revokeObjectURL 防泄漏。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { cacheDelete, cacheMatch, cachePut } from '../utils/mediaCache/cache'
import { recordUrlCached, touchUrl } from '../utils/mediaCache/canvasIndex'
import { isBlacklisted, blacklistUrl } from '../utils/mediaCache/corsGate'
import { isCacheableUrl } from '../utils/mediaCache/extractUrls'
import { shouldAllowWrite, postWriteQuotaCheck } from '../utils/mediaCache/quota'
import { ensureVideoCached } from '../utils/mediaCache/ensureVideoCached'
import { inferFileNameFromUrl } from '../utils/fileInfo'
import { getProxyUrl } from '@/utils/proxyUrl'
import { useCanvasId } from '../contexts/CanvasIdContext'

const VIEWPORT_DWELL_MS = 3000
const IDLE_TIMEOUT_MS = 10000

function initialDisplayUrl(url) {
  if (!url) return ''
  if (!isCacheableUrl(url)) return url
  return null
}

export function useMediaSource(url, options = {}) {
  const { kind = 'image', strategy } = options
  // strategy 默认 eager:所有类型(含视频)都先 fetch 成 blob 再喂给媒体标签,
  // 避免把带 Content-Disposition: attachment 的原始 URL 直接交给 <video> 偶发被浏览器
  // 当下载文件 abort。lazy 仅在显式传 strategy: 'lazy' 时启用(当前无调用方)。
  const effectiveStrategy = strategy || 'eager'

  const canvasId = useCanvasId()
  const [displayUrl, setDisplayUrl] = useState(() => initialDisplayUrl(url))
  const [ready, setReady] = useState(() => !isCacheableUrl(url))
  const [cached, setCached] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [errorRetryKey, setErrorRetryKey] = useState(0)
  const blobUrlRef = useRef(null)
  const escalateRef = useRef(false)
  const containerRef = useRef(null)

  const reload = useCallback(async () => {
    if (isCacheableUrl(url)) {
      await cacheDelete(url).catch(() => {})
    }
    setReloadKey((k) => k + 1)
  }, [url])

  const markError = useCallback(() => {
    // 一次性重试守卫:同一 url 只在出错后重拉一次,避免 blob/原始 URL 持续失败时无限循环
    if (escalateRef.current) return
    escalateRef.current = true
    setErrorRetryKey((k) => k + 1)
  }, [])

  // 当 url 切换时,清除上一份 url 累计的 markError 升级标记
  useEffect(() => {
    escalateRef.current = false
  }, [url])

  // 主加载 effect:查 cache → 按 strategy 决定 miss 行为
  useEffect(() => {
    let alive = true

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }

    if (!url) {
      setDisplayUrl('')
      setReady(true)
      setCached(false)
      return
    }
    if (!isCacheableUrl(url)) {
      setDisplayUrl(url)
      setReady(true)
      setCached(false)
      return
    }

    // lazy-video + 已知 CORS 黑名单 → 直接原 URL,避免每次都试一遍
    if (isBlacklisted(url) && effectiveStrategy === 'lazy') {
      setDisplayUrl(url)
      setReady(true)
      setCached(false)
      return
    }

    setDisplayUrl(null)
    setReady(false)

    ;(async () => {
      // 1. 查 cache
      try {
        const hit = await cacheMatch(url)
        if (!alive) return
        if (hit) {
          const blob = await hit.blob()
          if (!alive) return
          if (blob && blob.size > 0) {
            const bu = URL.createObjectURL(blob)
            blobUrlRef.current = bu
            setDisplayUrl(bu)
            setReady(true)
            setCached(true)
            touchUrl(url).catch(() => {})
            return
          }
        }
      } catch { /* cache 异常 → 走 miss 分支 */ }

      if (!alive) return

      // 2. miss 分支
      if (effectiveStrategy === 'lazy' && !escalateRef.current) {
        // lazy-video 首次:返回原 URL 边下边播,后台预拉由下面的 IntersectionObserver effect 处理
        setDisplayUrl(url)
        setReady(true)
        setCached(false)
        return
      }
      // 走到这里说明:eager 模式,或 lazy 模式但 markError 已升级 → 落入 eager fetch 分支

      // eager:立即 fetch → blob URL
      // 黑名单域名直接兜底原 URL,不再尝试 fetch
      if (isBlacklisted(url)) {
        setDisplayUrl(url)
        setReady(true)
        setCached(false)
        return
      }

      try {
        // dev 环境用 /oss-proxy 同源代理绕开 CORS;cache key 仍用原 url
        const resp = await fetch(getProxyUrl(url), { mode: 'cors' })
        if (!alive) return
        if (resp.type === 'opaque' || !resp.ok) {
          blacklistUrl(url)
          setDisplayUrl(url)
          setReady(true)
          setCached(false)
          return
        }
        const cacheCopy = resp.clone()
        const blob = await resp.blob()
        if (!alive) return
        if (!blob || blob.size === 0) {
          blacklistUrl(url)
          setDisplayUrl(url)
          setReady(true)
          setCached(false)
          return
        }
        const bu = URL.createObjectURL(blob)
        blobUrlRef.current = bu
        setDisplayUrl(bu)
        setReady(true)
        setCached(true)

        // 异步写入 cache(不阻塞展示)
        ;(async () => {
          if (!(await shouldAllowWrite())) return
          try {
            await cachePut(url, cacheCopy)
            await recordUrlCached(canvasId, url, {
              bytes: blob.size,
              type: kind,
              fileName: inferFileNameFromUrl(url),
              mimeType: blob.type || resp.headers.get('Content-Type') || null,
            })
            postWriteQuotaCheck().catch(() => {})
          } catch { /* 写缓存失败不影响展示 */ }
        })()
      } catch {
        if (!alive) return
        blacklistUrl(url)
        setDisplayUrl(url)
        setReady(true)
        setCached(false)
      }
    })()

    return () => {
      alive = false
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [url, effectiveStrategy, kind, canvasId, reloadKey, errorRetryKey])

  // lazy-video:IntersectionObserver 观察 containerRef,视口 + dwell + idle 后后台预拉
  useEffect(() => {
    if (effectiveStrategy !== 'lazy') return
    if (cached) return
    if (!url || !isCacheableUrl(url)) return
    if (isBlacklisted(url)) return
    if (!containerRef.current) return

    let dwellTimer = null
    let idleHandle = null
    let cancelled = false

    const scheduleIdleFetch = () => {
      const run = () => {
        if (cancelled) return
        ensureVideoCached(url, canvasId, { priority: 'low' }).catch(() => {})
      }
      if (typeof window.requestIdleCallback === 'function') {
        idleHandle = window.requestIdleCallback(() => run(), { timeout: IDLE_TIMEOUT_MS })
      } else {
        idleHandle = setTimeout(() => run(), 500)
      }
    }

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          if (!dwellTimer) {
            dwellTimer = setTimeout(() => {
              dwellTimer = null
              scheduleIdleFetch()
            }, VIEWPORT_DWELL_MS)
          }
        } else {
          if (dwellTimer) {
            clearTimeout(dwellTimer)
            dwellTimer = null
          }
        }
      }
    }, { threshold: 0.3 })

    observer.observe(containerRef.current)

    return () => {
      cancelled = true
      observer.disconnect()
      if (dwellTimer) clearTimeout(dwellTimer)
      if (idleHandle) {
        if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleHandle)
        else clearTimeout(idleHandle)
      }
    }
  }, [url, cached, canvasId, effectiveStrategy])

  return { displayUrl, ready, cached, reload, markError, containerRef }
}
