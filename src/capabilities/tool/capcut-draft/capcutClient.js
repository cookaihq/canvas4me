// src/capabilities/tool/capcut-draft/capcutClient.js
// 本机 capcut_helper 桌面服务调用封装(端口探测 + 提交草稿 + 轮询任务)。
// 协议详见 capcut_helper/backend/docs/CALLER_GUIDE.md。

// 默认绑定运行时实现:首次调用时懒加载 @/utils/request,避免 Node 测试环境加载失败。
// 测试通过 __setHttpForTests 注入 mock,不会触发懒加载路径。
let _get = async (...args) => {
  const { get } = await import('@/utils/request')
  _get = get
  return get(...args)
}
let _post = async (...args) => {
  const { post } = await import('@/utils/request')
  _post = post
  return post(...args)
}

/** 仅供测试用:覆盖底层 HTTP 函数。生产代码不要调。 */
export function __setHttpForTests({ get, post } = {}) {
  if (get) _get = get
  if (post) _post = post
}

/** 仅供测试用:恢复默认实现。每个 test 的 finally 里调用防污染。 */
export function __resetHttpForTests() {
  _get = async (...args) => {
    const { get } = await import('@/utils/request')
    _get = get
    return get(...args)
  }
  _post = async (...args) => {
    const { post } = await import('@/utils/request')
    _post = post
    return post(...args)
  }
}

export const PORT_RANGE = Array.from({ length: 10 }, (_, i) => 9527 + i)
export const LS_PORT_KEY = 'capcut_helper_port'
const HEALTH_TIMEOUT_MS = 500

export class CapcutServiceNotRunningError extends Error {
  constructor() {
    super('capcut_helper 未运行,请启动桌面应用')
    this.name = 'CapcutServiceNotRunningError'
  }
}

// 在端口段 9527-9536 里探测 capcut_helper 服务。先试 localStorage 里上次成功的端口,
// 再依次试整段。每个端口短超时 500ms。整段都没找到 → 抛 CapcutServiceNotRunningError。
// 返回 {port, health}：port 是命中的端口号，health 是 /api/v1/health 返回的 data 原样
// （含 service/version/cors_allowed/has_update/trust_url/hint/release_url/latest_version 等，
// 老 helper 可能字段不全，调用方需 ?. 容忍）。
export async function discoverPort() {
  const saved = localStorage.getItem(LS_PORT_KEY)
  const savedNum = saved ? Number(saved) : null
  const candidates = savedNum && PORT_RANGE.includes(savedNum)
    ? [savedNum, ...PORT_RANGE.filter(p => p !== savedNum)]
    : [...PORT_RANGE]

  for (const port of candidates) {
    try {
      const data = await _get(`http://localhost:${port}/api/v1/health`, {
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
        expectApiResponse: true,
        skipLog: true,
      })
      if (data?.service === 'capcut_helper') {
        localStorage.setItem(LS_PORT_KEY, String(port))
        return { port, health: data }
      }
    } catch {
      // 该端口没服务/超时/错误响应,继续试下一个
    }
  }
  throw new CapcutServiceNotRunningError()
}

export class DraftConflictError extends Error {
  constructor(message) {
    super(message || '已存在同名草稿')
    this.name = 'DraftConflictError'
  }
}

export class InvalidSpecError extends Error {
  constructor(message, fieldErrors) {
    super(message || '时间线规格非法')
    this.name = 'InvalidSpecError'
    this.fieldErrors = fieldErrors
  }
}

export class TaskNotFoundError extends Error {
  constructor() {
    super('与 capcut_helper 的连接中断,请重试')
    this.name = 'TaskNotFoundError'
  }
}

// POST /api/v1/drafts，返回 {task_id, stream_url}。
// stream_url 是 helper 给的 SSE 端点路径（相对路径，如 /api/v1/tasks/{id}/stream），
// 调用方拼上 http://localhost:{port} 后用 EventSource 订阅实时进度。
export async function submitDraft(port, spec) {
  try {
    const data = await _post(
      `http://localhost:${port}/api/v1/drafts`,
      spec,
      { expectApiResponse: true, skipLog: true },
    )
    if (!data?.task_id) {
      throw new Error('capcut_helper 响应缺少 task_id')
    }
    return {
      task_id: data.task_id,
      stream_url: data.stream_url || `/api/v1/tasks/${data.task_id}/stream`,
    }
  } catch (err) {
    // 重名:HTTP 409 / code 1002
    if (err?.status === 409 || err?.code === 1002) {
      throw new DraftConflictError(err.message)
    }
    // 规格非法:HTTP 422
    if (err?.status === 422 || err?.code === 422) {
      throw new InvalidSpecError(err.message, err?.data?.fields)
    }
    throw err
  }
}

// GET /api/v1/tasks/{task_id}。返回任务对象(注意:字段名 data.id,不是 data.task_id)。
export async function pollTaskOnce(port, taskId) {
  try {
    return await _get(
      `http://localhost:${port}/api/v1/tasks/${encodeURIComponent(taskId)}`,
      { expectApiResponse: true, skipLog: true },
    )
  } catch (err) {
    if (err?.status === 404 || err?.code === 1003) {
      throw new TaskNotFoundError()
    }
    throw err
  }
}

// 持续轮询,直到 done(返回 result 字符串)或 failed(抛 error)。
// onProgress:每次拿到非终态时回调 ({status, progress})。
// intervalMs:轮询间隔,默认 1500。
// signal:AbortSignal,用于外部取消(切节点 / 关页面)。
export async function runTaskPollingLoop(port, taskId, { onProgress, intervalMs = 1500, signal } = {}) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (signal?.aborted) {
      const err = new Error('轮询已取消')
      err.name = 'AbortError'
      throw err
    }
    const task = await pollTaskOnce(port, taskId)
    if (task.status === 'done') {
      return task.result
    }
    if (task.status === 'failed') {
      throw new Error(task.error || '生成草稿失败')
    }
    onProgress?.(task)
    await sleep(intervalMs, signal)
  }
}

// 订阅 helper SSE /api/v1/tasks/{id}/stream 实时拿任务进度。
// 抄 helper connector-examples.html 参考实现，加 abort signal 支持。
//
// onProgress(task)：每次状态/字节进度变化触发；task 是 helper 推送的完整对象
//                   （含 subtasks 数组）
// onDone(task)：    任务终态（done/failed）触发，函数内部自动 es.close()
// onError(e)：      EventSource 异常触发（首次连接失败、协议错误等）；
//                   函数本身不重连、不 close（EventSource 自带重连），
//                   由调用方在 onError 里决定如何降级（如切到 runTaskPollingLoop）
//
// 返回 cleanup 函数，调用方主动取消时用（如组件卸载）。
// signal 触发 abort 时也自动 close。
export function streamTask(port, streamUrl, { onProgress, onDone, onError, signal } = {}) {
  // 早退在 EventSource 构造之前，避免对已 abort 的 signal 还发起一次无效 TCP 连接
  if (signal?.aborted) return () => {}

  const es = new EventSource(`http://localhost:${port}${streamUrl}`)
  const onAbort = () => es.close()
  signal?.addEventListener('abort', onAbort, { once: true })
  es.addEventListener('progress', (e) => onProgress?.(JSON.parse(e.data)))
  es.addEventListener('done', (e) => {
    es.close()
    // done 后已 close，不再需要 abort listener 占着 signal（避免长生命周期 signal 持有 es 引用）
    signal?.removeEventListener('abort', onAbort)
    onDone?.(JSON.parse(e.data))
  })
  es.onerror = (e) => onError?.(e)
  return () => es.close()
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(t)
      const err = new Error('轮询已取消')
      err.name = 'AbortError'
      reject(err)
    }
    if (signal) {
      if (signal.aborted) {
        clearTimeout(t)
        const err = new Error('轮询已取消')
        err.name = 'AbortError'
        reject(err)
        return
      }
      signal.addEventListener('abort', onAbort)
    }
  })
}
