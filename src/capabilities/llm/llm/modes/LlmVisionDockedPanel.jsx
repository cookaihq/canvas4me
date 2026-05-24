/**
 * llm-vision DockedPanel — 图像理解 —— UX_SPEC.md §9 新形态
 *
 * 与 LlmText 差异: 多一行图片附件(独立显示,不进 commonParams)。
 */
import { useCallback, useMemo, useState } from 'react'
import { message } from 'antd'
import { CAPABILITIES } from '@/canvas/registry/nodeTypes'
import DockedTopBar from '@/canvas/panels/DockedTopBar'
import DockedBottomBar from '@/canvas/panels/DockedBottomBar'
import LlmPromptInput from '../_shared/LlmPromptInput'
import LlmAdvancedSection from '../_shared/LlmAdvancedSection'
import LlmAttachmentRow from '../_shared/LlmAttachmentRow'
import useEdgeAttachments from '../_shared/useEdgeAttachments'
import { useLlmModels, getModelsForCapability } from '../_shared/useLlmModels'
import useModelForMode from '../_shared/useModelForMode'
import { MAX_IMAGES } from '../builder'

export default function LlmVisionDockedPanel({
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

  const { items: imageItems, handlePickFiles, handleDelete } = useEdgeAttachments({
    nodeId: node.id,
    capabilityNode: node,
    edges,
    nodes,
    portId: 'image',
    inputSubType: 'image',
    max: MAX_IMAGES,
  })

  const { loading: modelsLoading, models: modelCatalog } = useLlmModels()
  const modeModels = useMemo(() => getModelsForCapability(modelCatalog, mode), [modelCatalog, mode])
  useModelForMode({
    mode, models: modeModels, loading: modelsLoading, params, onParamsChange,
  })

  const commonParams = useMemo(() => (
    CAPABILITIES[capability]?.modes?.[mode]?.commonParams || []
  ), [capability, mode])

  const modelOptions = useMemo(() => (
    modeModels.map(m => ({
      value: m.name,
      name: m.name,
      label: m.label || m.name,
      shortLabel: m.label || m.name,
      badge: m.badge || '',
      description: m.description || '',
    }))
  ), [modeModels])

  const extraOptions = useMemo(() => ({
    model: {
      options: modelOptions,
      control: modelOptions.length > 6 ? 'select' : 'buttons',
    },
  }), [modelOptions])

  const [runCount, setRunCount] = useState(1)
  const promptText = params.prompt || ''
  const hasImage = imageItems.some(i => !i.uploading && i.url)
  const canRun = !!params?.model && !!promptText.trim() && hasImage

  const handleRun = useCallback(() => {
    if (!node?.id || !canRun) return
    if (imageItems.some(i => i.uploading)) {
      message.warning('图片还在上传中，请稍候')
      return
    }
    onRun?.(node.id, runCount)
  }, [node?.id, canRun, runCount, onRun, imageItems])

  const showAdvanced = variant === 'advanced' || variant === 'modal'

  return (
    <div className="docked-panel-body llm-dp" data-mode={mode}>
      <DockedTopBar
        capability={capability}
        mode={mode}
        variant={variant}
        onCapabilityChange={onCapabilityChange}
        onModeChange={onModeChange}
        onRequestVariant={onRequestVariant}
      />

      <LlmAttachmentRow
        kind="image"
        items={imageItems}
        max={MAX_IMAGES}
        onPickFiles={handlePickFiles}
        onDelete={handleDelete}
      />

      <LlmPromptInput
        variant={variant}
        edges={edges}
        nodeId={node.id}
        value={params.prompt}
        onChange={(text) => onParamsChange({ prompt: text })}
        placeholder="描述你想从图片里理解什么..."
      />

      <DockedBottomBar
        capability={capability}
        mode={mode}
        commonParams={commonParams}
        params={params}
        onParamsChange={onParamsChange}
        extraOptions={extraOptions}
        variant={variant}
        isDone={isDone}
        paramsUnchanged={paramsUnchanged}
        canRun={canRun}
        runCount={runCount}
        onRunCountChange={setRunCount}
        onRun={handleRun}
        onRequestVariant={onRequestVariant}
      />

      {showAdvanced && (
        <LlmAdvancedSection
          params={params}
          onParamsChange={onParamsChange}
          edges={edges}
          nodeId={node.id}
        />
      )}
    </div>
  )
}
