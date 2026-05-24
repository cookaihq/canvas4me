// src/capabilities/tool/capcut-draft/runtime.js
// 自带运行时：不走标准 useRunCapability / taskClient。
// 入口由 TimelineModal 的「生成草稿」按钮调用，完成：
//   1. 校验 timeline
//   2. 转 capcut spec
//   3. 探测本地服务端口（拿 port + health）
//   4. POST /drafts 拿 task_id + stream_url
//   5. SSE 订阅 stream_url 直到 done / failed（失败时降级到 runTaskPollingLoop）
//   6. 全程 applyNodes 更新本节点 runStatus / content / capcutProgress
//   7. 通过 onTaskUpdate callback 把完整 task 对象漏给模态框（供 Badge 渲染"草稿生成中 N/M·X%"）
//
// 错误处理对应 spec §10 文案表。

import {
  discoverPort,
  submitDraft,
  streamTask,
  runTaskPollingLoop,
  CapcutServiceNotRunningError,
  DraftConflictError,
  InvalidSpecError,
  TaskNotFoundError,
} from './capcutClient.js'
import { toCapcutSpec, validateTimeline } from './timelineSpec.js'

export async function runCapcutDraft({ nodeId, timeline, materials, applyNodes, onTaskUpdate }) {
  // 1. 校验
  const errors = validateTimeline(timeline)
  if (errors.length > 0) {
    return { ok: false, error: errors.join(';') }
  }

  // 2. 转 spec
  const spec = toCapcutSpec(timeline, materials)

  // 3. 标记节点 polling
  applyNodes(nds => nds.map(n => n.id === nodeId ? {
    ...n,
    data: { ...n.data, runStatus: 'polling', capcutProgress: 0, content: {}, startedAt: Date.now() },
  } : n))

  try {
    // 4. 探测端口
    const { port } = await discoverPort()
    // 5. 提交
    const { task_id: taskId, stream_url: streamUrl } = await submitDraft(port, spec)
    applyNodes(nds => nds.map(n => n.id === nodeId ? {
      ...n, data: { ...n.data, taskId },
    } : n))

    // 6. SSE 订阅；失败自动降级到轮询
    const draftPath = await new Promise((resolve, reject) => {
      let resolved = false
      let cleanupSse = () => {}      // captured below; using let to avoid TDZ in onError closure
      const writeProgress = (task) => {
        onTaskUpdate?.(task)
        applyNodes(nds => nds.map(n => n.id === nodeId ? {
          ...n, data: { ...n.data, capcutProgress: task.progress },
        } : n))
      }
      cleanupSse = streamTask(port, streamUrl, {
        onProgress: writeProgress,
        onDone: (task) => {
          if (resolved) return
          resolved = true
          onTaskUpdate?.(task)
          if (task.status === 'done') resolve(task.result)
          else reject(new Error(task.error || '生成草稿失败'))
        },
        onError: () => {
          // SSE 异常 → 关掉 SSE 防止后台 reconnect 浪费连接，然后降级到轮询
          if (resolved) return
          cleanupSse()
          runTaskPollingLoop(port, taskId, {
            onProgress: writeProgress,
            intervalMs: 1500,
          })
            .then(result => {
              if (resolved) return
              resolved = true
              // 合成一个最小的 done task 喂给 Badge，与 SSE 路径"无感切换"
              onTaskUpdate?.({ id: taskId, status: 'done', progress: 100, result, draft_name: spec.draft_name })
              resolve(result)
            })
            .catch(err => {
              if (resolved) return
              resolved = true
              onTaskUpdate?.({ id: taskId, status: 'failed', error: err.message, draft_name: spec.draft_name })
              reject(err)
            })
        },
      })
    })

    // 7. 成功
    applyNodes(nds => nds.map(n => n.id === nodeId ? {
      ...n,
      data: {
        ...n.data,
        runStatus: 'done',
        capcutProgress: 100,
        content: { text: draftPath, type: 'capcut-draft' },
        finishedAt: Date.now(),
      },
    } : n))
    return { ok: true, draftPath }
  } catch (err) {
    const errorMsg = mapErrorToMessage(err)
    applyNodes(nds => nds.map(n => n.id === nodeId ? {
      ...n,
      data: {
        ...n.data,
        runStatus: 'error',
        content: { error: errorMsg },
        finishedAt: Date.now(),
      },
    } : n))
    return { ok: false, error: errorMsg, errorKind: err?.name }
  }
}

// 把异常映射成给用户看的文案。spec §10 错误处理表。
function mapErrorToMessage(err) {
  if (err instanceof CapcutServiceNotRunningError) {
    return 'capcut_helper 未运行,请启动桌面应用'
  }
  if (err instanceof DraftConflictError) {
    return '已存在同名草稿,改名或勾选「覆盖同名草稿」后重试'
  }
  if (err instanceof TaskNotFoundError) {
    return '与 capcut_helper 的连接中断,请重试'
  }
  if (err instanceof InvalidSpecError) {
    return `时间线规格非法:${err.message}`
  }
  const raw = err?.message || String(err)
  if (/草稿根目录/.test(raw)) {
    return '请在 capcut_helper 设置里选择剪映草稿目录'
  }
  if (/(CORS|cors|Failed to fetch)/.test(raw)) {
    return '当前站点不在 capcut_helper 白名单,请在桌面应用设置里添加'
  }
  return raw
}
