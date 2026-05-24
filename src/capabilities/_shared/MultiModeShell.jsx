import { Suspense, useCallback, useMemo } from 'react'
import { Segmented, Spin } from 'antd'
import { useCanvasFacade } from '@/canvas/state/canvasFacade'
import { CAPABILITIES } from '@/canvas/registry/nodeTypes'
import { reconcileOnModeChange } from '@/canvas/utils/edgeUtils'

/**
 * 多模式 capability 的通用面板壳。
 *
 * 每个多模式 capability 的 {Cap}View.jsx 调用本壳，传入 `capabilityId` 和 `modeForms`
 * （一个 `mode id → lazy(() => import(...))` 的映射），壳负责渲染 mode Segmented
 * 并按 data.mode 分发到对应 mode 表单。
 *
 * 设计约束：
 * - 每个 mode 表单仍然是独立文件（禁止跨 mode 共享 jsx 文件）；本壳只做调度
 * - 切 mode 副作用：调 reconcileOnModeChange——保留 modeParams 各桶、按端口 id 重算真实 edges
 *   详见 concepts.md §和输入端口的关系
 * - Mode 始终可切（移除运行后锁定），locked 仅传给 ModeForm 控制表单字段
 */
export default function MultiModeShell({
  capabilityId,
  modeForms,
  capability,
  mode,
  params,
  nodeId,
  edges,
  nodes,
  locked,
}) {
  const facade = useCanvasFacade()

  const capDef = CAPABILITIES[capabilityId]
  const currentMode = mode || capDef?.defaultMode

  const modeOptions = useMemo(
    () =>
      Object.entries(capDef?.modes || {}).map(([id, m]) => ({
        value: id,
        label: m.label,
      })),
    [capDef]
  )

  const handleModeChange = useCallback(
    (newMode) => {
      const { nodes: newNodes, edges: newEdges } = reconcileOnModeChange({
        nodeId,
        newMode,
        edges: facade.getEdges(),
        nodes: facade.getNodes(),
      })
      facade.batchUpdateNodes(() => newNodes)
      facade.batchUpdateEdges(() => newEdges)
    },
    [nodeId, facade]
  )

  const ModeForm = modeForms[currentMode]

  return (
    <div className="capability-view">
      <div className="view-field">
        <label className="view-field-label">模式</label>
        <Segmented
          value={currentMode}
          onChange={handleModeChange}
          options={modeOptions}
          block
          size="small"
        />
      </div>

      <Suspense
        fallback={<div style={{ textAlign: 'center', padding: 16 }}><Spin size="small" /></div>}
      >
        {ModeForm && (
          <ModeForm
            capability={capability}
            mode={currentMode}
            params={params}
            nodeId={nodeId}
            edges={edges}
            nodes={nodes}
            locked={locked}
          />
        )}
      </Suspense>
    </div>
  )
}
