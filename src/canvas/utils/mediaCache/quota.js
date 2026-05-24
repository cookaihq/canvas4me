/**
 * 配额监控与容量管理
 *
 * 策略：
 *  - 应用初始化时申请持久化权限（navigator.storage.persist），避免被浏览器自动清除
 *  - 每次写入前读取 navigator.storage.estimate()：
 *    - usage / quota ≥ 0.5 → 弹一次会话级提醒（通知用户清理）
 *    - usage / quota ≥ 0.8 → 暂停写入，触发 LRU 淘汰到 0.6
 *  - LRU：按 entries.lastUsedAt 升序删除，直至目标使用率
 */

import { notification } from 'antd'
import { entries } from './db'
import { cacheDelete } from './cache'

const WARN_THRESHOLD = 0.5
const PAUSE_THRESHOLD = 0.8
const EVICT_TARGET = 0.6
const SESSION_WARN_KEY = 'ai-canvas:cache-warned'

let persistRequested = false

/** 申请持久化权限（整个会话只申请一次） */
export async function ensurePersistentStorage() {
  if (persistRequested) return
  persistRequested = true
  try {
    if (navigator.storage?.persisted && navigator.storage?.persist) {
      const already = await navigator.storage.persisted()
      if (!already) {
        const granted = await navigator.storage.persist()
        console.log(`[MediaCache] 持久化存储: ${granted ? '已授权' : '未授权，可能被自动清理'}`)
      }
    }
  } catch (err) {
    console.warn('[MediaCache] 持久化申请失败', err)
  }
}

/** 读当前配额使用情况 */
export async function readQuotaStatus() {
  if (!navigator.storage?.estimate) {
    return { usage: 0, quota: 0, ratio: 0, supported: false }
  }
  try {
    const est = await navigator.storage.estimate()
    const usage = est.usage || 0
    const quota = est.quota || 0
    const ratio = quota > 0 ? usage / quota : 0
    return { usage, quota, ratio, supported: true }
  } catch {
    return { usage: 0, quota: 0, ratio: 0, supported: false }
  }
}

/** 写入前检查：返回是否允许写入 */
export async function shouldAllowWrite() {
  const { ratio, supported } = await readQuotaStatus()
  if (!supported) return true
  return ratio < PAUSE_THRESHOLD
}

/**
 * 配额告警：≥50% 时弹一次 notification（当会话去重）
 * 由调用方决定何时检查（通常在写入后或应用启动时）
 */
export async function checkQuotaAndWarn() {
  const status = await readQuotaStatus()
  if (!status.supported) return status

  if (status.ratio >= WARN_THRESHOLD) {
    const warned = sessionStorage.getItem(SESSION_WARN_KEY)
    if (!warned) {
      sessionStorage.setItem(SESSION_WARN_KEY, '1')
      notification.warning({
        message: 'AI 画布缓存占用已达 50%',
        description: (
          `浏览器为本站分配的存储空间已使用 ${formatMB(status.usage)} / ${formatMB(status.quota)}` +
          `（${(status.ratio * 100).toFixed(0)}%）。建议前往 AI 画布 → 设置 → 缓存管理清理不再需要的画布缓存。`
        ),
        duration: 0,
        placement: 'topRight',
      })
    }
  }
  return status
}

/** 重置告警（用户清理后调用，下次达到阈值可再提醒） */
export function resetQuotaWarning() {
  sessionStorage.removeItem(SESSION_WARN_KEY)
}

/**
 * LRU 淘汰到目标使用率
 * 按 entries.lastUsedAt 升序（最久未用）逐个删除
 * @returns { removed, freedBytes }
 */
export async function runLruEviction(targetRatio = EVICT_TARGET) {
  const all = await entries.getAll()
  all.sort((a, b) => (a.lastUsedAt || 0) - (b.lastUsedAt || 0))

  let removed = 0
  let freedBytes = 0
  for (const entry of all) {
    const status = await readQuotaStatus()
    if (!status.supported) break
    if (status.ratio <= targetRatio) break

    try {
      await cacheDelete(entry.url)
      await entries.delete(entry.url)
      removed += 1
      freedBytes += entry.bytes || 0
    } catch (err) {
      console.warn('[MediaCache] LRU 删除失败', entry.url, err)
    }
  }
  if (removed > 0) {
    console.log(`[MediaCache] LRU 淘汰完成：清理 ${removed} 个条目，释放 ${formatMB(freedBytes)}`)
  }
  return { removed, freedBytes }
}

/** 写入后的统一后置处理：告警 + 必要时淘汰 */
export async function postWriteQuotaCheck() {
  const status = await readQuotaStatus()
  if (!status.supported) return
  if (status.ratio >= WARN_THRESHOLD) {
    checkQuotaAndWarn().catch(() => {})
  }
  if (status.ratio >= PAUSE_THRESHOLD) {
    runLruEviction(EVICT_TARGET).catch(err => {
      console.warn('[MediaCache] LRU 执行失败', err)
    })
  }
}

function formatMB(bytes) {
  if (!bytes) return '0MB'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`
}
