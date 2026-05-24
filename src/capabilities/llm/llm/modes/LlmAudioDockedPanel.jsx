/**
 * llm-audio DockedPanel — 音频理解 —— UX_SPEC.md §9 新形态
 *
 * 与 LlmVision 差异: 音频附件(max=1, multiple=false),prompt 可选不参与 canRun 判断。
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

const MAX_AUDIO = 1

export default function LlmAudioDockedPanel({
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

  const { items: audioItems, handlePickFiles, handleDelete } = useEdgeAttachments({
    nodeId: node.id,
    capabilityNode: node,
    edges,
    nodes,
    portId: 'audio',
    inputSubType: 'audio',
    max: MAX_AUDIO,
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
  const hasAudio = audioItems.some(i => !i.uploading && i.url)
  // llm-audio 的 prompt 可选 — 不参与 canRun 判断
  const canRun = !!params?.model && hasAudio

  const handleRun = useCallback(() => {
    if (!node?.id || !canRun) return
    if (audioItems.some(i => i.uploading)) {
      message.warning('音频还在上传中，请稍候')
      return
    }
    onRun?.(node.id, runCount)
  }, [node?.id, canRun, runCount, onRun, audioItems])

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
        kind="audio"
        items={audioItems}
        max={MAX_AUDIO}
        multiple={false}
        onPickFiles={handlePickFiles}
        onDelete={handleDelete}
      />

      <LlmPromptInput
        variant={variant}
        edges={edges}
        nodeId={node.id}
        value={params.prompt}
        onChange={(text) => onParamsChange({ prompt: text })}
        placeholder="描述你想从音频里理解什么（可选）..."
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
