import { useRef, useCallback, useEffect } from 'react'
import { useTaskClient } from '@/platform/provider.jsx'

const DEFAULT_INTERVAL = 10000
const DEFAULT_MAX_ATTEMPTS = 60
const DEFAULT_MAX_CONSECUTIVE_ERRORS = 5

// 后端 TaskStatus 的终态映射
// 见 ai-tools-api/app/schemas/task.py TaskStatus
const SUCCESS_STATUSES = new Set(['success', 'completed'])
const FAILURE_STATUSES = new Set([
  'failed',
  'error',
  'canceled',
  'interrupted',
  'not_found',
])
// transfer_failed 特殊处理：上游已出图，只是转存失败——不按失败终态，交给 onTransferFailed
// 由调用方决定是否自动重试转存（见 ai-canvas/docs/tasks.md 1.x）
const TRANSFER_FAILED_STATUS = 'transfer_failed'

/**
 * 异步任务轮询 Hook
 *
 * 遵循 CLAUDE.md 4.7 轮询规范：
 * - 轮询超时不修改任务状态
 * - 网络错误不计入轮询次数
 * - 刷新页面重置计数
 *
 * 扩展（路径 B 乐观提交）：
 * - 支持用 extra_task_id 作为查询 ID（后端同时匹配 task_id 和 extra_task_id）
 * - 轮询返回的 TaskStatusItem 若携带 stream_url，说明对应 LLM 任务已启动 SSE，
 *   触发 onStreamReady 回调并把该任务移出轮询队列（由上层启动 SSE 接管）
 *
 * @param {object} options
 * @param {number} options.interval - 轮询间隔（ms），默认 10000
 * @param {number} options.maxAttempts - 最大轮询次数，默认 60
 * @param {number} options.maxConsecutiveErrors - 连续网络错误上限，默认 5
 * @param {(taskId: string, result: object) => void} options.onSuccess
 * @param {(taskId: string, error: object) => void} options.onFailed
 * @param {(taskId: string, info: object) => void} options.onPollingTimeout
 * @param {(info: object) => void} options.onNetworkError
 * @param {(taskId: string, streamUrl: string) => void} options.onStreamReady -
 *   LLM 场景：返回 stream_url 时触发，调用方启动 SSE 并把该任务移出轮询队列
 * @param {(taskId: string, info: {status: string, progress: number}) => void} options.onProgress -
 *   进行态每次 tick 回调（pending/processing/transferring 等），用于把后端进度回写节点 data
 * @param {(taskId: string, result: object) => void} options.onTransferFailed -
 *   转存失败回调：上游已出图但 OSS 转存失败，result 里带原始 URL 与错误；调用方可调 retry-transfer 接口
 */
export default function useTaskPolling({
  interval = DEFAULT_INTERVAL,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  maxConsecutiveErrors = DEFAULT_MAX_CONSECUTIVE_ERRORS,
  onSuccess,
  onFailed,
  onPollingTimeout,
  onNetworkError,
  onStreamReady,
  onProgress,
  onTransferFailed,
} = {}) {
  const taskClient = useTaskClient()
  // { taskId: { localIds: Set<string>, attempts, consecutiveErrors } }
  // 同 taskId 多个 localId 共存(num_outputs > 1 时,N 个产物节点共享一次 API 调用),
  // 实际查询请求按 taskId 去重,单次结果分发给所有 localId.
  const tasksRef = useRef(new Map())
  const timerRef = useRef(null)

  // 调用方传进来的回调通常是内联箭头函数, 每次父渲染都会产生新引用. 直接把它们塞进
  // poll 的 useCallback deps 会让 poll 也每次都新, 引发下面 setInterval 那个 useEffect
  // 反复 clearInterval / setInterval (在 console 表现为 "开始轮询" 不断打印). 用 ref
  // 兜住最新的回调, poll 的依赖只剩稳定项, 保证父渲染时定时器引用不动.
  const handlersRef = useRef({})
  handlersRef.current.onSuccess = onSuccess
  handlersRef.current.onFailed = onFailed
  handlersRef.current.onPollingTimeout = onPollingTimeout
  handlersRef.current.onNetworkError = onNetworkError
  handlersRef.current.onStreamReady = onStreamReady
  handlersRef.current.onProgress = onProgress
  handlersRef.current.onTransferFailed = onTransferFailed

  const poll = useCallback(async () => {
    const tasks = tasksRef.current
    if (tasks.size === 0) return

    const taskIds = []
    const taskEntries = []
    for (const [taskId, entry] of tasks) {
      taskIds.push(taskId)
      taskEntries.push([taskId, entry])
    }

    const attemptNum = Math.max(...taskEntries.map(([, e]) => e.attempts)) + 1
    console.log(
      `[TaskPolling] 轮询中 (第 ${attemptNum} 次) - 任务数: ${taskIds.length}`,
      taskIds.join(', ')
    )

    try {
      const results = await taskClient.queryStatus(taskIds)

      // 重置所有任务的连续错误计数
      for (const entry of tasks.values()) {
        entry.consecutiveErrors = 0
      }

      for (const result of results) {
        const taskId = result.task_id
        const entry = tasks.get(taskId)
        if (!entry) continue
        const localIds = [...entry.localIds]

        // 流式 URL 优先：LLM 任务在进行态就可能返回 stream_url
        // 一旦拿到就从轮询队列移出，由上层启动 SSE 接管生命周期
        if (result.stream_url && !SUCCESS_STATUSES.has(result.status) && !FAILURE_STATUSES.has(result.status)) {
          console.log(`[TaskPolling] 任务 ${taskId} 拿到 stream_url，交由 SSE 接管`)
          tasks.delete(taskId)
          for (const localId of localIds) handlersRef.current.onStreamReady?.(localId, result.stream_url)
          continue
        }

        if (SUCCESS_STATUSES.has(result.status)) {
          console.log(`[TaskPolling] 任务 ${taskId} 完成 (${result.status}) — 分发给 ${localIds.length} 个监听节点`)
          tasks.delete(taskId)
          for (const localId of localIds) handlersRef.current.onSuccess?.(localId, result)
        } else if (result.status === TRANSFER_FAILED_STATUS) {
          console.log(`[TaskPolling] 任务 ${taskId} 转存失败，移出轮询队列，等待调用方重试`)
          tasks.delete(taskId)
          for (const localId of localIds) handlersRef.current.onTransferFailed?.(localId, result)
        } else if (FAILURE_STATUSES.has(result.status)) {
          console.log(`[TaskPolling] 任务 ${taskId} 失败 (${result.status})`)
          tasks.delete(taskId)
          for (const localId of localIds) handlersRef.current.onFailed?.(localId, result)
        } else {
          // processing / pending / transferring 等进行态 — 回写进度到节点 + 计入轮询次数
          // pollingItem / polledAt 给 Debug 面板使用,让进行态也能看到上游原始返回与最近轮询时间
          for (const localId of localIds) {
            handlersRef.current.onProgress?.(localId, {
              status: result.status,
              progress: Number.isFinite(result.progress) ? result.progress : 0,
              pollingItem: result,
              polledAt: Date.now(),
            })
          }
          entry.attempts++
          if (entry.attempts >= maxAttempts) {
            const timeDesc = `约 ${Math.round(entry.attempts * interval / 60000)} 分钟`
            console.log(
              `[TaskPolling] 任务 ${taskId} 已达到最大轮询次数 (${maxAttempts} 次，${timeDesc})，停止轮询`
            )
            tasks.delete(taskId)
            for (const localId of localIds) {
              handlersRef.current.onPollingTimeout?.(localId, {
                attempts: entry.attempts,
                maxAttempts,
                timeDescription: timeDesc,
              })
            }
          }
        }
      }

      // 处理 API 未返回的任务
      for (const [taskId, entry] of [...tasks]) {
        const found = results.some(r => r.task_id === taskId)
        if (!found) {
          entry.attempts++
          // 如果 API 没返回这个 task，说明任务可能不存在
          if (entry.attempts >= 3) {
            const localIds = [...entry.localIds]
            console.log(`[TaskPolling] 任务 ${taskId} 未在 API 响应中找到，停止轮询`)
            tasks.delete(taskId)
            for (const localId of localIds) handlersRef.current.onFailed?.(localId, { error: '任务未找到' })
          }
        }
      }
    } catch (err) {
      console.warn('[TaskPolling] 轮询请求失败:', err.message)
      // 网络错误不计入轮询次数
      let maxConsec = 0
      for (const entry of tasks.values()) {
        entry.consecutiveErrors = (entry.consecutiveErrors || 0) + 1
        maxConsec = Math.max(maxConsec, entry.consecutiveErrors)
      }
      if (maxConsec >= maxConsecutiveErrors) {
        console.warn(`[TaskPolling] 网络异常，已连续失败 ${maxConsec} 次，轮询仍在继续...`)
        handlersRef.current.onNetworkError?.({ consecutiveErrors: maxConsec, maxConsecutiveErrors })
      }
    }
  }, [taskClient, interval, maxAttempts, maxConsecutiveErrors])

  // 启动/停止定时器
  useEffect(() => {
    timerRef.current = setInterval(poll, interval)
    console.log(`[TaskPolling] 开始轮询，间隔: ${interval}ms，最大次数: ${maxAttempts}`)
    return () => {
      clearInterval(timerRef.current)
    }
  }, [poll, interval, maxAttempts])

  const addTask = useCallback((taskId, localId) => {
    const existing = tasksRef.current.get(taskId)
    if (existing) {
      existing.localIds.add(localId)
      console.log(`[TaskPolling] 追加监听节点: ${localId} → 任务 ${taskId} (现共 ${existing.localIds.size} 个)`)
    } else {
      tasksRef.current.set(taskId, {
        localIds: new Set([localId]),
        attempts: 0,
        consecutiveErrors: 0,
      })
      console.log(`[TaskPolling] 添加任务到轮询队列: ${localId} (taskId: ${taskId})`)
    }
  }, [])

  // 不传 localId: 删除整个任务条目 (所有监听节点)
  // 传 localId: 只移除该监听节点; 最后一个移除后才删除任务条目
  const removeTask = useCallback((taskId, localId) => {
    const entry = tasksRef.current.get(taskId)
    if (!entry) return
    if (localId == null) {
      tasksRef.current.delete(taskId)
      return
    }
    entry.localIds.delete(localId)
    if (entry.localIds.size === 0) {
      tasksRef.current.delete(taskId)
    }
  }, [])

  const hasActiveTasks = useCallback(() => {
    return tasksRef.current.size > 0
  }, [])

  return { addTask, removeTask, hasActiveTasks }
}
