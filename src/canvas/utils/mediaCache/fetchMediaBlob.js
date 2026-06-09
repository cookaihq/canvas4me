import { getProxyUrl } from '@/utils/proxyUrl'
import { cacheMatch } from './cache'

/**
 * 远端 url → Blob。复用 mediaCache 现成路径(spec §7.3, spike 核实, 两版共用):
 * 先查 Cache API(画布显示过的媒体多半已缓存, 零网络), 未命中走 fetch(getProxyUrl,{cors})。
 * 失败抛错(调用方标记该文件失败、其余继续)。
 */
export async function fetchMediaBlob(url) {
  const hit = await cacheMatch(url)
  if (hit) {
    const b = await hit.blob()
    if (b && b.size > 0) return b
  }
  const resp = await fetch(getProxyUrl(url), { mode: 'cors' })
  if (resp.type === 'opaque' || !resp.ok) throw new Error(`fetch failed: ${url}`)
  const blob = await resp.blob()
  if (!blob || blob.size === 0) throw new Error(`empty blob: ${url}`)
  return blob
}
