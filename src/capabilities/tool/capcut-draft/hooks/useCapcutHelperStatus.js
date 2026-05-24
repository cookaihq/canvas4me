// src/capabilities/tool/capcut-draft/hooks/useCapcutHelperStatus.js
// 维护剪映草稿模态框里 capcut_helper 的连接状态 + 草稿任务进度的合并 state。
// 内部分两条流：
//   - health 流：runHelperStatusLoop 循环探测，每次结果通过 onResult({status, health}) 回调
//   - task 流：外层（TimelineModal）持有 activeTask 入参，通过 hook 传入
// 两条流由 composeHelperState 合并成单一 4-type 判别联合 state。
//
// 暴露：
// - runHelperStatusLoop（纯异步函数，可单测）
// - useCapcutHelperStatus（React hook）
//
// 设计依据：docs/superpowers/specs/2026-05-17-capcut-helper-status-badge-redesign-design.md

import { useEffect, useState, useCallback } from 'react'
import { discoverPort } from '../capcutClient.js'
import { composeHelperState } from '../composeHelperState.js'

const ONLINE_INTERVAL_MS = 2000
const OFFLINE_INTERVAL_MS = 5000

/**
 * 链式探测循环。每次探测结束后按上一次结果决定 sleep 时长，直到 signal abort。
 *
 * @param {object} opts
 * @param {AbortSignal} opts.signal                                   取消信号
 * @param {(result: {status:'online'|'offline', health?: object}) => void} opts.onResult  每次探测完成后回调
 * @param {() => Promise<{port:number, health:object}>} opts.probe   探测函数（默认 discoverPort）
 * @param {number} [opts.onlineDelayMs=2000]
 * @param {number} [opts.offlineDelayMs=5000]
 */
export async function runHelperStatusLoop({
  signal,
  onResult,
  probe,
  onlineDelayMs = ONLINE_INTERVAL_MS,
  offlineDelayMs = OFFLINE_INTERVAL_MS,
}) {
  if (signal?.aborted) return
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (signal?.aborted) return
    let lastResult
    try {
      const { health } = await probe()
      lastResult = { status: 'online', health }
    } catch {
      lastResult = { status: 'offline' }
    }
    if (signal?.aborted) return
    onResult(lastResult)
    const delay = lastResult.status === 'online' ? onlineDelayMs : offlineDelayMs
    try {
      await sleep(delay, signal)
    } catch {
      return
    }
  }
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(t)
      reject(new Error('aborted'))
    }
    if (signal) {
      if (signal.aborted) {
        clearTimeout(t)
        reject(new Error('aborted'))
        return
      }
      signal.addEventListener('abort', onAbort)
    }
  })
}

/**
 * React hook：health 流 + activeTask 入参合并为 state。
 * @param {object} opts
 * @param {boolean} opts.enabled        通常传模态框 open 状态；false 时停止探测、state 重置
 * @param {object|null} opts.activeTask 外层持有的当前活跃任务对象；null 时由 health 流主导
 * @returns {{ state: object, recheck: () => void }}
 */
export function useCapcutHelperStatus({ enabled, activeTask }) {
  const [loopResult, setLoopResult] = useState(null)
  const [recheckTick, setRecheckTick] = useState(0)

  const recheck = useCallback(() => {
    setLoopResult(null)
    setRecheckTick(t => t + 1)
  }, [])

  useEffect(() => {
    if (!enabled) {
      setLoopResult(null)
      return undefined
    }
    const controller = new AbortController()
    runHelperStatusLoop({
      signal: controller.signal,
      onResult: setLoopResult,
      probe: discoverPort,
    })
    return () => controller.abort()
  }, [enabled, recheckTick])

  const state = composeHelperState({ enabled, loopResult, activeTask })
  return { state, recheck }
}
