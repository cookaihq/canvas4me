import { Suspense, lazy, useMemo, useCallback, useState, useRef, useEffect } from 'react'
import { Button, Dropdown, Modal, Select, Spin, Tooltip } from 'antd'
import { Play, X, ChevronDown, Coins, AlertCircle } from '@/canvas/icons'
import { useReactFlow } from '@xyflow/react'
import {
  getNodeType,
  CAPABILITIES,
  CAPABILITY_VIEWS,
  getModeDef,
  getModeLabel,
  isMultiMode,
  resolveModeId,
  isOutputNodeType,
  isFoldedCapability,
  shouldHideModeBadgeInHeader,
} from '../registry/nodeTypes'
import { groupCapabilitiesByCategory } from '../registry/groupCapabilities'
import { deriveCapabilityNode, createFoldedOutputNode } from '../utils/nodeFactory'
import {
  setCachedCapability,
  setCachedMode,
  resolveInitialParams,
} from '../utils/capabilityDefaults'
import { usePanelContext } from '../contexts/PanelContext'
import useCapabilityCredits from '../hooks/useCapabilityCredits'
import { resolveInputs } from '../registry/resolveInputs'
import { isPortOccupiedByPanel, isPortOccupiedByEdge } from '../utils/portMutex'
import { useCanvasFacade } from '../state/canvasFacade'
import { useNodeSeq, useNodeSeqMap } from '../state/canvasDerived'
import SnapshotDiffBadge from '../components/badges/SnapshotDiffBadge'
import RunParamsViewer from '../components/RunParamsViewer'

const RUN_COUNT_OPTIONS = [1, 2, 3, 4].map(n => ({ value: n, label: `x${n}` }))
const CLICK_DEBOUNCE_MS = 500
// 上游节点处于这些状态时,视为「资源还在生成中」——禁用本节点运行按钮
const UPSTREAM_GENERATING_STATUSES = new Set(['running', 'polling'])

function formatCredits(value) {
  if (!Number.isFinite(value)) return '-'
  // 小于 1 积分保留 2 位小数，否则取整
  if (value < 1) return value.toFixed(2)
  if (value < 10) return value.toFixed(1).replace(/\.0$/, '')
  return Math.round(value).toString()
}

/**
 * 能力节点面板 —— Header + Body + 底部运行区
 *
 * Header 结构（见 design.md §5.5）：
 *   [类型 icon] [shortLabel] [▾ 下拉]   [mode-badge]         [×]
 *   └─ 左侧 title 组 ───────────────────┘└─ 多模式时显示 ──┘└─ 关闭 ─┘
 *
 * - 子能力下拉里列出同 nodeType 下所有 capability
 * - 未运行（无连接输出节点）：选新 capability 原地替换（portConnections = {}, modeParams = {}）
 * - 已运行（有连接输出节点）：选新 capability **派生新能力节点** 到当前节点下方，
 *   关闭当前面板、打开新节点面板；原节点及其输出保持不动
 * - mode 选择器不在 Header，由 view 壳（{Cap}View.jsx）自己渲染，始终可切（不再锁定）
 */
export default function CapabilityPanel({ node, onClose, onRun, edges, nodes }) {
  const { setCenter, getViewport } = useReactFlow()
  const facade = useCanvasFacade()
  const { openPanel } = usePanelContext()
  // 序号为派生属性, 即时取(节点身上不再带 canvasSeq 字段)
  const seq = useNodeSeq(node?.id)
  // 整张序号表:供"按上游 source 节点 id 查序号"等循环场景(useNodeSeq 单值版不能在 loop 里调)
  const seqMap = useNodeSeqMap()
  const { capability, mode } = node.data || {}
  // error 状态下表单 disabled（spec §3.1：error 状态不允许改参数）
  const locked = node.data?.locked || node.data?.runStatus === 'error'
  const nodeType = node.data?.nodeType ?? node.data?.abilityType
  const [runCount, setRunCount] = useState(1)
  const [viewMode, setViewMode] = useState('draft')
  const lastClickAtRef = useRef(0)

  const nodeTypeInfo = useMemo(() => getNodeType(nodeType), [nodeType])
  const NodeTypeIconComp = nodeTypeInfo?.icon ?? null
  const capDef = capability ? CAPABILITIES[capability] : null
  const resolvedMode = capability ? resolveModeId(capability, mode) : null
  const modeDef = capability ? getModeDef(capability, resolvedMode) : null
  // 当前 mode 的表单参数（per-mode 分桶；传给 CapView 后由各 ModeForm 绑定）
  const modeParams = useMemo(
    () => (resolvedMode ? (node.data?.modeParams?.[resolvedMode] || {}) : {}),
    [node.data?.modeParams, resolvedMode]
  )

  useEffect(() => {
    setViewMode('draft')
  }, [node.id, resolvedMode])

  // 同步 (capability, mode) 到 localStorage 作为下次新建节点的默认值。
  // 写入是幂等的，开面板时即便没真切换也会写一次相同值，无副作用。
  useEffect(() => {
    if (!nodeType || !capability) return
    setCachedCapability(nodeType, capability)
    if (resolvedMode) setCachedMode(capability, resolvedMode)
  }, [nodeType, capability, resolvedMode])

  // 当前能力节点是否已连接了输出节点 —— 决定 capability 切换语义（派生新节点 vs 原地替换）
  const hasOutputConnected = useMemo(() => {
    return edges.some(e => {
      if (e.source !== node.id) return false
      const targetNode = nodes.find(n => n.id === e.target)
      return targetNode && isOutputNodeType(targetNode.type)
    })
  }, [edges, nodes, node.id])

  // 子能力下拉选项（同 nodeType）
  // 占位 capability（未实现）不进下拉——避免用户在已选中状态下展开下拉看到无法切换的项；
  // 新建节点初始态的 chip picker 仍保留占位 + "即将上线"角标作为预告
  const capabilityMenuItems = useMemo(() => {
    const groups = groupCapabilitiesByCategory(nodeType)
      .map(g => ({ ...g, capabilities: g.capabilities.filter(c => !c.placeholder) }))
      .filter(g => g.capabilities.length > 0)
    const items = []
    groups.forEach((g, gi) => {
      if (gi > 0) items.push({ type: 'divider', key: `div-${gi}` })
      const children = g.capabilities.map(cap => ({
        key: cap.id,
        label: cap.shortLabel || cap.label,
      }))
      if (g.label) {
        items.push({ type: 'group', key: `grp-${g.categoryId ?? '__other__'}`, label: g.label, children })
      } else {
        items.push(...children)
      }
    })
    return items
  }, [nodeType])

  const handleCapabilityChange = useCallback((newCapability) => {
    if (!newCapability || newCapability === capability) return

    // 已连接输出: 派生新节点(保护既有输出的一致性), 打开新节点面板
    // 节点编号由 index.jsx 用 computeNodeSeqMap 派生, 此处不再写 canvasSeq
    // deriveCapabilityNode 返回成对 {nodes, edges}: 切到折叠能力时 nodes[1] 为常驻 output、
    // edges[0] 为 internal 边;切到非折叠能力则只有 nodes[0]、edges 为空。
    if (hasOutputConnected) {
      const { nodes: dNodes, edges: dEdges } = deriveCapabilityNode(node, newCapability)
      facade.batchUpdateNodes(nds => [
        ...nds.map(n => (n.selected ? { ...n, selected: false } : n)),
        ...dNodes.map((n, i) => (i === 0 ? { ...n, selected: true } : n)),
      ])
      if (dEdges.length) facade.addEdges(dEdges)
      openPanel?.(dNodes[0].id)
      return
    }

    // 未连接输出：原地替换（重置 mode、modeParams、portConnections）
    // 新 mode 桶用 resolveInitialParams 初始化 (defaults + 上次缓存)
    // 切到折叠能力 → 当前节点需补常驻 output + internal 边(否则重现"无 output 窗口期")。
    const newMode = CAPABILITIES[newCapability]?.defaultMode ?? null
    const isNewFolded = isFoldedCapability(newCapability)
    const pair = isNewFolded
      ? createFoldedOutputNode({ ...node, data: { ...node.data, capability: newCapability, mode: newMode } })
      : null
    facade.batchUpdateNodes(nds => {
      const updated = nds.map(n =>
        n.id === node.id
          ? {
            ...n,
            data: {
              ...n.data,
              capability: newCapability,
              mode: newMode,
              modeParams: newMode
                ? { [newMode]: resolveInitialParams(newCapability, newMode) }
                : {},
              portConnections: {},
            },
          }
          : n
      )
      return pair ? [...updated, pair.outputNode] : updated
    })
    if (pair) facade.addEdges([pair.internalEdge])
  }, [capability, hasOutputConnected, node, facade, openPanel])

  const CapView = useMemo(() => {
    if (!capability) return null
    const loader = CAPABILITY_VIEWS[capability]
    if (!loader) return null
    return lazy(loader)
  }, [capability])

  // 多模式 capability 在 Header 右侧展示 mode-badge,除非 capability 自己关闭(talking-head 等 capability 用自制 mode 选择器已经表达过 mode,Header 不重复显示胶囊)
  const multiMode = capability ? isMultiMode(capability) : false
  const hideBadge = capability ? shouldHideModeBadgeInHeader(capability) : false
  const modeLabel = multiMode && !hideBadge ? getModeLabel(capability, resolvedMode) : null

  // ── 收集端口输入（仅供积分预估读音频/文本等使用；运行时提交仍走 useRunCapability） ──
  const collectedInputsForPricing = useMemo(() => {
    if (!capability || !resolvedMode) return {}
    const inputDefs = resolveInputs(capability, resolvedMode)
    const incoming = edges.filter(e => e.target === node.id)
    const result = {}
    for (const def of inputDefs) {
      const connected = incoming.filter(e => e.targetHandle === def.id)
      if (connected.length === 0) continue
      const values = []
      for (const edge of connected) {
        const src = nodes.find(n => n.id === edge.source)
        if (!src) continue
        values.push({
          nodeId: src.id,
          subType: src.data?.subType,
          content: src.data?.content,
          label: src.data?.label,
        })
      }
      result[def.id] = def.multiple ? values : (values[0] || null)
    }
    return result
  }, [capability, resolvedMode, edges, nodes, node.id])

  const {
    credits: creditsPerRun,
    warning: creditsWarning,
    perUnitCredits,
    perUnitNote,
    pricing: creditsPricing,
  } = useCapabilityCredits(
    capability,
    resolvedMode,
    modeParams,
    collectedInputsForPricing,
  )
  const totalCredits = Number.isFinite(creditsPerRun) && creditsPerRun > 0
    ? creditsPerRun * runCount
    : null
  // 单价行（units 未就绪但 pricing 已返回）—— 例如 seedance-2 的 duration=Auto
  const showPerUnitHint = totalCredits == null
    && Number.isFinite(perUnitCredits)
    && perUnitCredits > 0

  // 必填参数是否都已满足（面板填写 或 端口连线 任一即可）
  const hasMissingRequired = useMemo(() => {
    if (!capability || !resolvedMode) return false
    const defs = resolveInputs(capability, resolvedMode)
    return defs.some(def => {
      if (!def.required) return false
      if (isPortOccupiedByPanel(modeParams, def.id)) return false
      if (isPortOccupiedByEdge(edges, node.id, def.id)) return false
      return true
    })
  }, [capability, resolvedMode, modeParams, edges, node.id])

  // 上游是否还有节点正在生成 —— 任意 incoming edge 的 source 节点 runStatus 为 running/polling
  // 都视为「资源还在路上」,本节点的运行按钮禁用,等上游就绪
  const upstreamGenerating = useMemo(() => {
    const incoming = edges.filter(e => e.target === node.id)
    for (const edge of incoming) {
      const src = nodes.find(n => n.id === edge.source)
      if (!src) continue
      if (UPSTREAM_GENERATING_STATUSES.has(src.data?.runStatus)) {
        return { nodeId: src.id, seq: seqMap.get(src.id) }
      }
    }
    return null
  }, [edges, nodes, node.id, seqMap])

  // 运行区
  const canRun = capability && modeDef?.api && !locked && !hasMissingRequired && !upstreamGenerating
  const disabledReason = upstreamGenerating
    ? `等待上游${typeof upstreamGenerating.seq === 'number' ? ` #${upstreamGenerating.seq}` : ''}输出完成`
    : null
  const handleRun = useCallback(() => {
    if (!onRun || !canRun) return
    const now = Date.now()
    if (now - lastClickAtRef.current < CLICK_DEBOUNCE_MS) return
    lastClickAtRef.current = now
    const doRun = () => onRun(node.id, runCount)
    if (creditsWarning?.message) {
      Modal.confirm({
        title: '本次运行将消耗较多积分',
        icon: <AlertCircle size={14} style={{ color: 'var(--ac-warning)' }} />,
        content: (
          <div>
            <p style={{ margin: 0 }}>{creditsWarning.message}</p>
            {totalCredits != null && (
              <p style={{ margin: '8px 0 0 0' }}>
                预计消耗：<strong style={{ color: 'var(--ac-warning)' }}>
                  {formatCredits(totalCredits)} 积分
                </strong>
              </p>
            )}
          </div>
        ),
        okText: '确认运行',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: doRun,
      })
      return
    }
    doRun()
  }, [onRun, canRun, node.id, runCount, creditsWarning, totalCredits])

  const headerDisplayLabel = capDef?.shortLabel || capDef?.label || '选择子能力'

  // 某些 capability 在特定 mode 下要隐藏 x1/x2/x4 倍数选择器
  // (例如 minimax-speech 的 batch:真实并发数由文本切分段数决定,不是 runCount)
  const hideRunCount = useMemo(() => {
    if (!capability || !resolvedMode) return false
    const list = CAPABILITIES[capability]?.hideRunCountInModes
    return Array.isArray(list) && list.includes(resolvedMode)
  }, [capability, resolvedMode])

  const handleEditStart = useCallback(() => {
    const snapshot = node.data?.lastRunSnapshot
    if (!snapshot || !resolvedMode) return
    facade.batchUpdateNodes(nds => nds.map(n =>
      n.id === node.id
        ? {
            ...n,
            data: {
              ...n.data,
              modeParams: {
                ...n.data.modeParams,
                [resolvedMode]: JSON.parse(JSON.stringify(snapshot)),
              },
              userTouched: {},
            },
          }
        : n
    ))
    setViewMode('draft')
  }, [node.id, node.data?.lastRunSnapshot, resolvedMode, facade])

  const handleSeqBadgeClick = useCallback(() => {
    if (!node) return
    const rawW = node.style?.width ?? node.width
    const rawH = node.style?.height ?? node.height
    const w = typeof rawW === 'number' ? rawW : parseFloat(rawW) || 220
    const h = typeof rawH === 'number' ? rawH : parseFloat(rawH) || 200
    const x = (node.position?.x ?? 0) + w / 2
    const y = (node.position?.y ?? 0) + h / 2
    const { zoom } = getViewport()
    setCenter(x, y, { zoom, duration: 300 })
    facade.batchUpdateNodes(nds => nds.map(n => {
      const shouldSelect = n.id === node.id
      if (!!n.selected === shouldSelect) return n
      return { ...n, selected: shouldSelect }
    }))
  }, [node, setCenter, getViewport, facade])

  return (
    <>
      {/* ── Header：类型 icon + capability 下拉触发器 + mode-badge + 关闭 ── */}
      <div className={`panel-header panel-header-capability panel-header-capability-${nodeType}`}>
        <div className="panel-header-title-group">
          {typeof seq === 'number' && (
            <span
              className="panel-seq-badge panel-seq-badge-clickable"
              title="点击居中到该节点"
              role="button"
              tabIndex={0}
              onClick={handleSeqBadgeClick}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleSeqBadgeClick()
                }
              }}
            >#{seq}</span>
          )}
          <span className="panel-capability-type-icon">
            {NodeTypeIconComp && <NodeTypeIconComp size={18} />}
          </span>
          <Dropdown
            menu={{
              items: capabilityMenuItems,
              onClick: ({ key }) => handleCapabilityChange(key),
              selectedKeys: capability ? [capability] : [],
            }}
            trigger={['click']}
          >
            <span
              className="panel-capability-trigger"
              title={hasOutputConnected ? '已运行：选择新子能力会在当前节点下方派生新节点' : undefined}
            >
              <span className="panel-capability-label">{headerDisplayLabel}</span>
              <ChevronDown className="panel-capability-chevron" size={14} />
            </span>
          </Dropdown>
          {modeLabel && (
            <span className={`panel-capability-mode-badge panel-capability-mode-badge-${nodeType}`}>
              {modeLabel}
            </span>
          )}
        </div>
        <button className="panel-header-close" onClick={onClose} aria-label="关闭">
          <X size={16} />
        </button>
      </div>

      {/* ── Body：capability 壳视图 ── */}
      <div className="panel-body panel-capability-body">
        {viewMode === 'snapshot' ? (
          <RunParamsViewer
            snapshot={node.data?.lastRunSnapshot}
            onEditStart={handleEditStart}
            onExit={() => setViewMode('draft')}
          />
        ) : (
          <div className="panel-capability-view">
            <SnapshotDiffBadge
              nodeData={node.data}
              variant="bar"
              onViewSnapshot={() => setViewMode('snapshot')}
            />
            {CapView ? (
              <Suspense fallback={<div style={{ textAlign: 'center', padding: 24 }}><Spin size="small" /></div>}>
                <CapView
                  capability={capability}
                  mode={resolvedMode}
                  params={modeParams}
                  nodeId={node.id}
                  edges={edges}
                  nodes={nodes}
                  locked={locked}
                />
              </Suspense>
            ) : (
              <div style={{ textAlign: 'center', color: '#bfbfbf', padding: 24 }}>
                请先在卡片上选择子能力
              </div>
            )}
          </div>
        )}

        {/* 运行区（始终展示，snapshot 视图下亦可运行） */}
        <div className="panel-capability-run">
          {totalCredits != null && (
            <div
              className={`panel-capability-credits${creditsWarning ? ' panel-capability-credits-warning' : ''}`}
              title={creditsWarning?.message || undefined}
            >
              <Coins className="panel-capability-credits-icon" size={12} />
              <span>即将消耗 {formatCredits(totalCredits)} 积分</span>
            </div>
          )}
          {totalCredits == null && showPerUnitHint && (
            <div
              className="panel-capability-credits panel-capability-credits-per-unit"
              title={perUnitNote || undefined}
            >
              <Coins className="panel-capability-credits-icon" size={12} />
              <span>
                按每{creditsPricing?.unit_label || '单位'} {formatCredits(perUnitCredits)} 积分
              </span>
              {perUnitNote && (
                <span className="panel-capability-credits-note">（{perUnitNote}）</span>
              )}
            </div>
          )}
          <div className="panel-capability-run-row">
            <Tooltip title={disabledReason} placement="top">
              <Button
                type="primary"
                icon={<Play size={14} />}
                disabled={!canRun}
                onClick={handleRun}
              >
                运行
              </Button>
            </Tooltip>
            {!hideRunCount && (
              <Select
                value={runCount}
                onChange={setRunCount}
                options={RUN_COUNT_OPTIONS}
                style={{ width: 72 }}
                disabled={locked}
              />
            )}
          </div>
        </div>
      </div>
    </>
  )
}
