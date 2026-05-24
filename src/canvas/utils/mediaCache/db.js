/**
 * IndexedDB 封装：媒体缓存的元数据层
 *
 * 两个 store：
 *  - entries (keyPath: url)        → 已缓存的媒体文件记录
 *  - canvas_index (keyPath: canvasId) → 画布 → URL 列表的索引
 *
 * Cache API 存真实字节（见 cache.js），IndexedDB 存归属与元数据，两者按 url 对齐。
 */

const DB_NAME = 'ai-canvas-cache'
const DB_VERSION = 1
const STORE_ENTRIES = 'entries'
const STORE_CANVAS_INDEX = 'canvas_index'

let dbPromise = null

function openDatabase() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
        db.createObjectStore(STORE_ENTRIES, { keyPath: 'url' })
      }
      if (!db.objectStoreNames.contains(STORE_CANVAS_INDEX)) {
        db.createObjectStore(STORE_CANVAS_INDEX, { keyPath: 'canvasId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function getDb() {
  if (!dbPromise) dbPromise = openDatabase()
  return dbPromise
}

function txRead(storeName, fn) {
  return getDb().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(storeName, 'readonly')
    const s = t.objectStore(storeName)
    const req = fn(s)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }))
}

function txWrite(storeName, fn) {
  return getDb().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(storeName, 'readwrite')
    const s = t.objectStore(storeName)
    const req = fn(s)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    t.onerror = () => reject(t.error)
  }))
}

export const entries = {
  get: (url) => txRead(STORE_ENTRIES, s => s.get(url)),
  put: (entry) => txWrite(STORE_ENTRIES, s => s.put(entry)),
  delete: (url) => txWrite(STORE_ENTRIES, s => s.delete(url)),
  getAll: () => txRead(STORE_ENTRIES, s => s.getAll()),
}

export const canvasIndexStore = {
  get: (canvasId) => txRead(STORE_CANVAS_INDEX, s => s.get(canvasId)),
  put: (record) => txWrite(STORE_CANVAS_INDEX, s => s.put(record)),
  delete: (canvasId) => txWrite(STORE_CANVAS_INDEX, s => s.delete(canvasId)),
  getAll: () => txRead(STORE_CANVAS_INDEX, s => s.getAll()),
}
