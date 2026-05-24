/**
 * 全局错误监听 — 装一对兜底 listener 把 window 级未捕获错误收集起来
 *
 * 覆盖:
 *   - window 'error' 事件: 同步 throw / setTimeout 里 throw / 资源加载错误
 *   - window 'unhandledrejection' 事件: Promise rejection 没人接
 *
 * React render 期的错误走 GlobalErrorBoundary, 不进这里 (React 会在自己的边界
 * 里 catch 掉, 不会冒泡到 window).
 *
 * 必须在 main.jsx 顶部装载, 越早越好 — 装载之前发生的错误抓不到.
 */

import { captureError } from './errorReport'

let installed = false

export function installGlobalErrorHandlers() {
  if (installed) return
  if (typeof window === 'undefined') return
  installed = true

  window.addEventListener('error', (event) => {
    // 资源加载错误 (img/script onerror) 没有 error 对象, 只有 target
    if (!event.error && event.target && event.target !== window) {
      const tag = event.target.tagName || '?'
      const src = event.target.src || event.target.href || ''
      captureError({
        type: 'window-error',
        message: `Resource load error: <${tag.toLowerCase()}> ${src}`,
        extra: { resourceTag: tag, resourceSrc: src },
      })
      return
    }
    captureError({
      type: 'window-error',
      error: event.error,
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    })
  }, true) // capture phase: 抓所有冒泡

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    captureError({
      type: 'unhandled-rejection',
      error: reason instanceof Error ? reason : null,
      message: reason instanceof Error
        ? reason.message
        : (typeof reason === 'string' ? reason : safeReasonString(reason)),
      extra: reason instanceof Error ? null : { reason: safeReasonString(reason) },
    })
  })
}

function safeReasonString(reason) {
  if (reason === null) return 'null'
  if (reason === undefined) return 'undefined'
  if (typeof reason === 'string') return reason
  if (typeof reason === 'object') {
    try {
      return JSON.stringify(reason)
    } catch {
      return '[Unserializable rejection reason]'
    }
  }
  return String(reason)
}
