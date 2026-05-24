/**
 * TaskClient 实现 —— 直连 foxapi.cc。
 *
 * 实现 src/platform/interfaces/TaskClient.js 契约:
 *   - submit / queryStatus / openStream
 *
 * 用户在 SimpleSettings 配置自己的 API Key(globalSettings.foxapi.apiKey),
 * 前端直连 foxapi.cc(用户自付费)。
 *
 * 路由表 —— ROUTES 的 key/value 形态:
 *   key:   `${nodeType}::${capability}::${mode}`(等价 platform 接口 SubmitParams)
 *   value: { endpoint, transformBody?, pickTaskId? }
 *     - endpoint:       POST 的 foxapi 路径(如 '/v1/images/generations')
 *     - transformBody:  可选,把 builder.js 输出翻译成 foxapi 字段
 *     - pickTaskId:     可选,从 foxapi 响应提取 taskId(默认取 task_id 或 id)
 *
 * 各 capability 在 register.js 调 registerRoute() 登记路由;漏接的 capability
 * submit 时会抛 "route not registered" 清晰错。
 *
 * 校准依据:
 *   - 任务查询统一 GET /v1/tasks/{task_id}?sync_upstream=true
 *   - 任务响应:`{ id, object, type, model, status, progress, results[], error?, stream? }`
 *     - `id` ≡ task_id,`results` 是数组(按 type 分形态:image/video/audio/llm)
 *     - `stream.url`(嵌套对象)是 LLM 任务的 SSE 路径
 *     - `error` 是对象 `{ message, type, code? }`
 *   - LLM SSE 三事件:`event: chunk` / `event: done` / `event: error`(命名事件,非裸 data:)
 *   - foxapi 无端点的 capability(midjourney / image-upscale 等)登记为 api: null
 *
 * 字段翻译策略:builder.js 直接输出与 foxapi 一致的字段,可省略 transformBody。
 * 仅当字段口径不一致时启用 transformBody 局部翻译。
 */

import { settingsLocal } from './Settings.localStorage'

// foxapi 网关基础 URL(已核实:docs/reference/foxapi-endpoint-mapping.md §0)。
// dev 走 Vite 代理（避免浏览器 CORS），prod 直连 foxapi。
// 后续可考虑放进 globalSettings 让用户自定义私有部署地址。
const FOXAPI_BASE = import.meta.env.DEV ? '/foxapi' : 'https://api.foxapi.cc'

// ────────────────────────────────────────────────────────────────────────────
// 路由表 —— 每接通一个 capability/mode 调 registerRoute() 登记
//   key:    `${nodeType}::${capability}::${mode}`
//   value:  { endpoint, transformBody?, pickTaskId? }
// 查不到 routing → submit 抛"route not registered"清晰错,避免静默失败。
// ────────────────────────────────────────────────────────────────────────────
const ROUTES = new Map()

/**
 * 各 capability 在 register.js / 单独 wiring 文件里调用本函数登记路由。
 * 重复登记会覆盖(测试便利);冲突由调用方自查。
 */
export function registerRoute(nodeType, capability, mode, route) {
  if (!route || !route.endpoint) {
    throw new Error('[TaskClient.foxapi] registerRoute: route.endpoint required')
  }
  ROUTES.set(routeKey(nodeType, capability, mode), route)
}

// ────────────────────────────────────────────────────────────────────────────
// 内部工具
// ────────────────────────────────────────────────────────────────────────────

function routeKey(nodeType, capability, mode) {
  return `${nodeType}::${capability}::${mode}`
}

function getRoute(nodeType, capability, mode) {
  const key = routeKey(nodeType, capability, mode)
  const route = ROUTES.get(key)
  if (!route) {
    throw new Error(
      `[TaskClient.foxapi] route not registered: ${nodeType}/${capability}/${mode} —— ` +
      `E.2 阶段在 capability 接通时 registerRoute() 登记(详见 unified-plan §8 E.2)`,
    )
  }
  return route
}

async function getApiKey() {
  const g = await settingsLocal.getGlobal()
  const key = g?.foxapi?.apiKey
  if (!key) {
    throw new Error(
      '[TaskClient.foxapi] 未配置 API Key —— 请在 Settings → API Key 填入 foxapi.cc 的 Key',
    )
  }
  return key
}

/**
 * 移除 builder 输出中、上游 API 不需要的包装字段。
 *
 * 字段剥离分层:
 *   - **本函数(全局剥)**:`extra_task_id` / `project_id` / `node_id` / `capability`
 *     —— foxapi 任何 capability 都不用这四个字段,全 capability 安全剥离
 *   - **per-route `transformBody`(局部剥)**:`mode` —— foxapi 部分 capability 真有
 *     `mode` 字段(如 kling-v3 motion-control 的 `mode: 'std'`),不能全局剥;由
 *     each 路由的 transformBody 自行决定剥不剥(builder 是否输出包装版 mode)
 *
 * 详见 platform/interfaces/TaskClient.js。
 */
function stripBuilderWrapperFields(body) {
  if (!body || typeof body !== 'object') return body
  const {
    extra_task_id: _ignore,
    project_id: _p,
    node_id: _n,
    capability: _c,
    ...rest
  } = body
  return rest
}

async function foxapiPost(endpoint, body, apiKey) {
  const resp = await fetch(`${FOXAPI_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body || {}),
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(
      `[TaskClient.foxapi] POST ${endpoint} 失败 (${resp.status}): ${text || resp.statusText}`,
    )
  }
  return resp.json()
}

async function foxapiGet(endpoint, apiKey) {
  const resp = await fetch(`${FOXAPI_BASE}${endpoint}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (resp.status === 404) return null // 任务不存在 —— 契约要求不出现在返回数组
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(
      `[TaskClient.foxapi] GET ${endpoint} 失败 (${resp.status}): ${text || resp.statusText}`,
    )
  }
  return resp.json()
}

/**
 * 把 foxapi 任务响应映射到 TaskClient 接口的 TaskStatusItem。
 * 字段口径以 platform/interfaces/TaskClient.js @typedef TaskStatusItem 为准;
 * 字段来源以 docs/reference/foxapi-endpoint-mapping.md §0 为准。
 *
 * foxapi 任务响应形态(已核实):
 *   { id, object, type, model, status, progress, results[], error?, stream? }
 * 字段对应:
 *   id            → task_id
 *   status        → status (foxapi 4 值:pending / processing / completed / failed)
 *   progress      → progress (整数百分比)
 *   stream.url    → stream_url (LLM 任务 SSE 路径,LLM 进入 streaming 阶段时 foxapi 才填)
 *   results       → result.results (包成对象,capability 的 resolveContent 统一从
 *                                   result.results[i] 兜底,与已转存形态 result.images[i]
 *                                   并列;直接挂 raw.results 数组会让 resolver 的
 *                                   `result.results[0]` 兜底失效)
 *   error.message → error     (字符串,接口约定 string)
 */
function normalizeTaskStatus(raw, fallbackId) {
  if (!raw || typeof raw !== 'object') return null
  return {
    task_id:    raw.id || raw.task_id || fallbackId,
    status:     raw.status,
    progress:   raw.progress,
    stream_url: raw.stream?.url,
    result:     raw.results ? { results: raw.results } : null,
    error:      typeof raw.error === 'object' ? raw.error?.message : raw.error,
  }
}

/**
 * SSE 解析 —— foxapi LLM 命名事件协议(已核实:docs/reference/foxapi-endpoint-mapping.md §1)。
 *
 * foxapi /v1/llm/generations/{task_id}/stream 三种事件:
 *   - event: chunk  + data: <OpenAI chat.completion.chunk JSON> → onData({ content: <json string> })
 *   - event: done   + data: <{total_chunks}>                    → onDone()
 *   - event: error  + data: <{message}>                         → onError(Error)
 * 缺省 event(裸 data:)按 chunk 处理,兼容部分服务端实现差异。
 *
 * 用 fetch + ReadableStream 解析(浏览器原生 EventSource 不支持自定义 header)。
 */
async function runStream(streamUrl, callbacks, signal, getOffset, setOffset) {
  const apiKey = await getApiKey()
  const resp = await fetch(streamUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'text/event-stream',
    },
    signal,
  })
  if (!resp.ok || !resp.body) {
    throw new Error(`[TaskClient.foxapi] openStream 连接失败 (${resp.status})`)
  }
  const reader = resp.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let sep
    while ((sep = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, sep)
      buf = buf.slice(sep + 2)
      let eventName = 'message'
      const dataLines = []
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim()
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart())
        }
        // 忽略 id: / retry: / 注释行
      }
      const payload = dataLines.join('\n')
      if (!payload) continue
      switch (eventName) {
        case 'done':
          callbacks?.onDone?.()
          return
        case 'error': {
          let msg = payload
          try { msg = JSON.parse(payload)?.message || payload } catch { /* keep raw */ }
          callbacks?.onError?.(new Error(`[TaskClient.foxapi] SSE error: ${msg}`))
          return
        }
        case 'chunk':
        case 'message':
        default:
          callbacks?.onData?.({ content: payload })
          setOffset(getOffset() + 1)
          break
      }
    }
  }
  callbacks?.onDone?.()
}

// ────────────────────────────────────────────────────────────────────────────
// TaskClient 导出 —— 实现 platform/interfaces/TaskClient.js 契约
// ────────────────────────────────────────────────────────────────────────────

export const taskClientFoxapi = {
  /**
   * 提交一次能力运行 —— 查 ROUTES 路由表 → POST foxapi 端点。
   * E.2 接通各 capability 时填表;在此之前调用会抛"暂未接通"错误。
   */
  submit: async ({ nodeType, capability, mode, body }) => {
    const route = getRoute(nodeType, capability, mode)
    const apiKey = await getApiKey()
    const cleanBody = stripBuilderWrapperFields(body)
    const finalBody = route.transformBody ? route.transformBody(cleanBody) : cleanBody

    console.group(`[foxapi] POST ${route.endpoint}`)
    console.log('Capability:', `${nodeType}/${capability}/${mode}`)
    console.log('Body:', finalBody)
    console.groupEnd()

    try {
      const resp = await foxapiPost(route.endpoint, finalBody, apiKey)
      const taskId = route.pickTaskId
        ? route.pickTaskId(resp)
        : (resp?.task_id || resp?.id)
      if (!taskId) {
        throw new Error(
          `[TaskClient.foxapi] ${capability}/${mode} submit 未返回 taskId(响应片段:${
            JSON.stringify(resp).slice(0, 200)
          })`,
        )
      }
      console.log(`[foxapi] POST ${route.endpoint} 成功 (taskId: ${taskId})`)
      return { taskId }
    } catch (err) {
      console.error(`[foxapi] POST ${route.endpoint} 失败:`, err?.message || err)
      throw err
    }
  },

  /**
   * 批量查询任务状态 —— foxapi 单查接口,内部 Promise.all 分发。
   * 未找到的 taskId 不出现在返回数组中(契约要求)。
   *
   * 兜底: 当 sync_upstream=true 拿到 status='completed' 但 results 缺失/为空时,
   * 立即重查一次不带 sync_upstream(走 foxapi 缓存), 通常能拿到完整 results.
   * 上游偶发的 completed+results=null 会让 polling 提前结束、节点 content 为空,
   * 这里多一次廉价重查能修掉绝大多数情况.
   */
  queryStatus: async (taskIds) => {
    if (!taskIds || taskIds.length === 0) return []
    const apiKey = await getApiKey()
    // 端点:docs/reference/foxapi-endpoint-mapping.md §0 —— /v1/tasks/{id}?sync_upstream=true
    // sync_upstream=true 让上游主动刷新而非依赖 foxapi 内部缓存。
    const items = await Promise.all(
      taskIds.map(async (id) => {
        try {
          let data = await foxapiGet(`/v1/tasks/${id}?sync_upstream=true`, apiKey)
          if (!data) return null
          if (data.status === 'completed' && (!data.results || data.results.length === 0)) {
            try {
              const fallback = await foxapiGet(`/v1/tasks/${id}`, apiKey)
              if (fallback && fallback.results && fallback.results.length > 0) {
                data = fallback
              }
            } catch (err2) {
              console.warn(`[TaskClient.foxapi] task ${id} 兜底重查失败:`, err2.message)
            }
          }
          return normalizeTaskStatus(data, id)
        } catch (err) {
          console.warn(`[TaskClient.foxapi] 查询 task ${id} 失败:`, err.message)
          return null
        }
      }),
    )
    return items.filter(Boolean)
  },

  /**
   * SSE 流 —— LLM 流式输出使用。
   * 用 fetch + ReadableStream 解析(浏览器原生 EventSource 不支持自定义 header)。
   * 返回 { abort } 句柄,组件 unmount 时调 abort() 释放连接。
   */
  openStream: (streamUrl, callbacks) => {
    const ctrl = new AbortController()
    let chunkCount = 0
    void runStream(
      streamUrl,
      callbacks,
      ctrl.signal,
      () => chunkCount,
      (n) => { chunkCount = n },
    ).catch((err) => {
      if (err?.name !== 'AbortError') callbacks?.onError?.(err)
    })
    return {
      abort: () => ctrl.abort(),
      getOffset: () => chunkCount,
    }
  },

  /**
   * LLM 模型清单：调上游 configs 接口，返回扁平 capability 表。
   *   GET /v1/configs/llm_generations_models → { object:'list', data:[{ id, capabilities }] }
   * 取内层 data 数组返回；调用方（useLlmModels）负责合并展示覆盖 + 缓存。
   */
  listLlmModels: async () => {
    const apiKey = await getApiKey()
    const resp = await foxapiGet('/v1/configs/llm_generations_models', apiKey)
    return Array.isArray(resp?.data) ? resp.data : []
  },
}
