import { createContext, useContext, useMemo } from 'react'
import { useStore, useStoreApi } from '@xyflow/react'
import { buildFoldedOutputMap } from './foldedEdge.js'
import { computeNodeSeqMap } from '../utils/canvasSeq'
import { resolveModeId } from '../registry/nodeTypes'
import { isEdgeVisibleInMode } from '../utils/portMode'

// 单次派生:folded 映射 / 画布序号 / 隐藏入边数 只依赖"结构"(节点 id+type+capability+mode、
// edges 连接),不依赖 content/runStatus。用便宜的结构指纹订阅,变了才重算重型派生,
// 组件经 context O(1) 读 —— 避免每个消费方各自跑 O(N×E)。
const Ctx = createContext(null)

function buildStructuralFingerprint(nodeLookup, edges) {
  const parts = []
  for (const n of nodeLookup.values()) parts.push(`${n.id}:${n.type}:${n.data?.capability || ''}:${n.data?.mode || ''}`)
  parts.sort()
  const e = edges.map((x) => `${x.source}>${x.target}:${x.targetHandle || ''}`).sort().join(',')
  return parts.join('|') + '#' + e
}

export function CanvasDerivedProvider({ children }) {
  const fingerprint = useStore((s) => buildStructuralFingerprint(s.nodeLookup, s.edges))
  const storeApi = useStoreApi()
  const value = useMemo(() => {
    const { nodeLookup, edges } = storeApi.getState()
    const foldedMap = buildFoldedOutputMap(nodeLookup, edges)
    const seqMap = computeNodeSeqMap([...nodeLookup.values()], { excludeIds: new Set(foldedMap.keys()) })
    const downstreamIdByParent = new Map() // parentId -> [outputId, ...]
    for (const [outputId, info] of foldedMap) {
      const arr = downstreamIdByParent.get(info.parentId) || []
      arr.push(outputId)
      downstreamIdByParent.set(info.parentId, arr)
    }
    const hiddenEdgeCountByCapability = new Map() // capId -> count
    for (const n of nodeLookup.values()) {
      if (n.type !== 'capability') continue
      const mode = resolveModeId(n.data?.capability, n.data?.mode)
      let c = 0
      for (const ed of edges) if (ed.target === n.id && !isEdgeVisibleInMode(ed, mode)) c++
      if (c) hiddenEdgeCountByCapability.set(n.id, c)
    }
    return { foldedMap, seqMap, downstreamIdByParent, hiddenEdgeCountByCapability }
    // 结构指纹变才重算;content/runStatus 变化由 useDownstreamOutputs 的窄 useStore 单独响应
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

function useDerived() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useDerived must be used within CanvasDerivedProvider')
  return v
}

export const useFoldedOutputMap = () => useDerived().foldedMap
export const useIsFoldedOutput = (id) => useDerived().foldedMap.has(id)
export const useNodeSeq = (id) => useDerived().seqMap.get(id)
export const useHiddenEdgeCount = (id) => useDerived().hiddenEdgeCountByCapability.get(id) || 0

// 整张序号表 —— 给"在循环/回调里按节点 id 查序号"的场景(useNodeSeq 是单值版,不能在 map 里调)。
// 软读取:context 缺失时返回空 Map(不抛错),序号退化为缺省展示,保证非画布上下文也不 crash。
const EMPTY_SEQ_MAP = new Map()
export const useNodeSeqMap = () => useContext(Ctx)?.seqMap || EMPTY_SEQ_MAP

const EMPTY = []
// 等值比较:按 id + data 引用。data 在每次更新时整体替换(updateNodeData 返回新 data 对象),
// 引用比即可命中"产物内容/状态变化"而不漏。type/id 结构变化由结构指纹另行驱动重建列表。
function downstreamEqual(a, b) {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    if (x.id !== y.id || x.data !== y.data) return false
  }
  return true
}

// 整张 nodes / edges 数组的响应式读取 —— 单一数据源是 React Flow 内部 store,
// 不再有应用层副本。消费方(面板 / 工具栏 / 运行能力等)需要"当前完整数组"且要随
// 节点/边变化重渲染时用这两个。等值比较按数组长度 + 每项引用,命中"内容/结构变化"。
function arrayRefEqual(a, b) {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

// nodeLookup 的值是 React Flow 内部节点(含 internals 等);为与旧的"应用层 nodes"形态一致,
// 直接展开成数组。每次 store 更新若节点对象引用变化即触发重渲染(arrayRefEqual 兜底跳过无变化)。
export function useStoreNodes() {
  return useStore((s) => [...s.nodeLookup.values()], arrayRefEqual)
}

export function useStoreEdges() {
  return useStore((s) => s.edges, arrayRefEqual)
}

// 折叠产物:结构(哪些 output 属于该 parent)走 context;产物内容(runStatus/content 等)
// 用窄 useStore 实时读那几个 output 节点的 live 字段(content 变化频繁,不进结构指纹)。
// 返回形态 = 完整节点投影 { id, type, data } —— 消费方按 `node.data.X` / `node.id` 读取,
// 与一个真实 output 节点对象等价(downstreamOutput 旧形态),消费侧字段读取无需改动。
export function useDownstreamOutputs(capabilityId) {
  const { downstreamIdByParent } = useDerived()
  const ids = capabilityId ? downstreamIdByParent.get(capabilityId) : null
  return useStore((s) => {
    if (!ids || !ids.length) return EMPTY
    const out = []
    for (const oid of ids) {
      const n = s.nodeLookup.get(oid)
      if (n) out.push({ id: oid, type: n.type, data: n.data })
    }
    return out.length ? out : EMPTY
  }, downstreamEqual)
}
