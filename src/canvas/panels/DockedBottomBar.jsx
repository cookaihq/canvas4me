/**
 * DockedBottomBar —— DockedPanel 底栏(两段:参数 chip + 工具区)
 *
 * 工具区从左到右:
 *   高级齿轮 ⚙ | ×N 倍数 | credits ⚡ | Run 按钮 ▶
 *
 * commonParams / model 的 extraOptions 在外层由 capability 注入(例如 LLM 的 model 列表)。
 */
import { Button, Tooltip } from 'antd'
import { Zap, SlidersHorizontal, Play } from '@/canvas/icons'
import { getModeLabel } from '@/canvas/registry/nodeTypes'
import ParamChip from './ParamChip'
import ModelParamSelector from './ModelParamSelector'
import RunMultiplierControl from './RunMultiplierControl'

export default function DockedBottomBar({
  capability, // 备用,某些 capability 可能用来决定 commonParams 列表
  mode,       // 备用
  commonParams = [],
  params = {},
  onParamsChange,
  extraOptions = {},
  variant = 'default',
  isDone = false,
  canRun = true,
  runDisabled = false,
  paramsUnchanged = false,
  runCount = 1,
  onRunCountChange,
  credits = null,
  onRun,
  onRequestVariant,
  showAdvancedGear = true,
  runLabel = 'Run',
  leftPrefix = null,  // 左侧 ParamChip 之前的自定义节点 (LLM 用来挂 tokens 估算)
  showParamChipIcon = true,  // ParamChip 左侧装饰图标 (默认显示;某些 capability 可关)
}) {
  const advancedActive = variant === 'advanced'
  const modelParam = commonParams.find(spec => spec.key === 'model' && extraOptions?.model?.options?.length)
  const modelOptions = modelParam ? extraOptions.model.options : []
  const modeLabel = capability && mode ? getModeLabel(capability, mode) : null
  const restParams = modelParam
    ? commonParams.filter(spec => spec.key !== 'model')
    : commonParams

  const handleToggleAdvanced = () => {
    if (variant === 'modal') return
    onRequestVariant?.(advancedActive ? 'default' : 'advanced')
  }

  return (
    <div className="docked-bottombar">
      <div className="docked-bottombar-left">
        {leftPrefix}
        {modelParam && (
          <ModelParamSelector
            value={params?.model ?? modelParam.defaultValue}
            options={modelOptions}
            onChange={(value) => onParamsChange?.({ model: value })}
            modeLabel={modeLabel}
          />
        )}
        <ParamChip
          commonParams={restParams}
          params={params}
          onParamsChange={onParamsChange}
          extraOptions={extraOptions}
          showIcon={showParamChipIcon}
        />
      </div>

      <div className="docked-bottombar-tools">
        {showAdvancedGear && (
          <Tooltip title={advancedActive ? '收起高级' : '展开高级'}>
            <button
              type="button"
              className={`docked-icon-btn${advancedActive ? ' active' : ''}`}
              onClick={handleToggleAdvanced}
              aria-label="展开高级"
            >
              <SlidersHorizontal size={16} />
            </button>
          </Tooltip>
        )}

        {/* 积分能耗 chip: pill 形态 + 浅黄底 + monospace 数字 (而非孤立 icon) */}
        <span className="docked-bottombar-credits">
          <Zap size={12} />
          <span className="docked-bottombar-credits-num">
            {credits == null ? '—' : credits}
          </span>
        </span>

        <Tooltip title={paramsUnchanged ? '参数无变化' : isDone ? '已锁定，将派生新节点' : ''}>
          <Button
            type="primary"
            icon={<Play size={14} fill="currentColor" />}
            disabled={runDisabled || !canRun || paramsUnchanged}
            onClick={onRun}
            className="docked-bottombar-run"
          >
            {runLabel}
          </Button>
        </Tooltip>

        <RunMultiplierControl value={runCount} onChange={onRunCountChange} />
      </div>
    </div>
  )
}
