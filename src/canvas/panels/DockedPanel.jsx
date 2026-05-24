import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
import { useReactFlow, useStore } from '@xyflow/react'
import { Spin } from 'antd'
import {
  CAPABILITIES,
  resolveModeId,
  isFoldedCapability,
  isOutputNodeType,
} from '../registry/nodeTypes'
import { resolveInputs } from '../registry/resolveInputs'
import { retargetFoldedOutputNode } from '../utils/nodeFactory'
import { resolveInitialParams, setCachedParams } from '../utils/capabilityDefaults'
import { patchModeParams } from '../utils/capabilityNodeData'
import { normalizeRunStatus } from '../utils/designTokens'
import { migrateEdgesByRole } from '../utils/migrateEdgesByRole'
import useBrowseMode from '../hooks/useBrowseMode'
import useCanvasPanThrough from '../hooks/useCanvasPanThrough'
import { markUserTouched } from '../runtime/userTouchedTracker'
import { useCanvasFacade } from '../state/canvasFacade'
import { useStoreNodes, useStoreEdges } from '../state/canvasDerived'
import SnapshotDiffBadge from '../components/badges/SnapshotDiffBadge'
import RunParamsViewer from '../components/RunParamsViewer'

/**
 * DockedPanel —— 折叠形态(form 'folded')能力节点选中时, 节点下方吸附的紧凑参数面板
 *
 * 设计要点 (详见 docs/design.md §3.3 + §3.6 / docs/archive/20260501-folded-ability-node.md):
 *  - 渲染在 ReactFlow viewport 容器**之外**, 避免被 viewport transform 一起缩放
 *  - 锚点始终跟随节点底部的**屏幕坐标**, viewport zoom/pan / 节点 DOM 尺寸变化时重算
 *  - 不做超屏兜底: 面板始终吸附节点底部, 超出 viewport 由用户平移画布解决
 *
 * 三种形态: default(默认紧凑) / advanced(展开高级) / modal(全屏 modal 放大 prompt)
 *
 * 插槽 (capability 私有, 按 mode 分发):
 *  - 推荐: `dockedPanels: { [modeId]: () => import('./modes/<ModeName>DockedPanel') }`
 *  - 兜底: 单文件 `dockedPanel: () => import(...)`  (其他还没拆 mode 的 capability)
 *
 * 草稿层 (生成即锁定语义, 详见 docs/archive/20260513-folded-node-edit-semantics.md §3-§4):
 *  - 容器壳维护 draft state: { capability, mode, params }
 *  - 选中节点变化时草稿初始化为本节点实际值
 *  - 修改分流 (按节点是否"已运行"分流, 子组件无感):
 *    - Ready 节点 (下游无 output 或 output runStatus 为 idle)   = 草稿纸
 *      → 实时 commit 到 node.data + 跨 cap 切换时按 role 把入边迁到新端口集
 *    - 已运行节点 (Done / Failed / Running / Polling / Streaming) = 不可变记录
 *      → 仅改 draft, 不污染 node.data
 *      → 跨 cap 切换在 node.data 写 _draft 临时字段让 CapabilityNode 端口集跟 draft 走
 *      → 入边按 role 迁移仅作用于 isDraft edge (用户拉的预备线), 老 edges 不动
 *  - Run 时把 draft 通过 onRun(nodeId, runCount, draftOverride) 传出
 *  - useRunCapability 据节点状态决定原地 commit (Ready) 或派生新节点 (已运行)
 *  - 切节点 / 切回原 cap 时清理 _draft + 所有 isDraft edges
 */

export const DOCKED_PANEL_WIDTH = 639
const ANCHOR_GAP_PX = 6

export default function DockedPanel({
  onRun,
  isPanActive = false,
  // selectedNode prop 不再使用 - 父组件的 selectedNode 是双击 (selectedNodeId) 触发的,
  // DockedPanel 需要单击即响应 (React Flow node.selected 状态), 直接从 store 读.
  // 保留参数声明仅为向下兼容父组件传值.
  selectedNode: _legacySelectedNodeProp, // eslint-disable-line no-unused-vars
}) {
  // 完整 nodes/edges 直接从 store 响应式读取(单一数据源),供 downstreamOutputStatus
  // 与各 mode 的 DockedPanel 实现(按入边解析素材)使用。
  const nodes = useStoreNodes()
  const edges = useStoreEdges()
  const reactFlow = useReactFlow()
  const { flowToScreenPosition } = reactFlow
  const facade = useCanvasFacade()
  const browseMode = useBrowseMode()
  const panelRef = useCanvasPanThrough()

  // 直接从 React Flow store 读单选节点 (单击即 node.selected = true).
  // 单选返回节点对象, 未选中 / 多选都返回 null - DockedPanel 都不显示, 等价合并.
  const selectedNode = useStore((s) => {
    let found = null
    for (const n of s.nodeLookup.values()) {
      if (n.selected) {
        if (found) return null  // 多选时返回 null
        found = n
      }
    }
    return found
  })

  const targetCapability = selectedNode?.data?.capability
  const isFoldedSelection =
    selectedNode?.type === 'capability' &&
    targetCapability &&
    isFoldedCapability(targetCapability)

  // 形态: default / advanced / modal
  const [panelMode, setPanelMode] = useState('default')

  // 查看运行参数视图: 'draft' | 'snapshot'
  const [viewMode, setViewMode] = useState('draft')

  // ── 草稿层 ──
  // 选中节点变化时按 node.id 重置 (取消选中 / 切节点 → 草稿丢失, 设计预期)
  const [draftCapability, setDraftCapability] = useState(null)
  const [draftMode, setDraftMode] = useState(null)
  const [draftParams, setDraftParams] = useState({})
  const lastInitNodeIdRef = useRef(null)
  // 记录上一次见到的 node.data.capability / mode, 用于区分"外部改了 node.data" vs "用户改了 draft"
  // Done 态下用户切 mode 只动 draft, node.data 不变 — 这两个 ref 不变 → 不会反向覆盖 draft
  const lastRealCapRef = useRef(null)
  const lastRealModeRef = useRef(null)

  useEffect(() => {
    const nodeId = selectedNode?.id || null
    if (nodeId === lastInitNodeIdRef.current) return
    const previousNodeId = lastInitNodeIdRef.current
    lastInitNodeIdRef.current = nodeId
    // 切节点 / 取消选中: 弃掉上一节点的草稿会话——清 _draft 字段 + 删它在草稿会话期拉的
    // isDraft 入边。(设计草案 §5: 关浏览器/切节点 = 弃稿; isDraft 不持久化)
    //
    // ⚠️ 仅当上一节点确有 _draft 草稿会话时才删 isDraft 边。isDraft 标记另有一类来源:
    // 连到「已生成的折叠记录节点」的预备线 (见 useCanvasConnection), 这类边没有 _draft
    // 会话, 应留到 Run 时由 useRunCapability 搬给派生节点, 不能因"点了别处"就被弃掉。
    // (修复前 isDraft 边只可能来自 _draft 会话, 故此守卫对既有行为是 no-op。)
    if (previousNodeId) {
      const prevHadDraft = !!reactFlow.getNode(previousNodeId)?.data?._draft
      if (prevHadDraft) {
        facade.batchUpdateEdges(eds => {
          const next = eds.filter(e => !(e.target === previousNodeId && e.isDraft))
          return next.length === eds.length ? eds : next
        })
        facade.batchUpdateNodes(nds => nds.map(n => {
          if (n.id !== previousNodeId) return n
          const { _draft: _drop, ...rest } = n.data
          return { ...n, data: rest }
        }))
      }
    }
    if (!nodeId || !isFoldedSelection) {
      setDraftCapability(null)
      setDraftMode(null)
      setDraftParams({})
      lastRealCapRef.current = null
      lastRealModeRef.current = null
      return
    }
    const cap = selectedNode.data.capability
    const mode = resolveModeId(cap, selectedNode.data.mode)
    setDraftCapability(cap)
    setDraftMode(mode)
    // 防御性 fallback: 老画布数据若 mode 桶缺失,按 commonParams.defaultValue + 上次缓存兜底
    setDraftParams(selectedNode.data.modeParams?.[mode] || resolveInitialParams(cap, mode))
    lastRealCapRef.current = cap
    lastRealModeRef.current = mode
  }, [selectedNode, isFoldedSelection, facade, reactFlow])

  // 切节点或切 mode 时重置 viewMode，避免新节点/新 mode 还停在 snapshot 视图
  useEffect(() => {
    setViewMode('draft')
  }, [selectedNode?.id, draftMode])

  // 节点本体的 capability / mode 由"外部"变更时同步 draft, 防止脱节
  // 判定"外部变更" = realCap/realMode 相对上一次 ref 记录发生变化
  // (用户在 Done 态自己改 draft 时, node.data 不动 → ref 也不动 → 不触发同步)
  useEffect(() => {
    if (!selectedNode || !isFoldedSelection) return
    const realCap = selectedNode.data.capability
    const realMode = resolveModeId(realCap, selectedNode.data.mode)
    const capChanged = realCap !== lastRealCapRef.current
    const modeChanged = realMode !== lastRealModeRef.current
    if (!capChanged && !modeChanged) return
    lastRealCapRef.current = realCap
    lastRealModeRef.current = realMode
    if (draftCapability === realCap) {
      setDraftMode(realMode)
      setDraftParams(selectedNode.data.modeParams?.[realMode] || resolveInitialParams(realCap, realMode))
    }
  }, [selectedNode, isFoldedSelection, draftCapability])

  // 外部如通过 setNodes 直接改 modeParams 时同步 draftParams
  // deps 用对象引用：setNodes 每次产生新对象，effect 触发；JSON.stringify 比较防止循环
  useEffect(() => {
    if (!selectedNode?.id || !draftMode) return
    const external = selectedNode.data?.modeParams?.[draftMode]
    if (!external) return
    if (JSON.stringify(external) !== JSON.stringify(draftParams)) {
      setDraftParams(JSON.parse(JSON.stringify(external)))
    }
  }, [selectedNode?.data?.modeParams?.[draftMode], draftMode, selectedNode?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // 节点是否处于"已运行"形态 (Done / Failed / Running / Polling / Streaming).
  // 折叠态: 能力节点本身永远 idle, 实际状态在下游 output 节点上.
  // 'Ready' 态 (无 output 或 output 的 runStatus 为 idle / undefined) → false.
  // 'Done' 单值兼容字段保留: 子组件 (isDone prop) 若只关心"完成态"自行判断 status==='Done'.
  const lockedStatuses = useMemo(() => new Set(['Done', 'Failed', 'Running', 'Polling', 'Streaming']), [])
  const downstreamOutputStatus = useMemo(() => {
    if (!selectedNode) return null
    const downstreamEdge = edges.find(e => e.source === selectedNode.id)
    const downstreamOutput = downstreamEdge
      ? nodes.find(n => n.id === downstreamEdge.target && isOutputNodeType(n.type))
      : null
    return normalizeRunStatus(downstreamOutput?.data?.runStatus)
  }, [selectedNode, edges, nodes])
  const isLockedFromEdit = lockedStatuses.has(downstreamOutputStatus)
  // 兼容子组件: 沿用 isDone 名字传给 props, 仅在状态严格为 'Done' 时为 true.
  const isDone = downstreamOutputStatus === 'Done'

  // 参数无变化 guard 已禁用：图像/视频生成天然有随机性，用户用同样参数再跑
  // 是合理需求（每次产出不同），不应该禁用 Run。SnapshotDiffBadge 已经在
  // panel 顶部显示「✓ 当前草稿 = 上次运行参数」提示状态，无需再 disabled 按钮。
  // 保留 prop 接口（各 capability view 仍接收，但永远 false）便于未来按需恢复。
  const paramsUnchanged = false

  // ── 跨 capability 切换 ──
  // Ready 节点 (草稿纸): 实时 commit 到 node.data + 按 role 把入边迁到新端口集.
  // 已运行节点 (不可变记录): 仅更新 draft + 在 node.data 写 _draft 让 CapabilityNode
  //   端口集跟 draft 渲染; isDraft 入边按 role 迁到新端口 (老 edges 不动).
  const handleCapabilityChange = useCallback((newCap) => {
    if (!newCap || !CAPABILITIES[newCap]) return
    const newMode = CAPABILITIES[newCap].defaultMode
    const newParams = resolveInitialParams(newCap, newMode)
    setDraftCapability(newCap)
    setDraftMode(newMode)
    setDraftParams(newParams)

    if (!selectedNode?.id) return
    const oldCap = draftCapability ?? selectedNode.data?.capability
    const oldMode = resolveModeId(oldCap, draftMode ?? selectedNode.data?.mode)
    const oldInputs = oldCap ? resolveInputs(oldCap, oldMode) : []
    const newInputs = resolveInputs(newCap, newMode)

    if (isLockedFromEdit) {
      // 不可变记录: node.data 只加 _draft 标记 (不动 capability/mode/modeParams),
      // isDraft edges 按 role 迁; 老 edges 不动.
      // 例外: 切回原 cap (newCap === node.data.capability) → 清 _draft + 全部 isDraft edges,
      //       视觉上回归"无 draft"状态.
      const realCap = selectedNode.data?.capability
      const isSwitchBackToReal = newCap === realCap
      if (isSwitchBackToReal) {
        facade.batchUpdateEdges(eds => eds.filter(e => !(e.target === selectedNode.id && e.isDraft)))
        facade.batchUpdateNodes(nds => nds.map(n => {
          if (n.id !== selectedNode.id) return n
          if (!n.data?._draft) return n
          const { _draft: _drop, ...rest } = n.data
          return { ...n, data: rest }
        }))
        return
      }
      facade.batchUpdateEdges(eds => {
        const draftEdges = eds.filter(e => e.target === selectedNode.id && e.isDraft)
        if (draftEdges.length === 0) return eds
        const { migratedEdges, failedEdgeIds } = migrateEdgesByRole({
          edges: draftEdges,
          nodeId: selectedNode.id,
          oldInputs,
          newInputs,
        })
        const failedSet = new Set(failedEdgeIds)
        const migratedById = new Map(migratedEdges.map(e => [e.id, e]))
        return eds.map(e => {
          const m = migratedById.get(e.id)
          if (!m) return e
          if (failedSet.has(e.id)) {
            return { ...m, data: { ...(m.data || {}), failed: true }, className: appendClass(m.className, 'is-orphan') }
          }
          // 成功迁移 → 清失败标记
          return clearFailedEdgeMark(m)
        })
      })
      facade.batchUpdateNodes(nds => nds.map(n =>
        n.id === selectedNode.id
          ? { ...n, data: { ...n.data, _draft: { capability: newCap, mode: newMode } } }
          : n
      ))
    } else {
      // 草稿纸: 全套 commit + 入边按 role 直接迁 (不带 isDraft, 是正式迁移).
      // 折叠节点 capability 原地变更 → 同时把常驻 output 改型对齐新 capability:
      //   保留 output id(保住下游已连的边)、换 type/渲染 data、internal 边 sourceHandle 指新主输出端口。
      const selNodeType = selectedNode.data?.nodeType ?? selectedNode.data?.abilityType
      const oldOutput = nodes.find(n =>
        isOutputNodeType(n.type) &&
        (n.data?.sourceCapabilityId ?? n.data?.sourceAbilityId) === selectedNode.id
      )
      const retarget = oldOutput
        ? retargetFoldedOutputNode(oldOutput, newCap, newMode, selNodeType)
        : null

      facade.batchUpdateEdges(eds => {
        const { migratedEdges, failedEdgeIds } = migrateEdgesByRole({
          edges: eds,
          nodeId: selectedNode.id,
          oldInputs,
          newInputs,
        })
        const failedSet = new Set(failedEdgeIds)
        return migratedEdges.map(e => {
          // internal 边(能力节点 → 常驻 output): sourceHandle 指到新主输出端口
          if (retarget && oldOutput && e.source === selectedNode.id && e.target === oldOutput.id) {
            return { ...e, sourceHandle: retarget.sourceHandle }
          }
          if (e.target !== selectedNode.id) return e
          if (failedSet.has(e.id)) {
            return { ...e, data: { ...(e.data || {}), failed: true }, className: appendClass(e.className, 'is-orphan') }
          }
          return clearFailedEdgeMark(e)
        })
      })
      facade.batchUpdateNodes(nds => nds.map(n => {
        if (n.id === selectedNode.id) {
          const nextData = {
            ...n.data,
            capability: newCap,
            mode: newMode,
            modeParams: { ...(n.data?.modeParams || {}), [newMode]: newParams },
          }
          if (nextData._draft) delete nextData._draft
          return { ...n, data: nextData }
        }
        if (retarget && oldOutput && n.id === oldOutput.id) return retarget.outputNode
        return n
      }))
    }
  }, [selectedNode, draftCapability, draftMode, isLockedFromEdit, facade, nodes])

  // ── mode 切换 ──
  // 草稿纸 + 同 cap: commit 到 node.data + 跨 mode 端口按 role 迁移 (含同 cap 内的 mode 切换).
  // 已运行节点: 仅 draft + isDraft edges 按 role 迁; 跨 cap 走 handleCapabilityChange 已处理.
  const handleModeChange = useCallback((newMode) => {
    if (!newMode) return
    const isCrossCap = draftCapability !== selectedNode?.data?.capability
    const isSameMode = newMode === draftMode
    // 新 mode 桶若不存在(首次切到此 mode),按 commonParams.defaultValue + 上次缓存初始化;
    // 已存在则用现有值(用户改过的优先)。
    const stored = selectedNode?.data?.modeParams?.[newMode]
      || resolveInitialParams(draftCapability, newMode)
    const nextParams = (!isCrossCap && !isSameMode)
      ? { ...(draftParams || {}), ...stored }
      : stored

    setDraftMode(newMode)
    setDraftParams(nextParams)

    if (!selectedNode?.id || isSameMode) return
    const oldInputs = draftCapability ? resolveInputs(draftCapability, draftMode) : []
    const newInputs = draftCapability ? resolveInputs(draftCapability, newMode) : []

    if (isLockedFromEdit) {
      // 不可变记录: 仅迁 isDraft edges + node.data 写 _draft.
      facade.batchUpdateEdges(eds => {
        const draftEdges = eds.filter(e => e.target === selectedNode.id && e.isDraft)
        if (draftEdges.length === 0) return eds
        const { migratedEdges, failedEdgeIds } = migrateEdgesByRole({
          edges: draftEdges,
          nodeId: selectedNode.id,
          oldInputs,
          newInputs,
        })
        const failedSet = new Set(failedEdgeIds)
        const migratedById = new Map(migratedEdges.map(e => [e.id, e]))
        return eds.map(e => {
          const m = migratedById.get(e.id)
          if (!m) return e
          if (failedSet.has(e.id)) {
            return { ...m, data: { ...(m.data || {}), failed: true }, className: appendClass(m.className, 'is-orphan') }
          }
          return clearFailedEdgeMark(m)
        })
      })
      facade.batchUpdateNodes(nds => nds.map(n =>
        n.id === selectedNode.id
          ? { ...n, data: { ...n.data, _draft: { capability: draftCapability, mode: newMode } } }
          : n
      ))
    } else if (!isCrossCap) {
      // 草稿纸 + 同 cap: commit modeParams + 同 cap 内 mode 切换走 role 迁移.
      facade.batchUpdateEdges(eds => {
        const { migratedEdges, failedEdgeIds } = migrateEdgesByRole({
          edges: eds,
          nodeId: selectedNode.id,
          oldInputs,
          newInputs,
        })
        const failedSet = new Set(failedEdgeIds)
        return migratedEdges.map(e => {
          if (e.target !== selectedNode.id) return e
          if (failedSet.has(e.id)) {
            return { ...e, data: { ...(e.data || {}), failed: true }, className: appendClass(e.className, 'is-orphan') }
          }
          return clearFailedEdgeMark(e)
        })
      })
      facade.batchUpdateNodes(nds => nds.map(n => (
        n.id === selectedNode.id
          ? { ...n, data: patchModeParams({ ...n.data, mode: newMode }, newMode, nextParams) }
          : n
      )))
    }
    // 草稿纸 + 跨 cap: handleCapabilityChange 已处理过端口迁移, 这里不重复.
  }, [selectedNode, draftCapability, draftMode, draftParams, isLockedFromEdit, facade])

  // params 修改: 草稿纸 + 同 cap → draft + 同步 node.data; 已运行节点 / 跨 cap → 仅 draft
  // 并即时写入 (cap, mode) 表单参数缓存(剥离 prompt) —— 下次新建同 cap/mode 的节点自动带出.
  const handleParamsChange = useCallback((patch) => {
    if (!patch || typeof patch !== 'object') return
    setDraftParams(p => {
      const merged = { ...p, ...patch }
      if (draftCapability && draftMode) {
        setCachedParams(draftCapability, draftMode, merged)
      }
      return merged
    })
    const isCrossCap = draftCapability !== selectedNode?.data?.capability
    if (!isLockedFromEdit && !isCrossCap && selectedNode?.id && draftMode) {
      markUserTouched({ nodeId: selectedNode.id, capability: draftCapability, mode: draftMode, fieldIds: Object.keys(patch) }, facade.batchUpdateNodes)
      facade.batchUpdateNodes(nds => nds.map(n =>
        n.id === selectedNode.id ? { ...n, data: patchModeParams(n.data, draftMode, patch) } : n
      ))
    }
  }, [selectedNode, draftCapability, draftMode, isLockedFromEdit, facade])

  // Run: 把 draft 作为 override 传给 onRun
  // useRunCapability 自行判断是否需要派生 (Done) 还是原地运行 (Ready)
  const handleRunFromDraft = useCallback((nodeId, runCount = 1) => {
    if (!nodeId) return
    onRun?.(nodeId, runCount, {
      capability: draftCapability,
      mode: draftMode,
      params: draftParams,
    })
  }, [onRun, draftCapability, draftMode, draftParams])

  // 「基于这些参数继续编辑」: 把 lastRunSnapshot 深拷贝到 modeParams[draftMode] + 清 userTouched + 回 draft 视图
  const handleEditStart = useCallback(() => {
    if (!selectedNode?.id || !draftMode) return
    const snapshot = selectedNode.data?.lastRunSnapshot
    if (!snapshot) return
    const snapshotCopy = JSON.parse(JSON.stringify(snapshot))
    facade.batchUpdateNodes(nds => nds.map(n =>
      n.id === selectedNode.id
        ? {
            ...n,
            data: {
              ...n.data,
              modeParams: {
                ...n.data.modeParams,
                [draftMode]: snapshotCopy,
              },
              userTouched: {},
            },
          }
        : n
    ))
    setDraftParams(snapshotCopy)   // 同步更新内部缓存，刷新表单显示和 diff badge
    setViewMode('draft')
  }, [selectedNode?.id, selectedNode?.data?.lastRunSnapshot, draftMode, facade])

  // ── 锚点跟随 ──
  // anchor 是"派生值"(由 selectedNode 位置 + viewport transform 派生屏幕坐标),
  // 不应该用 useState+useEffect+setAnchor 写, 那会撞 React"派生值用 state 反模式"
  // 触发 Maximum update depth (拖动时 selectedNode 引用每帧变, effect 每帧 setAnchor 新对象,
  // 配合 ReactFlow StoreUpdater 的高频 store 推送, 50 帧内累积进 nested update 计数器爆掉).
  // 改用 useMemo 直接派生 — 没有 setState, 自然没有循环.
  // 锚点依赖三类输入,全部用 store 派生,零 app 层 setState:
  //   1) viewport 变换(pan/zoom)→ transform
  //   2) 画布容器尺寸(含窗口 resize)→ store 的 width/height
  //      React Flow 内部已对容器挂 ResizeObserver + 监听 window resize 写这两个字段,
  //      订阅它们即可在窗口/容器尺寸变化时重算锚点,无需自建 ResizeObserver。
  //   3) 选中节点自身尺寸/位置 → selectedNode.measured / internals(随 RF 节点测量更新)
  const transform = useStore(s => s.transform)
  const rfWidth = useStore(s => s.width)
  const rfHeight = useStore(s => s.height)

  const anchor = useMemo(() => {
    if (!selectedNode || selectedNode.type !== 'capability') return null
    // NodeResizer 只更新 node.measured + 顶层 node.width/height, 永远不动 node.style.
    // 必须按 "measured(DOM 实测) → width(顶层) → style(初始兜底)" 取, 反之会读到永不更新的初始 style.
    const rawW = selectedNode.measured?.width ?? selectedNode.width ?? selectedNode.style?.width
    const rawH = selectedNode.measured?.height ?? selectedNode.height ?? selectedNode.style?.height
    const w = typeof rawW === 'number' ? rawW : parseFloat(rawW) || 220
    const h = typeof rawH === 'number' ? rawH : parseFloat(rawH) || 200
    // 优先用 internals.positionAbsolute (React Flow 内部坐标系算好的世界坐标),
    // fallback 到 position (顶级节点 OK)
    const absPos = selectedNode.internals?.positionAbsolute || selectedNode.position
    const x = absPos?.x ?? 0
    const y = absPos?.y ?? 0
    try {
      const screenAnchor = flowToScreenPosition({ x: x + w / 2, y: y + h })
      return {
        left: screenAnchor.x - DOCKED_PANEL_WIDTH / 2,
        top: screenAnchor.y + ANCHOR_GAP_PX,
      }
    } catch {
      return null
    }
  }, [selectedNode, transform, rfWidth, rfHeight, flowToScreenPosition])

  // 鼠标在面板上滚轮时的行为(空白处 pan / 子元素未触底 → 浏览器滚 / 触底 buffer / Ctrl+wheel zoom)
  // 统一走 useCanvasPanThrough, 行为契约见 UX_SPEC.md §9.9。
  // 加载 capability 的 DockedPanel 实现 (按 draft mode 分发, 不是 node.data 的 mode)
  // 这样 done 节点切 mode 后, 显示的是 draft mode 对应的面板
  const DockedPanelImpl = useMemo(() => {
    if (!isFoldedSelection || !draftCapability) return null
    const cap = CAPABILITIES[draftCapability]
    if (!cap) return null
    const loader = cap.dockedPanels?.[draftMode] ?? cap.dockedPanel
    if (typeof loader !== 'function') return null
    return lazy(loader)
  }, [isFoldedSelection, draftCapability, draftMode])

  if (browseMode || !isFoldedSelection || !DockedPanelImpl) return null

  // 共享给 impl 的 props
  const implProps = {
    node: selectedNode,
    capability: draftCapability,
    mode: draftMode,
    params: draftParams,
    edges,
    nodes,
    isDone,
    paramsUnchanged,
    onCapabilityChange: handleCapabilityChange,
    onModeChange: handleModeChange,
    onParamsChange: handleParamsChange,
    onRun: handleRunFromDraft,
    onRequestVariant: setPanelMode,
  }

  if (panelMode === 'modal') {
    return (
      <div
        className="docked-panel-modal-overlay"
        onClick={() => setPanelMode('default')}
        role="presentation"
      >
        <div
          className="docked-panel-modal-shell"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <Suspense fallback={<DockedPanelSpin />}>
            <DockedPanelImpl {...implProps} variant="modal" />
          </Suspense>
        </div>
      </div>
    )
  }

  if (!anchor) return null

  const style = {
    position: 'fixed',
    left: anchor.left,
    top: anchor.top,
    width: DOCKED_PANEL_WIDTH,
    zIndex: 50,
  }

  const className = `docked-panel${isPanActive ? ' docked-panel--pan-through' : ''}`

  // SnapshotDiffBadge 通过 nodeData.mode 查 modeParams，这里用 draftMode + draftParams 适配，
  // 保证 Done 态用户切了 mode 后 badge 比较的是正确的 draft vs snapshot。
  const snapshotBadgeNodeData = selectedNode?.data
    ? { ...selectedNode.data, mode: draftMode, modeParams: { ...(selectedNode.data.modeParams || {}), [draftMode]: draftParams } }
    : null

  return (
    <div ref={panelRef} className={className} style={style}>
      {viewMode === 'snapshot' ? (
        <RunParamsViewer
          snapshot={selectedNode.data?.lastRunSnapshot}
          onEditStart={handleEditStart}
          onExit={() => setViewMode('draft')}
        />
      ) : (
        <>
          <SnapshotDiffBadge
            nodeData={snapshotBadgeNodeData}
            variant="bar"
            onViewSnapshot={() => setViewMode('snapshot')}
          />
          <Suspense fallback={<DockedPanelSpin />}>
            <DockedPanelImpl {...implProps} variant={panelMode} />
          </Suspense>
        </>
      )}
    </div>
  )
}

function DockedPanelSpin() {
  return (
    <div style={{ padding: 24, textAlign: 'center' }}>
      <Spin size="small" />
    </div>
  )
}

// 给 edge.className 追加 token (去重). React Flow edge 的 className 是空格分隔字符串.
function appendClass(prev, token) {
  if (!token) return prev
  if (!prev) return token
  const tokens = String(prev).split(/\s+/).filter(Boolean)
  if (tokens.includes(token)) return prev
  return [...tokens, token].join(' ')
}

// 清掉 edge 上失败迁移的标记 (data.failed + className=is-orphan).
// 用于"再次切换 cap/mode 时, 上一轮失败 edge 这次成功匹配"的恢复路径.
function clearFailedEdgeMark(edge) {
  const had = edge.data?.failed || (edge.className && /\bis-orphan\b/.test(edge.className))
  if (!had) return edge
  const next = { ...edge }
  if (edge.data?.failed) {
    const { failed: _drop, ...restData } = edge.data
    next.data = restData
  }
  if (edge.className) {
    const tokens = String(edge.className).split(/\s+/).filter(t => t && t !== 'is-orphan')
    next.className = tokens.length ? tokens.join(' ') : undefined
  }
  return next
}
