/**
 * tabSession 单测
 *
 * 运行: node --test src/utils/tabSession.test.js
 *
 * 这是 jsdom-free 的单测——我们用 globalThis 注入一个最小 sessionStorage / window mock。
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// ── Mock sessionStorage / window（必须在 import 模块前注入）──
const storage = new Map()
globalThis.sessionStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear(),
}

// 记录 beforeunload 监听器的装/卸调用，供 appReady 守卫测试使用
const addEventListenerCalls = []
const removeEventListenerCalls = []
globalThis.window = {
  addEventListener: (event, handler) => addEventListenerCalls.push({ event, handler }),
  removeEventListener: (event, handler) => removeEventListenerCalls.push({ event, handler }),
}

const PENDING_KEY = 'ai-tools-pending-requests'
const MAX_AGE = 2 * 60 * 60 * 1000 // 与实现一致

// 动态 import 确保 mock 先生效
const {
  registerPendingRequest,
  unregisterPendingRequest,
  hasPendingRequests,
  getPendingRequestsCount,
  getPendingRequests,
  markAppReady,
} = await import('./tabSession.js')

beforeEach(() => {
  storage.clear()
  addEventListenerCalls.length = 0
  removeEventListenerCalls.length = 0
})

test('新注册的请求会被 hasPendingRequests 看到', () => {
  registerPendingRequest('req_1', { appId: 'ai-canvas' })
  assert.equal(hasPendingRequests(), true)
  assert.equal(getPendingRequestsCount(), 1)
})

test('过期记录被 hasPendingRequests 跳过（视作 false）', () => {
  storage.set(
    PENDING_KEY,
    JSON.stringify({
      stale_1: { appId: 'x', registeredAt: Date.now() - 3 * 60 * 60 * 1000 },
    }),
  )
  assert.equal(hasPendingRequests(), false)
  assert.equal(getPendingRequestsCount(), 0)
})

test('过期记录被 getPendingRequests 副作用清理出 sessionStorage', () => {
  storage.set(
    PENDING_KEY,
    JSON.stringify({
      stale_1: { appId: 'x', registeredAt: Date.now() - 3 * 60 * 60 * 1000 },
      fresh_1: { appId: 'y', registeredAt: Date.now() - 60 * 1000 },
    }),
  )
  const result = getPendingRequests()
  assert.equal(result.length, 1)
  assert.equal(result[0].requestId, 'fresh_1')
  const persisted = JSON.parse(storage.get(PENDING_KEY))
  assert.deepEqual(Object.keys(persisted), ['fresh_1'])
})

test('正常注册→注销链路不受影响', () => {
  registerPendingRequest('req_a')
  registerPendingRequest('req_b')
  assert.equal(getPendingRequestsCount(), 2)
  unregisterPendingRequest('req_a')
  assert.equal(getPendingRequestsCount(), 1)
  assert.equal(getPendingRequests()[0].requestId, 'req_b')
})

test('恰好低于阈值的记录保留，恰好超过的被剔除', () => {
  const justBelow = Date.now() - (MAX_AGE - 1000)  // 比阈值早 1s（仍在窗口内）
  const justOver = Date.now() - (MAX_AGE + 1000)   // 比阈值早 1s（已过期）
  storage.set(
    PENDING_KEY,
    JSON.stringify({
      keep_me: { appId: 'x', registeredAt: justBelow },
      drop_me: { appId: 'y', registeredAt: justOver },
    }),
  )
  const result = getPendingRequests()
  assert.equal(result.length, 1)
  assert.equal(result[0].requestId, 'keep_me')
})

// ──────────────────────────────────────────────────────────────
// appReady 守卫：beforeunload 监听器仅在 markAppReady() 之后装
// ──────────────────────────────────────────────────────────────

test('appReady=false 时，即使有 pending 记录也不装 beforeunload 监听器', () => {
  // ⚠ 本 test 依赖 appReady 模块初始值为 false（默认）。
  // 必须在任何调用 markAppReady() 的 test 之前运行——test 7 调了 markAppReady()，
  // 不可颠倒顺序。
  // 直接往 storage 写一条新鲜（非过期）记录，避免触发 registerPendingRequest 路径
  storage.set(
    PENDING_KEY,
    JSON.stringify({
      req_a: { appId: 'ai-canvas', registeredAt: Date.now() },
    }),
  )
  // 任何会触发 updateBeforeUnloadHandler 的公开操作都跑一遍
  hasPendingRequests()
  registerPendingRequest('req_b')
  // 整个流程不应装上 beforeunload 监听器
  const beforeunloadAdds = addEventListenerCalls.filter(c => c.event === 'beforeunload')
  assert.equal(beforeunloadAdds.length, 0,
    'appReady=false 时不应装 beforeunload 监听器；实际装了 ' + beforeunloadAdds.length + ' 次')
})

test('markAppReady() 后再有 pending 记录会装上 beforeunload 监听器', () => {
  markAppReady()
  // markAppReady 本身会跑一次 updateBeforeUnloadHandler；此时 storage 还是空的，不应装
  let beforeunloadAdds = addEventListenerCalls.filter(c => c.event === 'beforeunload')
  assert.equal(beforeunloadAdds.length, 0, 'markAppReady 时 storage 为空，不该装')

  // 注册一个新请求 → 装上
  registerPendingRequest('req_after_ready')
  beforeunloadAdds = addEventListenerCalls.filter(c => c.event === 'beforeunload')
  assert.equal(beforeunloadAdds.length, 1, '注册后应装 1 次 beforeunload 监听器')

  // 注销 → 卸下
  unregisterPendingRequest('req_after_ready')
  const beforeunloadRemoves = removeEventListenerCalls.filter(c => c.event === 'beforeunload')
  assert.equal(beforeunloadRemoves.length, 1, '注销后应卸 1 次 beforeunload 监听器')

  // NOTE: markAppReady() 设置模块级 appReady=true，此后所有 tests appReady 均为 true。
  // 如需添加 appReady=false 场景的 test，必须放在本 test 之前。
})
