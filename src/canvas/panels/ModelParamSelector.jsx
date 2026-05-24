import { useMemo, useState } from 'react'
import { Popover, Tooltip } from 'antd'

import { Brain, Check, ChevronDown, Cpu, Eye, Search, Sparkles } from '@/canvas/icons'

const BADGE_ICON = {
  thinking: Cpu,
  pro: Brain,
  fast: Sparkles,
  preview: Eye,
  vision: Eye,
}

function getModelLabel(model) {
  return model?.label || model?.name || ''
}

function getModelIcon(model) {
  const badge = String(model?.badge || '').toLowerCase()
  return BADGE_ICON[badge] || Cpu
}

export default function ModelParamSelector({
  value,
  options = [],
  onChange,
  disabled = false,
  modeLabel,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = useMemo(() => (
    options.find(item => item.value === value) || options[0] || null
  ), [options, value])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(item => {
      const haystack = [
        item.label,
        item.name,
        item.badge,
        item.description,
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [options, query])

  const handleSelect = (model) => {
    if (model?.disabled) return
    if (!model?.value || model.value === value) {
      setOpen(false)
      return
    }
    onChange?.(model.value)
    setOpen(false)
  }

  const SelectedIcon = getModelIcon(selected)

  const content = (
    <div className="model-param-popover-content">
      <div className="model-param-popover-head">
        <div className="model-param-popover-title">选择模型</div>
        {modeLabel && (
          <div className="model-param-popover-meta">{modeLabel}</div>
        )}
      </div>

      <label className="model-param-search">
        <Search size={14} />
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="搜索模型"
        />
      </label>

      <div className="model-param-option-list">
        {filtered.map(model => {
          const Icon = getModelIcon(model)
          const isSelected = model.value === selected?.value
          const isDisabled = !!model.disabled
          const optionBtn = (
            <button
              key={model.value}
              type="button"
              className={`model-param-option${isSelected ? ' selected' : ''}${isDisabled ? ' disabled' : ''}`}
              aria-disabled={isDisabled}
              onClick={() => handleSelect(model)}
            >
              <span className="model-param-option-icon">
                <Icon size={15} />
              </span>
              <span className="model-param-option-main">
                <span className="model-param-option-name">
                  <span>{getModelLabel(model)}</span>
                  {model.badge && (
                    <span className={`model-param-option-badge model-param-option-badge-${model.badge}`}>
                      {model.badge}
                    </span>
                  )}
                </span>
                {model.description && (
                  <span className="model-param-option-desc">{model.description}</span>
                )}
              </span>
              {isSelected ? <Check className="model-param-option-check" size={18} /> : <span />}
            </button>
          )
          return isDisabled && model.disabledReason
            ? <Tooltip key={model.value} title={model.disabledReason} placement="right">{optionBtn}</Tooltip>
            : optionBtn
        })}

        {!filtered.length && (
          <div className="model-param-empty">没有匹配的模型</div>
        )}
      </div>
    </div>
  )

  if (!options.length) return null

  const selectedGated = !!selected?.disabled
  const chip = (
    <Popover
      open={open}
      onOpenChange={(next) => !disabled && setOpen(next)}
      trigger="click"
      placement="topLeft"
      arrow={false}
      autoAdjustOverflow={false}
      align={{ offset: [0, 0] }}
      overlayClassName="model-param-popover"
      content={content}
      destroyOnHidden
    >
      <button
        type="button"
        className={`model-param-chip nodrag${open ? ' open' : ''}${selectedGated ? ' warning' : ''}`}
        disabled={disabled}
        aria-expanded={open}
      >
        <SelectedIcon size={15} />
        <span>{getModelLabel(selected)}</span>
        <ChevronDown className="model-param-chip-caret" size={13} />
      </button>
    </Popover>
  )

  return selectedGated && selected?.disabledReason
    ? <Tooltip title={selected.disabledReason} placement="top">{chip}</Tooltip>
    : chip
}
