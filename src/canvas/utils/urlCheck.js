/**
 * URL 可用性探测
 * 通过 HEAD 请求判断 URL 状态，尽量区分失败原因
 *
 * 注意：CORS 被拦时 fetch 抛 TypeError，前端无法区分"CORS / 断网 / DNS"
 * 这种情况统一归为 'unknown'
 */

const REASON = {
  NOT_FOUND: 'not-found',      // 404
  FORBIDDEN: 'forbidden',      // 403 / 401
  SERVER_ERROR: 'server-error',// 5xx
  TIMEOUT: 'timeout',          // 主动 abort
  UNKNOWN: 'unknown',          // CORS / 断网 / DNS / 其他
  MEDIA_ERROR: 'media-error',  // URL 可达（HEAD ok），但媒体元素自身加载失败（codec / 解码 / 传输中断等）
}

async function probeOnce(url, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(url, { method: 'HEAD', signal: controller.signal })
    if (resp.ok) return { ok: true, status: resp.status }
    if (resp.status === 404) return { ok: false, reason: REASON.NOT_FOUND, status: 404 }
    if (resp.status === 403 || resp.status === 401) {
      return { ok: false, reason: REASON.FORBIDDEN, status: resp.status }
    }
    if (resp.status >= 500) return { ok: false, reason: REASON.SERVER_ERROR, status: resp.status }
    return { ok: false, reason: REASON.UNKNOWN, status: resp.status }
  } catch (err) {
    if (err?.name === 'AbortError') return { ok: false, reason: REASON.TIMEOUT }
    return { ok: false, reason: REASON.UNKNOWN }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 探测 URL 状态，带可选自动重试（仅对 timeout / server-error）
 * @param {string} url
 * @param {{ timeout?: number, retries?: number, retryDelay?: number }} opts
 * @returns {Promise<{ ok: boolean, reason?: string, status?: number }>}
 */
export async function probeUrl(url, opts = {}) {
  const { timeout = 5000, retries = 0, retryDelay = 1000 } = opts
  if (!url) return { ok: false, reason: REASON.UNKNOWN }

  // data:/blob: 协议本地即可用
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    return { ok: true }
  }

  let last = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await probeOnce(url, timeout)
    if (result.ok) return result
    last = result
    // 只对瞬时故障重试
    if (result.reason !== REASON.TIMEOUT && result.reason !== REASON.SERVER_ERROR) break
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, retryDelay * 2 ** attempt))
    }
  }
  return last
}

/**
 * 批量并行探测多个 URL 的可用性
 * 用于提交能力请求前对 body 中所有 URL 字段做健康检查
 *
 * @param {string[]} urls
 * @param {{ timeout?: number, concurrency?: number, retries?: number }} opts
 * @returns {Promise<Array<{ url: string, ok: boolean, reason?: string, status?: number }>>}
 *   返回与输入 urls 一一对应的结果数组(顺序保持)
 */
export async function probeUrlsBatch(urls, opts = {}) {
  const { timeout = 2000, concurrency = 4, retries = 0 } = opts
  if (!Array.isArray(urls) || urls.length === 0) return []

  const results = new Array(urls.length)
  let cursor = 0

  async function worker() {
    while (true) {
      const idx = cursor++
      if (idx >= urls.length) return
      const url = urls[idx]
      const result = await probeUrl(url, { timeout, retries })
      results[idx] = { url, ...result }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, urls.length) },
    () => worker(),
  )
  await Promise.all(workers)
  return results
}

export { REASON as LOAD_ERROR_REASONS }

// 错误原因 → 人类可读文案（各 Renderer 共用）
export const REASON_MESSAGES = {
  [REASON.NOT_FOUND]: '文件不存在或已删除',
  [REASON.FORBIDDEN]: '无权访问该文件',
  [REASON.SERVER_ERROR]: '服务暂不可用',
  [REASON.TIMEOUT]: '加载超时',
  [REASON.UNKNOWN]: '无法加载',
  [REASON.MEDIA_ERROR]: '内容加载失败',
}
