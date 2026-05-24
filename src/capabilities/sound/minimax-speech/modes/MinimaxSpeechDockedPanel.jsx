import { useCallback, useMemo, useState } from 'react'
import { Button, Tooltip, message } from 'antd'
import { useCanvasFacade } from '@/canvas/state/canvasFacade'

import { Zap, Settings2, Play } from '@/canvas/icons'
import DockedTopBar from '@/canvas/panels/DockedTopBar'
import RunMultiplierControl from '@/canvas/panels/RunMultiplierControl'
import useCapabilityCredits from '@/canvas/hooks/useCapabilityCredits'
import useEdgePlaceholderSync from '@/canvas/hooks/useEdgePlaceholderSync'
import { getCanvasIdFromUrl } from '@/canvas/utils/canvasUrl'
import PromptTextarea from '../_shared/PromptTextarea'
import SeparatorRadioGroup from '../_shared/SeparatorRadioGroup'
import SpeechParamsPill from '../_shared/SpeechParamsPill'
import AdvancedSection from '../_shared/AdvancedSection'
import {
  DEFAULT_SEPARATOR,
  splitPromptBySeparator,
  MAX_PROMPT_LENGTH,
} from '../voice-presets'

/**
 * MiniMax Speech · 双 mode 共享 DockedPanel
 *
 * 三形态: variant === 'default' (紧凑) / 'advanced' (展开高级) / 'modal' (prompt 放大)
 *
 * 顶部 DockedTopBar (capability dropdown + mode tabs + ↗ icon) 已是公共组件,
 * 这里只负责中间区 (prompt + run bar + pill + advanced).
 *
 * Model 选择: 仅在 Params Pill Popover 顶部 MODEL 段呈现 (2 chip 横排, HD / Turbo),
 * 不在面板顶部单独显示 — 与设计文档 §Popover 段 1 一致.
 */
export default function MinimaxSpeechDockedPanel({
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
  const canvasId = getCanvasIdFromUrl()
  const facade = useCanvasFacade()

  // prompt 端口 ↔ params.prompt 中的 edge placeholder 双向同步
  useEdgePlaceholderSync({
    value: params.prompt || '',
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

  // 端口连入校验(Run 时用): 检查 prompt 端口或 placeholder 是否有内容
  const promptEdgeUrl = useMemo(() => {
    const e = edges.find(e => e.target === node.id && e.targetHandle === 'prompt')
    return e ? e.id : null
  }, [edges, node.id])

  // Run + 倍数
  const [runCount, setRunCount] = useState(1)

  // 积分预估
  const collectedInputs = useMemo(() => ({}), [])  // pricing 不依赖端口值, 留空
  const { credits } = useCapabilityCredits(capability, mode, params, collectedInputs)

  const isBatchMode = mode === 'batch'

  const handleRunClick = useCallback(() => {
    if (!node?.id) return
    const promptText = params.prompt || ''
    if (!promptText.trim() && !promptEdgeUrl) {
      message.warning('请输入待合成文本或连接 prompt 端口')
      return
    }
    if (isBatchMode) {
      const separator = params.separator || DEFAULT_SEPARATOR
      const segments = splitPromptBySeparator(promptText, separator)
      if (segments.length === 0 && !promptEdgeUrl) {
        message.warning('按当前分隔符切分后段数为 0, 请检查文本或分隔符')
        return
      }
      const tooLong = segments.findIndex(s => s.length > MAX_PROMPT_LENGTH)
      if (tooLong >= 0) {
        message.warning(`第 ${tooLong + 1} 段超过 ${MAX_PROMPT_LENGTH} 字符限制, 请缩短或调整分隔`)
        return
      }
    } else {
      if (promptText.length > MAX_PROMPT_LENGTH) {
        message.warning(`文本超过 ${MAX_PROMPT_LENGTH} 字符限制`)
        return
      }
    }
    onRun?.(node.id, runCount)
  }, [node, params.prompt, params.separator, isBatchMode, promptEdgeUrl, onRun, runCount])

  const advancedActive = variant === 'advanced'
  const handleToggleAdvanced = () => {
    if (variant === 'modal') return
    onRequestVariant?.(advancedActive ? 'default' : 'advanced')
  }

  return (
    <div className="docked-panel-body ms-dp">
      <DockedTopBar
        capability={capability}
        mode={mode}
        variant={variant}
        onCapabilityChange={onCapabilityChange}
        onModeChange={onModeChange}
        onRequestVariant={onRequestVariant}
      />

      {/* Prompt (带 ↗ 放大 icon, 字符计数, 支持文本端口连入 chip) */}
      <PromptTextarea
        value={params.prompt || ''}
        onChange={(v) => onParamsChange?.({ prompt: v })}
        nodes={nodes}
        onChipDelete={handlePromptChipDelete}
        variant={variant}
        onRequestVariant={onRequestVariant}
      />

      {/* batch mode: prompt 下方的分隔符 radio */}
      {isBatchMode && (
        <SeparatorRadioGroup
          value={params.separator || DEFAULT_SEPARATOR}
          onChange={(v) => onParamsChange?.({ separator: v })}
        />
      )}

      {/* 底栏紧贴 prompt: 自定义 ParamsPill + credits + advanced gear + Run + ×N
          advanced 区放在底栏之下, 让常用操作位置稳定不被高级区挤掉 */}
      <div className="ms-dp-bottom">
        <div className="ms-dp-bottom-left">
          <SpeechParamsPill
            params={params}
            onParamsChange={onParamsChange}
            projectId={canvasId}
            nodeId={node?.id}
          />
        </div>
        <div className="ms-dp-bottom-tools">
          <Tooltip title={advancedActive ? '收起高级' : '展开高级'}>
            <button
              type="button"
              className={`docked-icon-btn${advancedActive ? ' active' : ''}`}
              onClick={handleToggleAdvanced}
              aria-label="展开高级"
            >
              <Settings2 size={16} />
            </button>
          </Tooltip>
          <span className="docked-bottombar-credits">
            <Zap size={14} fill="#F59E0B" color="#F59E0B" />
            <span>{credits == null ? '—' : credits}</span>
          </span>
          <Tooltip title={paramsUnchanged ? '参数无变化' : isDone ? '已锁定, 将派生新节点' : ''}>
            <Button
              type="primary"
              icon={<Play size={14} fill="currentColor" />}
              onClick={handleRunClick}
              disabled={paramsUnchanged}
              className="docked-bottombar-run"
            >
              Run
            </Button>
          </Tooltip>
          <RunMultiplierControl value={runCount} onChange={setRunCount} />
        </div>
      </div>

      {/* Advanced 区 (variant === 'advanced' 时显示) — 放在底栏之下 */}
      {advancedActive && (
        <AdvancedSection params={params} onParamsChange={onParamsChange} />
      )}
    </div>
  )
}
