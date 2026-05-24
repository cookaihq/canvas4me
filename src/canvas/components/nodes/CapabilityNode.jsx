import { memo, useMemo, useEffect, useCallback, useRef, lazy, Suspense, Fragment } from 'react'
import { Handle, Position, NodeResizer, useUpdateNodeInternals, useReactFlow, useStore } from '@xyflow/react'
import { useCanvasFacade } from '../../state/canvasFacade'
import { Tooltip } from 'antd'
import {
  CAPABILITIES,
  CAPABILITY_CARDS,
  getCapabilityPrimaryOutput,
  resolveModeId,
  isFoldedCapability,
} from '../../registry/nodeTypes'
import { NODE_SIZE_PRESETS } from '../../constants/spacing'
import { resolveInputs } from '../../registry/resolveInputs'
import { isPortOccupiedByPanel, isPortReplaceable } from '../../utils/portMutex'
import { getPortColor, getContentTypeColor, normalizeRunStatus, getStatusColor } from '../../utils/designTokens'
import CapabilityCardRenderer from '../../renderers/CapabilityCardRenderer'
import CapabilityCardInitialPicker from './CapabilityCardInitialPicker'
import NodeMetaRow from '../NodeMetaRow'
import FoldedNodeMeta from './FoldedNodeMeta'
import { useDownstreamOutputs, useHiddenEdgeCount } from '../../state/canvasDerived'
import { useRenderRateMonitor } from '@/utils/renderRateMonitor'
import SnapshotDiffBadge from '@/canvas/components/badges/SnapshotDiffBadge'

/**
 * 能力节点壳组件
 * - 背景 #EEF2FF，边框 #B8C8F0，圆角 10px
 * - 左侧输入端口颜色 = 端口承载的内容类型色 + 阴影光晕
 * - 右侧输出端口颜色 = 输出内容类型色 + 阴影光晕
 */
function CapabilityNode({ id, data, selected }) {
  // 节点级渲染频率监控. 1s 内 >RENDER_THRESHOLD 次会进错误日志面包屑 (key 含 nodeId, 一节点一份)
  useRenderRateMonitor(`CapabilityNode:${id}`)

  const capability = data.capability ? CAPABILITIES[data.capability] : null
  const modeId = data.capability ? resolveModeId(data.capability, data.mode) : null

  // 端口集渲染数据源 (设计草案 §3.2 / §4.1):
  //   不可变记录节点 (Done/Failed/Running/Polling/Streaming) 在 DockedPanel 上 draft 跨 cap
  //   切换时, node.data._draft = { capability, mode }, CapabilityNode 端口集要跟 _draft 走,
  //   节点 body / Card 仍按原 capability 渲染老产物.
  //   _draft 缺省时 = 普通节点, 端口集走 data.capability.
  const draftCap = data._draft?.capability || null
  const draftMode = data._draft ? resolveModeId(draftCap, data._draft.mode) : null
  const portsCapability = draftCap || data.capability
  const portsModeId = draftCap ? draftMode : modeId

  // 动态输入端口（由 mode 决定）
  const inputs = useMemo(() => {
    if (!portsCapability) return []
    return resolveInputs(portsCapability, portsModeId)
  }, [portsCapability, portsModeId])

  // 主输出端口(能力节点只渲染 outputs[0];副输出端口只在"输出节点"出现)
  const primaryOutput = portsCapability ? getCapabilityPrimaryOutput(portsCapability, portsModeId) : null
  const outputHandleId = primaryOutput?.id
  const outputType = primaryOutput?.type
  const outputColor = outputType ? getContentTypeColor(outputType) : '#6C5CE7'

  // Handle 集合随 (capability, mode) 动态变化：初次挂载时 capability 可能为 null，
  // 后续选择子能力/切 mode 时增删 Handle。React Flow 只在节点尺寸变化时自动重测 handleBounds，
  // 而 Handle 是 position:absolute，不影响节点尺寸，重测不会自动触发，
  // 导致 edge 渲染时找不到 handle 位置画不出线。这里在 handle 集合变化后主动通知重测。
  const updateNodeInternals = useUpdateNodeInternals()
  useEffect(() => {
    updateNodeInternals(id)
  }, [id, inputs.length, outputHandleId, modeId, portsModeId, portsCapability, updateNodeInternals])

  // 折叠图片节点端口位置依赖 var(--rf-zoom) (top 公式 calc(.../max(zoom, 0.5))),
  // zoom 变化时端口物理位置移动, 但 React Flow handleBounds 只在节点尺寸变化时自动重测,
  // 不监听 inline style 变化 → edge 端点会跟着旧位置, 出现连线脱节.
  // 订阅 zoom, isMediaFolded 节点 zoom 变化时显式调 updateNodeInternals 重测 handleBounds.
  const rfZoom = useStore(s => s.transform[2])

  // 按 (capability, mode) 动态加载卡片渲染器；未注册时回退到通用 CapabilityCardRenderer
  const CardRenderer = useMemo(() => {
    if (!data.capability || !modeId) return null
    const loader = CAPABILITY_CARDS[`${data.capability}/${modeId}`]
    if (!loader) return null
    return lazy(loader)
  }, [data.capability, modeId])

  // folded 形态预判 (isMediaFoldedNode 在下方完整定义, 这里只为 computePortTop 提前判断 folded)
  // 折叠形态覆盖 image / video / audio 三种产物类型 — 共享"节点 = 产物本体"的尺寸联动逻辑.
  // audio 走固定尺寸档 (348×146), aspect 由 NODE_SIZE_PRESETS.audio 的 initial 反算.
  const isFoldedNode = data.capability ? isFoldedCapability(data.capability) : false
  const isMediaFolded = isFoldedNode && (outputType === 'image' || outputType === 'video' || outputType === 'audio')

  // zoom 变化时让 React Flow 重测能力节点的 handleBounds (修复连线对齐).
  // 所有能力节点的 handle top 都用 calc(... / max(zoom, 0.5)) 反向 scale,
  // 物理 offsetTop 随 zoom 变化, 必须主动通知 React Flow 重测, 否则 edge 端点指向旧位置.
  useEffect(() => {
    updateNodeInternals(id)
  }, [id, rfZoom, updateNodeInternals])
  // 能力节点端口分布 (见 components-canvas.html #port "能力节点端口分布算法"):
  //   - 折叠媒体节点 (无 Header): start = 36   → 第 i 个输入视觉 top = 36 + i × 36 = 36/72/108…
  //   - 其他能力节点 (含 Header): start = 44   → 第 i 个输入视觉 top = 44 + i × 36 = 44/80/116…
  //   - 输出端口 top = 第 0 个输入端口的 top (始终与第一个输入端口对齐)
  // 都用 / max(zoom, 0.5) 反向 scale 保持视觉间距恒定 36px (与标签字号视觉恒定策略一致).
  const PORT_TOP_BASE = 44
  const PORT_VISUAL_SPACING = 36
  const portTopCss = (visualPx) =>
    `calc(${visualPx}px / max(var(--rf-zoom, 1), 0.5))`
  const computePortTop = (index) => {
    const start = isMediaFolded ? PORT_VISUAL_SPACING : PORT_TOP_BASE
    return portTopCss(start + index * PORT_VISUAL_SPACING)
  }

  // 折叠形态(form 'folded'): 找到下游被折叠的输出节点, 把它的 data 传给 CardRenderer,
  // 让 view.jsx 把产物 URL 抠到能力节点本体上显示.
  //
  // 派生 hook 读取:结构(哪个 output 属于本节点)由 context 一次算好, 产物内容(runStatus/
  // content 等)用窄 useStore 实时读, 等值比较按 data 引用 → 只在该 output 真正变化时重渲染,
  // 拖动无关节点不触发。下游 output 是派生数据, 不进存盘 (useAutoSave 用 raw nodes).
  const folded = isFoldedNode
  const downstreamList = useDownstreamOutputs(id)
  const downstreamOutputNode = folded ? (downstreamList[0] || null) : null
  const hiddenEdgeCount = useHiddenEdgeCount(id)

  // 六态状态机 (Ready/Running/Polling/Streaming/Done/Failed): 渲染层把 runStatus 规范化.
  // 视觉规则见 docs/reference/ux-spec.md §2.2:
  //   - Failed/Polling/Streaming: 描边色高对比 (#EF4444 红 / #06B6D4 青 + breath / shimmer 动画)
  //   - Ready/Running/Done: 默认描边色 + 内容判定 (Running 是 <2s 瞬态)
  // 折叠态: 任务运行状态在下游 outputNode (capability 节点本身始终是 idle, 由 useRunCapability 注释保证),
  // 必须读 outputNode.runStatus 才能得到真实 Running/Polling/Streaming/Done/Failed 状态.
  // separated 态: 没有下游产物折叠, 直接看能力节点自己的 runStatus.
  const effectiveRunStatus = folded
    ? (downstreamOutputNode?.data?.runStatus ?? data.runStatus)
    : data.runStatus
  const canonicalStatus = normalizeRunStatus(effectiveRunStatus)
  const statusColor = getStatusColor(effectiveRunStatus)
  const isFailed = canonicalStatus === 'Failed'

  // 折叠态 + 媒体产物 (image / video): NodeResizer 的 aspect-lock 联动
  // 折叠形态下 .capability-node 已无 border / radius / padding / header (CSS),
  // header 通过 NodeToolbar 浮在节点物理区外, 节点本体 = 纯产物. 节点 height = W / effectiveAspect.
  //
  // effectiveAspect 三级兜底 (详见 docs/archive/folded-node-spec.md §3.3):
  //   1. realAspect    — 产物真实 w/h (Done 后由 view 写回 data._imageAspect, image / video 共用此字段)
  //   2. targetAspect  — capability 自报: capability.resolveTargetAspect(modeParams) 从生成参数反算
  //   3. initialAspect — NODE_SIZE_PRESETS[presetKey].initial 的 w/h 兜底
  //                      presetKey 按产物类型 (+ video 的 foldedOrientation) 选档
  // → 用户改面板参数时节点立即变形; Done 后切到产物真实比例无二次抖动.
  const { getNode } = useReactFlow()
  const facade = useCanvasFacade()
  const isMediaFoldedNode = isMediaFolded

  const realAspect = useMemo(() => {
    if (!isMediaFoldedNode) return null
    return pickPositiveNumber(data?._imageAspect) || null
  }, [isMediaFoldedNode, data?._imageAspect])

  const targetAspect = useMemo(() => {
    if (!isMediaFoldedNode || !data.capability || !modeId) return null
    const cap = CAPABILITIES[data.capability]
    if (typeof cap?.resolveTargetAspect !== 'function') return null
    const params = data.modeParams?.[modeId] ?? {}
    return pickPositiveNumber(cap.resolveTargetAspect(params)) || null
  }, [isMediaFoldedNode, data.capability, modeId, data.modeParams])

  // 折叠 video 节点选档: capability 自报 foldedOrientation ('landscape' | 'portrait'),
  // 缺省按 targetAspect 推断 (>=1 → landscape, <1 → portrait), 都没有就 landscape.
  // image 类型固定走 'image' 档; audio 类型固定走 'audio' 档 (348×146).
  const presetKey = useMemo(() => {
    if (!isMediaFoldedNode) return null
    if (outputType === 'audio') return 'audio'
    if (outputType !== 'video') return 'image'
    const cap = CAPABILITIES[data.capability]
    const declared = cap?.foldedOrientation
    if (declared === 'portrait') return 'video-portrait'
    if (declared === 'landscape') return 'video-landscape'
    return targetAspect && targetAspect < 1 ? 'video-portrait' : 'video-landscape'
  }, [isMediaFoldedNode, outputType, data.capability, targetAspect])

  const initialAspect = useMemo(() => {
    if (!isMediaFoldedNode || !presetKey) return null
    const preset = NODE_SIZE_PRESETS[presetKey]
    const w = pickPositiveNumber(preset?.initial?.width)
    const h = pickPositiveNumber(preset?.initial?.height)
    return (w && h) ? w / h : null
  }, [isMediaFoldedNode, presetKey])

  const effectiveAspect = realAspect || targetAspect || initialAspect

  // 给定节点 width 反算 height = W / effectiveAspect (节点 = 纯产物, header 浮层不占节点高度)
  const computeNodeHeight = useCallback((nodeWidth) => {
    if (!effectiveAspect || !(nodeWidth > 0)) return null
    return Math.round(nodeWidth / effectiveAspect)
  }, [effectiveAspect])

  // 同步节点 height 到 React Flow store —— 必须同时改顶层 height 和 style.height
  // 因为 React Flow v12 创建节点时 style.{width,height} 会被提升到顶层 node.{width,height},
  // 之后两者并存; NodeResizer 内部也是改顶层 width/height.
  // 只改 style 不会触发 React Flow 内部尺寸更新, 视觉/measure 都不会变.
  // 防 setNodes 振荡: 同一 targetH 100ms 内已写过就跳过. 历史上撞过 Maximum update depth,
  // 高频自动保存 + 多个折叠媒体节点同时尺寸联动时, 容忍 1px 整数边界容易让 bail 失败
  // (e.g. 348 vs 349 时 Math.abs=1 不满足 <1), 这里既放宽到 <=1.5 又加 ref 兜底
  const lastAppliedHRef = useRef({ h: null, ts: 0 })
  const applyNodeHeight = useCallback((targetH) => {
    const now = Date.now()
    const last = lastAppliedHRef.current
    if (last.h === targetH && now - last.ts < 100) return
    lastAppliedHRef.current = { h: targetH, ts: now }
    facade.batchUpdateNodes(nds => nds.map(n => {
      if (n.id !== id) return n
      const curTop = pickPositiveNumber(n.height)
      const curStyle = pickPositiveNumber(n.style?.height, parseFloat(n.style?.height))
      if (curTop && Math.abs(curTop - targetH) <= 1.5 && curStyle && Math.abs(curStyle - targetH) <= 1.5) return n
      return { ...n, height: targetH, style: { ...n.style, height: targetH } }
    }))
  }, [id, facade])

  // 同时改 width + height (用于 Running 进入时强制 reset 到初始尺寸 348×465)
  const applyNodeSize = useCallback((targetW, targetH) => {
    facade.batchUpdateNodes(nds => nds.map(n => {
      if (n.id !== id) return n
      return { ...n, width: targetW, height: targetH, style: { ...n.style, width: targetW, height: targetH } }
    }))
  }, [id, facade])

  // effectiveAspect 变化 (用户改面板参数 / 产物加载完 / 切 mode 等) → 按当前 width 重算 height
  // Running 状态下节点形状已锁定 (生成参数已提交上游, 前端面板改动不应影响进行中的节点),
  // 此时跳过同步, 只让 "Running 进入" 那一次 reset 决定形状.
  useEffect(() => {
    if (!isMediaFoldedNode || !effectiveAspect) return
    if (canonicalStatus === 'Running') return
    const node = getNode?.(id)
    const curW = pickPositiveNumber(node?.width, node?.measured?.width, parseFloat(node?.style?.width))
    const targetH = computeNodeHeight(curW)
    if (!targetH) return
    applyNodeHeight(targetH)
  }, [id, isMediaFoldedNode, effectiveAspect, canonicalStatus, getNode, computeNodeHeight, applyNodeHeight])

  // Running 进入时强制 reset: width 回到 lockedWidth, height 按 effectiveAspect 算
  // (从 Done 等状态切回 Running 时, 节点之前可能被撑成大尺寸; Running 期间应回到标准尺寸).
  // 用 ref 记录上一次 status, 只在状态首次进入 Running 时 reset 一次, Running 中拖大不会被覆盖.
  const lastResetStatusRef = useRef(null)
  useEffect(() => {
    if (!isMediaFoldedNode || !presetKey) return
    if (canonicalStatus === 'Running' && lastResetStatusRef.current !== 'Running') {
      const preset = NODE_SIZE_PRESETS[presetKey]
      const fallbackLockedW = presetKey === 'image' ? 348 : preset?.initial?.width
      const lockedW = pickPositiveNumber(preset?.lockedWidth, preset?.initial?.width) || fallbackLockedW
      const aspect = effectiveAspect || (preset?.initial?.width / preset?.initial?.height)
      const targetH = aspect ? Math.round(lockedW / aspect) : preset?.initial?.height
      applyNodeSize(lockedW, targetH)
    }
    lastResetStatusRef.current = canonicalStatus
  }, [isMediaFoldedNode, presetKey, canonicalStatus, effectiveAspect, applyNodeSize])

  return (
    <>
      <NodeResizer
        minWidth={180}
        minHeight={80}
        isVisible={selected}
        // 折叠媒体节点: 用 React Flow 内置等比缩放锁定宽高比 (节点宽高已由 applyNodeHeight 同步到
        // effectiveAspect)。比 onResize 回调里每帧手写 height 更省: 等比由 RF 内部一次性算 width+height,
        // 不会在 resize 拖拽期高频触发 facade 写 → 不再撞渲染频率监控。
        keepAspectRatio={isMediaFoldedNode && !!effectiveAspect}
        lineClassName="node-resize-line"
        handleClassName="node-resize-handle"
      />

      {/* 画布内序号角标 + 节点名称标签 (NodeMetaRow 外挂左右两段) — 仅 separated 形态显示;
          folded 形态下这两条信息已经在 FoldedNodeMeta 内显示, 上方独立浮签会重复. */}
      {!folded && <NodeMetaRow nodeId={id} name={data.name} />}

      {/* 折叠态 NodeMeta (外挂式): 左右两段直接挂在节点 DOM 内 (position:absolute, top:-24,
          反向缩放到 1× 视觉大小), 左 (seq + name) / 右 (info) 各一段, CSS 处理位置.
          跟 separated NodeMetaRow 一样在节点 stacking context 内, DOM order 后绘的节点
          会自然覆盖 — 视觉上"meta 属于节点本体", 下层节点 meta 不会飞到上层节点身上. */}
      {folded && data.capability && (
        <>
          <FoldedNodeMeta side="left" nodeId={id} data={data} downstreamOutputNode={downstreamOutputNode} />
          <FoldedNodeMeta side="right" nodeId={id} data={data} downstreamOutputNode={downstreamOutputNode} />
        </>
      )}

      <div
        className={`capability-node ${selected ? 'selected' : ''} status-${canonicalStatus}${isFailed ? ' is-failed' : ''}${folded ? ' is-folded' : ''}${isMediaFolded ? ' is-media-folded' : ''}${isMediaFolded && outputType === 'image' ? ' is-image-folded' : ''}${isMediaFolded && outputType === 'video' ? ' is-video-folded' : ''}${isMediaFolded && outputType === 'audio' ? ' is-audio-folded' : ''}`}
        data-run-status={canonicalStatus}
        style={{ '--status-color': statusColor }}
      >
        {/* 节点操作栏 (复制/删除/全屏/下载/查看节点数据) 由 NodeToolbarPortal 在选中态统一渲染,
            折叠态 debugMode "输出" 按钮也并入其 media 段, 节点本体不再自挂工具栏. */}

        {/* 卡片内容：未选子能力 → chip picker；已选 → 具体 Card 或通用 fallback
            折叠形态把下游 outputNode 作为 downstreamOutputNode prop 传给 CardRenderer,
            view.jsx 据此显示产物本体 (URL 等). 详见 docs/archive/20260501-folded-ability-node.md §6.1 */}
        {!data.capability ? (
          <CapabilityCardInitialPicker nodeId={id} nodeType={data.nodeType ?? data.abilityType} />
        ) : CardRenderer ? (
          <Suspense fallback={<CapabilityCardRenderer data={data} />}>
            <CardRenderer nodeId={id} data={data} downstreamOutputNode={folded ? downstreamOutputNode : null} />
          </Suspense>
        ) : (
          <CapabilityCardRenderer data={data} downstreamOutputNode={folded ? downstreamOutputNode : null} />
        )}
      </div>

      {/* 左外侧 input port 标签 (每 port 一行, 与 Handle 圆点垂直对齐)
          折叠态/结构化态/通用态全部共用,见 components-canvas.html #port "端口标签(外置左侧)" */}
      {data.capability && inputs.length > 0 && (
        <div className="capability-node-port-labels">
          {inputs.map((input, index) => (
            <div
              key={input.id}
              className="capability-node-port-label"
              style={{ top: computePortTop(index) }}
              title={input.label}
            >
              {input.label}
            </div>
          ))}
        </div>
      )}

      {/* 左侧输入端口（动态生成，颜色按内容类型） */}
      {inputs.map((input, index) => {
        // 仅"可替代型"端口（非 context、非 multiple）才因面板填写进入锁定态
        // _draft 跨 cap 时端口集走新 cap, 但 modeParams 桶仍是老 cap (新 cap 还没 commit) →
        // panel-occupied 在 draft 期间一律 false (符合"draft 是预备区, 用户尚未填值"的语义)
        const currentParams = portsModeId ? data.modeParams?.[portsModeId] : null
        const panelOccupied = isPortReplaceable(input) && isPortOccupiedByPanel(currentParams, input.id)
        const portColor = getPortColor(input.id, input.type)
        return (
          <Handle
            key={input.id}
            type="target"
            position={Position.Left}
            id={input.id}
            className={`node-handle node-handle-input ${input.required ? 'handle-required' : 'handle-optional'} ${panelOccupied ? 'handle-panel-occupied' : ''}`}
            style={{
              top: computePortTop(index),
              '--port-color': portColor,
            }}
            title={panelOccupied ? `${input.label} - 面板中已设置，清空后可连线` : `${input.label}${input.required ? ' (必需)' : ''}`}
          />
        )
      })}

      {/* 节点头右上角角标区 — 优先级：状态点 > +N 忽略
          超过 3 个折叠为 …，tooltip 列出所有被折叠项 */}
      {(() => {
        const badges = []
        if (data.runStatus !== 'idle' || data.lastRunSnapshot) {
          badges.push({
            key: 'status',
            el: <SnapshotDiffBadge nodeData={data} variant="badge" />,
            title: null,
          })
        }
        const ignoredCount = data._ignoredCount || 0
        if (ignoredCount > 0) {
          badges.push({
            key: 'ignored',
            el: <span className="capability-node-badge" title={`${ignoredCount} 项被忽略`}>+{ignoredCount}</span>,
            title: `${ignoredCount} 项被忽略`,
          })
        }
        if (badges.length === 0) return null
        const visible = badges.slice(0, 3)
        const overflow = badges.slice(3)
        const overflowTitle = overflow.map(b => b.title).filter(Boolean).join(', ')
        return (
          <div className="capability-node-badge-row">
            {visible.map(b => <Fragment key={b.key}>{b.el}</Fragment>)}
            {overflow.length > 0 && (
              <span className="capability-node-badge" title={overflowTitle}>…</span>
            )}
          </div>
        )
      })()}

      {/* 隐藏 edges 提示徽标 (UX_SPEC §7.3): 当前 mode 之外的 mode-specific 入边数 > 0
          时显示, 提示用户切了 mode 后还有其他 mode 连过的线. */}
      {hiddenEdgeCount > 0 && (
        <Tooltip title={`隐藏 ${hiddenEdgeCount} 条其他 mode 的连线`}>
          <div className="capability-node-hidden-edges-badge">
            +{hiddenEdgeCount}
          </div>
        </Tooltip>
      )}

      {/* 右侧主输出端口:id 跟当前 mode 的 outputs[0].id 走(= type)
          位置 = 第 0 个输入端口的 top (始终与第一个输入端口对齐):
            - 折叠媒体节点: 36px / max(zoom, 0.5)
            - 其他能力节点: 44px (与 meta 基线对齐) */}
      {outputHandleId && (
        <Handle
          type="source"
          position={Position.Right}
          id={outputHandleId}
          className="node-handle node-handle-output"
          style={{
            top: computePortTop(0),
            '--port-color': outputColor,
          }}
        />
      )}
    </>
  )
}

function pickPositiveNumber(...vals) {
  for (const v of vals) {
    const n = typeof v === 'number' ? v : Number(v)
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

export default memo(CapabilityNode)
