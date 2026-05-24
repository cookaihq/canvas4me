import { MODEL_OPTIONS } from '../voice-presets'

/**
 * MODEL 段 (popover 内, 第一段)
 *
 * 控件: 2 个 chip 横排, 单选
 * 选项: speech-2.8-hd (默认) / speech-2.8-turbo
 */
export default function ModelPopoverSection({ value, onChange }) {
  return (
    <div className="ms-dp-popover-section">
      <div className="ms-dp-popover-section-label">MODEL</div>
      <div className="ms-dp-model-grid">
        {MODEL_OPTIONS.map(opt => {
          const selected = opt.value === value
          return (
            <button
              key={opt.value}
              type="button"
              className={`ms-dp-model-chip${selected ? ' selected' : ''}`}
              onClick={() => onChange?.(opt.value)}
              title={opt.desc || ''}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
