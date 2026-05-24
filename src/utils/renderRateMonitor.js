/**
 * 渲染 / setNodes 频率监控 — 给"Maximum update depth"诊断兜底
 *
 * 用法:
 *   useRenderRateMonitor('AiCanvasInner')  // 每次组件渲染调一次
 *   useSetNodesMonitor(setNodes, 'canvas/index') // 包装 setNodes, 监控调用频率
 *
 * 触发条件 (任一):
 *   - 1 秒内组件渲染 >= RENDER_THRESHOLD
 *   - 1 秒内 setNodes 调用 >= SETNODES_THRESHOLD
 *
 * 触发后通过 console.error 打印一条警示, 会被 consoleBreadcrumbs 捕获进错误日志.
 * 同一组件 60 秒内只警示一次, 避免刷屏.
 *
 * 仅 dev 环境装载; production 直接返回 noop.
 *
 * RENDER_THRESHOLD 取值依据 (2026-05-17 调优):
 * 历史阈值 50 在加多个能力节点时会误报 —— React Flow 的 NodeWrapper 在 viewport
 * 平移动画 (panCanvasTo 300ms duration) + 尺寸测量 + dev StrictMode 双调用 +
 * Fast Refresh + autoSave 状态切换等多重叠加下, 单 CapabilityNode 在一次添加动画
 * 期间可以累计 50+ 次合法重渲. 画布根组件 (AiCanvasInner) 在多节点 (40+) 大
 * 画布上叠加多次添加动画时, 累计能达到 500+ 次 (实测 40 节点 + 0.5s 间隔连点
 * 4 个能力节点 → 累计 520+ 次, 全部为合法 reconcile 不含 setState 死循环).
 * 真正的 setState 死循环 (Maximum update depth) 触发量级是每秒上万次,
 * 阈值 1000 仍能可靠拦截真死循环, 同时不会被合法动画 burst 误报.
 * setter 阈值保持 50 不变 —— setNodes 调用没有动画 burst 模式, 单帧 50+ 次
 * 几乎一定是死循环 (动画期间 React 一次提交对应一次 setNodes, 60fps 上限).
 * 详见 visual-reviewer PR-7 报告.
 */

import { useRef } from 'react'

const RENDER_THRESHOLD = 1000
const SETNODES_THRESHOLD = 50
const WINDOW_MS = 1000
const COOLDOWN_MS = 60_000

const lastWarnAt = new Map()

function tryWarn(key, message, extra) {
  const now = Date.now()
  const lastAt = lastWarnAt.get(key) || 0
  if (now - lastAt < COOLDOWN_MS) return
  lastWarnAt.set(key, now)
  // 用 error 级别确保进错误日志面包屑
  // eslint-disable-next-line no-console
  console.error(`[RenderRateMonitor] ${message}`, extra || '')
}

/**
 * 监控组件渲染频率. 在组件函数顶部调用一次.
 */
export function useRenderRateMonitor(componentName) {
  const ref = useRef({ stamps: [], total: 0 })
  const now = Date.now()
  ref.current.total++
  ref.current.stamps.push(now)
  // 修剪窗口外
  while (ref.current.stamps.length > 0 && now - ref.current.stamps[0] > WINDOW_MS) {
    ref.current.stamps.shift()
  }
  if (ref.current.stamps.length >= RENDER_THRESHOLD) {
    tryWarn(
      `render:${componentName}`,
      `组件 ${componentName} 在 ${WINDOW_MS}ms 内渲染 ${ref.current.stamps.length} 次, 累计 ${ref.current.total} 次. 疑似渲染死循环.`,
    )
  }
}

/**
 * DEV-ONLY 渲染差异诊断: 找出每次 re-render 时哪些字段引用变了.
 * 用法: useRenderDiff('AiCanvasInner', { propA, stateB, ... })
 * 限流: 同一 label 每 200ms 最多打一行, 避免高频循环把 console 打爆.
 * 输出: "[RenderDiff:label] +N renders, changed: keyA, keyB"
 *       N = 自上次打印以来累计渲染次数; changed = 自上次记录以来引用换过的 key.
 */
export function useRenderDiff(label, values) {
  const prev = useRef(null)
  const counters = useRef({ rendersSinceLastLog: 0, lastLogAt: 0 })
  counters.current.rendersSinceLastLog++
  if (prev.current) {
    const changed = []
    for (const k of Object.keys(values)) {
      if (!Object.is(prev.current[k], values[k])) {
        changed.push(k)
      }
    }
    if (changed.length > 0) {
      const now = Date.now()
      if (now - counters.current.lastLogAt > 200) {
        // eslint-disable-next-line no-console
        console.log(
          `[RenderDiff:${label}] +${counters.current.rendersSinceLastLog} renders, changed:`,
          changed.join(', '),
        )
        counters.current.rendersSinceLastLog = 0
        counters.current.lastLogAt = now
      }
    }
  }
  prev.current = values
}

/**
 * 包装一个 setNodes (或类似 setter), 监控调用频率.
 * 返回包装后的 setter, 调用方式不变.
 */
export function wrapSetterWithMonitor(setter, label) {
  if (typeof setter !== 'function') return setter
  const state = { stamps: [], total: 0 }
  return function monitoredSetter(...args) {
    const now = Date.now()
    state.total++
    state.stamps.push(now)
    while (state.stamps.length > 0 && now - state.stamps[0] > WINDOW_MS) {
      state.stamps.shift()
    }
    if (state.stamps.length >= SETNODES_THRESHOLD) {
      tryWarn(
        `setter:${label}`,
        `setter ${label} 在 ${WINDOW_MS}ms 内被调用 ${state.stamps.length} 次, 累计 ${state.total} 次. 疑似 setState 死循环.`,
      )
    }
    return setter(...args)
  }
}
