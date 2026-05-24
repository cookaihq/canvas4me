/**
 * 模型配置 matcher（纯逻辑，无 React/无 @/，可 node --test）。
 * 键 = 精确 model id 或 单个 * 的通配符。优先级：精确 id > 最长通配符 > * 兜底。
 */
function literalLen(key) {
  return key.split('*').join('').length
}

function wildcardMatches(key, id) {
  const i = key.indexOf('*')
  if (i === -1) return key === id
  const prefix = key.slice(0, i)
  const suffix = key.slice(i + 1)
  return id.length >= prefix.length + suffix.length && id.startsWith(prefix) && id.endsWith(suffix)
}

export function matchBestKey(map, id) {
  if (!map || typeof map !== 'object') return null
  if (Object.prototype.hasOwnProperty.call(map, id)) return { key: id, value: map[id] }
  let best = null
  for (const key of Object.keys(map)) {
    if (!key.includes('*')) continue
    if (!wildcardMatches(key, id)) continue
    if (!best || literalLen(key) > literalLen(best.key)) best = { key, value: map[key] }
  }
  return best
}

export function applyLabelTemplate(patternKey, labelTemplate, id) {
  if (typeof labelTemplate !== 'string') return labelTemplate
  const i = patternKey.indexOf('*')
  if (i === -1) return labelTemplate
  if (!labelTemplate.includes('*')) return labelTemplate
  const prefix = patternKey.slice(0, i)
  const suffix = patternKey.slice(i + 1)
  const captured = id.slice(prefix.length, id.length - suffix.length)
  return labelTemplate.replace('*', captured)
}
