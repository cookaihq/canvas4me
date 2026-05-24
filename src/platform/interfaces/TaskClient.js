/**
 * TaskClient 接口 — 调用上游 AI 能力,获取任务结果。
 *
 * 调用流程:
 *   1. 用户点 Run → useRunCapability 立即创建节点(localId 占位,显示"等待响应中")
 *   2. submit() 异步发出 → 走上游 API(直连或经服务端中转),返回 taskId
 *   3. submit 返回 { taskId } → useRunCapability 把 taskId 回写到节点 data
 *   4. taskId 加入 useTaskPolling 队列 → queryStatus([...]) 反复查到终态
 *
 * 任务状态机由轮询独占。SSE 流仅用作 LLM 流式输出的"显示通道":
 *   - 轮询某次拿到 TaskStatusItem.stream_url → 启动 openStream 实时显示 chunks
 *   - openStream 的 onDone 不影响任务状态(任务可能仍在落库中);
 *     最多触发一次额外的 queryStatus 加快终态确认
 *   - 任务保留在轮询队列直到拿到终态(success / failed / transfer_failed 等)
 *
 * 实现:
 *   - 本地实现: `impl/TaskClient.foxapi.js` (前端直连 foxapi.cc,用户自备 API Key)
 *
 * 详见 CLAUDE.md §装饰层解耦原则。
 *
 * ---------------------------------------------------------------------------
 *
 * @typedef {object} SubmitParams
 * @property {string} nodeType         'llm' | 'image' | 'video' | 'sound'
 * @property {string} capability       capability id(如 'nano-banana')
 * @property {string} mode             mode id(已 resolved,如 'text-to-video')
 * @property {object} body             组装好的请求体(由 capability 的 builder.js 生成)
 *                                     不含上游 endpoint 路径(项目级 CLAUDE.md 禁用)。
 *                                     本地 impl 通过 (nodeType, capability, mode) 在内部
 *                                     路由表查 endpoint;装饰层 impl 直接 POST
 *                                     /api/apps/ai-canvas/v1/node/{nodeType}/{capability}/submit
 *                                     请求 body 中可包含前端生成的 extra_task_id(幂等键
 *                                     + 立即可用的查询 id);本地 impl 自动忽略此字段
 *
 * @typedef {object} SubmitResult
 * @property {string} taskId           异步任务的查询 id(必返,加入轮询队列用)
 * @property {string} [realTaskId]     服务端真实 task_id(retry-transfer 等装饰层可选
 *                                     场景用),仅装饰层实现填写。允许保留在节点 data 里——
 *                                     本地实现永不写入,不影响正确性(详见 §装饰层解耦原则)
 * @property {string} [streamUrl]      某些实现可提前返回的 SSE stream_url(LLM 优化,省一次
 *                                     轮询 tick),仅装饰层实现可能填写。调用方拿到立即启动
 *                                     openStream 显示,不影响轮询队列(任务状态机仍走轮询)
 *
 * @typedef {object} TaskStatusItem
 * @property {string} task_id
 * @property {string} status           pending / processing / running / success /
 *                                     completed / failed / error / canceled / interrupted /
 *                                     not_found / transfer_failed / transferring
 * @property {number} [progress]       0-100
 * @property {string} [stream_url]     LLM 进入 streaming 阶段时返回。按契约调用方应启动
 *                                     openStream 接管显示但保留任务在轮询队列(状态机仍走轮询)。
 *                                     **当前实现违反此契约**:useTaskPolling 拿到 stream_url
 *                                     时移出队列,SSE 写终态。等 P6 执行引擎重构。
 *                                     详见 unified-plan §5 B.1.3。
 * @property {object} [result]         success 时的结果 payload(capability 的 resolveContent 解析)
 * @property {string} [error]
 *
 * @typedef {object} StreamCallbacks
 * @property {(data: object) => void}  onData   收到 chunk 事件(data 形如 { content: '...OpenAI chunk JSON...' })
 * @property {() => void}              onDone   收到 done 事件或流自然结束;调用方可触发一次
 *                                              额外 queryStatus 加快终态确认(可选)
 * @property {(error: Error) => void}  onError  错误事件或底层网络异常
 * @property {(info: object) => void}  [onStatus] 状态心跳(可选)
 *
 * @typedef {object} StreamHandle
 * @property {() => void}    abort     组件 unmount / 用户切画布时调 abort() 释放 SSE 连接,避免泄漏。
 * @property {() => number}  getOffset 返回已收到的 chunk 数量。断线时上层用这个值
 *                                     作为 ?offset=N 续传后端 stream endpoint。
 *
 * ---------------------------------------------------------------------------
 *
 * @typedef {object} TaskClient
 * @property {(params: SubmitParams) => Promise<SubmitResult>}        submit
 *   提交一次能力运行,返回 taskId。两版均异步;调用方拿到 taskId 后回写节点 data
 *   并加入轮询队列。
 *
 * @property {(taskIds: string[]) => Promise<TaskStatusItem[]>}       queryStatus
 *   批量查询任务状态。返回数组顺序不保证与入参一致——按 task_id 字段对齐。
 *   未找到的 taskId 不出现在返回数组中(调用方按"连续 N 次未找到 = 任务不存在"自行判定)。
 *   foxapi 若只支持单 task 查询,本地 impl 内部用 Promise.all 分发。
 *
 * @property {(streamUrl: string, callbacks: StreamCallbacks) => StreamHandle} openStream
 *   打开 SSE 流仅用于显示。streamUrl 由 queryStatus 返回的 stream_url 提供。
 *   返回 { abort } 对象,组件生命周期结束时调 abort() 关闭。
 *
 * @property {() => Promise<LlmCapabilitiesPayload>} listLlmModels
 *   LLM 子能力的可选 model 清单。返回形态:
 *     { 'llm-text': [{name,label?,description?,badge?}], 'llm-vision': [...], 'llm-audio': [...], 'llm-video': [...] }
 *   各 impl 数据源不同:
 *     - 服务端 impl:GET /api/apps/ai-canvas/v1/node/llm/models(admin 维护)
 *     - 本地 impl  :读 import.meta.env.VITE_LLM_CAPABILITIES(JSON);该环境变量必填,缺失/解析失败/形态不符在模块加载时直接 throw(启动报错)
 *   字段:`name` 必填(submit 时透传给 body.model);`label` 空时前端用 name 兜底;`badge==='thinking'` 的 model 默认开 reasoning。
 *
 * @typedef {Object} LlmCapabilitiesPayload
 * @property {Array<{name:string,label?:string,description?:string,badge?:string}>} [llm-text]
 * @property {Array<{name:string,label?:string,description?:string,badge?:string}>} [llm-vision]
 * @property {Array<{name:string,label?:string,description?:string,badge?:string}>} [llm-audio]
 * @property {Array<{name:string,label?:string,description?:string,badge?:string}>} [llm-video]
 *
 * ---------------------------------------------------------------------------
 * 装饰层可选 概念 —— 不在 TaskClient 接口上(装饰层独立注入)
 * ---------------------------------------------------------------------------
 *
 * `retryTransfer(localId)`:手动重试"上游 → 自家存储"的图片/视频转存。
 *   - 仅 服务端有"先返回上游 URL → 异步转存到服务端存储"两段式流程,有"转存失败"
 *     概念;本地实现前端直接拿到上游 URL 即结束,无转存这一步。
 *   - 该方法**不是 TaskClient 接口的一部分**——装饰层 在 装饰层 hook
 *     里处理重试逻辑,通过 `CapabilityRuntimeContext.retryTransfer` 注入给输出节点;
 *     本地实现的 RuntimeContext 默认值是 no-op,输出节点上"手动重试转存"按钮自动隐藏。
 *   - 详见 unified-plan §5 B.1.1 与项目级 CLAUDE.md §装饰层解耦原则。
 */

export {}
