import { Suspense, lazy, useCallback, useMemo } from 'react'
import { Spin } from 'antd'
import { useReactFlow } from '@xyflow/react'
import { CAPABILITIES } from '@/canvas/registry/nodeTypes'
import { reconcileOnModeChange } from '@/canvas/utils/edgeUtils'
import { useCanvasFacade } from '@/canvas/state/canvasFacade'
import './_shared/rich-prompt-editor.css'

/**
 * GPT Image 2 面板壳（多模式 capability）
 *
 * 职责：
 *   - 渲染 mode 选择器（胶囊 Tab，标签就是原始 model id：gpt-image-2 / gpt-image-2-limit）
 *   - 根据 data.mode 懒加载对应 modes/{Mode}.jsx
 *   - 切 mode 副作用：reconcileOnModeChange 按端口 id 重算 edges；modeParams 各桶保留
 */
const MODE_FORMS = {
  'gpt-image-2':       lazy(() => import('./modes/GptImage2Mode')),
  'gpt-image-2-limit': lazy(() => import('./modes/GptImage2LimitMode')),
}

export default function GptImage2View({ capability, mode, params, nodeId, edges, nodes, locked }) {
  const { getNodes, getEdges } = useReactFlow()
  const facade = useCanvasFacade()

  const currentMode = mode || CAPABILITIES['gpt-image-2'].defaultMode

  const modeOptions = useMemo(
    () =>
      Object.entries(CAPABILITIES['gpt-image-2'].modes).map(([id, m]) => ({
        value: id,
        label: m.label,
      })),
    []
  )

  const handleModeChange = useCallback(
    (newMode) => {
      if (newMode === currentMode) return
      const { nodes: newNodes, edges: newEdges } = reconcileOnModeChange({
        nodeId,
        newMode,
        edges: getEdges(),
        nodes: getNodes(),
      })
      facade.batchUpdateNodes(() => newNodes)
      facade.batchUpdateEdges(() => newEdges)
    },
    [currentMode, nodeId, getNodes, getEdges, facade]
  )

  const ModeForm = MODE_FORMS[currentMode]

  return (
    <div className="capability-view">
      <div className="nb-mode-tabs">
        {modeOptions.map(opt => (
          <button
            type="button"
            key={opt.value}
            className={`nb-mode-tab${opt.value === currentMode ? ' selected' : ''}`}
            onClick={() => handleModeChange(opt.value)}
            disabled={locked}
          >
            {opt.label}
          </button>
        ))}
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
