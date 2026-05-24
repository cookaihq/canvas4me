import { useCallback, useMemo, useState } from 'react'
import { useCanvasFacade } from '@/canvas/state/canvasFacade'
import { CAPABILITIES } from '@/canvas/registry/nodeTypes'
import DockedTopBar from '@/canvas/panels/DockedTopBar'
import DockedBottomBar from '@/canvas/panels/DockedBottomBar'
import TextInputWithEdges from '@/canvas/components/TextInputWithEdges'
import useEdgePlaceholderSync from '@/canvas/hooks/useEdgePlaceholderSync'
import { PromptTextarea } from '@/canvas/components/fields'

/**
 * 可灵 V3 · text-to-video DockedPanel
 *
 * 主区:
 *   - prompt textarea (端口优先, 端口已连线时显示 hint 替代)
 *   - 高级区: negative_prompt (variant = 'advanced' | 'modal' 时展示)
 *
 * commonParams (来自 register.js): 比例 / 清晰度 / 时长 / 音频
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

  const showAdvanced = variant === 'advanced' || variant === 'modal'

  const [runCount, setRunCount] = useState(1)
  const handleRunClick = useCallback(() => {
    if (!node?.id) return
    onRun?.(node.id, runCount)
  }, [node?.id, onRun, runCount])

  return (
    <div className="docked-panel-body kv3-dp">
      <DockedTopBar
        capability={capability}
        mode={mode}
        variant={variant}
        onCapabilityChange={onCapabilityChange}
        onModeChange={onModeChange}
        onRequestVariant={onRequestVariant}
      />

      <div className="docked-panel-scroll">
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TextInputWithEdges
            value={params?.prompt || ''}
            onChange={(val) => onParamsChange?.({ prompt: val })}
            nodes={nodes}
            onChipDelete={handlePromptChipDelete}
            placeholder="描述你想生成的视频画面…"
            variant="inline"
          />

          {showAdvanced && (
            <PromptTextarea
              label="负面提示词"
              value={params?.negative_prompt || ''}
              onChange={(val) => onParamsChange?.({ negative_prompt: val })}
              placeholder="描述不希望出现在画面中的内容…"
              maxLength={500}
            />
          )}
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
