/**
 * CanvasStore 本地 IndexedDB 实现 —— 纯本地存储,无协作锁、无 team、无 user 概念。
 *
 * 实现 src/platform/interfaces/CanvasStore.js 契约。
 *
 * IndexedDB 设计:
 *   - DB / Store / Schema 详见下方常量与 onupgradeneeded
 *   - 一条记录 = { id, name, canvas: { nodes, edges, viewport }, updated_at }
 *
 * 能力:
 *   - 完整 CRUD
 *   - 列表按 updated_at desc
 *   - get 返回固定 lock_status: { locked: false, holder: null }
 *     (canvas/utils/canvasStorage 兼容此结构)
 */

const DB_NAME = 'ai-canvas-oss'
const DB_VERSION = 1
const STORE = 'canvases'

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('updated_at', 'updated_at', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx(mode = 'readonly') {
  return openDB().then(db => db.transaction(STORE, mode).objectStore(STORE))
}

function uuid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `c-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

function nowIso() { return new Date().toISOString() }

export const canvasStoreLocal = {
  // opts.scope 在本地单用户场景下无意义,忽略
  list: async (_opts) => {
    const store = await tx()
    return new Promise((resolve, reject) => {
      const req = store.getAll()
      req.onsuccess = () => {
        const all = (req.result || []).slice()
        all.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
        resolve(all.map(({ id, name, updated_at }) => ({ id, name, updated_at })))
      }
      req.onerror = () => reject(req.error)
    })
  },

  create: async (name) => {
    const record = {
      id: uuid(),
      name: name || '未命名画布',
      canvas: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      updated_at: nowIso(),
    }
    const store = await tx('readwrite')
    return new Promise((resolve, reject) => {
      const req = store.add(record)
      req.onsuccess = () => resolve({ id: record.id, name: record.name, updated_at: record.updated_at })
      req.onerror = () => reject(req.error)
    })
  },

  get: async (id) => {
    const store = await tx()
    return new Promise((resolve, reject) => {
      const req = store.get(id)
      req.onsuccess = () => {
        const rec = req.result
        if (!rec) return resolve(null)
        resolve({
          id: rec.id,
          name: rec.name,
          canvas: rec.canvas || { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
          // 本地存储无协作锁,固定返回"无人持锁"让 useEditLock 走自动获取分支
          lock_status: { locked: false, holder: null },
        })
      }
      req.onerror = () => reject(req.error)
    })
  },

  rename: async (id, name) => {
    const store = await tx('readwrite')
    return new Promise((resolve, reject) => {
      const getReq = store.get(id)
      getReq.onsuccess = () => {
        const rec = getReq.result
        if (!rec) return reject(new Error(`canvas ${id} not found`))
        rec.name = name
        rec.updated_at = nowIso()
        const putReq = store.put(rec)
        putReq.onsuccess = () => resolve()
        putReq.onerror = () => reject(putReq.error)
      }
      getReq.onerror = () => reject(getReq.error)
    })
  },

  delete: async (id) => {
    const store = await tx('readwrite')
    return new Promise((resolve, reject) => {
      const req = store.delete(id)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  },

  saveCanvas: async (id, data) => {
    const store = await tx('readwrite')
    return new Promise((resolve, reject) => {
      const getReq = store.get(id)
      getReq.onsuccess = () => {
        const rec = getReq.result || { id, name: '未命名画布' }
        rec.canvas = data
        rec.updated_at = nowIso()
        const putReq = store.put(rec)
        putReq.onsuccess = () => resolve()
        putReq.onerror = () => reject(putReq.error)
      }
      getReq.onerror = () => reject(getReq.error)
    })
  },

  // 本地单用户存储,无创建者过滤能力
  capabilities: { scopeMine: false },
}
