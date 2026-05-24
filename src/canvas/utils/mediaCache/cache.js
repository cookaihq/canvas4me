/**
 * Cache API 封装：存 Response 对象的"真实字节层"
 * 元数据（归属、大小）走 db.js 的 IndexedDB，两者按 url 对齐
 */

const CACHE_NAME = 'ai-canvas-media-v1'

let cachePromise = null

function getCache() {
  if (!cachePromise) cachePromise = caches.open(CACHE_NAME)
  return cachePromise
}

export async function cacheMatch(url) {
  try {
    const cache = await getCache()
    return cache.match(url)
  } catch {
    return undefined
  }
}

export async function cachePut(url, response) {
  const cache = await getCache()
  await cache.put(url, response)
}

export async function cacheDelete(url) {
  try {
    const cache = await getCache()
    return cache.delete(url)
  } catch {
    return false
  }
}

export async function cacheKeys() {
  try {
    const cache = await getCache()
    return cache.keys()
  } catch {
    return []
  }
}
