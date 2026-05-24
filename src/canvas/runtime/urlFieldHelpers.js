/**
 * URL 字段辅助 — 从 builder 输出的 body 中提取/替换 URL
 *
 * 各 capability 的 builder 返回 `{ body, urlFields }`,urlFields 声明 body 中
 * 哪些位置含 URL,提交前探测 + 自愈机制据此读写。
 *
 * urlFields 元素两种形态:
 *
 *   1. **字符串**: body 顶层字段名,值是 string(单 URL)或 string[](URL 数组)
 *      例: `urlFields: ['image_urls', 'mask_url']`
 *
 *   2. **对象 `{ get, set }`**: 自定义提取/替换逻辑(嵌套结构用)
 *      - get(body) → string[]
 *      - set(body, urlMap: Map<oldUrl, newUrl>) → void (就地改 body)
 *      例(messages 嵌套):
 *      ```
 *      {
 *        get: (body) => body.messages.flatMap(m => ...).filter(Boolean),
 *        set: (body, urlMap) => body.messages.forEach(m => ...)
 *      }
 *      ```
 */

/**
 * 从 body 抽取所有 URL,去重后返回。
 * 顺序保持(用于错误提示按声明顺序展示)。
 */
export function extractUrlsFromBody(body, urlFields) {
  if (!body || !Array.isArray(urlFields)) return []
  const seen = new Set()
  const urls = []

  const push = (v) => {
    if (typeof v !== 'string' || !v) return
    if (seen.has(v)) return
    seen.add(v)
    urls.push(v)
  }

  for (const field of urlFields) {
    if (typeof field === 'string') {
      const v = body[field]
      if (typeof v === 'string') push(v)
      else if (Array.isArray(v)) v.forEach(push)
    } else if (field && typeof field.get === 'function') {
      try {
        const list = field.get(body)
        if (Array.isArray(list)) list.forEach(push)
      } catch (_err) { /* skip broken field def */ }
    }
  }
  return urls
}

/**
 * 用 urlMap (oldUrl → newUrl) 就地替换 body 中所有引用。
 * 没有命中 urlMap 的 URL 保持不变。
 */
export function replaceUrlsInBody(body, urlFields, urlMap) {
  if (!body || !Array.isArray(urlFields) || !urlMap || urlMap.size === 0) return body

  for (const field of urlFields) {
    if (typeof field === 'string') {
      const v = body[field]
      if (typeof v === 'string' && urlMap.has(v)) {
        body[field] = urlMap.get(v)
      } else if (Array.isArray(v)) {
        body[field] = v.map(u => (typeof u === 'string' && urlMap.has(u)) ? urlMap.get(u) : u)
      }
    } else if (field && typeof field.set === 'function') {
      try {
        field.set(body, urlMap)
      } catch (_err) { /* skip broken field def */ }
    }
  }
  return body
}
