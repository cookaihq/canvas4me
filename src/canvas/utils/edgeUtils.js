import {
  CAPABILITIES,
  isOutputNodeType,
  getCapabilityOutputByHandle,
  resolveModeId,
} from '../registry/nodeTypes'
import { resolveInputs } from '../registry/resolveInputs'
import { isPortOccupiedByPanel, isPortReplaceable } from './portMutex'

/**
 * 端口类型匹配规则
 * file 类型端口接受 file, image, audio, video
 */
const FILE_COMPATIBLE_TYPES = ['file', 'image', 'audio', 'video']

/**
 * 检查源节点 subType 是否被目标端口的 accept 接受
 */
function isTypeAccepted(sourceSubType, acceptTypes) {
  if (!acceptTypes || acceptTypes.length === 0) return false
  for (const acceptType of acceptTypes) {
    if (acceptType === 'file') {
      if (FILE_COMPATIBLE_TYPES.includes(sourceSubType)) return true
    } else if (acceptType === sourceSubType) {
      return true
    }
  }
  return false
}

/**
 * 获取能力节点某个输入端口的定义（基于当前 capability + mode）
 */
function getTargetPortDef(targetNode, targetHandleId) {
  const capability = targetNode.data?.capability
  if (!capability) return null
  const mode = resolveModeId(capability, targetNode.data?.mode)
  const inputs = resolveInputs(capability, mode)
  return inputs.find(input => input.id === targetHandleId) || null
}

/**
 * 读取节点指定输出端口的"subType"用于连线校验
 *
 * - content 节点（input）：固定单输出，id = data.subType（见 InputNode 渲染），直接返回 subType
 * - 能力节点 + 输出节点：按 sourceHandle 查当前 (capability, mode) 的 outputs 定义
 */
function getNodeOutputSubType(node, sourceHandle) {
  if (!node) return null
  if (node.type === 'input') {
    return node.data?.subType || null
  }
  if (node.type === 'capability' || isOutputNodeType(node.type)) {
    const capability = node.type === 'capability'
      ? node.data?.capability
      : node.data?.sourceCapability
    if (!capability) return null
    const mode = resolveModeId(capability, node.type === 'capability' ? node.data?.mode : node.data?.sourceMode)
    return getCapabilityOutputByHandle(capability, mode, sourceHandle)?.type || null
  }
  return null
}

/**
 * 连线校验：判断一条连线是否合法
 *
 * @param {object} connection - { source, sourceHandle, target, targetHandle }
 * @param {Array} nodes - 当前所有节点
 * @param {Array} edges - 当前所有连线
 * @returns {boolean}
 */
export function isValidConnection(connection, nodes, edges) {
  const { source, sourceHandle, target, targetHandle } = connection

  // 1. 阻止自连接
  if (source === target) return false

  // 2. 必须有 sourceHandle 和 targetHandle
  if (!sourceHandle || !targetHandle) return false

  // 3. 阻止重复连接（同一对 source+target+targetHandle）
  const isDuplicate = edges.some(
    e => e.source === source && e.target === target && e.targetHandle === targetHandle
  )
  if (isDuplicate) return false

  // 4. 获取源节点和目标节点
  const sourceNode = nodes.find(n => n.id === source)
  const targetNode = nodes.find(n => n.id === target)
  if (!sourceNode || !targetNode) return false

  // 5. 目标节点必须是能力节点（有输入端口）
  if (targetNode.type !== 'capability') return false

  // 6. 类型匹配检查（sourceHandle 指定 source 节点的哪个输出端口）
  const portDef = getTargetPortDef(targetNode, targetHandle)
  if (!portDef) return false

  const sourceSubType = getNodeOutputSubType(sourceNode, sourceHandle)
  if (!sourceSubType) return false
  if (!isTypeAccepted(sourceSubType, portDef.accept)) return false

  // 8. 面板互斥检查：仅"可替代型"端口（非 context、非 multiple）触发
  //    - context 端口没有面板字段，不参与互斥
  //    - multi 附件端口（面板上传 + 端口连入合并显示），不互斥
  if (isPortReplaceable(portDef) && isPortOccupiedByPanel(targetNode.data?.modeParams?.[resolveModeId(targetNode.data?.capability, targetNode.data?.mode)], targetHandle)) {
    return false
  }

  // 9. 单连检查：非 multiple 的端口只能接受一条连线
  if (!portDef.multiple) {
    const existingConnection = edges.some(
      e => e.target === target && e.targetHandle === targetHandle
    )
    if (existingConnection) return false
  }

  return true
}

/**
 * 切 mode 时根据 portConnections 重算真实 edges。
 *
 * 规则（见 concepts.md §和输入端口的关系）：
 *   - portConnections 跨 mode 共享（按端口 id），切 mode 时**不改**它
 *   - 新 mode 的 inputs 里有的端口 + portConnections 里有记录 + source 节点仍存在 → 渲染为真实 edge
 *   - 新 mode 没有的端口：portConnections 里的记录保留（切回原 mode 时自动恢复）
 *   - source 节点已删除：从 portConnections 里清理（永远救不回来）
 *
 * @param {object} params
 * @param {string} params.nodeId      能力节点 id
 * @param {string} params.newMode     目标 mode id
 * @param {Array}  params.edges       当前 edges
 * @param {Array}  params.nodes       当前 nodes
 * @returns {{ edges: Array, nodes: Array }}
 */
export function reconcileOnModeChange({ nodeId, newMode, edges, nodes }) {
  const capabilityNode = nodes.find(n => n.id === nodeId)
  if (!capabilityNode || capabilityNode.type !== 'capability') {
    return { edges, nodes }
  }

  const capability = capabilityNode.data?.capability
  if (!capability) return { edges, nodes }

  const resolvedNewMode = resolveModeId(capability, newMode)
  const newInputs = resolveInputs(capability, resolvedNewMode)
  const newInputsByHandle = Object.fromEntries(newInputs.map(i => [i.id, i]))

  const portConns = capabilityNode.data?.portConnections || {}

  // 1. 移除所有指向本能力节点的旧 edges（将按 portConnections 重建）
  const otherEdges = edges.filter(e => e.target !== nodeId)
  // 建立 (source, sourceHandle, handle) → 现有 edge id 的查找表，用于复用 id 防止 React Flow 把"旧 id 消失、新 id 出现"
  // 当成 remove+add 触发 handleEdgesChange 的 removeConnection 把刚重建的 portConnections 条目清空。
  const existingEdgeId = {}
  for (const e of edges) {
    if (e.target !== nodeId) continue
    existingEdgeId[`${e.source}|${e.sourceHandle || ''}|${e.targetHandle || ''}`] = e.id
  }

  // 2. 扫描 portConnections：清理死引用 + 为新 mode 的端口生成真实 edges
  const cleanedConns = {}
  const restoredEdges = []
  const nodeExists = (id) => nodes.some(n => n.id === id)

  for (const handle of Object.keys(portConns)) {
    const raw = portConns[handle]
    const conns = Array.isArray(raw) ? raw : [raw]
    const liveConns = conns.filter(c => c && nodeExists(c.source))

    if (liveConns.length === 0) {
      // 所有 source 都被删了 → 整个端口条目清理
      continue
    }
    cleanedConns[handle] = liveConns

    // 新 mode 有此端口才渲染为真实 edge；否则记录保留在 portConnections 里
    const port = newInputsByHandle[handle]
    if (!port) continue

    // single 端口即使 portConnections 里有多条也只取第一条（可能因 multiple→single 切换形成）
    const toRender = port.multiple ? liveConns : liveConns.slice(0, 1)
    for (const c of toRender) {
      const reuseId = existingEdgeId[`${c.source}|${c.sourceHandle || ''}|${handle}`]
      restoredEdges.push({
        id: reuseId || `edge-${c.source}-${c.sourceHandle || ''}-${nodeId}-${handle}`,
        source: c.source,
        sourceHandle: c.sourceHandle,
        target: nodeId,
        targetHandle: handle,
        type: 'custom',
      })
    }
  }

  // 3. 更新能力节点：mode + 清理后的 portConnections
  const updatedNodes = nodes.map(n =>
    n.id === nodeId
      ? {
        ...n,
        data: {
          ...n.data,
          mode: resolvedNewMode,
          portConnections: cleanedConns,
        },
      }
      : n
  )

  return {
    edges: [...otherEdges, ...restoredEdges],
    nodes: updatedNodes,
  }
}
