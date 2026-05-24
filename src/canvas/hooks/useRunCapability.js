import { useCallback } from 'react'
import { message } from 'antd'
import {
  CAPABILITIES,
  isOutputNodeType,
  getModeDef,
  getModelSeries,
  resolveModeId,
  isFoldedCapability,
} from '../registry/nodeTypes'
import { resolveInputs } from '../registry/resolveInputs'
import { isPortOccupiedByPanel } from '../utils/portMutex'
import { buildRequestBody } from '../runtime/buildRequestBody'
import { extractUrlsFromBody, replaceUrlsInBody } from '../runtime/urlFieldHelpers'
import { probeUrlsBatch, LOAD_ERROR_REASONS, REASON_MESSAGES } from '../utils/urlCheck'
import { selfHealUrlsBatch, CacheMissError } from '../utils/urlSelfHeal'
import { useTaskClient, useUploader } from '@/platform/provider.jsx'
import { registerPendingRequest, unregisterPendingRequest } from '@/utils/tabSession'
import { generateExtraTaskId } from '../utils/extraTaskId'
import { OUTPUT_STACK_GAP, DERIVE_VERTICAL_GAP } from '../constants/spacing'
import { deriveCapabilityNode } from '../utils/nodeFactory'
import { normalizeRunStatus } from '../utils/designTokens'
import { resolveEdgeCapabilityMode } from '../utils/portMode'
import { useCanvasFacade } from '../state/canvasFacade'

/**
 * 运行能力节点 Hook（乐观提交模式）
 *
 * 流程：
 * 1. OSS 前置检查 + 校验必需输入
 * 2. 收集输入 + 构造 inputSnapshot
 * 3. 立即创建输出节点（runStatus='polling'），挂在画布上
 * 4. 注册轮询（用前端生成的 extra_task_id 作为查询 ID）
 * 5. 立即保存画布（triggerSave）
 * 6. 后台异步调 submitCapability 接口：
 *    - LLM 成功：用返回的 stream_url 直接启动 SSE（省一次轮询 tick）
 *    - 异步成功：等轮询拿到 completed/failed
 *    - 409 冲突：换一个 extra_task_id 再试一次；再冲突视为前端 id 生成 bug
 *    - 其他错误：节点标 error
 *
 * ⚠️ Capability 节点本身不再进入 running/locked 状态，按钮立刻可再点。
 */
export default function useRunCapability({
  nodes,
  edges,
  setNodes,
  setEdges,
  canvasId,
  triggerSave,
  addPollingTask,
  removePollingTask,
  startSseStream,
  panToNodesBounds,
}) {
  const taskClient = useTaskClient()
  const uploader = useUploader()
  const facade = useCanvasFacade()
  const run = useCallback(async function runFn(nodeId, runCount = 1, draftOverride = null) {
    // ── 找到目标能力节点 ──
    const capabilityNode = nodes.find(n => n.id === nodeId)
    if (!capabilityNode || capabilityNode.type !== 'capability') {
      message.error('未找到能力节点')
      return
    }

    // ── 应用 DockedPanel 草稿 (生成即锁定语义, 详见 design.md §3.3) ──
    // draftOverride 来自 DockedPanel 容器壳, 包含用户当前看到的 capability/mode/params.
    // 不存在时回退到 node.data 实际值 (兼容非 DockedPanel 入口的调用).
    const rawCapability = capabilityNode.data.capability
    const capability = draftOverride?.capability ?? rawCapability
    const nodeType = capabilityNode.data.nodeType ?? capabilityNode.data.abilityType
    if (!capability) {
      message.warning('请先选择子能力')
      return
    }

    const capDef = CAPABILITIES[capability]
    if (!capDef) {
      message.error('子能力定义未找到')
      return
    }

    const mode = resolveModeId(capability, draftOverride?.mode ?? capabilityNode.data.mode)
    const modeDef = getModeDef(capability, mode)
    if (!modeDef) {
      message.error('Mode 定义未找到')
      return
    }

    if (!modeDef.api) {
      message.info('该子能力尚未接入')
      return
    }

    // 跨 capability 切换: draft.capability ≠ node.data.capability
    // 跨切时 modeParams 必须只用 draft (旧 capability 的桶 schema 不兼容新 capability)
    const isCrossCapability = capability !== rawCapability

    // 当前 mode 的表单参数: 跨切时用纯 draft, 同 cap 时合并 node.data 桶 + draft
    const baseModeParams = isCrossCapability
      ? {}
      : (capabilityNode.data.modeParams?.[mode] || {})
    const modeParams = draftOverride?.params
      ? { ...baseModeParams, ...draftOverride.params }
      : baseModeParams

    // ── 1. 校验必需输入 ──
    const inputDefs = resolveInputs(capability, mode)
    const incomingEdges = edges.filter(e => e.target === nodeId)
    const requiredInputs = inputDefs.filter(def => def.required)

    for (const req of requiredInputs) {
      const hasEdge = incomingEdges.some(e => e.targetHandle === req.id)
      const hasPanelValue = isPortOccupiedByPanel(modeParams, req.id)
      if (!hasEdge && !hasPanelValue) {
        message.warning(`缺少必需输入: ${req.label}`)
        return
      }
    }

    // ── 3. 收集输入 ──
    const collectedInputs = {}
    for (const inputDef of inputDefs) {
      const connectedEdges = incomingEdges.filter(e => e.targetHandle === inputDef.id)
      if (connectedEdges.length === 0) continue

      const values = []
      for (const edge of connectedEdges) {
        const sourceNode = nodes.find(n => n.id === edge.source)
        if (!sourceNode) continue
        values.push({
          nodeId: sourceNode.id,
          subType: sourceNode.data?.subType,
          // sourceHandle 指明值从 source 节点的哪个输出端口流入(多输出能力按 handle 区分语义)
          sourceHandle: edge.sourceHandle,
          content: sourceNode.data?.content,
          label: sourceNode.data?.label,
        })
      }

      if (inputDef.multiple) {
        collectedInputs[inputDef.id] = values
      } else {
        collectedInputs[inputDef.id] = values[0] || null
      }
    }

    // ── 4. inputSnapshot + 锁定连入的输入节点 ──
    const inputSnapshot = {
      capability,
      mode,
      params: { ...modeParams },
      inputs: collectedInputs,
    }

    // ── 4.5 Failed 原地重跑分支 (UX_SPEC §6.4) ──
    // 折叠形态 + 下游输出节点 Failed + 单次重试 + 无 DockedPanel 草稿 →
    // 不派生新节点, 复用现有输出节点重跑 (清掉 errorMsg → polling).
    // FailedCard 的"重试"按钮走这条路径; DockedPanel 上改参数后点 Run
    // (带 draftOverride) 仍按 §11.1 派生规则处理.
    const isLlm = nodeType === 'llm'
    const isFoldedCap = isFoldedCapability(capability)
    // 折叠节点状态看它的常驻 output: 按 output 自带的 sourceCapabilityId 结构化反查,
    // 不再用 edges.find 猜 internal 边(顺序依赖、易误命中,曾参与本次双线的状态误判)。
    const downstreamOutputForStatus = isFoldedCap
      ? nodes.find(n =>
          isOutputNodeType(n.type) &&
          (n.data?.sourceCapabilityId ?? n.data?.sourceAbilityId) === nodeId
        )
      : null
    const downstreamStatus = normalizeRunStatus(downstreamOutputForStatus?.data?.runStatus)
    const isFailedRetryInPlace = isFoldedCap
      && downstreamStatus === 'Failed'
      && runCount === 1
      && !draftOverride

    if (isFailedRetryInPlace) {
      const reusedOutputNodeId = downstreamOutputForStatus.id
      const newExtraTaskId = generateExtraTaskId()
      const startedAt = Date.now()
      const retryLastRunSnapshot = {
        edgeIds: incomingEdges.map(e => e.id),
        mode,
        ts: startedAt,
      }

      facade.batchUpdateNodes(nds => nds.map(n => {
        const isConnectedInput = incomingEdges.some(e => e.source === n.id)
        if (isConnectedInput && n.type === 'input') {
          return { ...n, data: { ...n.data, locked: true } }
        }
        if (n.id === nodeId && n.type === 'capability') {
          return { ...n, data: { ...n.data, lastModeContext: retryLastRunSnapshot } }
        }
        if (n.id === reusedOutputNodeId) {
          const prevContent = n.data?.content || {}
          // 清掉错误现场,保留其他业务字段(图像/视频结果在 Failed 时通常为空,
          // 但 LLM/streaming 中途失败可能残留 text 片段 — 用 isLlm 区分)
          const { error: _err, rawError: _raw, ...restContent } = prevContent
          return {
            ...n,
            data: {
              ...n.data,
              runStatus: 'polling',
              startedAt,
              finishedAt: null,
              content: isLlm ? { text: '' } : restContent,
              extraTaskId: newExtraTaskId,
              taskId: newExtraTaskId,
              realTaskId: null,
              inputSnapshot,
            },
          }
        }
        return n
      }))

      registerPendingRequest(reusedOutputNodeId, {
        appId: 'ai-canvas',
        type: isLlm ? 'sse-pending' : 'polling',
        capability,
      })
      addPollingTask?.(newExtraTaskId, reusedOutputNodeId)
      triggerSave?.()

      const urlSegment = getModelSeries(capability, mode)
      await submitWithRetry({
        nodeType,
        capability,
        mode,
        modeParams,
        collectedInputs,
        canvasId,
        nodeId,
        urlSegment,
        outputNodeId: reusedOutputNodeId,
        siblingNodeIds: [reusedOutputNodeId],
        extraTaskId: newExtraTaskId,
        isLlm,
        batchUpdateNodes: facade.batchUpdateNodes,
        removePollingTask,
        addPollingTask,
        startSseStream,
        taskClient,
        uploader,
      })
      return
    }

    // ── 多 mode capability 的"切 mode"派生判定 (UX_SPEC §7.4) ──
    //   lastModeContext 记录"上一次 Run 时用了哪些 edges + 当时的 mode"
    //   下一次 Run 时若 mode 与 lastModeContext.mode 不同 → 场景 4/6/8 (edges 全部搬家),
    //   否则 → 场景 2/3/5/7 (edges 复制到派生节点, 原节点保留 edges)
    const previousMode = capabilityNode.data?.lastModeContext?.mode
    const modeChangedSinceLastRun = !!previousMode && previousMode !== mode
    const lastModeContext = {
      edgeIds: incomingEdges.map(e => e.id),
      mode,
      ts: Date.now(),
    }

    // 折叠 + Ready (in-place run) + draftOverride 跨 cap 兜底:
    //   理论上 DockedPanel 已经先 commit 了 capability/mode/modeParams 到 node.data,
    //   但通过非 DockedPanel 入口 (热重载 / 程序化触发 / 历史代码路径) 调用时可能没 commit.
    //   这里保险起见: Ready 节点 in-place run 时, 把 draftOverride 兜底写回 node.data.
    const willInPlaceRun = isFoldedCap && downstreamStatus === 'Ready' && !!draftOverride
    facade.batchUpdateNodes(nds => nds.map(n => {
      // 锁定连入的输入节点（防止用户以为修改输入会影响正在跑的任务）
      const isConnectedInput = incomingEdges.some(e => e.source === n.id)
      if (isConnectedInput && n.type === 'input') {
        return { ...n, data: { ...n.data, locked: true } }
      }
      // 给原能力节点写入 lastModeContext —— 下一次 Run 才能用它判定是否切了 mode
      if (n.id === nodeId && n.type === 'capability') {
        const nextData = { ...n.data, lastModeContext }
        if (willInPlaceRun && isCrossCapability) {
          nextData.capability = capability
          nextData.mode = mode
          nextData.modeParams = { ...(n.data?.modeParams || {}), [mode]: modeParams }
          if (nextData._draft) delete nextData._draft
        }
        // 首次进 running 时拍参数快照（终生不变）
        // - 仅在 lastRunSnapshot 为 null 时拍，已有快照不被覆盖
        // - idle 节点首次跑：拍当前参数
        // - error 重试：lastRunSnapshot 已有，跳过（满足 spec "error 重试不重拍"）
        // - 派生新节点（Task 4 会让 N2.lastRunSnapshot=null）：首次跑时被这条捕获
        if (nextData.lastRunSnapshot === null) {
          const snapshotMode = nextData.mode
          const snapshotParams = nextData.modeParams?.[snapshotMode] || {}
          nextData.lastRunSnapshot = JSON.parse(JSON.stringify(snapshotParams))
        }
        return { ...n, data: nextData }
      }
      return n
    }))

    // ── 5. 为每次运行创建输出节点 ──
    const nodeWidth = capabilityNode.style?.width || 220
    const nodeX = capabilityNode.position.x
    const nodeY = capabilityNode.position.y

    // outputs[0] 为主输出(自动连线终点 + 输出节点 subType 依据)
    const primaryOutput = modeDef.outputs?.[0] || null
    const outputSubType = primaryOutput?.type || 'text'
    // LLM 输出(text 类)需要更宽:容纳 markdown 段落 + reasoning 折叠区
    const outputWidth = isLlm ? 300 : 200
    // audio 输出只有一条小播放条,不需要 image/video 那么高;LLM 走自己的尺寸
    const outputHeight = isLlm
      ? 200
      : outputSubType === 'audio' ? 100 : 160

    // capability 可声明 expandRuns(扩展点),把单次「点击运行」拆成 N 次迭代,
    // 每次迭代可独立覆盖 modeParams / collectedInputs / 节点名。
    // 缺省时退化为 runCount 次完全一致的迭代,保留原行为。
    let iterations
    try {
      iterations = capDef.expandRuns
        ? capDef.expandRuns({ mode, modeParams, collectedInputs, runCount })
        : Array.from({ length: runCount }, () => ({}))
    } catch (err) {
      message.warning(err?.message || '运行准备失败')
      return
    }
    if (!Array.isArray(iterations) || iterations.length === 0) {
      message.warning('没有可运行的内容')
      return
    }

    // ── 折叠形态(form 'folded')的"派生派发" ──
    // form 1 (separated): N 次迭代共享同一个能力节点, 输出节点垂直堆叠 (现状)
    // form 2 (folded)   : 每次迭代各自一个 (能力节点 + 输出节点 + 连线), 能力节点垂直堆叠
    //
    // 派生规则 (UX_SPEC §11.1 — 全状态派生, Ready 除外):
    //   - 节点 Ready: 第 1 次在原节点运行, 第 2..N 次派生新能力节点
    //   - 节点 Done/Failed/Running/Polling/Streaming: 全部 N 次都派生新节点
    //     (原节点保持当前状态: 产物保留 / 失败信息保留 / 进行中任务不打断)
    //
    // 例外: FailedCard 的"重试"按钮 (runCount=1, 无 draftOverride) 走 §6.4 原地
    // 重跑分支, 在上面的 4.5 节已 return; 此处只处理派生路径.
    //
    // 折叠态下能力节点本身的 runStatus 永远是 'idle' (capability 节点不再进入 running/locked,
    // 见上面 line 38 注释). 状态由下游输出节点反映, 所以判断 startWithDerive 必须读
    // 下游 output 节点的 runStatus, 而不是能力节点自己的.
    const folded = isFoldedCap
    const status = folded
      ? downstreamStatus
      : normalizeRunStatus(capabilityNode.data?.runStatus)
    // 全状态派生 (UX_SPEC §11.1): 非 Ready 一律派生, 不区分具体状态
    const startWithDerive = folded && status !== 'Ready'

    // 入边集合 (上游节点 -> 当前能力节点) — 派生时按 source/sourceHandle/targetHandle 复制
    // isDraft edges 单独拎出来 (DockedPanel 在不可变记录节点 draft 期间拉的新连线),
    // 派生时只转给"第一个派生节点"并清掉 isDraft 标记, 同时从画布上删掉.
    const allIncomingEdges = edges.filter(e => e.target === nodeId)
    const incomingDraftEdges = allIncomingEdges.filter(e => e.isDraft)
    const incomingEdgesForDerive = allIncomingEdges.filter(e => !e.isDraft)

    const now = Date.now()
    const newOutputs = []
    // 折叠派生的能力节点列表 (按派生顺序排列, 每个对应 iterations[i] 的"宿主")
    const derivedCapabilityNodes = []
    // 折叠派生节点自带的 internal 边 (能力节点→常驻 output, 由 deriveCapabilityNode 返回)
    const derivedInternalEdges = []
    // 上一次派生节点的 (高度 + 位置), 用于堆叠下一个派生节点
    let lastDeriveAnchor = {
      x: nodeX,
      y: nodeY,
      height: typeof capabilityNode.style?.height === 'number'
        ? capabilityNode.style.height
        : parseFloat(capabilityNode.style?.height) || 200,
    }

    // 非折叠形态下: 输出节点垂直堆叠的位置基准
    let separatedBaseY = nodeY
    let separatedOutputX = nodeX + nodeWidth + 200
    if (!folded) {
      const existingOutputs = nodes.filter(n =>
        isOutputNodeType(n.type) && (n.data?.sourceCapabilityId ?? n.data?.sourceAbilityId) === nodeId
      )
      if (existingOutputs.length > 0) {
        // 找到最底部的输出节点，新节点对齐其 X 并堆在它下面
        // 优先用 React Flow 测量出的实际渲染高度(measured.height)：
        // 失败节点会被错误信息撑高,style.height 仍是创建时的固定值 100/160,
        // 用 style.height 算出来的 bottom 偏小,新节点会塞进失败节点内部。
        const anchor = existingOutputs.reduce((acc, n) => {
          const measuredH = typeof n.measured?.height === 'number' ? n.measured.height : null
          const explicitH = typeof n.height === 'number' ? n.height : null
          const rawStyleH = n.style?.height
          const styleH = typeof rawStyleH === 'number' ? rawStyleH : parseFloat(rawStyleH) || null
          const h = measuredH ?? explicitH ?? styleH ?? outputHeight
          const bottom = n.position.y + h
          return !acc || bottom > acc.bottom ? { node: n, bottom } : acc
        }, null)
        separatedBaseY = anchor.bottom + OUTPUT_STACK_GAP
        separatedOutputX = anchor.node.position.x
      }
    }
    const outputStep = outputHeight + OUTPUT_STACK_GAP

    // 共享 task_id 的迭代分组 (num_outputs > 1 时, 一次 API 调用对应 N 个产物节点):
    //   iter.taskBatchKey 相同的迭代共用一个 extraTaskId 与一次提交;
    //   slotIndex === 0 是 primary (实际提交), slotIndex > 0 是 passive (跳过提交).
    const batchPrimaryExtraTaskId = new Map()

    // 同步：批量创建输出节点 + edges + 注册轮询
    for (let i = 0; i < iterations.length; i++) {
      const iter = iterations[i] || {}
      const batchKey = iter.taskBatchKey ?? null
      const slotIndex = batchKey != null ? (iter.slotIndex ?? 0) : null
      const isPrimary = batchKey == null || slotIndex === 0

      let extraTaskId
      if (batchKey != null && !isPrimary) {
        extraTaskId = batchPrimaryExtraTaskId.get(batchKey)
        if (!extraTaskId) {
          // expandRuns 必须保证同 batch 内 primary 排在 passive 之前; 否则跳过该迭代
          console.warn(`[useRunCapability] passive iteration ${i} 找不到同 batch 的 primary extraTaskId, skip`)
          continue
        }
      } else {
        extraTaskId = generateExtraTaskId()
        if (batchKey != null) batchPrimaryExtraTaskId.set(batchKey, extraTaskId)
      }
      // 把迭代覆盖应用到 inputSnapshot,让"输入参数回溯"展示真实提交的参数
      const iterModeParams = iter.modeParamsOverride
        ? { ...modeParams, ...iter.modeParamsOverride }
        : modeParams
      const iterCollectedInputs = iter.collectedInputsOverride
        ? { ...collectedInputs, ...iter.collectedInputsOverride }
        : collectedInputs
      const iterInputSnapshot = {
        capability,
        mode,
        params: iterModeParams,
        inputs: iterCollectedInputs,
      }

      // 决定本轮输出节点挂在哪个能力节点上 (hostNodeId) + 其位置
      let hostNodeId = nodeId
      let outputX
      let outputY
      // D-eager 三条 output 路径: 复用常驻(in-place Ready) / 派生自带(derive) / 新建(fresh)
      let reusedOutputNode = null
      let derivedOutputNode = null

      const shouldDeriveThisIter = folded && (startWithDerive || i > 0)

      if (shouldDeriveThisIter) {
        // 派生新能力节点:
        // - 同 capability: 复用原节点 mode/modeParams/portConnections (preserveParams: true)
        // - 跨 capability (DockedPanel 草稿切了能力): 不能复制旧 modeParams (schema 不兼容),
        //   走 preserveParams: false, 由 draft 提供新 capability 的初始 params
        const { nodes: derivedPair, edges: derivedPairEdges } = deriveCapabilityNode(
          {
            ...capabilityNode,
            position: { x: lastDeriveAnchor.x, y: lastDeriveAnchor.y },
            style: { ...capabilityNode.style, height: lastDeriveAnchor.height },
          },
          capability,
          { gap: DERIVE_VERTICAL_GAP, preserveParams: !isCrossCapability }
        )
        const derived = derivedPair[0]
        // 折叠 derive 自带常驻 output(derivedPair[1])+ internal 边(derivedPairEdges[0]),
        // 运行时复用它,不再单独建 output / capToOutputEdge。
        derivedOutputNode = derivedPair[1] || null
        if (derivedPairEdges[0]) derivedInternalEdges.push(derivedPairEdges[0])
        // 应用 draft 的 mode + params 到派生节点 (覆盖 deriveCapabilityNode 内部决定)
        derived.data.mode = mode
        derived.data.modeParams = {
          ...(derived.data.modeParams || {}),
          [mode]: { ...(derived.data.modeParams?.[mode] || {}), ...iterModeParams },
        }
        // 折叠态: 派生节点的初始 height 默认为 preset.initial.height (image=465),
        // CapabilityNode 挂载后 useEffect 会按 resolveTargetAspect(modeParams) 把 height
        // 调成 width / aspect (1536x1024 比例下 = 348/1.5 = 232). 但本循环里"下一个派生"
        // 的 y 位置依赖 lastDeriveAnchor.height —— 此时仍是 465, 比实际渲染高度大 233px,
        // 导致两个派生节点之间出现多余空隙. 这里直接按目标比例算出最终 height 写入,
        // 既消除空隙也避免节点挂载后的高度跳变.
        if (typeof capDef?.resolveTargetAspect === 'function') {
          const targetAspect = capDef.resolveTargetAspect(iterModeParams)
          if (Number.isFinite(targetAspect) && targetAspect > 0) {
            const w = typeof derived.style?.width === 'number'
              ? derived.style.width
              : parseFloat(derived.style?.width) || nodeWidth
            const expectedH = Math.round(w / targetAspect)
            derived.style = { ...derived.style, height: expectedH }
            derived.height = expectedH
          }
        }
        // capability 自定义的派生节点名 (如 batch 模式 "{前5字} [i/N]") — 写入 data.name
        // 让 FoldedHeaderNameEditor 显示, 而不是回退到 "未命名"
        if (typeof iter.nodeName === 'string' && iter.nodeName.length > 0) {
          derived.data.name = iter.nodeName
        }
        derivedCapabilityNodes.push(derived)
        hostNodeId = derived.id
        // 新派生节点的位置 = 上一锚点 y + height + gap
        const derivedX = derived.position.x
        const derivedY = derived.position.y
        outputX = derivedX + nodeWidth + 200
        outputY = derivedY
        // 更新锚点供下一次派生使用
        const newH = typeof derived.style?.height === 'number'
          ? derived.style.height
          : parseFloat(derived.style?.height) || 200
        lastDeriveAnchor = { x: derivedX, y: derivedY, height: newH }
      } else if (folded) {
        // 折叠形态首次迭代 (Ready 状态) → 在本节点内运行,复用创建时就带的常驻 output
        // (即上面状态反查到的同一个 output)。找不到(老画布无常驻 output)→ 走新建兜底。
        reusedOutputNode = downstreamOutputForStatus || null
        outputX = nodeX + nodeWidth + 200
        outputY = nodeY
      } else {
        // 非折叠形态 (form 1): N 次迭代都挂同一个能力节点, 输出节点垂直堆叠
        outputX = separatedOutputX
        outputY = separatedBaseY + i * outputStep
      }

      // outputNodeId: 复用→常驻 id;派生→derive 自带 output id;新建→生成新 id
      const outputNodeId = reusedOutputNode ? reusedOutputNode.id
        : derivedOutputNode ? derivedOutputNode.id
        : `output-${now}-${i}`

      // 运行态 data(三路径共用)。subType/renderer 按本次运行的 mode 取(覆盖复用/派生
      // 节点 createFoldedOutputNode 时按 default mode 设的值,杜绝跨 mode 产物类型不一致)。
      // label/autoPositioned 是 capability 级静态字段,复用/派生节点已带,仅新建路径补。
      const outputRunData = {
        subType: outputSubType,
        renderer: primaryOutput?.renderer || null,
        name: iter.nodeName,    // capability 自定义的节点名(如 batch 模式 [i/N] 前缀)
        content: isLlm ? { text: '' } : {},
        locked: true,
        // sourceCapabilityId 持久化字段。老画布用 sourceAbilityId,读取点统一做
        // `data.sourceCapabilityId ?? data.sourceAbilityId` 兜底(20+ OutputPanel + filter)
        sourceCapabilityId: hostNodeId,
        sourceCapability: capability,
        sourceMode: mode,
        inputSnapshot: iterInputSnapshot,
        // 路径 B 乐观提交：前端生成的查询 ID（后端可用它查询任务状态）
        extraTaskId,
        taskId: extraTaskId,    // 轮询使用的 ID（同时作为 extraTaskId 别名）
        realTaskId: null,       // submit 响应返回后填入（真实 tasks.id）
        runStatus: 'polling',   // 统一初始态：图/视频/音频=轮询；LLM=等 stream_url
        startedAt: Date.now(),  // 任务计时起点（NodeElapsedBadge 用）
        finishedAt: null,
        // 多图共享 task 的 slot 标记 (num_outputs > 1 拆分场景):
        //   batchKey 非空时 → 该节点属于一个共享 task 的 batch, slotIndex 用于 polling
        //   onSuccess 按 urls[slotIndex] 分发图; isPrimary 用于 submit 阶段跳过 passive.
        ...(batchKey != null ? { taskBatchKey: batchKey, slotIndex, isPrimary } : {}),
      }

      // 复用 → null(在 batchUpdateNodes 里把 outputRunData merge 进已有节点);
      // 派生 → derive 自带节点 + 运行态;新建 → 完整新节点。
      let outputNode = null
      if (reusedOutputNode) {
        outputNode = null
      } else if (derivedOutputNode) {
        outputNode = { ...derivedOutputNode, data: { ...derivedOutputNode.data, ...outputRunData } }
      } else {
        outputNode = {
          id: outputNodeId,
          type: `output-${capability}`,
          position: { x: outputX, y: outputY },
          data: {
            label: `${capDef.label} 输出`,
            autoPositioned: true,
            ...outputRunData,
          },
          style: {
            width: outputWidth,
            height: outputHeight,
          },
        }
      }

      newOutputs.push({
        outputNode,         // 复用时为 null
        outputData: outputRunData,
        outputNodeId,
        extraTaskId,
        iterModeParams,
        iterCollectedInputs,
        hostNodeId,
        isPrimary,
        reused: !!reusedOutputNode,
        // 复用(internal 边已在 store)/ 派生(internal 边来自 derive)→ 不再建 capToOutputEdge
        hasInternalEdge: !!(reusedOutputNode || derivedOutputNode),
      })
    }

    // 原子更新画布: 添加派生能力节点 + 输出节点 + edges
    // 节点编号由 index.jsx 用 computeNodeSeqMap 派生(渲染时即时计算), 此处不再写 canvasSeq
    //
    // 选中"用户视角下最底部的新增节点":
    //   - 折叠形态有派生 → 选最后一个派生能力节点 (堆叠最底部)
    //   - 折叠形态无派生 (Ready 首次 + 单 iter) → output 节点被 hiddenNodeIds 过滤,
    //     用户感知不到新节点 → 不动选中状态
    //   - 非折叠形态 → 选最后一个输出节点 (堆叠最底部)
    const bottomMostNodeId = folded
      ? (derivedCapabilityNodes.length > 0
          ? derivedCapabilityNodes[derivedCapabilityNodes.length - 1].id
          : null)
      : (newOutputs.length > 0
          ? newOutputs[newOutputs.length - 1].outputNodeId
          : null)
    facade.batchUpdateNodes(nds => {
      // 派生完成后, 老节点上的 _draft 字段已经"兑现"成新派生节点的真身, 清掉.
      // (清 _draft 后老节点端口集回归 node.data.capability/mode, DockedPanel 也会重置 draft)
      const cleared = derivedCapabilityNodes.length > 0
        ? nds.map(n => {
          if (n.id !== nodeId || !n.data?._draft) return n
          const { _draft: _drop, ...restData } = n.data
          return { ...n, data: restData }
        })
        : nds
      // 复用的常驻 output: 把运行态 data merge 进画布已有节点(不新增节点)
      const reusedById = new Map(
        newOutputs.filter(o => o.reused).map(o => [o.outputNodeId, o])
      )
      const existing = (bottomMostNodeId
        ? cleared.map(n => (n.selected ? { ...n, selected: false } : n))
        : cleared
      ).map(n => {
        const r = reusedById.get(n.id)
        return r ? { ...n, data: { ...n.data, ...r.outputData } } : n
      })
      const newCaps = derivedCapabilityNodes.map(c =>
        c.id === bottomMostNodeId ? { ...c, selected: true } : c
      )
      // 新建/派生的 output 才追加(复用的已 merge 进 existing)
      const newOuts = newOutputs
        .filter(o => !o.reused)
        .map(o =>
          o.outputNodeId === bottomMostNodeId
            ? { ...o.outputNode, selected: true }
            : o.outputNode
        )
      return [...existing, ...newCaps, ...newOuts]
    })
    // 能力节点 → 输出节点的自动连线:sourceHandle 用主输出端口 id
    // 派生新能力节点时, 还要复制原节点的所有入边 (上游 -> 派生节点) 让派生节点接到同样的输入
    const primarySourceHandle = primaryOutput?.id
    facade.batchUpdateEdges(eds => {
      // 仅新建 output 需要 cap→output 边;复用(internal 边已在 store)/ 派生(internal 边
      // 来自 derive, 见 derivedInternalEdges)的 hasInternalEdge 为 true, 跳过。
      const capToOutputEdges = newOutputs
        .filter(o => !o.hasInternalEdge)
        .map(o => ({
          id: `edge-${o.hostNodeId}-${o.outputNodeId}`,
          source: o.hostNodeId,
          sourceHandle: primarySourceHandle,
          target: o.outputNodeId,
          targetHandle: 'input',
          type: 'custom',
        }))
      // 派生能力节点继承原节点的入边 (UX_SPEC §7.4)
      // 跨 capability 派生时: 按新 capability 的 input ids 过滤 (旧端口在新 capability 可能不存在)
      const allowedTargetHandles = isCrossCapability
        ? new Set(inputDefs.map(i => i.id))
        : null

      const incomingEdgeIdsForDerive = new Set(incomingEdgesForDerive.map(e => e.id))
      const inheritedEdges = []

      // 统一走"复制"路径: 所有派生节点都复制原入边, 原节点入边不动
      // (detachAndRelocate 已移除, 不再区分是否切了 mode)
      for (let dIdx = 0; dIdx < derivedCapabilityNodes.length; dIdx++) {
        const derived = derivedCapabilityNodes[dIdx]
        for (const e of incomingEdgesForDerive) {
          if (allowedTargetHandles && !allowedTargetHandles.has(e.targetHandle)) continue
          // 派生节点本身还没进入 nodes 数组, 但 resolveEdgeCapabilityMode 只读 type / data,
          // 直接传 derived 即可拿到当前 (capability, mode) 下端口的通用/specific 归属
          const capabilityMode = resolveEdgeCapabilityMode(derived, e.targetHandle)
          inheritedEdges.push({
            id: `edge-${e.source}-${e.sourceHandle || ''}-${derived.id}-${e.targetHandle || ''}-${now}-${dIdx}`,
            source: e.source,
            sourceHandle: e.sourceHandle,
            target: derived.id,
            targetHandle: e.targetHandle,
            type: 'custom',
            ...(capabilityMode !== undefined ? { data: { capabilityMode } } : {}),
          })
        }
      }

      let nextEdges = eds

      // ── isDraft edges 转给首个派生节点 ──
      // 1. 从画布上删掉老节点上的所有 isDraft edges
      // 2. 复制成"指向首个派生节点"的正式 edge (清 isDraft 标记 / 清 failed/is-orphan)
      // 派生 cap === draftOverride.capability, 所以新派生节点的端口集就是 draft 端口集,
      // 这些 edge 的 targetHandle 不需要再迁, 直接复用即可.
      const draftDerivedEdges = []
      if (incomingDraftEdges.length > 0 && derivedCapabilityNodes.length > 0) {
        const firstDerived = derivedCapabilityNodes[0]
        const draftEdgeIds = new Set(incomingDraftEdges.map(e => e.id))
        nextEdges = nextEdges.filter(e => !draftEdgeIds.has(e.id))
        for (const e of incomingDraftEdges) {
          if (allowedTargetHandles && !allowedTargetHandles.has(e.targetHandle)) continue
          const capabilityMode = resolveEdgeCapabilityMode(firstDerived, e.targetHandle)
          draftDerivedEdges.push({
            id: `edge-${e.source}-${e.sourceHandle || ''}-${firstDerived.id}-${e.targetHandle || ''}-${now}-draft`,
            source: e.source,
            sourceHandle: e.sourceHandle,
            target: firstDerived.id,
            targetHandle: e.targetHandle,
            type: 'custom',
            ...(capabilityMode !== undefined ? { data: { capabilityMode } } : {}),
          })
        }
      }

      return [...nextEdges, ...inheritedEdges, ...draftDerivedEdges, ...capToOutputEdges, ...derivedInternalEdges]
    })

    // 注册 pending request + 加入轮询队列
    for (const { outputNodeId, extraTaskId } of newOutputs) {
      registerPendingRequest(outputNodeId, {
        appId: 'ai-canvas',
        type: isLlm ? 'sse-pending' : 'polling',
        capability,
      })
      addPollingTask?.(extraTaskId, outputNodeId)
    }

    // 立即保存画布（确保刷新后能恢复）
    triggerSave?.()

    // 平移画布: 仅"用户视觉上能感知到的新节点"才平移; 原地运行画布不动
    //   - 折叠态派生 → 平移到最后一个派生 capability 节点(它本身的 measured 已包含折叠产物视觉高度)
    //   - 非折叠态新增输出 → 平移到这次新增的所有 output 节点 union bbox
    //   - 折叠态原地运行(Ready 首次单 iter)→ output 节点被渲染层隐藏, 用户无感知, 不平移
    // 已禁用：自动 pan 到新派生节点 / 新输出节点会让用户视野突然跳，干扰体验。
    // 用户可通过 mini map 或手动滚动找新节点。Task 13 用户反馈"运行不该移动画布"。
    // 保留 panToNodesBounds 注入便于按需恢复。

    // ── 6. 后台异步提交 ──
    const urlSegment = getModelSeries(capability, mode)

    // 同 batch 内 passive 节点列表 (供 primary 提交成功 / 409 换 ID 时同步更新)
    const siblingsByPrimaryId = new Map()
    for (const out of newOutputs) {
      const data = out.outputData
      if (data.taskBatchKey == null) continue
      const primaryEntry = newOutputs.find(o =>
        o.outputData.taskBatchKey === data.taskBatchKey && o.outputData.isPrimary
      )
      if (!primaryEntry) continue
      if (!siblingsByPrimaryId.has(primaryEntry.outputNodeId)) {
        siblingsByPrimaryId.set(primaryEntry.outputNodeId, [])
      }
      siblingsByPrimaryId.get(primaryEntry.outputNodeId).push(out.outputNodeId)
    }

    const submitOne = async ({ outputNodeId, extraTaskId, iterModeParams, iterCollectedInputs, isPrimary }) => {
      // passive (slotIndex > 0): 共享 primary 的 task, 不提交 API. 轮询里 useTaskPolling
      // 已 dedup, primary 提交时该 extraTaskId 会被多个 localId 监听, polling onSuccess
      // 按 slotIndex 分发图.
      if (!isPrimary) return
      const siblingNodeIds = siblingsByPrimaryId.get(outputNodeId) || [outputNodeId]
      console.log('🟢 [DBG submitOne] about to submitWithRetry', { outputNodeId, extraTaskId, urlSegment, capability, mode })
      await submitWithRetry({
        nodeType,
        capability,
        mode,
        modeParams: iterModeParams,
        collectedInputs: iterCollectedInputs,
        canvasId,
        nodeId,
        urlSegment,
        outputNodeId,
        siblingNodeIds,
        extraTaskId,
        isLlm,
        batchUpdateNodes: facade.batchUpdateNodes,
        removePollingTask,
        addPollingTask,
        startSseStream,
        taskClient,
        uploader,
      })
    }

    await Promise.allSettled(newOutputs.map(submitOne))
  }, [nodes, edges, setNodes, setEdges, canvasId, triggerSave, addPollingTask, removePollingTask, startSseStream, panToNodesBounds, taskClient, uploader, facade])

  return { run }
}

// ─── 内部辅助 ───

async function submitWithRetry({
  nodeType,
  capability,
  mode,
  modeParams,
  collectedInputs,
  canvasId,
  nodeId,
  urlSegment,
  outputNodeId,
  siblingNodeIds,   // 共享同一 task 的所有节点 (含 primary 自身); 单输出场景 = [outputNodeId]
  extraTaskId,
  isLlm,
  batchUpdateNodes,
  removePollingTask,
  addPollingTask,
  startSseStream,
  taskClient,
  uploader,
}) {
  // polling 队列里当前用的查询 key,会随两类事件变化:
  //   1) 409 冲突重试 → 换成新生成的 newExtraTaskId
  //   2) submit 成功后 resp.taskId 与 extraTaskId 不同 → 切到 resp.taskId
  //      (某些 TaskClient 实现里上游 API 不识别 extra_task_id 字段,返回的是上游
  //      自己的 task_id,polling 必须用这个真实 ID 才能查到)
  let currentPollingKey = extraTaskId
  const allNodeIds = siblingNodeIds && siblingNodeIds.length > 0 ? siblingNodeIds : [outputNodeId]
  const allNodeIdsSet = new Set(allNodeIds)
  // 同 batch 重新登记轮询: 老 key 整条删除, 新 key 给每个节点都登记一次 (useTaskPolling
  // 内部 dedup, 实际查询请求不会重复)
  const reregisterPolling = (oldKey, newKey) => {
    removePollingTask?.(oldKey)
    for (const id of allNodeIds) addPollingTask?.(newKey, id)
  }

  const attempt = async (currentExtraTaskId) => {
    const built = buildRequestBody({
      nodeType,
      capability,
      mode,
      modeParams,
      collectedInputs,
      canvasId,
      nodeId,
    })
    const body = built.body
    const urlFields = built.urlFields || []
    // builder 声明的"外部 URL"(如 Gemini 视频粘贴的 YouTube 链接) ——
    // 不在我们 OSS 控制下、HEAD 探测会被 CORS 拦、健康检查/自愈对它们都不适用。
    const externalUrls = new Set(built.externalUrls || [])

    // ── URL 探测 + 自愈 ──
    // 把节点先标 validating, 让 UI 显示"校验中"状态(色同 polling).
    // 探测 body 里 urlFields 声明的所有 URL → 失效的从浏览器缓存重传拿新 url →
    // 替换 body + 同步节点 data.content.url. 任一失效 URL 既无缓存也无法上传 → 整体抛错.
    batchUpdateNodes(nds => nds.map(n =>
      allNodeIdsSet.has(n.id) ? { ...n, data: { ...n.data, runStatus: 'validating' } } : n
    ))
    await healUrlsInBody(body, urlFields, uploader, batchUpdateNodes, allNodeIdsSet, externalUrls)

    body.extra_task_id = currentExtraTaskId

    // 自愈成功后切回 polling, 让后续 submit 进入正常态(LLM 还会被 stream_url 接管)
    batchUpdateNodes(nds => nds.map(n =>
      allNodeIdsSet.has(n.id) && n.data?.runStatus === 'validating'
        ? { ...n, data: { ...n.data, runStatus: 'polling' } }
        : n
    ))

    return taskClient.submit({
      nodeType,
      capability: urlSegment || capability,
      mode,
      body,
    })
  }

  try {
    let resp
    try {
      resp = await attempt(extraTaskId)
    } catch (err) {
      // 409 冲突：换一个 extra_task_id 再试一次；仍冲突视为前端 bug
      if (isConflictError(err)) {
        const newExtraTaskId = generateExtraTaskId()
        console.warn(
          `[useRunCapability] extra_task_id 冲突，换新 ID 重试: ${extraTaskId} → ${newExtraTaskId}`
        )
        // 更新轮询队列 + 节点数据 (同 batch 全部节点)
        reregisterPolling(currentPollingKey, newExtraTaskId)
        currentPollingKey = newExtraTaskId
        batchUpdateNodes(nds => nds.map(n =>
          allNodeIdsSet.has(n.id)
            ? { ...n, data: { ...n.data, extraTaskId: newExtraTaskId, taskId: newExtraTaskId } }
            : n
        ))
        try {
          resp = await attempt(newExtraTaskId)
        } catch (err2) {
          if (isConflictError(err2)) {
            console.error(
              '[useRunCapability] 第二次 extra_task_id 仍冲突，前端 ID 生成规则可能有 bug',
              { first: extraTaskId, second: newExtraTaskId, error: err2 }
            )
          }
          throw err2
        }
      } else {
        throw err
      }
    }

    // 提交成功：记录真实 task.id (装饰层才有,基础实现永远 null)
    const realTaskId = resp?.realTaskId || null
    // platform/interfaces/TaskClient.js 契约:SubmitResult.taskId 是「轮询查询 id」,
    // 必须用它作为 polling key。当 resp.taskId 与 currentPollingKey 不同时(例如
    // TaskClient 实现里上游 API 不识别 extra_task_id 字段、返回的是上游自己的
    // task_id),必须把 polling key 切到 resp.taskId,否则后续 queryStatus 查不到。
    const submittedTaskId = resp?.taskId
    if (submittedTaskId && submittedTaskId !== currentPollingKey) {
      reregisterPolling(currentPollingKey, submittedTaskId)
      currentPollingKey = submittedTaskId
    }
    batchUpdateNodes(nds => nds.map(n =>
      allNodeIdsSet.has(n.id)
        ? { ...n, data: { ...n.data, taskId: submittedTaskId || n.data.taskId, realTaskId } }
        : n
    ))

    // LLM：直接用返回的 stream_url 启动 SSE，省一次轮询 tick
    if (isLlm && resp?.streamUrl) {
      // 从轮询移出，由 SSE 接管 (B.1.3 指出此行为待 P6 重构)
      removePollingTask?.(currentPollingKey)
      startSseStream?.(outputNodeId, resp.streamUrl)
    }
    // 异步任务 / LLM 未返回 stream_url：继续由轮询推进
  } catch (err) {
    console.error(`[useRunCapability] 提交失败 ${outputNodeId}:`, err)
    removePollingTask?.(currentPollingKey)
    for (const id of allNodeIds) unregisterPendingRequest(id)
    const errorMsg = err?.message || String(err) || '提交失败'
    batchUpdateNodes(nds => nds.map(n =>
      allNodeIdsSet.has(n.id)
        ? {
          ...n,
          data: {
            ...n.data,
            runStatus: 'error',
            finishedAt: Date.now(),
            content: { ...(n.data.content || {}), error: errorMsg, rawError: err },
          },
        }
        : n
    ))
    message.error(`运行失败: ${errorMsg}`)
  }
}

function isConflictError(err) {
  // 后端 ConflictException → HTTP 409 + body.code = 409
  // 前端 utils/request.js 抛错时附带 error.status 和 error.code
  if (!err) return false
  if (err.status === 409) return true
  if (err.code === 409) return true
  // 兜底：按 message 匹配 extra_task_id 冲突信息
  const msg = err.message || ''
  return /extra_task_id/i.test(msg) && /冲突|已被|存在/.test(msg)
}

/**
 * 提交前 URL 健康检查 + 自愈
 *
 * 流程:
 *   1. 抽出 body 里 urlFields 声明的所有 URL
 *   2. 过滤掉 externalUrls (来自带 content.external 标记节点的 URL,如 YouTube)
 *   3. probeUrlsBatch HEAD 探测 (并行,2s 超时)
 *   4. 失效的走 selfHealUrlsBatch:从浏览器 Cache 取 blob → uploader.uploadFile 拿新 URL
 *   5. urlMap (oldUrl → newUrl) 替换 body 中所有引用 + 同步节点 data.content.url / urls
 *   6. 任一失效 URL 既无缓存也无法上传 → 整体抛错(让上层走 catch 给节点标 error)
 *
 * 不抛错的情况:全部 URL 探测 ok / 部分失效但全部自愈成功 / urlFields 为空 / 全部是 external
 */
async function healUrlsInBody(body, urlFields, uploader, batchUpdateNodes, allNodeIdsSet, externalUrls) {
  const allUrls = extractUrlsFromBody(body, urlFields)
  const urls = externalUrls && externalUrls.size > 0
    ? allUrls.filter(u => !externalUrls.has(u))
    : allUrls
  if (urls.length === 0) return

  const probeResults = await probeUrlsBatch(urls, { timeout: 2500, concurrency: 4 })
  const deadUrls = []
  for (const r of probeResults) {
    if (!r.ok) deadUrls.push(r.url)
  }
  if (deadUrls.length === 0) return

  console.log(`[useRunCapability] 提交前发现 ${deadUrls.length} 个失效 URL,启动自愈:`, deadUrls)
  const { success, failures } = await selfHealUrlsBatch(deadUrls, uploader, { concurrency: 2 })

  if (failures.length > 0) {
    // 任一 URL 自愈失败 → 抛错让上层进 catch (整个 submit 中止)
    // 外层 submitWithRetry catch 会调 message.error 展示该 message,这里不重复 toast.
    const reasons = failures.map(({ url, error }) => {
      if (error instanceof CacheMissError) {
        // 找出该 URL 对应的探测原因便于用户理解
        const probe = probeResults.find(p => p.url === url)
        const reasonText = probe?.reason ? REASON_MESSAGES[probe.reason] || REASON_MESSAGES[LOAD_ERROR_REASONS.UNKNOWN] : '已失效'
        return `${shortenUrl(url)}: ${reasonText}, 浏览器缓存中也无备份, 请重新上传`
      }
      return `${shortenUrl(url)}: ${error?.message || '上传失败'}`
    })
    const summary = `${failures.length} 个资源无法自动续期\n${reasons.join('\n')}`
    throw new Error(summary)
  }

  // 全部自愈成功 → 替换 body + 同步节点
  replaceUrlsInBody(body, urlFields, success)
  syncUrlReplacementsToNodes(batchUpdateNodes, success)

  // 节点是输入节点(content)且 url 被替换的,提示一下
  if (success.size > 0) {
    console.log(`[useRunCapability] 自愈完成,替换了 ${success.size} 个 URL`)
  }
}

function shortenUrl(url) {
  if (typeof url !== 'string') return ''
  if (url.length <= 80) return url
  return url.slice(0, 50) + '...' + url.slice(-20)
}

/**
 * 把 urlMap (oldUrl → newUrl) 同步替换到画布所有节点的 data.content.url / urls.
 * 这一步让 Renderer 立即用新 URL 显示,且下次再点运行时 collectedInputs 已经是新 URL.
 *
 * 注意: 仅替换 data.content.url / data.content.urls.
 * data.modeParams 里面板存的图片(如 {url, name} 数组)暂不同步,接受下次运行时再次自愈的代价.
 */
function syncUrlReplacementsToNodes(batchUpdateNodes, urlMap) {
  if (!urlMap || urlMap.size === 0) return
  batchUpdateNodes(nds => nds.map(n => {
    const content = n.data?.content
    if (!content) return n
    const oldUrl = content.url
    const oldUrls = content.urls

    let nextContent = content
    let changed = false

    if (typeof oldUrl === 'string' && urlMap.has(oldUrl)) {
      nextContent = { ...nextContent, url: urlMap.get(oldUrl) }
      changed = true
    }
    if (Array.isArray(oldUrls)) {
      const newUrls = oldUrls.map(u => urlMap.has(u) ? urlMap.get(u) : u)
      if (newUrls.some((u, i) => u !== oldUrls[i])) {
        nextContent = { ...nextContent, urls: newUrls }
        changed = true
      }
    }

    return changed ? { ...n, data: { ...n.data, content: nextContent } } : n
  }))
}
