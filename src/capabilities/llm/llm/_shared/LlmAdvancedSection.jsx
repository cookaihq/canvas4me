/**
 * LLM DockedPanel 高级区(仅 advanced/modal variant 渲染)
 *
 * - System Prompt: 用 TextInputWithEdges,兼容端口连入 + 手输
 * - Temperature: 滑块 + 数值 chip
 * - Max tokens: InputNumber
 * - Reasoning: Switch
 */
import { useCallback } from 'react'
import { Slider, InputNumber, Switch } from 'antd'
import { useStore } from '@xyflow/react'
import { useCanvasFacade } from '@/canvas/state/canvasFacade'
import TextInputWithEdges from '@/canvas/components/TextInputWithEdges'
import useEdgePlaceholderSync from '@/canvas/hooks/useEdgePlaceholderSync'

const SYSTEM_PROMPT_PORT_ID = 'system-prompt'

function LabelBlock({ title, hint }) {
  return (
    <div className="llm-dp-adv-label-block">
      <div className="llm-dp-adv-label">{title}</div>
      {hint && <div className="llm-dp-adv-hint">{hint}</div>}
    </div>
  )
}

export default function LlmAdvancedSection({
  params,
  onParamsChange,
  edges,
  nodeId,
}) {
  const temperature = params.temperature ?? 0.7
  const facade = useCanvasFacade()
  const nodes = useStore(s => s.nodes)
  const systemPrompt = params.systemPrompt || ''

  useEdgePlaceholderSync({
    value: systemPrompt,
    onChange: v => onParamsChange({ systemPrompt: v }),
    nodeId,
    portId: SYSTEM_PROMPT_PORT_ID,
    edges,
  })

  const handleChipDelete = useCallback(
    (sourceNodeId) => {
      facade.batchUpdateEdges(eds =>
        eds.filter(e => !(
          e.target === nodeId &&
          e.targetHandle === SYSTEM_PROMPT_PORT_ID &&
          e.source === sourceNodeId
        ))
      )
    },
    [facade, nodeId]
  )

  return (
    <>
      <div className="llm-dp-divider" />
      <div className="llm-dp-section-title">高级（capability 私有参数）</div>

      <div className="llm-dp-adv-card llm-dp-adv-card-stack">
        <LabelBlock title="System Prompt" hint="系统提示（可选）" />
        <TextInputWithEdges
          value={systemPrompt}
          onChange={v => onParamsChange({ systemPrompt: v })}
          placeholder="系统提示词（可选）—— 设定助理身份/风格"
          nodes={nodes}
          onChipDelete={handleChipDelete}
          variant="inline"
        />
      </div>

      <div className="llm-dp-adv-card">
        <LabelBlock title="Temperature" hint="控制采样随机性" />
        <div className="llm-dp-adv-control llm-dp-adv-slider-control">
          <Slider
            className="llm-dp-temp-slider"
            min={0}
            max={2}
            step={0.1}
            value={temperature}
            onChange={v => onParamsChange({ temperature: v })}
          />
          <span className="llm-dp-adv-value-chip">{temperature}</span>
        </div>
      </div>

      <div className="llm-dp-adv-card">
        <LabelBlock title="Max tokens" hint="输出最大 token 数" />
        <InputNumber
          size="small"
          min={1}
          value={params.maxTokens ?? null}
          onChange={v => onParamsChange({ maxTokens: v })}
          placeholder="不限"
          className="llm-dp-adv-num"
        />
      </div>

      <div className="llm-dp-adv-card">
        <LabelBlock title="Reasoning" hint="thinking 模型默认开启" />
        <Switch
          size="small"
          checked={!!params.reasoning}
          onChange={v => onParamsChange({ reasoning: v })}
        />
      </div>
    </>
  )
}
