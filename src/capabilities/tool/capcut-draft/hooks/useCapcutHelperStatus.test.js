// src/capabilities/tool/capcut-draft/hooks/useCapcutHelperStatus.test.js
// 运行: node --test src/capabilities/tool/capcut-draft/hooks/useCapcutHelperStatus.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runHelperStatusLoop } from './useCapcutHelperStatus.js'

// localStorage shim（node:test 无浏览器环境；discoverPort 内部会读写 localStorage）
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => store.has(k) ? store.get(k) : null,
  setItem: (k, v) => store.set(k, String(v)),
  clear: () => store.clear(),
  removeItem: (k) => store.delete(k),
}

const mockHealth = { service: 'capcut_helper', version: '0.1.7', port: 9527, cors_allowed: true }

test('runHelperStatusLoop · 探测成功 → onResult({status:online, health}) + 按 onlineDelayMs 排下一次', async () => {
  store.clear()
  const results = []
  let probeCount = 0
  const probe = async () => {
    probeCount += 1
    return { port: 9527, health: mockHealth }
  }
  const controller = new AbortController()
  setTimeout(() => controller.abort(), 50)
  await runHelperStatusLoop({
    signal: controller.signal,
    onResult: (r) => results.push(r),
    probe,
    onlineDelayMs: 20,
    offlineDelayMs: 100,
  })
  assert.ok(results.length >= 2, `期望 ≥2 次回调，实际 ${results.length}`)
  for (const r of results) {
    assert.equal(r.status, 'online')
    assert.equal(r.health.version, '0.1.7')
  }
  assert.ok(probeCount >= 2)
})

test('runHelperStatusLoop · 探测失败 → onResult({status:offline, health:undefined}) + 按 offlineDelayMs', async () => {
  store.clear()
  const results = []
  let probeCount = 0
  const probe = async () => {
    probeCount += 1
    throw new Error('not running')
  }
  const controller = new AbortController()
  setTimeout(() => controller.abort(), 80)
  await runHelperStatusLoop({
    signal: controller.signal,
    onResult: (r) => results.push(r),
    probe,
    onlineDelayMs: 10,
    offlineDelayMs: 30,
  })
  assert.ok(results.length >= 2, `期望 ≥2 次回调，实际 ${results.length}`)
  for (const r of results) {
    assert.equal(r.status, 'offline')
    assert.equal(r.health, undefined)
  }
  assert.ok(probeCount >= 2 && probeCount <= 4)
})

test('runHelperStatusLoop · 在线/离线交替 → 间隔按当前结果切换', async () => {
  store.clear()
  const results = []
  let probeCount = 0
  const probe = async () => {
    probeCount += 1
    if (probeCount === 2) throw new Error('flaky')
    return { port: 9527, health: mockHealth }
  }
  const controller = new AbortController()
  setTimeout(() => controller.abort(), 70)
  await runHelperStatusLoop({
    signal: controller.signal,
    onResult: (r) => results.push(r),
    probe,
    onlineDelayMs: 10,
    offlineDelayMs: 40,
  })
  const statuses = results.map(r => r.status)
  assert.ok(statuses.includes('online'))
  assert.ok(statuses.includes('offline'))
  assert.ok(probeCount >= 3)
})

test('runHelperStatusLoop · 老 helper 字段缺失 → health 透传不崩', async () => {
  store.clear()
  const results = []
  const probe = async () => ({ port: 9527, health: { service: 'capcut_helper', port: 9527 } })
  const controller = new AbortController()
  setTimeout(() => controller.abort(), 30)
  await runHelperStatusLoop({
    signal: controller.signal,
    onResult: (r) => results.push(r),
    probe,
    onlineDelayMs: 10,
    offlineDelayMs: 100,
  })
  assert.ok(results.length >= 1)
  assert.equal(results[0].health.version, undefined)
  assert.equal(results[0].health.has_update, undefined)
})

test('runHelperStatusLoop · signal 在 sleep 中 abort → 干净退出', async () => {
  store.clear()
  let probeCount = 0
  const probe = async () => { probeCount += 1; return { port: 9527, health: mockHealth } }
  const controller = new AbortController()
  setTimeout(() => controller.abort(), 30)
  await runHelperStatusLoop({
    signal: controller.signal,
    onResult: () => {},
    probe,
    onlineDelayMs: 1000,
    offlineDelayMs: 1000,
  })
  assert.equal(probeCount, 1)
})

test('runHelperStatusLoop · 启动前 signal 已 abort → 立即返回', async () => {
  store.clear()
  let probeCount = 0
  const probe = async () => { probeCount += 1; return { port: 9527, health: mockHealth } }
  const controller = new AbortController()
  controller.abort()
  await runHelperStatusLoop({
    signal: controller.signal,
    onResult: () => {},
    probe,
    onlineDelayMs: 10,
    offlineDelayMs: 10,
  })
  assert.equal(probeCount, 0)
})
