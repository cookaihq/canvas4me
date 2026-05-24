/**
 * CORS 会话黑名单：
 * - 首次请求某个域名时，若 CORS 失败或响应不可读，把该 hostname 加入黑名单
 * - 黑名单只在本会话有效，刷新页面后重新尝试
 * - 被拉黑的域名不走缓存流程，Renderer 直接用原始 URL
 */

const blacklist = new Set()

export function hostnameOf(url) {
  try { return new URL(url).hostname } catch { return '' }
}

export function isBlacklisted(url) {
  const host = hostnameOf(url)
  return !!host && blacklist.has(host)
}

export function blacklistUrl(url) {
  const host = hostnameOf(url)
  if (host) blacklist.add(host)
}

export function getBlacklist() {
  return [...blacklist]
}
