import { memo, useState } from 'react'
import { getBezierPath, BaseEdge, useStore, useInternalNode, Position } from '@xyflow/react'
import { getCapabilityOutputByHandle, getCapabilityPrimaryOutput, isOutputNodeType, resolveModeId } from '../../registry/nodeTypes'
import { isEdgeVisibleInMode } from '../../utils/portMode'
import { getContentTypeColor } from '../../utils/designTokens'
import { useFoldedOutputMap } from '../../state/canvasDerived'

const DEFAULT_EDGE_COLOR = '#b1b1b7'
// source 节点处于这些状态时,edge 显示流动动画,提示「资源还在生成中」
const FLOWING_STATUSES = new Set(['running', 'polling', 'validating'])

function resolveSourceOutputColor(node, sourceHandleId) {
  if (!node) return DEFAULT_EDGE_COLOR
  // content 节点固定单输出端口,颜色 = data.subType
  if (node.type === 'input') {
    const subType = node.data?.subType
    return subType ? getContentTypeColor(subType) : DEFAULT_EDGE_COLOR
  }
  // 能力节点 / 输出节点:按 sourceHandle 查具体端口 type;handle 不明时 fallback 到主端口
  if (node.type === 'capability' || isOutputNodeType(node.type)) {
    const capability = node.type === 'capability' ? node.data?.capability : node.data?.sourceCapability
    if (!capability) return DEFAULT_EDGE_COLOR
    const mode = resolveModeId(capability, node.type === 'capability' ? node.data?.mode : node.data?.sourceMode)
    const portDef = sourceHandleId
      ? getCapabilityOutputByHandle(capability, mode, sourceHandleId)
      : getCapabilityPrimaryOutput(capability, mode)
    return portDef?.type ? getContentTypeColor(portDef.type) : DEFAULT_EDGE_COLOR
  }
  return DEFAULT_EDGE_COLOR
}

function isSourceFlowing(node) {
  return !!node && FLOWING_STATUSES.has(node.data?.runStatus)
}

// 从 InternalNode 取某 source handle 的绝对坐标(flow 坐标系,与 RF 给的 targetX/Y 同系)。
// RF 把量出的 handle bounds 放在 internals.handleBounds.source,坐标相对节点;
// 加 internals.positionAbsolute 得世界坐标。
function sourceHandleAbs(internalNode, handleId) {
  if (!internalNode) return null
  const bounds = internalNode.internals?.handleBounds?.source || []
  let h = bounds.find((b) => b.id === handleId)
  if (!h) {
    h = bounds[0]
    if (h && import.meta.env?.DEV) {
      // 折叠端口 id 与节点上量出的 handle 不一致 → 退化到首个 handle, 坐标可能偏移
      console.warn(`[CustomEdge] source handle "${handleId}" 未在节点 handleBounds 中找到, 退化到首个 handle`)
    }
  }
  const pos = internalNode.internals?.positionAbsolute
  if (!h || !pos) return null
  return { x: pos.x + h.x + h.width / 2, y: pos.y + h.y + h.height / 2 }
}

/**
 * 自定义连线组件
 * - 贝塞尔曲线
 * - 线条颜色 = source 节点输出端口颜色（按内容类型）
 * - hover / 选中：同色加粗
 * - 折叠形态自解析:被折叠 output 的端点重写回 parent 能力节点主输出端口;parent↔自己被
 *   折叠 output 的内部边不渲染;不匹配当前 mode 的 mode-specific 入边不渲染。
 */
function CustomEdge({
  id,
  source,
  target,
  sourceHandleId,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
  style = {},
}) {
  const [hovered, setHovered] = useState(false)

  // ── 折叠映射:source/target 落在被折叠 output 上时, 端点重写到 parent 能力节点主端口 ──
  const foldedMap = useFoldedOutputMap()
  const srcRedirect = foldedMap.get(source) || null
  const tgtRedirect = foldedMap.get(target) || null

  // 内部边(parent ↔ 自己被折叠的 output): 数据层副产品, 视觉上不显示。
  // Hooks 必须无条件调用, 故 useInternalNode / useStore 都放在任何 return 之前。
  const isInternal = (tgtRedirect && tgtRedirect.parentId === source)
    || (srcRedirect && srcRedirect.parentId === target)

  // source 折叠时, 取 parent 能力节点的端口坐标 + 端口色覆盖 RF 给的(指向不可见 output 的)值。
  const parentInternal = useInternalNode(srcRedirect?.parentId)

  // 取色 + 流动态: source 折叠时按 parent 能力节点 + parentHandle 解析, 否则按真实 source。
  const colorSourceId = srcRedirect ? srcRedirect.parentId : source
  const colorHandleId = srcRedirect ? srcRedirect.parentHandle : sourceHandleId
  const sourceColor = useStore((s) => resolveSourceOutputColor(s.nodeLookup.get(colorSourceId), colorHandleId))
  const flowing = useStore((s) => isSourceFlowing(s.nodeLookup.get(colorSourceId)))

  // 不匹配当前 mode 的 mode-specific 入边: 视觉隐藏(数据保留, 切回原 mode 自动恢复)。
  // target 折叠时连的是 parent 能力节点, 用真实 target(连 capability 的那个)判定 mode。
  const targetMode = useStore((s) => {
    const tn = s.nodeLookup.get(target)
    if (!tn || tn.type !== 'capability') return null
    return resolveModeId(tn.data?.capability, tn.data?.mode)
  })

  if (isInternal) return null
  // isEdgeVisibleInMode 只读 edge.data.capabilityMode, 传 { data } 即可判定。
  if (targetMode && !isEdgeVisibleInMode({ data }, targetMode)) return null

  const parentHandlePos = srcRedirect ? sourceHandleAbs(parentInternal, srcRedirect.parentHandle) : null
  const sx = parentHandlePos ? parentHandlePos.x : sourceX
  const sy = parentHandlePos ? parentHandlePos.y : sourceY
  const sp = parentHandlePos ? Position.Right : sourcePosition

  const [edgePath] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    targetX,
    targetY,
    sourcePosition: sp,
    targetPosition,
  })

  const isFailed = !!data?.failed

  // selected 视觉强化: 加粗到 4 + 同色 4px 半透明光晕 (与端口光晕语言一致),
  // hover 单独维持 2.5 + 轻微 1px 同色光晕作为区分;
  // selected 比 hover 视觉权重更高,避免框选后看不出选中.
  const edgeColor = isFailed ? '#EF4444' : sourceColor
  const edgeStyle = {
    stroke: edgeColor,
    strokeWidth: selected ? 2.5 : (hovered ? 2 : 1.5),
    strokeDasharray: isFailed ? '6 4' : undefined,
    filter: selected
      ? `drop-shadow(0 0 4px color-mix(in srgb, ${edgeColor} 50%, transparent))`
      : (hovered ? `drop-shadow(0 0 1px color-mix(in srgb, ${edgeColor} 40%, transparent))` : undefined),
    transition: 'stroke 0.15s, stroke-width 0.15s, filter 0.15s',
    ...style,
  }

  return (
    <>
      {/* 透明加宽路径，用于扩大 hover 命中区域 */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ pointerEvents: 'stroke' }}
      />
      <BaseEdge
        id={id}
        path={edgePath}
        style={edgeStyle}
        className={`custom-edge${selected ? ' selected' : ''}${hovered ? ' hovered' : ''}${flowing && !isFailed ? ' flowing' : ''}${isFailed ? ' is-orphan' : ''}`}
      />
    </>
  )
}

export default memo(CustomEdge)
