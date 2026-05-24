/**
 * 画布与 URL 的归属管理
 *
 * 两个索引互相对齐：
 *  - entries[url].canvases      → 该 URL 被哪些画布引用
 *  - canvas_index[cid].urls     → 该画布引用了哪些 URL
 *
 * 写入时机：
 *  - registerCanvasUrls()：画布加载后批量登记（不创建 entries 记录，仅更新 canvas_index 及已存在 entries 的反向引用）
 *  - recordUrlCached()：媒体真实缓存后登记（创建/更新 entries + 追加 canvas_index）
 *
 * 清理：
 *  - clearCanvasCache()：按画布清理；引用计数归零的 URL 会同时从 Cache API 删除
 *  - findOrphanCanvasIds()：对比后端画布列表，识别已删除画布的残留记录
 */

import { entries, canvasIndexStore } from './db'
import { cacheDelete } from './cache'

/**
 * 画布加载时批量登记该画布引用的所有 URL
 * 仅更新归属索引，不触发真实缓存
 */
export async function registerCanvasUrls(canvasId, urls) {
  if (!canvasId) return
  const unique = [...new Set((urls || []).filter(Boolean))]
  await canvasIndexStore.put({
    canvasId,
    urls: unique,
    lastActive: Date.now(),
  })
  for (const url of unique) {
    const entry = await entries.get(url)
    if (entry && !entry.canvases.includes(canvasId)) {
      entry.canvases.push(canvasId)
      await entries.put(entry)
    }
  }
}

/**
 * 媒体完成缓存后登记
 * - 创建或更新 entries 记录（带字节数/类型/lastUsedAt/fileName/mimeType）
 * - 同步把 url 追加到 canvas_index
 *
 * fileName/mimeType 用于 URL 自愈时把 cache blob 重新上传(需要恢复 multipart File 元数据)。
 * 旧记录没有这两个字段时,自愈层做兜底(从 url 推断扩展名 + Blob.type)。
 */
export async function recordUrlCached(canvasId, url, meta = {}) {
  const existing = await entries.get(url)
  const canvases = new Set(existing?.canvases || [])
  if (canvasId) canvases.add(canvasId)
  const record = {
    url,
    bytes: meta.bytes ?? existing?.bytes ?? 0,
    type: meta.type ?? existing?.type ?? 'unknown',
    fileName: meta.fileName ?? existing?.fileName ?? null,
    mimeType: meta.mimeType ?? existing?.mimeType ?? null,
    lastUsedAt: Date.now(),
    canvases: [...canvases],
    backgroundFetched: meta.backgroundFetched ?? existing?.backgroundFetched ?? false,
  }
  await entries.put(record)

  if (canvasId) {
    const ci = (await canvasIndexStore.get(canvasId)) || {
      canvasId,
      urls: [],
      lastActive: Date.now(),
    }
    if (!ci.urls.includes(url)) ci.urls.push(url)
    ci.lastActive = Date.now()
    await canvasIndexStore.put(ci)
  }
}

/** 刷新 URL 的最近使用时间戳（命中缓存时调用，用于后续 LRU 淘汰） */
export async function touchUrl(url) {
  const entry = await entries.get(url)
  if (!entry) return
  entry.lastUsedAt = Date.now()
  await entries.put(entry)
}

/**
 * 按画布清理缓存
 * @returns { removed, bytes } 删除的 URL 数量与字节数
 */
export async function clearCanvasCache(canvasId) {
  const ci = await canvasIndexStore.get(canvasId)
  if (!ci) return { removed: 0, bytes: 0 }

  let removed = 0
  let bytes = 0
  for (const url of ci.urls) {
    const entry = await entries.get(url)
    if (!entry) continue
    entry.canvases = entry.canvases.filter(c => c !== canvasId)
    if (entry.canvases.length === 0) {
      await cacheDelete(url)
      await entries.delete(url)
      removed += 1
      bytes += entry.bytes || 0
    } else {
      await entries.put(entry)
    }
  }
  await canvasIndexStore.delete(canvasId)
  return { removed, bytes }
}

/**
 * 识别孤儿画布：canvas_index 中存在但后端画布列表里已不存在的 canvasId
 * @param {string[]} existingCanvasIds 后端当前画布 ID 列表
 */
export async function findOrphanCanvasIds(existingCanvasIds) {
  const all = await canvasIndexStore.getAll()
  const existing = new Set(existingCanvasIds || [])
  return all
    .filter(ci => !existing.has(ci.canvasId))
    .map(ci => ci.canvasId)
}

/**
 * 读取所有画布的缓存占用汇总（缓存管理页面数据源）
 * 返回 [{ canvasId, urlCount, totalBytes, lastActive }]
 */
export async function getCanvasUsageSummary() {
  const [allCanvases, allEntries] = await Promise.all([
    canvasIndexStore.getAll(),
    entries.getAll(),
  ])
  const entryMap = new Map(allEntries.map(e => [e.url, e]))
  return allCanvases.map(ci => {
    let totalBytes = 0
    let cachedCount = 0
    for (const url of ci.urls) {
      const e = entryMap.get(url)
      if (e) {
        totalBytes += e.bytes || 0
        cachedCount += 1
      }
    }
    return {
      canvasId: ci.canvasId,
      urlCount: ci.urls.length,
      cachedCount,
      totalBytes,
      lastActive: ci.lastActive,
    }
  })
}
