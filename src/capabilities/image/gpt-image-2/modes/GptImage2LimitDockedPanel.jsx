import { useCallback, useMemo, useState } from 'react'
import { Button, message } from 'antd'
import { Info, ArrowRightLeft } from '@/canvas/icons'
import { useCanvasFacade } from '@/canvas/state/canvasFacade'
import { CAPABILITIES } from '@/canvas/registry/nodeTypes'
import { expandPortInputs } from '@/canvas/runtime/expandPortInputs'
import DockedTopBar from '@/canvas/panels/DockedTopBar'
import DockedBottomBar from '@/canvas/panels/DockedBottomBar'
import TextInputWithEdges from '@/canvas/components/TextInputWithEdges'
import useEdgePlaceholderSync from '@/canvas/hooks/useEdgePlaceholderSync'
import DockedReferenceRow from '../_shared/DockedReferenceRow'

/**
 * GPT Image 2 精简版 DockedPanel —— UX_SPEC.md §9 新形态
 *
 * 与完整版差异:
 *   - 仅 3 档预设分辨率(commonParams 里 1 个 param)
 *   - 不支持 Quality / Mask / Output Format / Background / Seed
 *   - 参考图行无 + 按钮(面板不能直传, 只能从画布连入)
 *   - Prompt 用普通 textarea
 *   - 高级形态显示空状态卡片(引导切到完整版)
 */
export default function GptImage2LimitDockedPanel({
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
    value: params.prompt || '',
    onChange: (val) => onParamsChange({ prompt: val }),
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

  // 参考图: 仅画布连入
  const referenceItems = useMemo(() => {
    return expandPortInputs({
      targetNodeId: node.id,
      targetHandle: 'image',
      edges,
      nodes,
    })
  }, [edges, nodes, node.id])

  const handleDeleteReference = useCallback((item) => {
    if (item.source === 'edge') {
      message.info('画布连线参考图: 请在画布上选中连线后按 Delete')
    }
  }, [])

  const [runCount, setRunCount] = useState(1)
  const handleRunClick = useCallback(() => {
    if (!node?.id) return
    onRun?.(node.id, runCount)
  }, [node?.id, onRun, runCount])

  const handleSwitchToFull = useCallback(() => {
    onModeChange?.('gpt-image-2')
  }, [onModeChange])

  const isModal = variant === 'modal'
  const showAdvanced = variant === 'advanced'

  return (
    <div className="docked-panel-body gi2-dp-lite">
      <DockedTopBar
        capability={capability}
        mode={mode}
        variant={variant}
        onCapabilityChange={onCapabilityChange}
        onModeChange={onModeChange}
        onRequestVariant={onRequestVariant}
      />

      {/* 参考图行 */}
      <DockedReferenceRow
        items={referenceItems}
        max={10}
        showAddButton={false}
        onDelete={handleDeleteReference}
      />

      {/* prompt — 支持文本端口连入 chip + 手输混排 */}
      <TextInputWithEdges
        value={params.prompt || ''}
        onChange={(val) => onParamsChange({ prompt: val })}
        nodes={nodes}
        onChipDelete={handlePromptChipDelete}
        placeholder="描述想要生成的图像..."
        variant={isModal ? 'modal' : 'inline'}
      />

      {/* 底栏 */}
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
        showAdvancedGear={false}  // 精简版无高级 → 不显示齿轮
      />

      {/* 高级区空状态(用户从完整版切过来时齿轮可能仍处于 advanced variant) */}
      {showAdvanced && (
        <>
          <div className="gi2-dp-divider" />
          <div className="gi2-dp-section-title">高级（capability 私有参数）</div>
          <div className="gi2-dp-empty-advanced">
            <Info size={24} style={{ color: 'var(--ac-text-muted)' }} />
            <div className="gi2-dp-empty-advanced-text">
              <div className="gi2-dp-empty-advanced-title">精简版无高级参数</div>
              <div className="gi2-dp-empty-advanced-hint">
                切换到「完整版」可使用 Quality / Mask / Output Format / Background / Seed
              </div>
            </div>
            <Button
              size="small"
              icon={<ArrowRightLeft size={14} />}
              onClick={handleSwitchToFull}
            >
              切到完整版
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
