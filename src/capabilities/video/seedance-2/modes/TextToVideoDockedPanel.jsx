import { useCallback, useMemo, useState } from 'react'
import { useCanvasFacade } from '@/canvas/state/canvasFacade'
import { CAPABILITIES } from '@/canvas/registry/nodeTypes'
import DockedTopBar from '@/canvas/panels/DockedTopBar'
import DockedBottomBar from '@/canvas/panels/DockedBottomBar'
import TextInputWithEdges from '@/canvas/components/TextInputWithEdges'
import useEdgePlaceholderSync from '@/canvas/hooks/useEdgePlaceholderSync'

/**
 * Seedance 2.0 · text-to-video DockedPanel — 见 docs/capabilities/video/seedance-2.md §2.4
 *
 * 主区结构 (T2V 最简):
 *   - 顶栏: capability dropdown + (单 mode 时无 mode tab) + ↗ 模态全屏
 *   - 主体: prompt textarea (端口优先, 端口已连接时显示 hint 替代)
 *   - 底栏: chip (5 项 commonParams) + credits + Run + ×N
 *
 * Prompt 来源优先级 (与 builder 一致):
 *   - 画布 prompt 端口连接: 端口文本优先, 面板 textarea 替换为只读 hint
 *   - 否则: 用 modeParams.prompt
 */
export default function TextToVideoDockedPanel({
  node,
  capability,
  mode,
  params,
  edges,
  nodes,
  isDone,
  paramsUnchanged = false,
  variant = 'default',
  onCapabilityChange,
  onModeChange,
  onParamsChange,
  onRun,
  onRequestVariant,
}) {
  const facade = useCanvasFacade()
  const commonParams = useMemo(() => (
    CAPABILITIES[capability]?.modes?.[mode]?.commonParams || []
  ), [capability, mode])

  // prompt 端口 ↔ params.prompt 中的 edge placeholder 双向同步
  useEdgePlaceholderSync({
    value: params?.prompt || '',
    onChange: (val) => onParamsChange?.({ prompt: val }),
    nodeId: node.id,
    portId: 'prompt',
    edges,
  })

  const handlePromptChipDelete = useCallback((sourceNodeId) => {
    facade.batchUpdateEdges(eds => eds.filter(e => !(
      e.target === node.id &&
      e.targetHandle === 'prompt' &&
      e.source === sourceNodeId
    )))
  }, [facade, node.id])

  // ×N 倍数 (派生 N-1 节点; 见 expandRuns)
  const [runCount, setRunCount] = useState(1)
  const handleRunClick = useCallback(() => {
    if (!node?.id) return
    onRun?.(node.id, runCount)
  }, [node?.id, onRun, runCount])

  return (
    <div className="docked-panel-body sd2-dp">
      <DockedTopBar
        capability={capability}
        mode={mode}
        variant={variant}
        onCapabilityChange={onCapabilityChange}
        onModeChange={onModeChange}
        onRequestVariant={onRequestVariant}
      />

      <div className="docked-panel-scroll">
        <div className="sd2-dp-prompt-section" style={{ padding: '12px 16px' }}>
          <TextInputWithEdges
            value={params?.prompt || ''}
            onChange={(val) => onParamsChange?.({ prompt: val })}
            nodes={nodes}
            onChipDelete={handlePromptChipDelete}
            placeholder="描述你想生成的视频画面…"
            variant="inline"
          />
        </div>
      </div>

      <DockedBottomBar
        capability={capability}
        mode={mode}
        commonParams={commonParams}
        params={params}
        onParamsChange={onParamsChange}
        variant={variant}
        isDone={isDone}
        paramsUnchanged={paramsUnchanged}
        runCount={runCount}
        onRunCountChange={setRunCount}
        onRun={handleRunClick}
        onRequestVariant={onRequestVariant}
      />
    </div>
  )
}
