/**
 * 从画布节点数组中提取所有可缓存的媒体 URL
 *
 * 节点数据结构约定：
 *  - data.content.url        → 单文件（图片/视频/音频/文件）
 *  - data.content.urls       → 多文件（如四宫格、PBR 贴图组）
 *
 * 只返回 http(s) 协议的 URL；data:/blob: 跳过（本地数据不需要缓存）。
 */

export function isCacheableUrl(url) {
  if (typeof url !== 'string' || !url) return false
  if (url.startsWith('data:') || url.startsWith('blob:')) return false
  return /^https?:\/\//i.test(url)
}

export function extractMediaUrlsFromNodes(nodes) {
  const urls = new Set()
  for (const node of nodes || []) {
    const content = node?.data?.content
    if (!content) continue
    if (isCacheableUrl(content.url)) urls.add(content.url)
    if (Array.isArray(content.urls)) {
      for (const u of content.urls) {
        if (isCacheableUrl(u)) urls.add(u)
      }
    }
  }
  return [...urls]
}
