// src/capabilities/tool/capcut-draft/capcutClient.test.js
// 运行: node --test src/capabilities/tool/capcut-draft/capcutClient.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { discoverPort, submitDraft, pollTaskOnce, runTaskPollingLoop, __setHttpForTests, __resetHttpForTests, PORT_RANGE, LS_PORT_KEY, CapcutServiceNotRunningError, DraftConflictError, InvalidSpecError, TaskNotFoundError } from './capcutClient.js'

// localStorage shim(node:test 无浏览器环境)
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => store.has(k) ? store.get(k) : null,
  setItem: (k, v) => store.set(k, String(v)),
  clear: () => store.clear(),
  removeItem: (k) => store.delete(k),
}

// 简易 mock 工厂:按顺序返回预设响应,Error 实例会被 throw
function makeMockGet(responses) {
  let i = 0
  return async () => {
    const resp = responses[i++]
    if (resp instanceof Error) throw resp
    return resp
  }
}

test('discoverPort · 从头探测 9527 命中 → 返回 {port, health}', async () => {
  store.clear()
  const healthData = { service: 'capcut_helper', version: '0.1.7', port: 9527, cors_allowed: true, has_update: false }
  __setHttpForTests({ get: makeMockGet([healthData]) })
  try {
    const result = await discoverPort()
    assert.deepEqual(result, { port: 9527, health: healthData })
    assert.equal(localStorage.getItem(LS_PORT_KEY), '9527')
  } finally {
    __resetHttpForTests()
  }
})

test('discoverPort · localStorage 有保存端口 → 优先试该端口、返回 {port, health}', async () => {
  store.clear()
  store.set(LS_PORT_KEY, '9530')
  let capturedUrl = null
  __setHttpForTests({
    get: async (url) => {
      capturedUrl = url
      return { service: 'capcut_helper', version: '0.1.5', port: 9530 }
    },
  })
  try {
    const result = await discoverPort()
    assert.equal(result.port, 9530)
    assert.equal(result.health.version, '0.1.5')
    assert.ok(capturedUrl.includes('9530'))
  } finally {
    __resetHttpForTests()
  }
})

test('discoverPort · service 字段不是 capcut_helper → 不认,继续试', async () => {
  store.clear()
  __setHttpForTests({ get: makeMockGet([{ service: 'other-app' }, { service: 'capcut_helper', version: '0.1.0' }]) })
  try {
    const result = await discoverPort()
    assert.equal(result.port, PORT_RANGE[1])
    assert.equal(result.health.version, '0.1.0')
  } finally {
    __resetHttpForTests()
  }
})

test('discoverPort · 全段探测不到 → 抛 CapcutServiceNotRunningError', async () => {
  store.clear()
  __setHttpForTests({ get: async () => { throw new Error('network') } })
  try {
    await assert.rejects(discoverPort(), CapcutServiceNotRunningError)
  } finally {
    __resetHttpForTests()
  }
})

test('discoverPort · 老 helper 只返回 service + port → health 仍可用、其他字段 undefined', async () => {
  store.clear()
  __setHttpForTests({ get: makeMockGet([{ service: 'capcut_helper', port: 9527 }]) })
  try {
    const result = await discoverPort()
    assert.equal(result.port, 9527)
    assert.equal(result.health.service, 'capcut_helper')
    assert.equal(result.health.version, undefined)
    assert.equal(result.health.has_update, undefined)
    assert.equal(result.health.cors_allowed, undefined)
  } finally {
    __resetHttpForTests()
  }
})

test('discoverPort · PORT_RANGE 是 9527..9536', () => {
  assert.equal(PORT_RANGE[0], 9527)
  assert.equal(PORT_RANGE[PORT_RANGE.length - 1], 9536)
  assert.equal(PORT_RANGE.length, 10)
})

test('submitDraft · 成功 → 返回 {task_id, stream_url}', async () => {
  const spec = { draft_name: 'demo', canvas: { width: 1920, height: 1080, fps: 30 }, tracks: [] }
  let capturedUrl = null
  let capturedBody = null
  __setHttpForTests({
    post: async (url, body) => {
      capturedUrl = url
      capturedBody = body
      return { task_id: 'abc123', stream_url: '/api/v1/tasks/abc123/stream' }
    },
  })
  try {
    const result = await submitDraft(9527, spec)
    assert.deepEqual(result, { task_id: 'abc123', stream_url: '/api/v1/tasks/abc123/stream' })
    assert.equal(capturedUrl, 'http://localhost:9527/api/v1/drafts')
    assert.deepEqual(capturedBody, spec)
  } finally {
    __resetHttpForTests()
  }
})

test('submitDraft · helper 不返回 stream_url → 兜底拼 /api/v1/tasks/{id}/stream', async () => {
  __setHttpForTests({
    post: async () => ({ task_id: 'xyz789' }),  // 老 helper 没 stream_url
  })
  try {
    const result = await submitDraft(9527, {})
    assert.equal(result.stream_url, '/api/v1/tasks/xyz789/stream')
    assert.equal(result.task_id, 'xyz789')
  } finally {
    __resetHttpForTests()
  }
})

test('submitDraft · HTTP 409 / code 1002(重名)→ 抛 DraftConflictError', async () => {
  const err = new Error('请求失败 (409): 重名')
  err.status = 409
  err.code = 1002
  __setHttpForTests({ post: async () => { throw err } })
  try {
    await assert.rejects(submitDraft(9527, {}), (e) => {
      assert.equal(e.name, 'DraftConflictError')
      return true
    })
  } finally {
    __resetHttpForTests()
  }
})

test('submitDraft · HTTP 422 → 抛 InvalidSpecError', async () => {
  const err = new Error('请求失败 (422): bad')
  err.status = 422
  err.code = 422
  err.data = { fields: { 'tracks.0': 'empty' } }
  __setHttpForTests({ post: async () => { throw err } })
  try {
    await assert.rejects(submitDraft(9527, {}), (e) => {
      assert.equal(e.name, 'InvalidSpecError')
      return true
    })
  } finally {
    __resetHttpForTests()
  }
})

test('pollTaskOnce · 正常返回 → 返回任务对象(字段名 id,不是 task_id)', async () => {
  __setHttpForTests({ get: makeMockGet([{ id: 'abc123', status: 'downloading', progress: 30, result: null, error: null }]) })
  try {
    const task = await pollTaskOnce(9527, 'abc123')
    assert.deepEqual(task, { id: 'abc123', status: 'downloading', progress: 30, result: null, error: null })
  } finally {
    __resetHttpForTests()
  }
})

test('pollTaskOnce · HTTP 404 / code 1003 → 抛 TaskNotFoundError', async () => {
  const err = new Error('请求失败 (404)')
  err.status = 404
  err.code = 1003
  __setHttpForTests({ get: async () => { throw err } })
  try {
    await assert.rejects(pollTaskOnce(9527, 'unknown'), (e) => {
      assert.equal(e.name, 'TaskNotFoundError')
      return true
    })
  } finally {
    __resetHttpForTests()
  }
})

test('runTaskPollingLoop · done 时 resolve(result)', async () => {
  let progressCalled = null
  __setHttpForTests({
    get: makeMockGet([
      { id: 't', status: 'downloading', progress: 30 },
      { id: 't', status: 'done', progress: 100, result: '/path/to/draft', error: null },
    ]),
  })
  try {
    const result = await runTaskPollingLoop(9527, 't', {
      onProgress: (task) => { progressCalled = task },
      intervalMs: 10,
    })
    assert.equal(result, '/path/to/draft')
    assert.equal(progressCalled.status, 'downloading')
    assert.equal(progressCalled.progress, 30)
  } finally {
    __resetHttpForTests()
  }
})

test('runTaskPollingLoop · failed 时 reject', async () => {
  __setHttpForTests({ get: makeMockGet([{ id: 't', status: 'failed', error: '素材下载失败:clip1.mp4' }]) })
  try {
    await assert.rejects(
      runTaskPollingLoop(9527, 't', { intervalMs: 10 }),
      /素材下载失败:clip1\.mp4/,
    )
  } finally {
    __resetHttpForTests()
  }
})

test('runTaskPollingLoop · signal abort → 抛 AbortError', async () => {
  __setHttpForTests({ get: async () => ({ id: 't', status: 'downloading', progress: 30 }) })
  const controller = new AbortController()
  setTimeout(() => controller.abort(), 30)
  try {
    await assert.rejects(
      runTaskPollingLoop(9527, 't', { intervalMs: 10, signal: controller.signal }),
      /abort/i,
    )
  } finally {
    __resetHttpForTests()
  }
})

// === streamTask 测试 ===
// 用一个可控的 mock EventSource 替换 globalThis.EventSource
class MockEventSource {
  constructor(url) {
    this.url = url
    this.closed = false
    this.handlers = {}
    MockEventSource.instances.push(this)
  }
  addEventListener(name, fn) { this.handlers[name] = fn }
  set onerror(fn) { this.handlers.error = fn }
  close() { this.closed = true }
  // 测试用：手动触发事件
  __emit(name, data) {
    const e = name === 'error' ? {} : { data: JSON.stringify(data) }
    this.handlers[name]?.(e)
  }
}
MockEventSource.instances = []

test('streamTask · progress 事件 → onProgress 收到 task 对象', async () => {
  MockEventSource.instances = []
  globalThis.EventSource = MockEventSource
  const { streamTask } = await import('./capcutClient.js')

  const received = []
  streamTask(9527, '/api/v1/tasks/abc/stream', {
    onProgress: (task) => received.push(task),
  })
  const es = MockEventSource.instances[0]
  es.__emit('progress', { id: 'abc', status: 'downloading', progress: 30 })
  es.__emit('progress', { id: 'abc', status: 'downloading', progress: 60 })

  assert.equal(received.length, 2)
  assert.equal(received[0].progress, 30)
  assert.equal(received[1].progress, 60)
  assert.equal(es.url, 'http://localhost:9527/api/v1/tasks/abc/stream')
})

test('streamTask · done 事件 → onDone 收到 task + 自动 close', async () => {
  MockEventSource.instances = []
  globalThis.EventSource = MockEventSource
  const { streamTask } = await import('./capcutClient.js')

  let doneTask = null
  streamTask(9527, '/api/v1/tasks/abc/stream', {
    onDone: (task) => { doneTask = task },
  })
  const es = MockEventSource.instances[0]
  es.__emit('done', { id: 'abc', status: 'done', result: '/path/to/draft' })

  assert.equal(doneTask?.status, 'done')
  assert.equal(doneTask?.result, '/path/to/draft')
  assert.equal(es.closed, true)
})

test('streamTask · error → onError 触发，不重连', async () => {
  MockEventSource.instances = []
  globalThis.EventSource = MockEventSource
  const { streamTask } = await import('./capcutClient.js')

  let errored = false
  streamTask(9527, '/api/v1/tasks/abc/stream', {
    onError: () => { errored = true },
  })
  const es = MockEventSource.instances[0]
  es.__emit('error')

  assert.equal(errored, true)
  // EventSource 自带重连——本函数不主动 close，由 onError 决定（如降级到轮询）
  assert.equal(es.closed, false)
})

test('streamTask · signal abort → es.close() + 返回的 cleanup 也可安全调', async () => {
  MockEventSource.instances = []
  globalThis.EventSource = MockEventSource
  const { streamTask } = await import('./capcutClient.js')

  const controller = new AbortController()
  const cleanup = streamTask(9527, '/api/v1/tasks/abc/stream', {
    signal: controller.signal,
  })
  const es = MockEventSource.instances[0]
  assert.equal(es.closed, false)
  controller.abort()
  assert.equal(es.closed, true)
  cleanup()  // 二次调用不应抛
})

test('streamTask · 启动前 signal 已 abort → 不构造 EventSource、不订阅', async () => {
  MockEventSource.instances = []
  globalThis.EventSource = MockEventSource
  const { streamTask } = await import('./capcutClient.js')

  const controller = new AbortController()
  controller.abort()
  streamTask(9527, '/api/v1/tasks/abc/stream', { signal: controller.signal })
  // 不应构造 EventSource — 跳过浏览器一次无效 TCP 连接
  assert.equal(MockEventSource.instances.length, 0)
})
