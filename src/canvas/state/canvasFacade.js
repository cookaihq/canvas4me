import { useReactFlow } from '@xyflow/react'
import { useMemo } from 'react'
import { wrapSetterWithMonitor } from '@/utils/renderRateMonitor'

/**
 * 画布状态访问层 —— 所有对节点/边的写都经此命令式 API,不在各处散落直接 setNodes。
 * 底层统一用 useReactFlow()(操作 React Flow 内部 store),在 controlled / uncontrolled
 * 下语义一致,因此换地基时本层基本不动。
 *
 * 复杂批量更新(一帧改多节点多字段)走 batchUpdateNodes / batchUpdateEdges 兜底:
 * 它们是登记在册的过渡后门,带频率监控(1s 内异常高频写错误日志,作死循环兜底告警,
 * 非同步拦截),应随收敛逐步清零,不当万能出口。
 */
export function useCanvasFacade() {
  const rf = useReactFlow()
  return useMemo(() => {
    const monitoredSetNodes = wrapSetterWithMonitor(rf.setNodes, 'canvasFacade.setNodes')
    const monitoredSetEdges = wrapSetterWithMonitor(rf.setEdges, 'canvasFacade.setEdges')
    return {
      // ── 单节点 data ──
      updateNodeData: (id, patch) => rf.updateNodeData(id, patch),
      // ── 布局 ──
      moveNode: (id, position) => rf.updateNode(id, { position }),
      // 用函数式更新合并 style,保留节点其他 style 键(背景色/圆角等),不整体替换
      resizeNode: (id, { width, height }) =>
        rf.updateNode(id, (n) => ({ width, height, style: { ...n.style, width, height } })),
      setNodeZIndex: (id, zIndex) => rf.updateNode(id, { zIndex }),
      // ── 增删 ──
      addNodes: (nodes) => rf.addNodes(nodes),
      removeNodes: (ids) => rf.deleteElements({ nodes: ids.map((id) => ({ id })) }),
      addEdges: (edges) => rf.addEdges(edges),
      removeEdges: (ids) => rf.deleteElements({ edges: ids.map((id) => ({ id })) }),
      // ── 端口连接(领域字段) ──
      setPortConnections: (id, portConnections) => rf.updateNodeData(id, { portConnections }),
      // ── 全量加载 / 切换 / 恢复 ──
      replaceAll: ({ nodes, edges }) => {
        rf.setNodes(nodes || [])
        rf.setEdges(edges || [])
      },
      // ── 兜底(登记在册,过渡用,带监控) ──
      batchUpdateNodes: (updater) => monitoredSetNodes(updater),
      batchUpdateEdges: (updater) => monitoredSetEdges(updater),
      // ── 读 ──
      getNodes: () => rf.getNodes(),
      getEdges: () => rf.getEdges(),
    }
  }, [rf])
}
