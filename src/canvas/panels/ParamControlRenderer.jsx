/**
 * ParamControlRenderer —— commonParams Popover 内的控件分发
 *
 * 按 spec.control 类型渲染对应控件,统一接收 (value, onChange, params) 接口。
 * spec 结构见 docs/reference/ux-spec.md §9.6:
 *   {
 *     key, label, icon?, control: 'buttons'|'aspect-grid'|'stepper'|'slider'|'switch'|'radio-group'|'select'|'number',
 *     options?, min?, max?, step?, placeholder?, suffix?, formatter?,
 *     computeDisabled?: (optValue, params) => { disabled, reason }   // 选项级联动 disabled
 *   }
 *
 * params 是兄弟参数的当前值合集,用于 computeDisabled 联动 (如 clarity 按钮要看 aspect_ratio 当前值)。
 */
import { Slider, Select, InputNumber, Tooltip } from 'antd'

import { Minus, Plus } from '@/canvas/icons'

function pickDisabled(spec, optValue, params) {
  if (typeof spec.computeDisabled !== 'function') return { disabled: false, reason: null }
  try {
    const r = spec.computeDisabled(optValue, params)
    return { disabled: !!r?.disabled, reason: r?.reason || null }
  } catch {
    return { disabled: false, reason: null }
  }
}

function ButtonsControl({ spec, value, options = [], onChange, params }) {
  const layoutCls = spec.optionsLayout === 'row' ? ' row' : ''
  return (
    <div className={`param-ctl-buttons${layoutCls}`}>
      {options.map(opt => {
        const v = typeof opt === 'object' ? opt.value : opt
        const label = typeof opt === 'object' ? (opt.label ?? opt.value) : opt
        const selected = value === v
        const { disabled, reason } = pickDisabled(spec, v, params)
        const btn = (
          <button
            key={String(v)}
            type="button"
            className={`param-ctl-button${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
            disabled={disabled}
            onClick={() => !disabled && onChange?.(v)}
          >
            {label}
          </button>
        )
        return reason ? (
          <Tooltip key={String(v)} title={reason} placement="top">
            <span className="param-ctl-button-wrap">{btn}</span>
          </Tooltip>
        ) : btn
      })}
    </div>
  )
}

/**
 * AspectGrid —— 网格,每个 cell 画一个迷你比例缩略图(按 w/h)+ 比例文字。
 * 支持 computeDisabled 联动灰掉不合规组合。
 *
 * 可选 spec 字段(均向后兼容,缺省保持原行为):
 *   - gridCols   每行列数(默认 5)
 *   - cellLayout 'horizontal' → 图标在文字左侧(默认竖排:图标在上、文字在下)
 *   - 无 w/h 的 option(如 match_input_image)→ 渲染 dashed 占位缩略图
 */
function AspectGridControl({ spec, value, options = [], onChange, params }) {
  const gridStyle = spec.gridCols ? { '--aspect-cols': spec.gridCols } : undefined
  const gridCls = `param-ctl-aspect-grid${spec.cellLayout === 'horizontal' ? ' horizontal' : ''}`
  return (
    <div className={gridCls} style={gridStyle}>
      {options.map(opt => {
        const v = opt.value
        const selected = value === v
        const { disabled, reason } = pickDisabled(spec, v, params)
        // 缩略矩形：在 16×16 viewbox 中按 w/h 比例画一个内嵌矩形;无 w/h 用 dashed 占位
        const hasRatio = opt.w > 0 && opt.h > 0
        const longSide = 14
        const aspect = hasRatio ? opt.w / opt.h : 1
        const thumbW = aspect >= 1 ? longSide : Math.round(longSide * aspect)
        const thumbH = aspect >= 1 ? Math.round(longSide / aspect) : longSide
        const cell = (
          <button
            key={v}
            type="button"
            className={`param-ctl-aspect-cell${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
            disabled={disabled}
            onClick={() => !disabled && onChange?.(v)}
            aria-label={`比例 ${v}`}
          >
            <span className="param-ctl-aspect-thumb">
              <span
                className={`param-ctl-aspect-thumb-rect${hasRatio ? '' : ' auto'}`}
                style={hasRatio ? { width: `${thumbW}px`, height: `${thumbH}px` } : undefined}
              />
            </span>
            <span className="param-ctl-aspect-label">{opt.label || v}</span>
          </button>
        )
        return reason ? (
          <Tooltip key={v} title={reason} placement="top">
            <span className="param-ctl-aspect-cell-wrap">{cell}</span>
          </Tooltip>
        ) : cell
      })}
    </div>
  )
}

/**
 * Stepper —— 减号按钮 + 数值 + 加号按钮,适合 num_outputs / 张数 这类整数 1-N 控件
 */
function StepperControl({ spec, value, onChange }) {
  const min = spec.min ?? 1
  const max = spec.max ?? 10
  const v = typeof value === 'number' ? value : (spec.defaultValue ?? min)
  const canDec = v > min
  const canInc = v < max
  return (
    <div className="param-ctl-stepper">
      <button
        type="button"
        className="param-ctl-stepper-btn"
        disabled={!canDec}
        onClick={() => canDec && onChange?.(v - 1)}
        aria-label="减少"
      >
        <Minus size={14} />
      </button>
      <span className="param-ctl-stepper-value">{v}</span>
      <button
        type="button"
        className="param-ctl-stepper-btn"
        disabled={!canInc}
        onClick={() => canInc && onChange?.(v + 1)}
        aria-label="增加"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}

function SwitchControl({ value, onChange, options }) {
  // 二选一矩形按钮形态。options 缺省时按 true/false 渲染 [开启/关闭]
  const opts = options && options.length === 2
    ? options
    : [{ value: true, label: '开启' }, { value: false, label: '关闭' }]
  return (
    <div className="param-ctl-switch">
      {opts.map(opt => {
        const v = typeof opt === 'object' ? opt.value : opt
        const label = typeof opt === 'object' ? (opt.label ?? String(opt.value)) : String(opt)
        const selected = value === v
        return (
          <button
            key={String(v)}
            type="button"
            className={`param-ctl-switch-btn${selected ? ' selected' : ''}`}
            onClick={() => onChange?.(v)}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

function SliderControl({ value, min, max, step, onChange, formatter, suffix }) {
  const display = formatter ? formatter(value) : `${value}${suffix || ''}`
  return (
    <div className="param-ctl-slider">
      <Slider
        min={min}
        max={max}
        step={step ?? 1}
        value={typeof value === 'number' ? value : min}
        onChange={onChange}
        className="param-ctl-slider-track"
      />
      <span className="param-ctl-slider-value">{display}</span>
    </div>
  )
}

function NumberControl({ value, min, max, onChange, placeholder, formatter }) {
  return (
    <InputNumber
      size="small"
      min={min}
      max={max}
      value={value ?? null}
      onChange={onChange}
      placeholder={placeholder}
      formatter={formatter}
      style={{ width: '100%' }}
    />
  )
}

function SelectControl({ value, options = [], onChange, placeholder }) {
  return (
    <Select
      size="middle"
      value={value}
      options={options}
      onChange={onChange}
      placeholder={placeholder}
      style={{ width: '100%' }}
      popupMatchSelectWidth={false}
    />
  )
}

/**
 * @param {object} props
 * @param {object} props.spec     commonParams 数组里的一项
 * @param {*}      props.value    当前值
 * @param {Function} props.onChange (newValue) => void
 * @param {object} [props.params] 兄弟参数当前值合集 (供 computeDisabled 联动用)
 */
export default function ParamControlRenderer({ spec, value, onChange, params = {} }) {
  if (!spec) return null
  const control = spec.control || 'buttons'
  switch (control) {
    case 'buttons':
    case 'radio-group':
      return (
        <ButtonsControl
          spec={spec}
          value={value}
          options={spec.options}
          onChange={onChange}
          params={params}
        />
      )
    case 'aspect-grid':
      return (
        <AspectGridControl
          spec={spec}
          value={value}
          options={spec.options}
          onChange={onChange}
          params={params}
        />
      )
    case 'stepper':
      return <StepperControl spec={spec} value={value} onChange={onChange} />
    case 'switch':
      return <SwitchControl value={value} options={spec.options} onChange={onChange} />
    case 'slider':
      return (
        <SliderControl
          value={value}
          min={spec.min}
          max={spec.max}
          step={spec.step}
          onChange={onChange}
          formatter={spec.formatter}
          suffix={spec.suffix}
        />
      )
    case 'number':
      return (
        <NumberControl
          value={value}
          min={spec.min}
          max={spec.max}
          onChange={onChange}
          placeholder={spec.placeholder}
          formatter={spec.formatter}
        />
      )
    case 'select':
      return (
        <SelectControl
          value={value}
          options={spec.options}
          onChange={onChange}
          placeholder={spec.placeholder}
        />
      )
    default:
      return null
  }
}
