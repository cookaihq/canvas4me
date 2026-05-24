/**
 * 错误摘要格式化工具
 *
 * Failed 节点的"摘要文本"(≤80 字)统一从这里走:
 *   1. 优先调用 capability.formatError(rawError) 拿到定制摘要
 *   2. 缺省 fallback: 沿着 rawError 常见字段(error.message / message / String())抽一段
 *   3. 一律截断到 80 字 + 省略号
 */
import { CAPABILITIES } from '../registry/nodeTypes'

const MAX_SUMMARY_LEN = 80

function truncate(text, maxLen = MAX_SUMMARY_LEN) {
  if (typeof text !== 'string') return ''
  const trimmed = text.trim()
  if (trimmed.length <= maxLen) return trimmed
  return trimmed.slice(0, maxLen - 1) + '…'
}

/**
 * 缺省摘要抽取: 沿着 rawError 常见字段抽一段可读文本
 */
export function defaultExtractSummary(rawError) {
  if (rawError == null) return '未知错误'

  // 1) 直接是 string
  if (typeof rawError === 'string') return truncate(rawError)

  // 2) 常见嵌套结构(参考 ai-tools-api 错误体 / openrouter 嵌套 raw)
  if (typeof rawError === 'object') {
    // 优先尝试 error.message / message
    const candidates = [
      rawError?.error?.message,
      rawError?.message,
      rawError?.error,
      rawError?.detail,
    ]
    for (const c of candidates) {
      if (typeof c === 'string' && c.length > 0) return truncate(c)
    }

    // 兜底:把对象序列化截断
    try {
      return truncate(JSON.stringify(rawError))
    } catch {
      // fallthrough
    }
  }

  return truncate(String(rawError))
}

/**
 * 根据 capabilityId 拿到摘要文本(≤80 字)
 * capability 自定义了 formatError 时走自定义,否则走 defaultExtractSummary
 */
export function getCapabilityErrorSummary(capabilityId, rawError) {
  const cap = capabilityId ? CAPABILITIES[capabilityId] : null
  if (cap && typeof cap.formatError === 'function') {
    try {
      const summary = cap.formatError(rawError)
      if (typeof summary === 'string' && summary.length > 0) {
        return truncate(summary)
      }
    } catch (e) {
      console.warn('[errorFormatter] capability.formatError threw', e)
    }
  }
  return defaultExtractSummary(rawError)
}
