/**
 * 错误日志收集与下载 — 浏览器端轻量诊断
 *
 * 数据流:
 *   1. installGlobalErrorHandlers / GlobalErrorBoundary / consoleBreadcrumbs
 *      → captureError({...}) 把一条错误塞进 localStorage 环形缓冲 (最近 50 条)
 *   2. 设置页 → "诊断" tab → downloadErrorLog() 把全部条目打包成 json 让用户下载
 *
 * 一条错误尽量自描述 — 包含错误本体 + 当时的画布快照 + 最近的 console 面包屑 +
 * 环境信息. 目标是单看这个 json 就能复盘问题, 不用反问用户当时在干嘛.
 *
 * localStorage 是有意选择:
 *   - 同步读写, 错误发生在 commit 阶段时也能可靠落盘
 *   - quota 5MB 对错误日志远够 (单条 ~20KB × 50 条 ≈ 1MB)
 *   - 单一 key, 用户清缓存能一并清掉, 不留垃圾
 */

import { CANVAS_VERSION } from '@/canvas/version'
import { getRecentBreadcrumbs, getNativeConsole } from './consoleBreadcrumbs'

const STORAGE_KEY = 'ai-canvas:error-log'
const MAX_ENTRIES = 50
const MAX_BREADCRUMBS_PER_ENTRY = 100
// 单条 json 文本上限 (truncate 后): localStorage 5MB / 50 条 = 100KB/条上限,
// 留 buffer 取 80KB
const MAX_ENTRY_SIZE = 80 * 1024

// ─── 快照提供者 ─────────────────────────────────────────────────────
// 画布组件 mount 后调 setCanvasSnapshotProvider(fn) 注册一个同步快照函数;
// 错误捕获时调 fn() 拉一份当时的画布状态. mount 之前发生的错误 (例如初次 render
// 阶段就死循环) 自然拿不到画布快照, 这是 ok 的 — 用户初次报错时画布也是白的.

let snapshotProvider = null

export function setCanvasSnapshotProvider(fn) {
  snapshotProvider = typeof fn === 'function' ? fn : null
}

function tryGetCanvasSnapshot() {
  if (!snapshotProvider) return null
  try {
    return snapshotProvider()
  } catch (err) {
    return { _snapshotError: String(err?.message || err) }
  }
}

// ─── 安全 stringify (处理循环引用 + 大对象截断) ─────────────────────

function safeStringify(value, maxLen = 500) {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return truncate(value, maxLen)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`
  if (typeof value === 'symbol') return value.toString()
  if (value instanceof Error) {
    return truncate(`${value.name}: ${value.message}\n${value.stack || ''}`, maxLen * 4)
  }
  // 对象 / 数组
  const seen = new WeakSet()
  try {
    const json = JSON.stringify(value, (_k, v) => {
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[Circular]'
        seen.add(v)
        // DOM 节点 / React fiber 等大对象别完整序列化
        if (typeof Node !== 'undefined' && v instanceof Node) return `[${v.nodeName}]`
        if (v.constructor && v.constructor.name === 'HTMLElement') return '[HTMLElement]'
      }
      if (typeof v === 'function') return `[Function ${v.name || 'anonymous'}]`
      if (typeof v === 'bigint') return v.toString() + 'n'
      return v
    })
    return truncate(json, maxLen)
  } catch (err) {
    return `[Unserializable: ${err?.message || 'unknown'}]`
  }
}

function truncate(s, maxLen) {
  if (typeof s !== 'string') return s
  if (s.length <= maxLen) return s
  return s.slice(0, maxLen) + `…[${s.length - maxLen} more chars]`
}

// ─── 环境信息 ────────────────────────────────────────────────────────

function getEnvironment() {
  const env = {
    canvasVersion: CANVAS_VERSION,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    language: typeof navigator !== 'undefined' ? navigator.language : '',
    platform: typeof navigator !== 'undefined' ? navigator.platform : '',
    viewport: typeof window !== 'undefined' ? {
      w: window.innerWidth,
      h: window.innerHeight,
      dpr: window.devicePixelRatio,
    } : null,
  }
  // performance.memory: Chrome only, gives JS heap usage
  if (typeof performance !== 'undefined' && performance.memory) {
    env.memory = {
      usedJSHeapSize: performance.memory.usedJSHeapSize,
      totalJSHeapSize: performance.memory.totalJSHeapSize,
      jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
    }
  }
  // navigator.connection: 网络条件
  if (typeof navigator !== 'undefined' && navigator.connection) {
    env.connection = {
      effectiveType: navigator.connection.effectiveType,
      downlink: navigator.connection.downlink,
      rtt: navigator.connection.rtt,
      saveData: navigator.connection.saveData,
    }
  }
  return env
}

function getLocation() {
  if (typeof window === 'undefined' || !window.location) return null
  const l = window.location
  return {
    href: l.href,
    origin: l.origin,
    pathname: l.pathname,
    search: l.search,
    hash: l.hash,
    referrer: typeof document !== 'undefined' ? document.referrer : '',
  }
}

function getLocalStorageInfo() {
  try {
    let count = 0
    let totalSize = 0
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k) continue
      count++
      const v = localStorage.getItem(k) || ''
      totalSize += k.length + v.length
    }
    return { count, totalBytes: totalSize * 2 /* utf-16 */ }
  } catch {
    return null
  }
}

// ─── 核心: captureError ─────────────────────────────────────────────

/**
 * 捕获一条错误并追加到本地环形缓冲
 *
 * @param {object} input
 * @param {'react' | 'window-error' | 'unhandled-rejection'} input.type
 * @param {Error | unknown} [input.error]            原始 Error 对象 (可能没有 stack)
 * @param {string} [input.message]                   覆盖 error.message
 * @param {string} [input.componentStack]            仅 React 错误边界提供
 * @param {string} [input.filename]                  仅 window error 事件提供
 * @param {number} [input.lineno]
 * @param {number} [input.colno]
 * @param {object} [input.extra]                     调用方想附加的任意结构
 */
export function captureError(input = {}) {
  try {
    const entry = buildEntry(input)
    persist(entry)
    printToConsole(entry)
    return entry.id
  } catch (err) {
    // 错误捕获本身炸了 — 写一条最小记录, 别因为日志收集再炸一轮
    try {
      const fallback = {
        id: makeId(),
        ts: Date.now(),
        type: 'capture-failure',
        message: String(err?.message || err),
        stack: err?.stack || '',
      }
      persist(fallback)
    } catch { /* give up */ }
    return null
  }
}

// 在控制台同步打印一段可直接复制的错误摘要 — 用单条 console.error
// 输出一整块多行文本, 用户三连击 / 选中后右键即可整段复制给开发者.
// 用原生 console.error 绕过 consoleBreadcrumbs 的 patch, 避免本次打印
// 再被记进下一轮错误的面包屑里.
function printToConsole(entry) {
  try {
    const lines = []
    lines.push('━━━━━━━━━━ ai-canvas error ━━━━━━━━━━')
    lines.push(`id:        ${entry.id}`)
    lines.push(`time:      ${entry.tsIso}`)
    lines.push(`type:      ${entry.type}`)
    lines.push(`version:   ${entry.environment?.canvasVersion ?? '?'}`)
    if (entry.location?.href) lines.push(`url:       ${entry.location.href}`)
    lines.push(`message:   ${entry.error?.name || 'Error'}: ${entry.error?.message || '(no message)'}`)
    if (entry.source?.filename) {
      const { filename, lineno, colno } = entry.source
      lines.push(`source:    ${filename}${lineno != null ? `:${lineno}` : ''}${colno != null ? `:${colno}` : ''}`)
    }
    if (entry.error?.stack) {
      lines.push('stack:')
      lines.push(indent(entry.error.stack, '  '))
    }
    if (entry.componentStack) {
      lines.push('componentStack:')
      lines.push(indent(entry.componentStack.trim(), '  '))
    }
    const crumbs = entry.breadcrumbs || []
    if (crumbs.length) {
      const tail = crumbs.slice(-10)
      lines.push(`breadcrumbs (last ${tail.length} of ${crumbs.length}):`)
      for (const c of tail) {
        const t = c.ts ? new Date(c.ts).toISOString().slice(11, 23) : '--:--:--.---'
        const lvl = (c.level || 'log').padEnd(5)
        const args = Array.isArray(c.args) ? c.args.join(' ') : String(c.args ?? '')
        lines.push(`  [${t}] ${lvl} ${truncate(args, 240)}`)
      }
    }
    lines.push('提示: 完整 json 可调 window.__aiCanvasDownloadErrorLog() 下载')
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    getNativeConsole().error(lines.join('\n'))
  } catch { /* 打印失败别影响主流程 */ }
}

function indent(s, prefix) {
  return String(s).split('\n').map((l) => prefix + l).join('\n')
}

function buildEntry(input) {
  const { type, error, message, componentStack, filename, lineno, colno, extra } = input

  const errorObj = error instanceof Error ? error : null
  const resolvedMessage = message
    || (errorObj && errorObj.message)
    || (typeof error === 'string' ? error : 'Unknown error')
  const resolvedStack = errorObj?.stack
    || (typeof error?.stack === 'string' ? error.stack : '')

  const entry = {
    id: makeId(),
    ts: Date.now(),
    tsIso: new Date().toISOString(),
    type: type || 'unknown',

    error: {
      name: errorObj?.name || 'Error',
      message: truncate(resolvedMessage, 2000),
      stack: truncate(resolvedStack, 6000),
    },

    componentStack: componentStack ? truncate(componentStack, 4000) : null,

    source: (filename || lineno != null) ? {
      filename: filename || null,
      lineno: lineno ?? null,
      colno: colno ?? null,
    } : null,

    location: getLocation(),
    environment: getEnvironment(),
    storage: { localStorage: getLocalStorageInfo() },

    canvasSnapshot: tryGetCanvasSnapshot(),

    breadcrumbs: getRecentBreadcrumbs(MAX_BREADCRUMBS_PER_ENTRY),
  }

  if (extra && typeof extra === 'object') {
    entry.extra = JSON.parse(safeStringify(extra, 4000))
  }

  // 整体大小兜底: 序列化后超 80KB 的话, 把 breadcrumbs 砍半重试.
  // 真出问题的错误信息本身不会超几 KB, 体积都在 breadcrumbs 里.
  let serialized = JSON.stringify(entry)
  if (serialized.length > MAX_ENTRY_SIZE && entry.breadcrumbs?.length > 10) {
    entry.breadcrumbs = entry.breadcrumbs.slice(-Math.floor(entry.breadcrumbs.length / 2))
    entry._breadcrumbsTruncated = true
    serialized = JSON.stringify(entry)
  }
  // 还超就把 stack 截断到 2KB
  if (serialized.length > MAX_ENTRY_SIZE) {
    entry.error.stack = truncate(entry.error.stack, 2000)
    entry._stackTruncated = true
  }

  return entry
}

function persist(entry) {
  let list = []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) list = parsed
    }
  } catch { /* ignore corrupted */ }

  list.push(entry)
  if (list.length > MAX_ENTRIES) {
    list = list.slice(list.length - MAX_ENTRIES)
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch (err) {
    // localStorage quota 满了 — 砍掉一半再写
    list = list.slice(Math.floor(list.length / 2))
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    } catch { /* give up writing */ }
  }
}

function makeId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
}

// ─── 读 / 清 / 下载 ─────────────────────────────────────────────────

export function getErrorLog() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function clearErrorLog() {
  try {
    localStorage.removeItem(STORAGE_KEY)
    return true
  } catch {
    return false
  }
}

export function downloadErrorLog() {
  const entries = getErrorLog()
  const payload = {
    exportedAt: new Date().toISOString(),
    canvasVersion: CANVAS_VERSION,
    entryCount: entries.length,
    entries,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  a.href = url
  a.download = `ai-canvas-error-log-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(url)
    a.remove()
  }, 0)
  return entries.length
}

export function getErrorLogSummary() {
  const entries = getErrorLog()
  if (entries.length === 0) return { count: 0 }
  const last = entries[entries.length - 1]
  return {
    count: entries.length,
    lastTs: last.ts,
    lastType: last.type,
    lastMessage: last.error?.message?.slice(0, 200) || '(no message)',
  }
}

// 暴露给开发者控制台手动触发 — 调试方便
if (typeof window !== 'undefined') {
  window.__aiCanvasGetErrorLog = getErrorLog
  window.__aiCanvasClearErrorLog = clearErrorLog
  window.__aiCanvasDownloadErrorLog = downloadErrorLog
}
