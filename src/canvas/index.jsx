import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  MiniMap,
  Controls,
  Panel,
  useStore,
  useReactFlow,
} from '@xyflow/react'
import { message, Modal, Spin } from 'antd'
import '@xyflow/react/dist/style.css'
import './styles.css'

// ─── 子能力注册(触发各 register.js 把自己注入到 abilities.js 的收集器)───
import '@/capabilities'

// ─── 节点 & 连线 ───
import InputNode from './components/nodes/InputNode'
import CapabilityNode from './components/nodes/CapabilityNode'
import NoteNode from './components/nodes/NoteNode'
import CustomEdge from './components/edges/CustomEdge'
import { OUTPUT_NODE_TYPES } from './registry/outputNodeTypes'

// ─── 面板 ───
import NodePanel from './panels/NodePanel'
import DockedPanel from './panels/DockedPanel'

// ─── P4 组件 ───
import Toolbar from './components/Toolbar'
import BrandLogo from './components/BrandLogo'
import NodeToolbarPortal from './components/NodeToolbarPortal'
import ZoomCssVarSetter from './components/ZoomCssVarSetter'
import TopRightCluster from './components/TopRightCluster'
import CanvasContextMenu from './components/CanvasContextMenu'
import CanvasManager from './components/CanvasManager'
import CanvasZoomIndicator from './components/CanvasZoomIndicator'

// ─── Hooks ───
import useAutoSave from './hooks/useAutoSave'
import useAutoStackReflow from './hooks/useAutoStackReflow'
import useCanvasActions from './hooks/useCanvasActions'
import useRunCapability from './hooks/useRunCapability'
import useTaskPolling from './hooks/useTaskPolling'
import useCanvasViewport from './hooks/useCanvasViewport'
import useNodeInsertion from './hooks/useNodeInsertion'
import useCanvasContextMenu from './hooks/useCanvasContextMenu'
import useCanvasDragDrop from './hooks/useCanvasDragDrop'
import useCanvasClipboardImage from './hooks/useCanvasClipboardImage'
import useCanvasPanel from './hooks/useCanvasPanel'
import useCanvasConnection from './hooks/useCanvasConnection'
import useCanvasPanMode from './hooks/useCanvasPanMode'
import useBoxSelectEdges from './hooks/useBoxSelectEdges'

// ─── 状态写访问层 ───
import { useCanvasFacade } from './state/canvasFacade'
import { CanvasDerivedProvider, useFoldedOutputMap, useStoreNodes, useStoreEdges } from './state/canvasDerived'

// ─── 工具 ───
import { loadCanvas } from './utils/canvasStorage'
import { migrateCapabilityNodes } from './utils/migrateCapabilityNodes'
import { useSettings, useCanvasStore, useUploader, useTaskClient } from '@/platform/provider.jsx'
import {
  createInputNode,
  createCapabilityNode,
  createNoteNode,
} from './utils/nodeFactory'
import { backfillCanvasSeq } from './utils/canvasSeq'
import { defaultTemplate } from './templates/default'
import {
  registerPendingRequest,
  unregisterPendingRequest,
  clearPendingRequests,
  markAppReady,
} from '@/utils/tabSession'
import {
  isOutputNodeType,
  getCapabilityPrimaryOutput,
  isFoldedCapability,
} from './registry/nodeTypes'
import { resolveContentByCapability } from './utils/resolveContentByCapability'
import { getCanvasIdFromUrl, updateCanvasIdInUrl } from './utils/canvasUrl'
import { CANVAS_VERSION } from './version'
import { setCanvasSnapshotProvider } from '@/utils/errorReport'
import { useRenderRateMonitor, useRenderDiff } from '@/utils/renderRateMonitor'
import { onEvent, EVENTS } from '@/utils/eventBus'
import { buildMaterialNode } from './utils/buildMaterialNode'

// ─── 媒体缓存 ───
import { CanvasIdContext } from './contexts/CanvasIdContext'
import { PanelContext } from './contexts/PanelContext'
import { CapabilityRuntimeContext } from './contexts/CapabilityRuntimeContext'
import { CanvasEditingContext } from './contexts/CanvasEditingContext'
import { NodeActionExtrasContext } from './contexts/NodeActionExtrasContext'

// 模块级默认值（恒返 null），避免 Provider value 每次 render 都新建对象
const defaultNodeActionExtras = () => null
import {
  registerCanvasUrls,
  extractMediaUrlsFromNodes,
  ensurePersistentStorage,
  checkQuotaAndWarn,
  prefetchCanvasMedia,
} from './utils/mediaCache'

// ─── 转存重试常量 ───
const TRANSFER_RETRY_MAX = 5

// ─── SSE 静默 watchdog 常量 ───
// 每 5 秒 tick 一次, 距上次 chunk/status ≥ 5 秒就调 queryStatus 主动确认任务终态:
//   - task 已 completed → 写 done (即使 SSE 还没 done)
//   - task failed/canceled/interrupted → 写 error (保留已流出的 text)
//   - task 仍在跑 → 不动, 继续等现有 SSE
// 解决"后端 SSE proxy 已经放弃但前端无法感知"的 stuck 问题。
const SSE_WATCHDOG_TICK_MS = 5_000

// ─── ReactFlow prop 稳定引用 ───
// 这些值不随渲染变化, 提到模块级避免每次 render 产生新引用导致 StoreUpdater 在
// useLayoutEffect 里反复触发 store.setState (tracked fields 包含 defaultEdgeOptions
// 等; 不稳引用 + 多个 store 订阅一起放大会撑爆嵌套更新)
const DEFAULT_EDGE_OPTIONS = { type: 'custom' }
const ZOOM_ACTIVATION_KEYS = ['Meta', 'Control']
const RF_PRO_OPTIONS = { hideAttribution: true }
// panOnDrag: 中键(button=1)拖动平移. 非平移模式下用数组形式; 平移模式下用 true.
// 提到模块级避免内联 `[1]` 每渲染都换新数组
const PAN_ON_DRAG_NORMAL = [1]

/**
 * 把当前画布状态打成一份适合塞进错误日志的快照 (扁平 JSON, 体积可控).
 *
 * 节点数据只取关键属性 + 计数, 不带 base64 / url, 防止把大型素材写进日志.
 * runStatusCounts / nodeTypeCounts 等聚合视图比逐节点 dump 更有助于事后定位.
 */
function buildCanvasSnapshot(state) {
  if (!state) return null
  const nodes = Array.isArray(state.nodes) ? state.nodes : []
  const edges = Array.isArray(state.edges) ? state.edges : []
  const nodeTypeCounts = {}
  const capabilityCounts = {}
  const runStatusCounts = {}
  const foldedCapNodes = []
  let measuredCount = 0
  let withErrorCount = 0
  for (const n of nodes) {
    const t = n.type || 'unknown'
    nodeTypeCounts[t] = (nodeTypeCounts[t] || 0) + 1
    if (n.type === 'capability' && n.data?.capability) {
      capabilityCounts[n.data.capability] = (capabilityCounts[n.data.capability] || 0) + 1
      try {
        // 不在这里 import isFoldedCapability — 避免循环依赖; 用 data 字段近似判断
        if (n.data?._imageAspect || n.data?._mediaWidth) foldedCapNodes.push(n.id)
      } catch { /* ignore */ }
    }
    if (n.data?.runStatus) {
      const s = n.data.runStatus
      runStatusCounts[s] = (runStatusCounts[s] || 0) + 1
    }
    if (n.measured?.width || n.measured?.height) measuredCount++
    if (n.data?.content?.error) withErrorCount++
  }
  return {
    canvasId: state.canvasId,
    canvasName: state.canvasName,
    loading: state.loading,
    selectedNodeId: state.selectedNodeId,
    initialViewport: state.initialViewport,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodeTypeCounts,
    capabilityCounts,
    runStatusCounts,
    measuredCount,
    withErrorCount,
    foldedCapNodes: foldedCapNodes.slice(0, 20),
    // 节点位置 + 尺寸 (最多前 30 个) — 用来排查布局类问题
    nodesSlim: nodes.slice(0, 30).map(n => ({
      id: n.id,
      type: n.type,
      cap: n.data?.capability || null,
      mode: n.data?.mode || null,
      runStatus: n.data?.runStatus || null,
      pos: n.position ? { x: Math.round(n.position.x), y: Math.round(n.position.y) } : null,
      size: { w: n.width, h: n.height, sw: n.style?.width, sh: n.style?.height },
      measured: n.measured || null,
      autoPositioned: n.data?.autoPositioned ?? null,
    })),
    edgesSlim: edges.slice(0, 30).map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
    })),
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 内层组件（需要 useReactFlow）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * @typedef {object} AiCanvasInnerProps
 * @property {boolean} [readonly]            是否只读模式 (默认 false)。本地实现总是 false;
 *                                           装饰层实现根据编辑锁状态由 CanvasShell 注入
 * @property {React.ReactNode} [overlaySlot] 渲染在画布顶部的装饰区(只读 banner / 协作头像等),装饰层实现用
 * @property {React.ReactNode} [topRightSlot] 右上角胶囊里头像/设置 icon 槽(由父级注入,如用户头像或设置 icon)
 * @property {React.ReactNode} [brandExtra] 左上角 logo 右侧的扩展槽(如 GitHub 链接)
 * @property {React.ReactNode[]} [toolbarExtras] 工具栏额外按钮(如素材库),追加在 ABILITY_BUTTONS 后面,带 divider
 * @property {(node: object) => React.ReactNode} [nodeActionExtras] 选中态工具栏 actions 段额外按钮渲染函数,
 *                                           接节点对象返回 ReactNode(null 表示不渲染)。装饰层用于注入
 *                                           "加入素材库"等额外操作。
 * @property {() => void} [onOpenSettings]   点击设置按钮的回调,父级决定打开什么 UI(基础入口可挂简化设置面板,装饰层可挂完整设置模态)
 * @property {() => void} [onOpenManager]    点击画布管理按钮的回调
 * @property {(canvasId: string) => Promise<void>} [onBeforeSwitchCanvas] 切换画布前的副作用(装饰层:释放锁)
 * @property {(canvasId: string, lockStatus: object | null) => void} [onCanvasSwitched]
 *                                           画布切换/创建/初次加载完成后通知父级(装饰层:同步 currentCanvasId +
 *                                           initialLockStatus 给 useEditLock)
 * @property {({ taskId, helpers }) => Promise<void>} [transferRetryHandler]
 *                                           画布提供:incRetryCount / resumePolling / notifyError。
 *                                           本地实现不传(transfer_failed 永不触发)。详见 CLAUDE.md
 *                                           §装饰层解耦原则。
 */

// ── 节点 / 边类型（模块级常量，保证整个进程内引用稳定，避免 React Flow "new nodeTypes" 警告 + 重 mount）
// 依赖 import 顺序：上方 `import '@/capabilities'` 已使 CAPABILITY_OUTPUT_NODE_TYPES 完整填充，
// 再 import 的 outputNodeTypes 才会拷贝出有效 OUTPUT_NODE_TYPES。
const NODE_TYPES = {
  input: InputNode,
  capability: CapabilityNode,
  note: NoteNode,
  ...OUTPUT_NODE_TYPES,
}
const EDGE_TYPES = { custom: CustomEdge }

function AiCanvasInner({
  readonly = false,
  overlaySlot,
  topRightSlot,
  brandExtra,
  toolbarExtras,
  nodeActionExtras,
  onOpenSettings,
  onOpenManager,
  onBeforeSwitchCanvas,
  onCanvasSwitched,
  transferRetryHandler,
} = {}) {
  // 监控渲染频率, 1 秒内 >50 次会进错误日志面包屑
  useRenderRateMonitor('AiCanvasInner')

  // ── ReactFlow 实例 ──
  const { getViewport, setViewport, screenToFlowPosition, setCenter, getNode, getEdges } = useReactFlow()

  // ── 画布状态写访问层 —— 所有节点/边的写经此命令式 API ──
  const facade = useCanvasFacade()

  // 输出节点自动堆叠重排：失败节点被错误信息撑高 / loading→结果切换时,
  // 把"自己之下"的兄弟节点同步下移,避免重叠。仅对 autoPositioned 节点生效。
  useAutoStackReflow()

  // 拖动鼠标框选 — 扩展 RF 12 默认行为, 让框中路径相交的 edges 也被选中
  // (默认 RF 12 只选 node, edge 仅当两端 node 都被框中时跟选).
  useBoxSelectEdges()

  // ── platform 接口实例(由父级装饰层 shell 注入) ──
  const settings = useSettings()
  const canvasStore = useCanvasStore()
  const uploader = useUploader()
  const taskClient = useTaskClient()

  // ── 节点类型（用模块级常量 NODE_TYPES / EDGE_TYPES，避免 dev HMR 时 useMemo 失效触发 ReactFlow "new nodeTypes" 警告 + 整树重 mount） ──

  // ── 核心状态 ──
  // 单一数据源 = React Flow 内部 store。<ReactFlow> 不吃 nodes/edges 受控 prop,
  // 写入统一走 facade(底层 useReactFlow 直写 store);需要"完整数组且随之重渲染"的
  // 消费方(运行能力 / 复制粘贴 / 连线清理 / 视口空位计算等)用响应式 store 读取。
  const nodes = useStoreNodes()
  const edges = useStoreEdges()
  // 首次挂载播种用的种子(defaultNodes/defaultEdges)。<ReactFlow> 只在挂载那一刻读一次,
  // 所以加载/切换画布时同时更新它 + 调 facade.replaceAll,两份数据一致(幂等),
  // 无论 RF 重挂走 defaultNodes 重播种、还是 replaceAll 直写 store 生效,结果都是加载到的节点。
  const [seedNodes, setSeedNodes] = useState([])
  const [seedEdges, setSeedEdges] = useState([])

  // ── 节点 z-index 单调递增计数器 (bring-to-front 持久化) ──
  // 每次点击节点把它 zIndex 设为 counter++, 让被点节点永远浮到上层 (即使取消选中也保留 z).
  // 解决 PR-3 后 NodeMetaRow 改成无框浮文字, RF 默认 selected 节点 z 提升 +1000 / 取消选中
  // 又回落, 导致 meta 飞到相邻未选中节点内部的视觉问题.
  const nodeZCounterRef = useRef(1)

  // 折叠 output id 集合(由 CanvasDerivedProvider 内的 FoldedOutputGuard 实时同步)。
  // 给 onSelectionChange 兜底过滤用 —— AiCanvasInner 在 provider 之外, 无法直接读 context。
  const foldedOutputIdsRef = useRef(new Set())

  // 折叠 output → { parentId, parentHandle } 反查表(同步自 FoldedOutputGuard)。
  // 给 onBeforeDelete 用 —— 删 folded capability parent 时, 需要按 parentId 找出
  // 它的全部 folded output 一起删, 否则 output 会失去归属变成画布上的孤儿节点。
  const foldedMapRef = useRef(new Map())

  // 折叠过滤 / 边重写 / 序号 / 隐藏入边数 / 下游产物注入 等"派生数据"已下沉到组件层:
  //   - 折叠 output:渲染层不再过滤, 由 outputNodeTypes 的折叠壳渲染为不可见 1×1(保留隐形 Handle)
  //   - 边端点重写 + mode 隐藏:CustomEdge 自解析(useFoldedOutputMap + 自身 internal/mode 判定)
  //   - 序号 / 隐藏入边数 / 下游产物:消费方用 useNodeSeq / useHiddenEdgeCount / useDownstreamOutputs
  // 因此 <ReactFlow> 直接吃 raw nodes/edges, 不再有"派生过滤 prop"这层。

  // NodeToolbarPortal / llm OutputNode 等视口外组件直接用 useStoreNodes / useStoreEdges
  // 响应式读取完整数组,不再经 Context 注入(单一数据源)。
  const [canvasId, setCanvasId] = useState(null)
  const [canvasName, setCanvasName] = useState('')
  const [loading, setLoading] = useState(true)
  // ── 画布状态快照: 全局错误捕获时同步读, 给错误日志附带 "出错那一刻画布是什么样" ──
  // 用 ref + useEffect 在每次 render 后同步最新状态, 避免每渲染都 register 新 provider.
  const snapshotStateRef = useRef({
    nodes: [], edges: [], canvasId: null, canvasName: '', loading: true, selectedNodeId: null,
  })

  // 首次加载画布时的 viewport:加载完才 mount ReactFlow,
  // 通过 defaultViewport 传入,避免 ReactFlow 未 mount 时 setViewport 静默失败的时序问题
  const [initialViewport, setInitialViewport] = useState({ x: 0, y: 0, zoom: 1 })
  const [initialLockStatus, setInitialLockStatus] = useState(null)

  // ── P3 面板 ──
  const {
    selectedNodeId,
    setSelectedNodeId,
    onNodeDoubleClick,
    handlePanelClose,
  } = useCanvasPanel()
  // 选中节点直接从 store 按 id 取(序号在面板内用 useNodeSeq 即时取, 不带派生字段)。
  // 窄订阅:只在该节点对象引用变化时重渲染,不随其他节点变动。
  const selectedNode = useStore(
    (s) => (selectedNodeId ? s.nodeLookup.get(selectedNodeId) || null : null)
  )
  const panelContextValue = useMemo(
    () => ({
      openPanel: (nodeId) => setSelectedNodeId(nodeId),
    }),
    [setSelectedNodeId]
  )

  // ── P4 画布管理(本地 UI 状态) ──
  const [managerOpen, setManagerOpen] = useState(false)

  // ── 只读 = readonly prop 直接驱动;isEditing 是 !readonly 的语义化别名,沿用旧名最小化改动
  // initialLockStatus 在双轨期间仍由内部 init 设置,Step 2.4 后由 CanvasShell 通过 onCanvasLoaded 接收
  const isEditing = !readonly
  const enabled = isEditing

  // ── P5 自动保存 ──
  // useAutoSave 内部用 useReactFlow 取数(单一数据源);scheduleSave 挂到
  // onNodesChange/onEdgesChange,加载期由 isLoadingCanvasRef guard 屏蔽。
  const { triggerSave, scheduleSave, markDirty, isSaving } = useAutoSave({
    canvasId,
    isEditing: enabled,
    onLockLost: () => {
      // 仅 装饰层实现会触发(本地实现无锁);沿用旧 callback 名让 useAutoSave 暂不改造
      message.warning('编辑锁已失效，已切换为只读模式')
    },
  })

  // ── 跨 hook 引用的 refs（声明顺序问题用 ref 解耦）──
  const panCanvasToRef = useRef(null)
  const panToNodesBoundsRef = useRef(null)
  const markDirtyRef = useRef(null)
  const triggerSaveRef = useRef(null)
  // 加载画布期间标记：屏蔽 onMoveEnd 触发的 markDirty,
  // 防止 setViewport 兜底/ReactFlow init 抖动把错位视口保存回去
  const isLoadingCanvasRef = useRef(false)
  useEffect(() => { markDirtyRef.current = markDirty }, [markDirty])
  useEffect(() => { triggerSaveRef.current = triggerSave }, [triggerSave])

  // 同步最新画布状态到 ref —— 直接在 render body 里写, 不走 useEffect.
  // 错误捕获 provider 只读 ref.current, 不需要 React 调度. 走 useEffect 反而每次
  // 状态变化都触发一次 effect commit/cleanup, 在高频渲染时给 React 工作量翻倍.
  snapshotStateRef.current = {
    nodes, edges, canvasId, canvasName, loading,
    selectedNodeId,
    initialViewport,
  }

  // 注册全局错误捕获用的快照提供者; 卸载时清掉
  useEffect(() => {
    setCanvasSnapshotProvider(() => buildCanvasSnapshot(snapshotStateRef.current))
    return () => setCanvasSnapshotProvider(null)
  }, [])

  // P5.5 只读观察(useCanvasObserver)由装饰层 hook 提供,
  // 由 CanvasShell 装饰。基础实现无锁概念,readonly 模式下不需要"同步编辑者增删改"。
  // 装饰层实现后续若需把观察者的更新合并到画布内部 nodes/edges,通过 prop incomingCanvasUpdate
  // 传入即可,handler 实现暂留参考(Step 2.3a TODO 完整接通)。

  // ── SSE 启动（供 submit 成功 & 轮询拿到 stream_url 复用）──
  const startSseStream = useCallback((outputNodeId, streamUrl, options = {}) => {
    // options.resumeOffset > 0 表示续传 (重连场景): 保留 startedAt/text/reasoning_stream,
    // 后端 stream endpoint 收到 ?offset=N 后只推从第 N 个 chunk 之后的内容, 累加到已有 text 上。
    const resumeOffset = options.resumeOffset > 0 ? options.resumeOffset : 0
    const isResume = resumeOffset > 0

    // 标记节点状态为 running、写入 stream_url
    facade.batchUpdateNodes(nds => nds.map(n => {
      if (n.id !== outputNodeId) return n
      const prevContent = n.data.content || {}
      const { error: _e, rawError: _re, ...contentWithoutError } = prevContent
      return {
        ...n,
        data: {
          ...n.data,
          runStatus: 'running',
          streamUrl,
          // 续传不重置 startedAt (耗时累加); 新启动用 now
          ...(isResume ? {} : { startedAt: Date.now(), usage: null }),
          finishedAt: null,
          content: {
            ...contentWithoutError,
            text: contentWithoutError.text || '',
            // 新 SSE 流启动 (含续传场景),清除之前可能残留的超时标记
            sseTimeout: undefined,
            pollingTimeout: undefined,
          },
        },
      }
    }))

    // 注册 pending request（可能重复注册一次，tabSession 内部是 Map 幂等）
    registerPendingRequest(outputNodeId, { appId: 'ai-canvas', type: 'sse' })

    const baseUrl = import.meta.env.VITE_API_BASE_URL || ''
    const sseUrl = streamUrl.startsWith('http') ? streamUrl : `${baseUrl}${streamUrl}`

    // 续传跳过计数: 后端总是从 chunk 0 全量推, 前端 drop 前 resumeOffset 个 chunk,
    // 从第 resumeOffset+1 个开始 append 到已累积的 text。等效于"客户端侧续传"。
    let chunkSkipRemaining = resumeOffset

    // ─── SSE 静默 watchdog ───
    // 每 5 秒检查一次, 距上次 chunk/status ≥ 5 秒就调 queryStatus 确认任务终态。
    // 仅在任务到达终态 (completed / failed系列) 时接管, 仍在跑就静默等现有 SSE。
    let lastChunkAt = Date.now()
    let streamHandle = null
    let watchdogRunning = false
    const idleTimer = setInterval(async () => {
      if (watchdogRunning) return
      if (Date.now() - lastChunkAt < SSE_WATCHDOG_TICK_MS) return

      watchdogRunning = true
      try {
        const node = nodesRef.current.find(n => n.id === outputNodeId)
        const queryTaskId = node?.data?.extraTaskId || node?.data?.taskId || node?.data?.realTaskId
        if (!queryTaskId) {
          // 没 taskId 没法查, 重置避免反复触发
          lastChunkAt = Date.now()
          return
        }
        console.log('[SSE Watchdog] 5s 静默, 查任务状态', { outputNodeId, taskId: queryTaskId })
        const results = await taskClient.queryStatus([queryTaskId])
        const item = Array.isArray(results) ? results[0] : null
        if (!item) {
          lastChunkAt = Date.now()
          return
        }

        const SUCCESS = new Set(['completed', 'success'])
        const FAILURE = new Set(['failed', 'error', 'canceled', 'interrupted', 'not_found'])

        if (SUCCESS.has(item.status)) {
          clearInterval(idleTimer)
          try { streamHandle?.abort?.() } catch {}
          unregisterPendingRequest(outputNodeId)
          const media = resolveContentByCapability(node?.data?.sourceCapability, item.result) || {}
          const finishedAt = Date.now()
          facade.batchUpdateNodes(nds => nds.map(n => {
            if (n.id !== outputNodeId) return n
            const { reasoning_stream: _drop, ...prevContent } = n.data.content || {}
            // queryStatus 拿到的 text 比流式累加的更权威, 优先用; 拿不到才回退到已累加的
            const text = typeof media.text === 'string' ? media.text : prevContent.text
            return {
              ...n,
              data: {
                ...n.data,
                runStatus: 'done',
                finishedAt,
                content: { ...prevContent, ...(text !== undefined ? { text } : {}) },
                ...(media.usage ? { usage: media.usage } : {}),
                lastPollingItem: item,
                lastPolledAt: finishedAt,
              },
            }
          }))
          markDirtyRef.current?.()
          return
        }

        if (FAILURE.has(item.status)) {
          clearInterval(idleTimer)
          try { streamHandle?.abort?.() } catch {}
          unregisterPendingRequest(outputNodeId)
          const finishedAt = Date.now()
          facade.batchUpdateNodes(nds => nds.map(n =>
            n.id === outputNodeId
              ? {
                ...n,
                data: {
                  ...n.data,
                  runStatus: 'error',
                  finishedAt,
                  // 保留已流出的 text 和 reasoning_stream, 仅追加 error 标记
                  content: {
                    ...(n.data.content || {}),
                    error: item.error || `任务${item.status}`,
                    rawError: item,
                  },
                  lastPollingItem: item,
                  lastPolledAt: finishedAt,
                },
              }
              : n
          ))
          markDirtyRef.current?.()
          return
        }

        // 仍在跑: 不动, 继续等现有 SSE; 重置 lastChunkAt 避免 5 秒后立即重查
        lastChunkAt = Date.now()
      } catch (err) {
        console.warn('[SSE Watchdog] 查询任务状态失败', err)
        lastChunkAt = Date.now()
      } finally {
        watchdogRunning = false
      }
    }, SSE_WATCHDOG_TICK_MS)

    streamHandle = taskClient.openStream(sseUrl, {
      onData: (data) => {
        // 任何 chunk（包括 content 为空的心跳）都重置 watchdog —— 流还活着就不超时
        lastChunkAt = Date.now()
        // 续传 drop: 后端从 chunk 0 全量重推, 前端跳过已收到的 resumeOffset 个 chunk。
        // skip 期间也算作活着 (上面已经更新 lastChunkAt), 不影响 watchdog 判断。
        if (chunkSkipRemaining > 0) {
          chunkSkipRemaining -= 1
          return
        }
        // SSE chunk 格式：{ content: "<OpenAI chunk JSON 字符串>" }
        let textChunk = ''
        let reasoningChunk = ''
        const raw = data?.content
        if (typeof raw === 'string') {
          try {
            const openaiChunk = JSON.parse(raw)
            const delta = openaiChunk?.choices?.[0]?.delta || {}
            textChunk = delta.content || ''
            // reasoning 流仅 thinking 模型有(如 kimi-k2.6),累积到 content.reasoning_stream;
            // 运行结束时由 onDone 清空(最终 text 不含 reasoning,与后端契约一致)
            reasoningChunk = delta.reasoning_content || ''
          } catch {
            textChunk = raw
          }
        } else if (typeof data?.text === 'string') {
          textChunk = data.text
        }
        if (!textChunk && !reasoningChunk) return
        facade.batchUpdateNodes(nds => nds.map(n => {
          if (n.id !== outputNodeId) return n
          const prevContent = n.data.content || {}
          const nextContent = { ...prevContent }
          if (textChunk) {
            nextContent.text = (prevContent.text || '') + textChunk
          }
          if (reasoningChunk) {
            nextContent.reasoning_stream = (prevContent.reasoning_stream || '') + reasoningChunk
          }
          return { ...n, data: { ...n.data, content: nextContent } }
        }))
      },
      onStatus: () => {
        // status 心跳也算流活着 —— 思考模型 reasoning 阶段可能只发心跳不发 chunk
        lastChunkAt = Date.now()
      },
      onDone: () => {
        clearInterval(idleTimer)
        unregisterPendingRequest(outputNodeId)
        const finishedAt = Date.now()
        facade.batchUpdateNodes(nds => nds.map(n => {
          if (n.id !== outputNodeId) return n
          // 输出节点创建时快照的 (sourceCapability, sourceMode) 决定 validator
          // 只看主输出端口的 validateContent(副端口如 LLM 的 text 派生自主端口,不单独校验)
          const outputDef = n.data.sourceCapability
            ? getCapabilityPrimaryOutput(n.data.sourceCapability, n.data.sourceMode)
            : null
          const validator = outputDef?.validateContent
          if (validator && !validator(n.data.content)) {
            return {
              ...n,
              data: {
                ...n.data,
                runStatus: 'error',
                finishedAt,
                content: { ...n.data.content, error: '模型未返回任何内容' },
              },
            }
          }
          // 运行结束清空 reasoning_stream(最终 content 不含 reasoning,与后端契约一致;
          // 设计文档 docs/capabilities/llm/llm.md §5 SSE 实时累积).
          // usage 不在此写——以任务查询接口为权威源,由 useTaskPolling.onSuccess 写入 data.usage.
          const finalContent = n.data.content || {}
          const { reasoning_stream: _drop, ...contentWithoutReasoning } = finalContent
          return {
            ...n,
            data: {
              ...n.data,
              runStatus: 'done',
              finishedAt,
              content: contentWithoutReasoning,
            },
          }
        }))
        markDirtyRef.current?.()
      },
      onError: (err) => {
        clearInterval(idleTimer)
        unregisterPendingRequest(outputNodeId)
        console.error('[SSE] 流式读取失败:', err.message)
        // 记录断点 chunk 总数, 给"重连"按钮续传用 (前端 drop 前 N 个 chunk 实现客户端侧续传)。
        // 后端总是从 chunk 0 全量推, sseStream 的 chunkCount 反映本次 stream 收到的所有 chunk
        // (含被前端 drop 掉的), 因此就是真实总数, 不再叠加 resumeOffset。
        const sseChunkOffset = (() => {
          try { return streamHandle?.getOffset?.() ?? resumeOffset } catch { return resumeOffset }
        })()
        const finishedAt = Date.now()
        facade.batchUpdateNodes(nds => nds.map(n =>
          n.id === outputNodeId
            ? {
              ...n,
              data: {
                ...n.data,
                runStatus: 'error',
                finishedAt,
                sseChunkOffset,
                content: { ...(n.data.content || {}), error: err.message, rawError: err },
              },
            }
            : n
        ))
        markDirtyRef.current?.()
      },
    })
  }, [facade, taskClient])

  // ── P6 异步任务轮询 ──
  const { addTask: addPollingTask, removeTask: removePollingTask } = useTaskPolling({
    onSuccess: (localId, pollingItem) => {
      // pollingItem 是完整的 TaskStatusItem：{ task_id, status, progress, result, error, stream_url }
      // 真正的结果 dict 在 pollingItem.result 里（后端 images_generations.result_transfer 等返回的 payload）
      unregisterPendingRequest(localId)
      facade.batchUpdateNodes(nds => nds.map(n => {
        if (n.id !== localId) return n
        const media = resolveContentByCapability(n.data?.sourceCapability, pollingItem?.result) || {}
        const slotIndex = n.data?.slotIndex
        let mediaPatch
        // resolveContent 可能在返回里带 LLM token usage(metadata),hoist 到 data.usage
        // 顶层 — usage 是运行元信息(跟 startedAt/finishedAt 同档),不属于 content 的一部分
        const usagePatch = (typeof slotIndex !== 'number' && media.usage)
          ? media.usage
          : undefined
        if (typeof slotIndex === 'number') {
          // 多图共享 task: 按 slotIndex 取对应那张图的元数据 (resolveContent.images[slotIndex])
          // 取不到 → 上游漏返此 slot, 写 placeholder 标记给 OutputNode 渲染"未生成"
          const slot = Array.isArray(media.images) ? media.images[slotIndex] : null
          if (slot && slot.url) {
            mediaPatch = {
              url: slot.url,
              fileSize: slot.fileSize,
              mimeType: slot.mimeType,
              fileName: slot.fileName,
            }
          } else {
            mediaPatch = { placeholder: true }
          }
        } else {
          // 单输出 (历史路径): 整体 merge resolveContent 的返回, undefined 字段过滤掉
          // 排除 usage(已在 usagePatch 单独 hoist)
          const { usage: _u, ...mediaWithoutUsage } = media
          mediaPatch = Object.fromEntries(
            Object.entries(mediaWithoutUsage).filter(([, v]) => v !== undefined)
          )
        }
        return {
          ...n,
          data: {
            ...n.data,
            runStatus: 'done',
            finishedAt: Date.now(),
            content: { ...n.data.content, ...mediaPatch },
            ...(usagePatch ? { usage: usagePatch } : {}),
            lastPollingItem: pollingItem,
            lastPolledAt: Date.now(),
          },
        }
      }))
      markDirtyRef.current?.()
    },
    onFailed: (localId, result) => {
      unregisterPendingRequest(localId)
      facade.batchUpdateNodes(nds => nds.map(n =>
        n.id === localId
          ? {
            ...n,
            data: {
              ...n.data,
              runStatus: 'error',
              finishedAt: Date.now(),
              content: {
                ...n.data.content,
                error: result.error || result.message || '任务失败',
                rawError: result,
              },
              lastPollingItem: result,
              lastPolledAt: Date.now(),
            },
          }
          : n
      ))
      markDirtyRef.current?.()
    },
    onPollingTimeout: (localId, info) => {
      facade.batchUpdateNodes(nds => nds.map(n =>
        n.id === localId
          ? {
            ...n,
            data: {
              ...n.data,
              content: {
                ...n.data.content,
                pollingTimeout: true,
                pollingInfo: info,
              },
            },
          }
          : n
      ))
    },
    onStreamReady: (localId, streamUrl) => {
      // LLM 任务：轮询首次拿到 stream_url → 启动 SSE（刷新恢复场景）
      startSseStream(localId, streamUrl)
    },
    onProgress: (localId, { status, progress, pollingItem, polledAt }) => {
      // 进行态进度回写：让输出节点的 Processing 视觉能展示 "处理中 · 33%"
      // 同时把完整 pollingItem 和 polledAt 写入,让 Debug 面板进行态也能看到上游原始返回
      facade.batchUpdateNodes(nds => nds.map(n => {
        if (n.id !== localId) return n
        return {
          ...n,
          data: {
            ...n.data,
            pollProgress: { status, progress },
            lastPollingItem: pollingItem,
            lastPolledAt: polledAt,
          },
        }
      }))
    },
    onTransferFailed: (localId, pollingItem) => {
      // 上游已出图但 OSS 转存失败：展示未转存的原始 URL，同时触发自动重试（上限 5 次）
      // pollingItem 是完整的 TaskStatusItem，后端结果 dict 在 pollingItem.result 里
      let taskId = null
      let extraTaskId = null
      let shouldAutoRetry = false
      facade.batchUpdateNodes(nds => nds.map(n => {
        if (n.id !== localId) return n
        taskId = n.data?.realTaskId
        extraTaskId = n.data?.extraTaskId
        const prevCount = n.data?.transferRetryCount ?? 0
        shouldAutoRetry = prevCount < TRANSFER_RETRY_MAX
        const media = resolveContentByCapability(n.data?.sourceCapability, pollingItem?.result) || {}
        const slotIndex = n.data?.slotIndex
        let mediaPatch
        if (typeof slotIndex === 'number') {
          // 多图共享 task (转存失败): 按 slotIndex 取对应原始 URL; 取不到记 placeholder
          const slot = Array.isArray(media.images) ? media.images[slotIndex] : null
          if (slot && slot.url) {
            mediaPatch = {
              url: slot.url,
              fileSize: slot.fileSize,
              mimeType: slot.mimeType,
              fileName: slot.fileName,
            }
          } else {
            mediaPatch = { placeholder: true }
          }
        } else {
          mediaPatch = Object.fromEntries(
            Object.entries(media).filter(([, v]) => v !== undefined)
          )
        }
        const errorMsg = pollingItem?.error || pollingItem?.message || '文件转存失败'
        return {
          ...n,
          data: {
            ...n.data,
            runStatus: 'transfer_failed',
            finishedAt: Date.now(),
            content: {
              ...(n.data?.content || {}),
              ...mediaPatch,
              error: errorMsg,
              rawError: pollingItem,
            },
            transferRetryCount: prevCount,
            lastPollingItem: pollingItem,
            lastPolledAt: Date.now(),
          },
        }
      }))
      markDirtyRef.current?.()
      if (shouldAutoRetry && taskId && extraTaskId) {
        retryTransferFnRef.current?.({ localId, taskId, extraTaskId })
      }
    },
  })

  // ── 转存重试（auto: onTransferFailed 触发；manual: CapabilityRuntimeContext.retryTransfer）──
  // 调 API 的部分由 装饰层(transferRetryHandler prop)注入,canvas 通用层只管节点状态写入
  // 与 helpers 装配。详见 CLAUDE.md §装饰层解耦原则。
  const retryTransferFnRef = useRef(null)
  const nodesRef = useRef(nodes)
  useEffect(() => { nodesRef.current = nodes }, [nodes])

  const dispatchRetryTransfer = useCallback(({ localId, taskId, extraTaskId }) => {
    if (!transferRetryHandler) return Promise.resolve()
    return transferRetryHandler({
      taskId,
      helpers: {
        incRetryCount: () => {
          facade.batchUpdateNodes(nds => nds.map(n =>
            n.id === localId
              ? { ...n, data: { ...n.data, transferRetryCount: (n.data?.transferRetryCount ?? 0) + 1 } }
              : n
          ))
        },
        resumePolling: () => {
          addPollingTask(extraTaskId, localId)
          registerPendingRequest(localId, { appId: 'ai-canvas', type: 'polling' })
        },
        notifyError: (msg) => message.error(msg),
      },
    })
  }, [transferRetryHandler, addPollingTask, facade])

  useEffect(() => {
    retryTransferFnRef.current = dispatchRetryTransfer
  }, [dispatchRetryTransfer])

  const handleManualRetryTransfer = useCallback(async (localId) => {
    const node = nodesRef.current.find(n => n.id === localId)
    if (!node) return
    const { realTaskId, extraTaskId } = node.data || {}
    if (!realTaskId || !extraTaskId) {
      message.warning('任务信息缺失，无法重试转存')
      return
    }
    await dispatchRetryTransfer({ localId, taskId: realTaskId, extraTaskId })
  }, [dispatchRetryTransfer])

  // runCapability: 给 FailedCard 等组件用,重跑指定能力节点
  // 直接引用 handleRerunRef 以避免依赖 handleRerun 自身(handleRerun 声明在下方,
  // 引用前置会造成 TDZ);用 ref 转一手既能解依赖又能拿到最新闭包
  const handleRerunRef = useRef(null)
  const runCapabilityForRuntime = useCallback((nodeId, runCount = 1) => {
    return handleRerunRef.current?.(nodeId, runCount)
  }, [])

  // reconnectStream: 给 FailedCard 的「重连」按钮用
  //   场景: 流式接口断线后,任务在后端可能仍在跑(SSE proxy 失败不影响 task 状态)。
  //   流程: 查 task 状态 → 按结果分发:
  //     - completed: 直接从 result 提取最终文本写 done (跳过重接 SSE)
  //     - 仍在跑 + 有 stream_url: 清空累积 text + 重新启动 SSE (后端会从 chunk 0 全量重推)
  //     - 仍在跑 + 无 stream_url: 加回轮询队列,等下次 tick 拿 stream_url 再接管
  //     - 真失败 (failed/canceled/interrupted/not_found): 写入 task 的真实 error
  const handleReconnectStream = useCallback(async (outputNodeId) => {
    const node = nodesRef.current.find(n => n.id === outputNodeId)
    if (!node) return
    const queryTaskId = node.data?.extraTaskId || node.data?.taskId || node.data?.realTaskId
    if (!queryTaskId) {
      message.warning('任务 ID 缺失，无法重连')
      return
    }

    // 先把节点标回 polling,清掉旧 error,保留 text (避免闪烁)
    facade.batchUpdateNodes(nds => nds.map(n => {
      if (n.id !== outputNodeId) return n
      const prevContent = n.data?.content || {}
      const { error: _e, rawError: _re, ...restContent } = prevContent
      return {
        ...n,
        data: {
          ...n.data,
          runStatus: 'polling',
          content: restContent,
        },
      }
    }))

    let results
    try {
      results = await taskClient.queryStatus([queryTaskId])
    } catch (err) {
      console.error('[Reconnect] 查询任务状态失败:', err)
      facade.batchUpdateNodes(nds => nds.map(n =>
        n.id === outputNodeId
          ? {
            ...n,
            data: {
              ...n.data,
              runStatus: 'error',
              content: {
                ...(n.data.content || {}),
                error: `查询任务状态失败: ${err?.message || err}`,
                rawError: err,
              },
            },
          }
          : n
      ))
      markDirtyRef.current?.()
      return
    }

    const item = Array.isArray(results) ? results[0] : null
    if (!item) {
      facade.batchUpdateNodes(nds => nds.map(n =>
        n.id === outputNodeId
          ? {
            ...n,
            data: {
              ...n.data,
              runStatus: 'error',
              content: { ...(n.data.content || {}), error: '任务查询返回为空' },
            },
          }
          : n
      ))
      markDirtyRef.current?.()
      return
    }

    const SUCCESS = new Set(['completed', 'success'])
    const FAILURE = new Set(['failed', 'error', 'canceled', 'interrupted', 'not_found'])

    if (SUCCESS.has(item.status)) {
      const media = resolveContentByCapability(node.data?.sourceCapability, item.result) || {}
      const finishedAt = Date.now()
      facade.batchUpdateNodes(nds => nds.map(n => {
        if (n.id !== outputNodeId) return n
        const { error: _e, rawError: _re, ...restContent } = (n.data.content || {})
        const { usage: _u, ...mediaWithoutUsage } = media
        const mediaPatch = Object.fromEntries(
          Object.entries(mediaWithoutUsage).filter(([, v]) => v !== undefined)
        )
        return {
          ...n,
          data: {
            ...n.data,
            runStatus: 'done',
            finishedAt,
            content: { ...restContent, ...mediaPatch },
            ...(media.usage ? { usage: media.usage } : {}),
            lastPollingItem: item,
            lastPolledAt: finishedAt,
          },
        }
      }))
      markDirtyRef.current?.()
      return
    }

    if (FAILURE.has(item.status)) {
      facade.batchUpdateNodes(nds => nds.map(n =>
        n.id === outputNodeId
          ? {
            ...n,
            data: {
              ...n.data,
              runStatus: 'error',
              finishedAt: Date.now(),
              content: {
                ...(n.data.content || {}),
                error: item.error || `任务${item.status}`,
                rawError: item,
              },
              lastPollingItem: item,
              lastPolledAt: Date.now(),
            },
          }
          : n
      ))
      markDirtyRef.current?.()
      return
    }

    // 仍在 pending/processing/queued/transferring
    if (item.stream_url) {
      // 客户端侧续传: 保留已流出的 text/reasoning_stream;
      // 后端不动 (从 chunk 0 全量推), 前端 drop 前 sseChunkOffset 个 chunk,
      // 从第 N+1 个开始 append 到现有 text。
      // sseChunkOffset 由上一段 SSE 的 onError 写入节点 data; 没记录就 0 全量重收。
      const resumeOffset = node.data?.sseChunkOffset || 0
      startSseStream(outputNodeId, item.stream_url, { resumeOffset })
      return
    }

    // 没有 stream_url -> 加回轮询队列,等下次 tick 拿到
    addPollingTask(queryTaskId, outputNodeId)
  }, [facade, taskClient, addPollingTask, startSseStream])

  const capabilityRuntimeValue = useMemo(
    () => ({
      retryTransfer: handleManualRetryTransfer,
      runCapability: runCapabilityForRuntime,
      reconnectStream: handleReconnectStream,
    }),
    [handleManualRetryTransfer, runCapabilityForRuntime, handleReconnectStream]
  )

  const canvasEditingValue = useMemo(() => ({ isEditing }), [isEditing])

  // ── P6 运行能力 ──
  const { run } = useRunCapability({
    nodes,
    edges,
    canvasId,
    triggerSave: () => triggerSaveRef.current?.(),
    addPollingTask,
    removePollingTask,
    startSseStream,
    panToNodesBounds: (ids) => panToNodesBoundsRef.current?.(ids),
  })

  const handleRun = useCallback((nodeId, runCount, draftOverride) => {
    if (!isEditing) {
      message.info('当前为只读模式')
      return
    }
    run(nodeId, runCount, draftOverride)
  }, [isEditing, run])

  const handleRerun = useCallback((capabilityNodeId, runCount = 1) => {
    if (!isEditing) {
      message.info('当前为只读模式')
      return
    }
    return run(capabilityNodeId, runCount)
  }, [isEditing, run])

  useEffect(() => {
    handleRerunRef.current = handleRerun
  }, [handleRerun])

  // ── P4 快捷键 ──
  // handlePasteImage 声明在下方，用 ref 转发给 useCanvasActions
  const handlePasteImageRef = useRef(null)
  const onImagePaste = useCallback((file) => {
    handlePasteImageRef.current?.(file)
  }, [])

  const { copySelected, paste, deleteSelected, selectAll } = useCanvasActions({
    nodes,
    edges,
    isEditing,
    getViewport,
    onImagePaste,
    nodeZCounterRef,
  })

  // ━━━ 画布加载 ━━━

  /**
   * 扫描画布节点，把刷新前在跑的输出任务加回轮询队列
   * - runStatus='polling'：直接加回
   * - runStatus='running'（LLM SSE 被刷新打断）：降级为 polling，
   *   让轮询拿到 stream_url 后重启 SSE（后端 tracked_request 仍在则能续上）
   */
  const resumePendingOutputs = useCallback((loadedNodes) => {
    const resumed = []
    for (const n of loadedNodes) {
      if (!isOutputNodeType(n.type)) continue
      const status = n.data?.runStatus
      const queryId = n.data?.taskId || n.data?.extraTaskId
      if (!queryId) continue
      if (status === 'polling' || status === 'running') {
        addPollingTask?.(queryId, n.id)
        registerPendingRequest(n.id, {
          appId: 'ai-canvas',
          type: 'polling',
          capability: n.data?.sourceCapability,
        })
        resumed.push({ id: n.id, status, queryId })
      }
    }
    if (resumed.length > 0) {
      console.log(`[AiCanvas] 恢复 ${resumed.length} 个在跑任务到轮询队列`, resumed)
    }
    // 统一清理历史残留：
    // - 输出节点：之前 'running' 的降级为 'polling'（SSE 被刷新打断，靠 stream_url 重连）
    // - 能力节点：按新流程永远不应持有 running/locked，刷新时强制重置
    facade.batchUpdateNodes(nds => nds.map(n => {
      const matched = resumed.find(r => r.id === n.id)
      if (matched && matched.status === 'running') {
        return {
          ...n,
          data: {
            ...n.data,
            runStatus: 'polling',
            // 续传时清除之前残留的超时标记，badge 回归正常
            content: { ...(n.data.content || {}), sseTimeout: undefined, pollingTimeout: undefined },
          },
        }
      }
      if (n.type === 'capability' && (n.data?.runStatus === 'running' || n.data?.locked)) {
        return { ...n, data: { ...n.data, runStatus: 'idle', locked: false } }
      }
      return n
    }))
  }, [addPollingTask, facade])

  /**
   * 加载指定画布并更新状态
   */
  const loadCanvasById = useCallback(async (cid) => {
    const { canvas, lockStatus } = await loadCanvas(canvasStore, cid)
    setCanvasId(cid)
    const rawNodes = canvas.nodes || []
    // 老数据硬覆盖：检测三层 Mode 结构上线前的旧能力节点（缺 data.mode 或残留 config.sub_model / config.model）
    const { nodes: migratedNodes, migrated, affectedLabels } = migrateCapabilityNodes(rawNodes)
    // 历史画布兼容：未带 canvasSeq 的节点按 id 时间戳顺序回填
    const loadedNodes = backfillCanvasSeq(migratedNodes)
    // 首次加载:ReactFlow 此刻还在 loading 分支未挂载,直接 setViewport 无效;
    // 改为把目标 viewport 写到 state,等 loading=false 后 ReactFlow 用 defaultViewport 一次性装入。
    // isLoadingCanvasRef 保险兜底:防 ReactFlow mount 瞬间 onMoveEnd 把 (0,0,1) 误写回去。
    isLoadingCanvasRef.current = true
    const targetViewport = canvas.viewport || { x: 0, y: 0, zoom: 1 }
    setInitialViewport(targetViewport)
    // 重置 bring-to-front 计数器 = max(loaded zIndex) + 1, 让下一次 click 自然站到最高
    let maxZ = 0
    for (const n of loadedNodes) {
      const z = typeof n.zIndex === 'number' ? n.zIndex : 0
      if (z > maxZ) maxZ = z
    }
    nodeZCounterRef.current = maxZ + 1
    const loadedEdges = canvas.edges || []
    // 首次加载:ReactFlow 还在 loading 分支未挂载,replaceAll(rf.setNodes)此刻写的是 provider 的
    // store,但挂载时会被 defaultNodes 重新播种 → 故同时把 seed 设成加载到的数据,两条路径幂等。
    // 切换画布:ReactFlow 已挂载,replaceAll 直写 store 立即生效;seed 同步更新保证 loading
    // 重挂(本路径不重挂,但 handleSwitchCanvas 会)时 defaultNodes 也是这份数据。
    setSeedNodes(loadedNodes)
    setSeedEdges(loadedEdges)
    facade.replaceAll({ nodes: loadedNodes, edges: loadedEdges })
    // 切换画布路径下 ReactFlow 已 mount,setViewport 也有效;首次加载时该调用静默失败,无副作用。
    setViewport(targetViewport)
    // 下两帧后解除屏蔽:确保 ReactFlow 已完成挂载 + 首次布局
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { isLoadingCanvasRef.current = false })
    })
    setInitialLockStatus(lockStatus)
    updateCanvasIdInUrl(cid)
    onCanvasSwitched?.(cid, lockStatus)
    // 刷新恢复：把在跑的输出节点加回轮询
    resumePendingOutputs(loadedNodes)
    // 媒体缓存：全量登记当前画布引用的所有媒体 URL,然后后台预下载未缓存的资源
    // (预下载是 URL 自愈机制的前置保障 —— 缓存里有 blob,失效时才能从 cache 取出重新上传拿新 url)
    const allMediaUrls = extractMediaUrlsFromNodes(loadedNodes)
    registerCanvasUrls(cid, allMediaUrls).catch(err => {
      console.warn('[AiCanvas] 注册画布缓存归属失败', err)
    })
    prefetchCanvasMedia(cid, allMediaUrls).catch(err => {
      console.warn('[AiCanvas] 后台预下载失败', err)
    })
    // 旧数据弹窗提示（Modal）+ 把迁移结果落盘（下次打开就无提示）
    if (migrated) {
      const uniqueLabels = Array.from(new Set(affectedLabels))
      Modal.info({
        title: '画布数据已自动迁移',
        content: (
          <div>
            <p>本画布由旧版本创建，以下能力节点的 <strong>mode</strong> 已重置为默认：</p>
            <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
              {uniqueLabels.map(l => <li key={l}>{l}</li>)}
            </ul>
            <p style={{ color: '#9998B3', marginBottom: 0 }}>
              请在面板中重新选择模式与参数后再运行。保存后下次打开不再提示。
            </p>
          </div>
        ),
        okText: '知道了',
      })
      // 触发自动保存，把迁移后的数据写回后端
      markDirtyRef.current?.()
      triggerSaveRef.current?.()
    }
  }, [facade, setViewport, resumePendingOutputs, onCanvasSwitched])

  // 初始化：按优先级加载画布
  useEffect(() => {
    const init = async () => {
      setLoading(true)

      // 清理上次页面刷新留下的悬空请求
      const pending = clearPendingRequests()
      if (pending.length > 0) {
        console.log(`[AiCanvas] 清理了 ${pending.length} 个悬空请求`)
      }

      // 媒体缓存：申请持久化权限 + 首次配额告警（非阻塞）
      ensurePersistentStorage().catch(() => {})
      checkQuotaAndWarn().catch(() => {})

      try {
        // 1. 从 URL 获取 canvasId
        const cid = getCanvasIdFromUrl()

        if (cid) {
          // 加载指定画布
          await loadCanvasById(cid)
          // 获取画布名称
          try {
            const resp = await canvasStore.get(cid)
            setCanvasName(resp?.name || '')
          } catch {
            // 名称获取失败不影响主流程
          }
        } else {
          // 2. 获取画布列表
          const resp = await canvasStore.list()
          const list = Array.isArray(resp) ? resp : (resp?.items || resp?.list || [])

          if (list.length > 0) {
            // 加载最近的画布
            const first = list[0]
            setCanvasName(first.name || '')
            await loadCanvasById(first.id)
          } else {
            // 3. 自动创建默认画布
            const newCanvas = await canvasStore.create('默认画布')
            setCanvasName(newCanvas?.name || '默认画布')

            // 根据设置决定是否带模板
            const appSettings = await settings.getApp('ai-canvas').catch(() => ({}))
            const useTemplate = appSettings?.newCanvasWithTemplate !== false
            if (useTemplate) {
              await canvasStore.saveCanvas(newCanvas.id, {
                nodes: defaultTemplate.nodes,
                edges: defaultTemplate.edges,
                viewport: { x: 0, y: 0, zoom: 1 },
              })
            }

            await loadCanvasById(newCanvas.id)
          }
        }
      } catch (err) {
        console.error('[AiCanvas] 初始化失败:', err)
        message.error('初始化画布失败')

        // API 不可用时降级为本地模式
        const appSettings = await settings.getApp('ai-canvas').catch(() => ({}))
        if (appSettings?.newCanvasWithTemplate !== false) {
          const fallbackNodes = backfillCanvasSeq(defaultTemplate.nodes)
          setSeedNodes(fallbackNodes)
          setSeedEdges(defaultTemplate.edges)
          facade.replaceAll({ nodes: fallbackNodes, edges: defaultTemplate.edges })
        }
        setCanvasName('本地画布')
      } finally {
        setLoading(false)
        // 标记 app 已就绪 —— 之后 beforeunload 才会按"有 pending 记录就拦"正常工作。
        // 在 finally 而不是 try 末尾，确保即使初始化失败（catch 路径走完）也置位。详见 spec §4.1。
        markAppReady()
      }
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ━━━ P2 连线 ━━━

  // uncontrolled 下 React Flow 自己把 changes 应用进 store, 并照常触发 onNodesChange/onEdgesChange。
  // 这里的 onNodesChange/onEdgesChange 不再"应用变更", 只作通知:调度 debounce 自动保存。
  // 加载/切换画布期间 isLoadingCanvasRef=true → 屏蔽, 防止把加载瞬间的中间态存回去。
  const scheduleSaveRef = useRef(scheduleSave)
  useEffect(() => { scheduleSaveRef.current = scheduleSave }, [scheduleSave])
  const onNodesChange = useCallback(() => {
    if (isEditing && !isLoadingCanvasRef.current) scheduleSaveRef.current?.()
  }, [isEditing])
  const onEdgesChange = useCallback(() => {
    if (isEditing && !isLoadingCanvasRef.current) scheduleSaveRef.current?.()
  }, [isEditing])

  // 用 ref 缓存最新 edges，供 onEdgesChange 在变更前按 id 查出被移除的 edge
  // （nodesRef 已在上方声明，共用）
  const {
    onConnect,
    handleEdgesChange,
    handleNodesChange,
    isValidConnection,
  } = useCanvasConnection({
    nodes, edges, onNodesChange, onEdgesChange,
  })

  // ━━━ P5 拖拽保存 ━━━

  const onNodeDragStop = useCallback((_event, node) => {
    if (!isEditing) return
    // 拖拽后标记为手动定位
    facade.batchUpdateNodes(nds => nds.map(n =>
      n.id === node.id && n.data?.autoPositioned
        ? { ...n, data: { ...n.data, autoPositioned: false } }
        : n
    ))
    triggerSave()
  }, [isEditing, facade, triggerSave])

  // bring-to-front: 点击节点把它 zIndex 提升到全局最大, 取消选中后 z 不回落 —
  // 解决 PR-3 后 meta 是无框浮文字, RF 默认 selected 节点 z 提升 / 取消选中 z 回落,
  // 导致 meta 飞到相邻未选中节点内部的视觉问题.
  const onNodeClick = useCallback((_event, node) => {
    if (!isEditing) return
    const nextZ = nodeZCounterRef.current++
    facade.batchUpdateNodes(nds => nds.map(n => (
      n.id === node.id ? { ...n, zIndex: nextZ } : n
    )))
    triggerSave()
  }, [isEditing, facade, triggerSave])

  // 框选 / Cmd+A / 任何"进入选中态"的路径同样 bring-to-front —
  // 只对"新进入 selected"的节点 bump zIndex, 已选中的不重复 bump.
  // 没有这条逻辑时, 框选两个重叠节点会让两个 internals.z 平局, 下层节点的
  // meta(NodeToolbar portal)会按 DOM 顺序飘到上层节点的 body 上, 视觉错位.
  const lastSelectedIdsRef = useRef(new Set())
  const onSelectionChange = useCallback(({ nodes: selectedNodes }) => {
    // 兜底:折叠 output 已 selectable:false, 框选理论上不会进选区;这里再过滤一层,
    // 防止悬空边/状态竞态下被选中后随删除误删(它视觉上不存在, 不该可选)。
    const foldedIds = foldedOutputIdsRef.current
    const visibleSelected = foldedIds.size
      ? selectedNodes.filter(n => !foldedIds.has(n.id))
      : selectedNodes
    const prev = lastSelectedIdsRef.current
    const next = new Set(visibleSelected.map(n => n.id))
    lastSelectedIdsRef.current = next
    if (!isEditing) return
    const newlySelected = visibleSelected.filter(n => !prev.has(n.id))
    if (newlySelected.length === 0) return
    const bumps = new Map()
    for (const n of newlySelected) {
      bumps.set(n.id, nodeZCounterRef.current++)
    }
    facade.batchUpdateNodes(nds => nds.map(n => (
      bumps.has(n.id) ? { ...n, zIndex: bumps.get(n.id) } : n
    )))
    triggerSave()
  }, [isEditing, facade, triggerSave])

  // 删除前拦截:折叠能力节点(form 'folded')在数据上是 parent capability + 它的
  // folded output 两个真实节点;用户视觉上只看到一个"折叠节点",删除时只点了 parent。
  // 这里把对应的 folded output 也加进删除列表, 否则 parent 没了之后 output 失去归属,
  // withFoldedShell 会从 1×1 透明壳切回完整 OutputNode 渲染, 在画布上变成孤儿节点。
  //
  // 关键点:RF 传进来的 edges 是基于"原始 nodes 列表"通过 getConnectedEdges 算出的连接边,
  // 我们后加的 output 节点的连接边不在里面 —— 必须手动从 store 全量边里捞出来追加,
  // 否则节点删了边还在, 变成悬空 edge.target 引用。
  const handleBeforeDelete = useCallback(({ nodes, edges }) => {
    if (!nodes || nodes.length === 0) return { nodes, edges }
    const foldedMap = foldedMapRef.current
    if (foldedMap.size === 0) return { nodes, edges }

    const foldedParentIds = new Set()
    for (const n of nodes) {
      if (n.type === 'capability' && isFoldedCapability(n.data?.capability)) {
        foldedParentIds.add(n.id)
      }
    }
    if (foldedParentIds.size === 0) return { nodes, edges }

    const existingNodeIds = new Set(nodes.map(n => n.id))
    const extraNodes = []
    const extraOutputIds = new Set()
    for (const [outputId, info] of foldedMap) {
      if (!foldedParentIds.has(info.parentId)) continue
      if (existingNodeIds.has(outputId)) continue
      const n = getNode(outputId)
      if (!n) continue
      extraNodes.push(n)
      extraOutputIds.add(outputId)
    }
    if (extraNodes.length === 0) return { nodes, edges }

    // 补齐新加 output 节点的所有连接边 (入边 + 出边), 避免节点删了边悬空。
    // 注意 edge.deletable 默认为 true 时才能被删, 与 RF 内置过滤逻辑保持一致。
    const existingEdgeIds = new Set(edges.map(e => e.id))
    const extraEdges = []
    for (const e of getEdges()) {
      if (e.deletable === false) continue
      if (existingEdgeIds.has(e.id)) continue
      if (extraOutputIds.has(e.source) || extraOutputIds.has(e.target)) {
        extraEdges.push(e)
      }
    }

    return { nodes: [...nodes, ...extraNodes], edges: [...edges, ...extraEdges] }
  }, [getNode, getEdges])

  // ReactFlow onMoveEnd 稳定引用 (内联 arrow 会让 StoreUpdater 跟踪的字段每渲染都
  // 视为变更, 触发不必要的 store.setState 与级联订阅唤醒, 见模块顶 DEFAULT_EDGE_OPTIONS 注释)
  const handleMoveEnd = useCallback(() => {
    if (isEditing && !isLoadingCanvasRef.current) markDirtyRef.current?.()
  }, [isEditing])

  // ━━━ P4 视口 + 右键菜单 ━━━

  const viewport = useCanvasViewport({ nodes })
  const { getViewportCenter, centerNodeAt, findFreeSpot, panCanvasTo, panToNodesBounds } = viewport

  // 把 viewport 平移方法同步到 ref，供 useRunCapability 使用（解决声明顺序问题）
  useEffect(() => {
    panCanvasToRef.current = panCanvasTo
    panToNodesBoundsRef.current = panToNodesBounds
  }, [panCanvasTo, panToNodesBounds])

  const {
    contextMenu,
    onPaneContextMenu,
    onNodeContextMenu,
    handleContextMenuClose,
    handleContextMenuAction,
  } = useCanvasContextMenu({
    isEditing,
    nodes,
    edges,
    viewport,
    clipboard: { paste, copySelected, selectAll, deleteSelected },
    onOpenPanel: setSelectedNodeId,
    nodeZCounterRef,
  })

  // ━━━ P4 工具栏操作 ━━━

  const { handleInsertNode, handleInsertCapability } = useNodeInsertion({
    isEditing,
    viewport,
    nodeZCounterRef,
  })

  // 粘贴图片：立即创建节点（blob URL 预览），后台上传完成后替换为 OSS URL
  const { handlePasteImage } = useCanvasClipboardImage({ isEditing, viewport, uploader, nodeZCounterRef })

  useEffect(() => {
    handlePasteImageRef.current = handlePasteImage
  }, [handlePasteImage])

  // 监听素材库「添加到画布」事件 —— MaterialDrawer 在 ReactFlowProvider 外部，
  // 用 eventBus 跨 Provider 边界通信，避免 useReactFlow() context 越界 crash
  useEffect(() => {
    return onEvent(EVENTS.ADD_MATERIAL_TO_CANVAS, (e) => {
      if (readonly) return
      const material = e.detail
      if (!material) return
      const center = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      })
      const jitter = () => Math.round((Math.random() - 0.5) * 40)
      const position = { x: center.x + jitter(), y: center.y + jitter() }
      const node = buildMaterialNode(material, position)
      if (!node) return
      // bring-to-front: 写 zIndex = counter++, 避免新节点被点过的老节点压底
      facade.addNodes({ ...node, zIndex: nodeZCounterRef.current++ })
    })
  }, [readonly, screenToFlowPosition, facade])

  // ━━━ 平移模式(空格临时 / 工具栏持久) ━━━

  const { isHandTool, setIsHandTool, isPanActive } = useCanvasPanMode()

  // ── Toolbar 稳定 props ──
  // Toolbar 内部用 antd Tooltip 包按钮, Tooltip 在高频父级重渲染时会让内部 rc-trigger
  // 的 useEffect 累积 setState. 这里把 Toolbar 收到的 callback 全部走 ref 兜底,
  // 再用 React.memo 包 Toolbar/ToolbarButton, 阻断 AiCanvasInner 高频渲染往下传.
  // 必须放在 useCanvasPanMode() 之后, 否则 setIsHandTool 还在 TDZ.
  const toolbarHandlersRef = useRef({})
  toolbarHandlersRef.current.handleInsertNode = handleInsertNode
  toolbarHandlersRef.current.handleInsertCapability = handleInsertCapability
  const stableInsertNode = useCallback((...a) => toolbarHandlersRef.current.handleInsertNode?.(...a), [])
  const stableInsertAbility = useCallback((...a) => toolbarHandlersRef.current.handleInsertCapability?.(...a), [])
  const stableToggleHandTool = useCallback(() => setIsHandTool(v => !v), [setIsHandTool])

  // ━━━ P4 文件拖入 ━━━

  const { isDragOver, onDragOver, onDragLeave, onDrop } = useCanvasDragDrop({
    isEditing,
    uploader,
    nodeZCounterRef,
  })

  // ── 临时诊断: 找出 AiCanvasInner re-render 风暴的源头 (定位完删除) ──
  // 每次渲染对比上一次, 把引用换过的字段名打到 console (限流 200ms/次).
  useRenderDiff('AiCanvasInner', {
    // ── props (父组件传入, 引用换说明上层在 re-render) ──
    readonly, overlaySlot, topRightSlot, brandExtra,
    onOpenSettings, onOpenManager, onBeforeSwitchCanvas, onCanvasSwitched, transferRetryHandler,
    // ── useState ──
    nodes, edges,
    canvasId, canvasName, loading,
    initialViewport, initialLockStatus, managerOpen,
    // ── 子 hook 返回值 ──
    selectedNodeId,
    triggerSave, markDirty, isSaving,
    isDragOver,
  })

  // ━━━ 画布切换 ━━━

  const handleSwitchCanvas = useCallback(async (newCanvasId) => {
    // 切换前的副作用(装饰层:释放编辑锁) — 由父级注入
    if (canvasId && isEditing && onBeforeSwitchCanvas) {
      try {
        await onBeforeSwitchCanvas(canvasId)
      } catch (err) {
        console.warn('[AiCanvas] onBeforeSwitchCanvas 失败,继续切换:', err?.message)
      }
    }
    setLoading(true)
    setSelectedNodeId(null)
    handleContextMenuClose()
    // 切换期间屏蔽 onNodesChange/onMoveEnd 触发的自动保存:loading=true 会卸载 ReactFlow,
    // 重挂时 RF 的 init/测量变更会触发 onNodesChange,不 guard 会把新画布的中间态当编辑存回去。
    isLoadingCanvasRef.current = true
    try {
      const { canvas, lockStatus } = await loadCanvas(canvasStore, newCanvasId)
      setCanvasId(newCanvasId)
      const rawNodes = canvas.nodes || []
      const { nodes: migratedNodes, migrated, affectedLabels } = migrateCapabilityNodes(rawNodes)
      const loadedNodes = backfillCanvasSeq(migratedNodes)
      const loadedEdges = canvas.edges || []
      // seed + replaceAll 同步两份相同数据:loading=false 重挂时 defaultNodes 用新画布节点播种,
      // replaceAll 也直写 store,两条路径幂等 → 最终 store = 新画布节点,不会是旧画布或空。
      setSeedNodes(loadedNodes)
      setSeedEdges(loadedEdges)
      facade.replaceAll({ nodes: loadedNodes, edges: loadedEdges })
      setViewport(canvas.viewport || { x: 0, y: 0, zoom: 1 })
      setInitialLockStatus(lockStatus)
      updateCanvasIdInUrl(newCanvasId)
      onCanvasSwitched?.(newCanvasId, lockStatus)
      resumePendingOutputs(loadedNodes)
      if (migrated) {
        const uniqueLabels = Array.from(new Set(affectedLabels))
        Modal.info({
          title: '画布数据已自动迁移',
          content: (
            <div>
              <p>本画布由旧版本创建，以下能力节点的 <strong>mode</strong> 已重置为默认：</p>
              <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
                {uniqueLabels.map(l => <li key={l}>{l}</li>)}
              </ul>
              <p style={{ color: '#9998B3', marginBottom: 0 }}>
                请在面板中重新选择模式与参数后再运行。保存后下次打开不再提示。
              </p>
            </div>
          ),
          okText: '知道了',
        })
        markDirtyRef.current?.()
        triggerSaveRef.current?.()
      }
      // 获取画布名称
      try {
        const resp = await canvasStore.get(newCanvasId)
        setCanvasName(resp?.name || '')
      } catch {
        // 名称获取失败不影响主流程
      }
    } catch (err) {
      message.error('切换画布失败: ' + err.message)
    } finally {
      setLoading(false)
      // 等 ReactFlow 重挂 + 首次布局两帧后再解除屏蔽,放开自动保存。
      requestAnimationFrame(() => {
        requestAnimationFrame(() => { isLoadingCanvasRef.current = false })
      })
    }
  }, [canvasId, isEditing, onBeforeSwitchCanvas, onCanvasSwitched, facade, setViewport, resumePendingOutputs])

  const handleCreateCanvas = useCallback((canvas) => {
    setCanvasName(canvas.name || '')
    handleSwitchCanvas(canvas.id)
  }, [handleSwitchCanvas])

  const handleRenameCanvas = useCallback((id, name) => {
    if (id === canvasId) setCanvasName(name)
  }, [canvasId])

  // ━━━ 渲染 ━━━

  if (loading) {
    return (
      <div className="ai-canvas-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" tip="加载画布中..." />
      </div>
    )
  }

  return (
    <CanvasDerivedProvider>
    <FoldedOutputGuard foldedIdsRef={foldedOutputIdsRef} foldedMapRef={foldedMapRef} />
    <CanvasIdContext.Provider value={canvasId}>
    <PanelContext.Provider value={panelContextValue}>
    <CapabilityRuntimeContext.Provider value={capabilityRuntimeValue}>
    <CanvasEditingContext.Provider value={canvasEditingValue}>
    <NodeActionExtrasContext.Provider value={nodeActionExtras || defaultNodeActionExtras}>
    <div className="ai-canvas-container">
      {/* 左上角品牌浮层(可选 extra: GitHub 入口等) */}
      <BrandLogo extra={brandExtra} />

      {/* 左侧工具栏(浮层) */}
      <Toolbar
        onInsertNode={stableInsertNode}
        onInsertAbility={stableInsertAbility}
        isEditing={isEditing}
        isPanActive={isPanActive}
        onToggleHandTool={stableToggleHandTool}
        extras={toolbarExtras}
      />

      {/* 主区域(画布 + 右侧节点配置面板) */}
      <div className="ai-canvas-body">
          {/* 画布 */}
          <div
            className={`ai-canvas-main${isPanActive ? ' ac-pan-mode' : ''}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            {/* 右上角浮动区(胶囊) — 放在画布主区内,
                NodePanel 打开时画布主区收窄,胶囊自动跟着左移,不会落到面板上 */}
            <TopRightCluster
              canvasName={canvasName}
              isSaving={isSaving}
              onOpenManager={() => { setManagerOpen(true); onOpenManager?.() }}
              rightSlot={topRightSlot}
            />
            <ReactFlow
              defaultNodes={seedNodes}
              defaultEdges={seedEdges}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onNodeClick={onNodeClick}
              onSelectionChange={onSelectionChange}
              onNodeDoubleClick={onNodeDoubleClick}
              onNodeDragStop={onNodeDragStop}
              onMoveEnd={handleMoveEnd}
              onConnect={onConnect}
              onBeforeDelete={handleBeforeDelete}
              isValidConnection={isValidConnection}
              onPaneContextMenu={onPaneContextMenu}
              onNodeContextMenu={onNodeContextMenu}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
              deleteKeyCode={null}
              nodesDraggable={isEditing && !isPanActive}
              nodesConnectable={isEditing && !isPanActive}
              elementsSelectable={!isPanActive}
              panOnDrag={isPanActive ? true : PAN_ON_DRAG_NORMAL}
              selectionOnDrag={!isPanActive}
              selectionMode="partial"
              selectionKeyCode={null}
              panOnScroll
              zoomActivationKeyCode={ZOOM_ACTIVATION_KEYS}
              minZoom={0.1}
              maxZoom={2}
              defaultViewport={initialViewport}
              proOptions={RF_PRO_OPTIONS}
            >
              <Background variant="dots" gap={20} size={1} color="#d0d0d0" />
              <FoldedAwareMiniMap />
              <Controls position="bottom-right" style={{ right: 160 }} />
              <Panel position="bottom-right" style={{ right: 200 }}>
                <CanvasZoomIndicator />
              </Panel>

              {/* 装饰层槽:只读 banner / 协作头像 / 全局通知等
                  统一由父级(CanvasShell)通过 overlaySlot 注入,画布不感知具体内容 */}
              {overlaySlot && (
                <Panel position="top-center">{overlaySlot}</Panel>
              )}

              {/* 版本号 badge(替换 React Flow 默认 attribution) —— 缓存探测用,见 version.js */}
              <Panel position="bottom-right" style={{ bottom: 108, right: 8 }}>
                <div className="canvas-version-badge">v{CANVAS_VERSION}</div>
              </Panel>

              {/* 节点选中态统一工具栏 — 单一 NodeToolbar 含 3 段按钮组 (debug / actions / media),
                  竖线分隔, align="center" 浮在节点正上方居中.
                  见 docs/ui-standards/components-canvas.html#node-overlays */}
              <NodeToolbarPortal nodeZCounterRef={nodeZCounterRef} />

              {/* 把 zoom 写到 .react-flow 的 CSS 变量 --rf-zoom 上,
                  供端口标签 / 圆点 等"反向缩放"使用 */}
              <ZoomCssVarSetter />
            </ReactFlow>

            {/* 文件拖放覆盖层 */}
            {isDragOver && (
              <div className="drop-overlay">
                <div className="drop-overlay-text">释放以添加文件</div>
              </div>
            )}

            {/* 右键菜单 */}
            {contextMenu && (
              <CanvasContextMenu
                position={contextMenu.position}
                target={contextMenu.target}
                onClose={handleContextMenuClose}
                onAction={handleContextMenuAction}
              />
            )}

            {/* DockedPanel: 折叠形态(form 'folded')能力节点选中时, 节点下方吸附的紧凑参数面板.
                作为 ReactFlow 兄弟元素, 不被 viewport transform 缩放; 锚点用 flowToScreenPosition 跟随节点底部.
                form 1 / 多选 / 无选 时不渲染 (DockedPanel 内部自检). */}
            <DockedPanel
              selectedNode={selectedNode}
              onRun={handleRun}
              isPanActive={isPanActive}
            />
          </div>

          {/* 右侧面板 (form 1 节点 / 输入节点 / 输出节点等仍走右侧面板) */}
          {selectedNode && !(selectedNode.type === 'capability' && isFoldedCapability(selectedNode.data?.capability)) && (
            <NodePanel
              selectedNode={selectedNode}
              onClose={handlePanelClose}
              onRun={handleRun}
              onRerun={handleRerun}
            />
          )}
      </div>

      {/* 画布管理抽屉 */}
      <CanvasManager
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
        currentCanvasId={canvasId}
        onSwitchCanvas={handleSwitchCanvas}
        onCreateCanvas={handleCreateCanvas}
        onRenameCanvas={handleRenameCanvas}
      />

      {/* SettingsModal 已搬出画布:
          装饰层实现由 CanvasShell 通过 onOpenSettings + 自渲染 SettingsModal 接管
          本地实现由 SimpleSettings 接管(Step 2.4 实现) */}
    </div>
    </NodeActionExtrasContext.Provider>
    </CanvasEditingContext.Provider>
    </CapabilityRuntimeContext.Provider>
    </PanelContext.Provider>
    </CanvasIdContext.Provider>
    </CanvasDerivedProvider>
  )
}

// 折叠 output 守卫:在 CanvasDerivedProvider 内订阅折叠映射, 做三件事 ——
//   ① 把折叠 output id 集合同步到 ref(供 onSelectionChange 兜底过滤);
//   ② 把整张 outputId→{parentId, parentHandle} 反查表同步到 ref(供 onBeforeDelete
//      连带删除 folded output);
//   ③ 低频幂等地把折叠 output 的 selectable 置 false(只在折叠集合变化时跑,
//      且只改与目标值不同的节点 → 无变化直接返回原数组, 不触发 setNodes 风暴)。
// 折叠态下 output 渲染为不可见壳, 不应被框选/点选命中。
function FoldedOutputGuard({ foldedIdsRef, foldedMapRef }) {
  const foldedMap = useFoldedOutputMap()
  const facade = useCanvasFacade()
  useEffect(() => {
    const ids = new Set(foldedMap.keys())
    foldedIdsRef.current = ids
    foldedMapRef.current = foldedMap
    facade.batchUpdateNodes((nds) => {
      let changed = false
      const nextNodes = nds.map((n) => {
        const shouldUnselectable = ids.has(n.id)
        // 折叠 output → selectable:false;非折叠 output(展开回来)→ 删除 selectable 标记还原默认
        if (shouldUnselectable) {
          if (n.selectable === false) return n
          changed = true
          return { ...n, selectable: false }
        }
        if (n.selectable === false) {
          changed = true
          const { selectable, ...rest } = n
          return rest
        }
        return n
      })
      return changed ? nextNodes : nds
    })
  }, [foldedMap, facade, foldedIdsRef, foldedMapRef])
  return null
}

// 折叠感知的 MiniMap:折叠态 output 节点在主画布是 1×1 透明壳, 但数据层带 style.width/height
// (200×160 / 300×200 等档位), RF measured 量到的就是这个尺寸 → MiniMap 默认会按这个尺寸
// 画一个小方块, 视觉上多出来一个不该有的"节点"。这里用 nodeColor / nodeStrokeColor 把折叠
// output 涂成透明, 让 MiniMap 跳过其方块绘制。不能用 node.hidden=true —— 那会让 RF 整个不
// 渲染节点 DOM 含 Handle, 破坏跨节点边的端点重写 (见 outputNodeTypes.jsx 注释)。
function FoldedAwareMiniMap() {
  const foldedMap = useFoldedOutputMap()
  const nodeColor = useCallback(
    (n) => (foldedMap.has(n.id) ? 'transparent' : '#fff'),
    [foldedMap],
  )
  const nodeStrokeColor = useCallback(
    (n) => (foldedMap.has(n.id) ? 'transparent' : '#bbb'),
    [foldedMap],
  )
  return (
    <MiniMap
      position="bottom-right"
      style={{ width: 150, height: 100 }}
      zoomable
      pannable
      nodeColor={nodeColor}
      nodeStrokeColor={nodeStrokeColor}
    />
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 外层:提供 ReactFlowProvider,透传 props 到 AiCanvasInner
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function AiCanvas(props) {
  return (
    <ReactFlowProvider>
      <AiCanvasInner {...props} />
    </ReactFlowProvider>
  )
}
