/**
 * Settings 本地实现 — localStorage + key prefix。
 * 实现 src/platform/interfaces/Settings.js 契约(object 形态)。
 *
 * key 命名:
 *   - 全局 settings: ai-canvas:settings:global  (整个对象 JSON)
 *   - 应用 settings: ai-canvas:settings:app:{appId} (整个对象 JSON)
 */

const KEY_GLOBAL = 'ai-canvas:settings:global'
const PREFIX_APP = 'ai-canvas:settings:app:'

function readObject(key) {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeObject(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value || {}))
  } catch (err) {
    console.warn('[Settings.localStorage] write failed:', err.message)
  }
}

const listeners = new Set()

function notify(payload) {
  for (const fn of listeners) {
    try { fn(payload) } catch { /* ignore listener errors */ }
  }
}

export const settingsLocal = {
  getGlobal: async () => readObject(KEY_GLOBAL),
  updateGlobal: async (updates) => {
    const current = readObject(KEY_GLOBAL)
    writeObject(KEY_GLOBAL, { ...current, ...(updates || {}) })
    notify({ scope: 'global' })
  },
  getApp: async (appId) => readObject(PREFIX_APP + appId),
  updateApp: async (appId, updates) => {
    const key = PREFIX_APP + appId
    const current = readObject(key)
    writeObject(key, { ...current, ...(updates || {}) })
    notify({ scope: 'app', appId })
  },
  onChange: (handler) => {
    listeners.add(handler)
    return () => listeners.delete(handler)
  },
}
