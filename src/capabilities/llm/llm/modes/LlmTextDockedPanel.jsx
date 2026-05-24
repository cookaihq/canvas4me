/**
 * llm-text DockedPanel — 文本对话(无附件)—— UX_SPEC.md §9 新形态
 *
 * 布局:
 *   顶栏 DockedTopBar(LLM 单 capability + 4 mode → 显示 mode tab + ↗,不显示能力切换)
 *   Prompt 输入区(独立显示)
 *   底栏 DockedBottomBar(model chip + 工具区 + Run)
 *   高级区(齿轮展开): systemPrompt / temperature / maxTokens / reasoning
 */
import { useCallback, useMemo, useState } from 'react'
import { CAPABILITIES } from '@/canvas/registry/nodeTypes'
import DockedTopBar from '@/canvas/panels/DockedTopBar'
import DockedBottomBar from '@/canvas/panels/DockedBottomBar'
import LlmPromptInput from '../_shared/LlmPromptInput'
import LlmAdvancedSection from '../_shared/LlmAdvancedSection'
import { useLlmModels, getModelsForCapability } from '../_shared/useLlmModels'
import useModelForMode from '../_shared/useModelForMode'

export default function LlmTextDockedPanel({
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

  const { loading: modelsLoading, models: modelCatalog } = useLlmModels()
  const modeModels = useMemo(
    () => getModelsForCapability(modelCatalog, mode),
    [modelCatalog, mode],
  )
  useModelForMode({
    mode,
    models: modeModels,
    loading: modelsLoading,
    params,
    onParamsChange,
  })

  const commonParams = useMemo(() => (
    CAPABILITIES[capability]?.modes?.[mode]?.commonParams || []
  ), [capability, mode])

  // 把后端 model 清单注入 model commonParam options(选用 buttons / select 由 capability 决定)
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
      // 模型数量多时 buttons 控件过宽,切到 select
      control: modelOptions.length > 6 ? 'select' : 'buttons',
    },
  }), [modelOptions])

  const [runCount, setRunCount] = useState(1)

  const promptText = params.prompt || ''
  const canRun = !!params?.model && !!promptText.trim()

  const handleRun = useCallback(() => {
    if (!node?.id || !canRun) return
    onRun?.(node.id, runCount)
  }, [node?.id, canRun, runCount, onRun])

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

      <LlmPromptInput
        variant={variant}
        edges={edges}
        nodeId={node.id}
        value={params.prompt}
        onChange={(text) => onParamsChange({ prompt: text })}
        placeholder="输入你想问的内容..."
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
