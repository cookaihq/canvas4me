/**
 * 决定 URL 中的 apiKey 该如何处理(纯逻辑,无副作用)。
 *
 * @param {string} urlKey   URL ?apiKey= 读出的值(可能为 ''/空白)
 * @param {string} localKey 本地已存的 apiKey(可能为 '')
 * @returns {'write'|'confirm'|'skip'}
 *   - 'write'   直接写入(本地为空)
 *   - 'confirm' 需弹确认框(本地已有且与 url 不同)
 *   - 'skip'    不处理(url 为空,或与本地相同)
 */
export function decideImport(urlKey, localKey) {
  const next = (urlKey || '').trim()
  const cur = (localKey || '').trim()
  if (!next) return 'skip'
  if (!cur) return 'write'
  if (next === cur) return 'skip'
  return 'confirm'
}
