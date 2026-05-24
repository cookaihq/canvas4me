import { useCallback, useRef } from 'react'
import { addEdge } from '@xyflow/react'
import { resolveModeId, isFoldedCapability, isOutputNodeType } from '../registry/nodeTypes'
import { resolveInputs } from '../registry/resolveInputs'
import { normalizeRunStatus } from '../utils/designTokens'
import {
  addConnection,
  removeConnection,
  clearConnectionsBySource,
} from '../utils/capabilityNodeData'
import { isValidConnection as checkValidConnection } from '../utils/edgeUtils'
import { resolveEdgeCapabilityMode } from '../utils/portMode'
import { clearFile } from '../state/dragUploadStore'
import { useCanvasFacade } from '../state/canvasFacade'

/**
 * 节点连线 / 节点变化包装 hook
 *
 * 4 个 callback 都做"标准 React Flow 行为 + portConnections 同步":
 *   - onConnect:        addEdge + 写入 portConnections
 *   - handleEdgesChange: 包装 onEdgesChange,捕获 remove 事件清理 portConnections
 *   - handleNodesChange: 包装 onNodesChange,捕获 remove 事件清理引用
 *   - isValidConnection: 调用 edgeUtils 的校验
 *
 * portConnections 见 concepts.md §和输入端口的关系。
 */
export default function useCanvasConnection({
  nodes,
  edges,
  setNodes,
  setEdges,
  onNodesChange,
  onEdgesChange,
}) {
  // 把 nodes / edges 兜进 ref, 让下面 4 个 callback 的引用 mount 后永不变.
  // 否则把 nodes/edges 写进 useCallback deps, 拖动一帧 nodes 就换引用 → 这些 callback
  // 跟着每渲染都换引用 → ReactFlow StoreUpdater 的 useLayoutEffect 反复 store.setState
  // → 唤醒全部订阅者 → DockedPanel 的 setAnchor effect 配合 React 嵌套更新检测撞
  // "Maximum update depth exceeded". 同 useAutoSave 顶部说明.
  const facade = useCanvasFacade()
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  nodesRef.current = nodes
  edgesRef.current = edges

  const onConnect = useCallback((connection) => {
    const currentNodes = nodesRef.current
    const currentEdges = edgesRef.current
    // ── 折叠形态端口代理 ──
    // 用户从 form 'folded' 能力节点的右侧端口拉线时, 视觉上 source 是能力节点,
    // 但数据层的 source 必须改写成下游被折叠的 outputNode (V1 数据形态:
    // outputNode -> nextNode). 这样 form 1 / form 2 在数据层完全一致, 老画布
    // 与新折叠形态可自由互转, 不引入 V2 标记字段.
    let proxied = connection
    const sourceNode = currentNodes.find(n => n.id === connection.source)
    if (sourceNode?.type === 'capability' && isFoldedCapability(sourceNode.data?.capability)) {
      // 在 edges 里查"该能力节点 -> outputNode"那条边
      const outputEdge = currentEdges.find(e =>
        e.source === sourceNode.id &&
        currentNodes.find(n => n.id === e.target && isOutputNodeType(n.type))
      )
      if (outputEdge) {
        proxied = {
          ...connection,
          source: outputEdge.target,
          // 输出节点的 source handle 与能力节点不同(由该 capability 的 OutputNode 定义),
          // 但能力节点和输出节点都按 outputs[0].id 命名主输出端口, 多数情况下可直接复用.
          // 如果端口 id 不匹配, 留给上层 isValidConnection / 实际连线渲染兜底.
        }
      }
    }

    // 多 mode capability 的 edge mode 标记 (UX_SPEC §7.1):
    //   - 连到 capability 节点的通用端口 → capabilityMode = '*'  (跨 mode 共用)
    //   - 连到 mode-specific 端口         → capabilityMode = 当前 mode id
    //   - 连到 IO / 输出节点              → 不写 capabilityMode 字段 (undefined)
    const targetNodeForMode = currentNodes.find(n => n.id === proxied.target)
    const capabilityMode = resolveEdgeCapabilityMode(targetNodeForMode, proxied.targetHandle)
    const edgeData = capabilityMode !== undefined ? { capabilityMode } : undefined

    // isDraft 标记 (生成即锁定 §4.6): 连到"不可变记录节点"的边是"预备线" —— 持久化时被
    // sanitizeCanvasPayload filter 掉, Run 时由 useRunCapability 转给派生新节点, 不固化到
    // 历史节点上。两种成为预备线的情形:
    //   1. DockedPanel draft 期间连到 draft 端口 (node.data._draft 存在 + targetHandle 不在
    //      当前 capability/mode 的 inputs 里) —— 切了能力/模式后拉的预备连线。
    //   2. 连到已生成/生成中的折叠记录节点 —— 该节点已是冻结历史 (Done) 或正在产出
    //      (Polling/Streaming/Running), 下次 Run 必派生新节点 (与 useRunCapability 的
    //      startWithDerive 同源)。任何新连入的边都属于"下次派生出的新节点", 不应固化到
    //      历史节点上 (否则历史节点会挂着它从未跑过的输入)。
    //      Ready (未跑, 首跑在原节点) 与 Failed (可原地重试, 节点本体仍可变、重跑会真用
    //      上这条边) 不算冻结记录 —— 这两种状态下新边照常持久化。
    let isDraft = false
    if (targetNodeForMode?.type === 'capability') {
      if (targetNodeForMode.data?._draft) {
        const realCap = targetNodeForMode.data.capability
        const realMode = resolveModeId(realCap, targetNodeForMode.data.mode)
        const realInputs = realCap ? resolveInputs(realCap, realMode) : []
        const inRealPorts = realInputs.some(p => p.id === proxied.targetHandle)
        if (!inRealPorts) isDraft = true
      }
      if (!isDraft && isFoldedCapability(targetNodeForMode.data?.capability)) {
        const downstreamOutput = currentNodes.find(n =>
          isOutputNodeType(n.type) &&
          (n.data?.sourceCapabilityId ?? n.data?.sourceAbilityId) === targetNodeForMode.id
        )
        const recordStatus = normalizeRunStatus(downstreamOutput?.data?.runStatus)
        if (downstreamOutput && recordStatus !== 'Ready' && recordStatus !== 'Failed') {
          isDraft = true
        }
      }
    }

    facade.batchUpdateEdges((eds) => {
      // uncontrolled React Flow 在连接落地时会自行把"原始 source"那条边写进 store
      // (走 defaultEdgeOptions: type custom、无 capabilityMode/isDraft data)。两种情况下
      // 这条自动边都得先按本次连接端点删掉, 否则下面 addEdge 会因"同端点已存在"去重,
      // 让自动边(缺 capabilityMode/isDraft)留下、我们带正确标记的边被丢弃:
      //   1. 折叠改写 (proxied.source !== connection.source): 自动边 source=能力节点, 与
      //      改写出的 source=output 边并存成平行双线 —— 删掉自动边只留改写边。
      //   2. isDraft 预备线: 自动边不带 isDraft, 若被去重保留则预备线标记丢失, 派生时不会
      //      搬走 —— 删掉自动边, 让带 isDraft 的边落地。
      const next = (proxied.source !== connection.source || isDraft)
        ? eds.filter(e => !(
            e.source === connection.source &&
            e.sourceHandle === connection.sourceHandle &&
            e.target === connection.target &&
            e.targetHandle === connection.targetHandle
          ))
        : eds
      return addEdge({
        ...proxied,
        type: 'custom',
        ...(edgeData ? { data: edgeData } : {}),
        ...(isDraft ? { isDraft: true } : {}),
      }, next)
    })

    const { source, sourceHandle, target, targetHandle } = proxied
    if (!target || !targetHandle) return
    // isDraft edge 不写 portConnections (它本身不持久化, portConnections 也不应被它"占用")
    if (isDraft) return
    facade.batchUpdateNodes(nds => nds.map(n => {
      if (n.id !== target || n.type !== 'capability') return n
      const capability = n.data?.capability
      if (!capability) return n
      const mode = resolveModeId(capability, n.data?.mode)
      const inputs = resolveInputs(capability, mode)
      const port = inputs.find(i => i.id === targetHandle)
      if (!port) return n
      return {
        ...n,
        data: addConnection(n.data, targetHandle, {
          source,
          sourceHandle,
        }, !!port.multiple),
      }
    }))
  }, [setEdges, setNodes, facade])

  const handleEdgesChange = useCallback((changes) => {
    const prevEdges = edgesRef.current
    const prevNodes = nodesRef.current
    const removedEdges = changes
      .filter(c => c.type === 'remove')
      .map(c => prevEdges.find(e => e.id === c.id))
      .filter(e => e && e.target && e.targetHandle)

    onEdgesChange(changes)

    if (removedEdges.length === 0) return
    facade.batchUpdateNodes(nds => nds.map(n => {
      if (n.type !== 'capability') return n
      const relevant = removedEdges.filter(e => e.target === n.id)
      if (relevant.length === 0) return n
      let data = n.data
      for (const e of relevant) {
        data = removeConnection(data, e.targetHandle, e.source, e.sourceHandle)
      }
      return data === n.data ? n : { ...n, data }
    }))
  }, [onEdgesChange, setNodes, facade])

  const handleNodesChange = useCallback((changes) => {
    const removedIds = changes
      .filter(c => c.type === 'remove')
      .map(c => c.id)

    // 删除前先释放被删 input 节点的本地预览 blob + dragUploadStore 引用
    if (removedIds.length > 0) {
      const currentNodes = nodesRef.current
      removedIds.forEach((id) => {
        const node = currentNodes.find(n => n.id === id)
        const blob = node?.data?.content?.localPreviewUrl
        if (blob) {
          try { URL.revokeObjectURL(blob) } catch { /* ignore */ }
        }
        clearFile(id)
      })
    }

    onNodesChange(changes)

    if (removedIds.length === 0) return
    facade.batchUpdateNodes(nds => nds.map(n => {
      if (n.type !== 'capability') return n
      let data = n.data
      for (const id of removedIds) {
        data = clearConnectionsBySource(data, id)
      }
      return data === n.data ? n : { ...n, data }
    }))
  }, [onNodesChange, setNodes, facade])

  const isValidConnection = useCallback((connection) => {
    return checkValidConnection(connection, nodesRef.current, edgesRef.current)
  }, [])

  return {
    onConnect,
    handleEdgesChange,
    handleNodesChange,
    isValidConnection,
  }
}
