/**
 * Console 面包屑 — 把最近 N 条 console 调用写进内存环形缓冲
 *
 * 错误捕获时把这些面包屑塞进错误条目里, 让我能看清错误发生前几秒在打印什么.
 * 对调试无限循环 (例如 "[TaskPolling] 开始轮询" 重复 50 次说明 useEffect 死循环) 极其有用.
 *
 * 注意:
 *   - 只 patch console, 不动 native 行为 — 控制台照样能看到 log
 *   - 仅记录最近 200 条; 旧的自动 shift 掉
 *   - 大对象 / 长字符串单条截断到 800 字符, 控制单条体积
 *   - 必须在 main.jsx 顶部立刻 install, 越早装载捕获越完整
 */

const MAX_BREADCRUMBS = 200
const MAX_ARG_LEN = 800

const breadcrumbs = []
let installed = false

const NATIVE_CONSOLE = {
  log: null,
  info: null,
  warn: null,
  error: null,
  debug: null,
}

const LEVELS = ['log', 'info', 'warn', 'error', 'debug']

export function installConsoleBreadcrumbs() {
  if (installed) return
  if (typeof console === 'undefined') return
  installed = true
  for (const level of LEVELS) {
    NATIVE_CONSOLE[level] = console[level]
    console[level] = createPatchedFn(level)
  }
}

// 给 errorReport 等模块用 — 拿到 patch 前的原始 console.error,
// 避免错误兜底打印再被记一条面包屑形成噪音.
// install 之前调用会回退到当前(可能未被 patch 的) console.
export function getNativeConsole() {
  return {
    log:   NATIVE_CONSOLE.log   || console.log.bind(console),
    info:  NATIVE_CONSOLE.info  || console.info.bind(console),
    warn:  NATIVE_CONSOLE.warn  || console.warn.bind(console),
    error: NATIVE_CONSOLE.error || console.error.bind(console),
    debug: NATIVE_CONSOLE.debug || console.debug.bind(console),
  }
}

function createPatchedFn(level) {
  const native = NATIVE_CONSOLE[level]
  return function patched(...args) {
    // 先记面包屑, 再调原生 — 即便原生抛错面包屑也有了
    try {
      pushBreadcrumb(level, args)
    } catch { /* ignore */ }
    if (native) {
      try {
        native.apply(console, args)
      } catch { /* ignore */ }
    }
  }
}

function pushBreadcrumb(level, args) {
  const formatted = args.map(formatArg).join(' ')
  const truncated = formatted.length > MAX_ARG_LEN
    ? formatted.slice(0, MAX_ARG_LEN) + `…[+${formatted.length - MAX_ARG_LEN}]`
    : formatted
  breadcrumbs.push({
    ts: Date.now(),
    level,
    msg: truncated,
  })
  while (breadcrumbs.length > MAX_BREADCRUMBS) breadcrumbs.shift()
}

function formatArg(v) {
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'function') return `[Function ${v.name || ''}]`
  if (v instanceof Error) return `${v.name}: ${v.message}`
  if (typeof v === 'object') {
    try {
      const seen = new WeakSet()
      return JSON.stringify(v, (_k, val) => {
        if (typeof val === 'object' && val !== null) {
          if (seen.has(val)) return '[Circular]'
          seen.add(val)
          if (typeof Node !== 'undefined' && val instanceof Node) return `[${val.nodeName}]`
        }
        if (typeof val === 'function') return `[Function]`
        if (typeof val === 'bigint') return val.toString() + 'n'
        return val
      })
    } catch (err) {
      return `[Object: ${err?.message || 'unserializable'}]`
    }
  }
  return String(v)
}

/**
 * 取最近 n 条面包屑 (副本, 调用方修改不影响内部 buffer)
 */
export function getRecentBreadcrumbs(n = MAX_BREADCRUMBS) {
  const start = Math.max(0, breadcrumbs.length - n)
  return breadcrumbs.slice(start)
}

export function clearBreadcrumbs() {
  breadcrumbs.length = 0
}
