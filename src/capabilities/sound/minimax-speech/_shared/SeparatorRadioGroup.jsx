import { SEPARATOR_OPTIONS } from '../voice-presets'

/**
 * 分隔符 radio group — 仅 batch mode 显示
 * 横向 4 项, 紧贴 prompt textarea 下方
 */
export default function SeparatorRadioGroup({ value, onChange }) {
  return (
    <div className="ms-dp-separator-row">
      <span className="ms-dp-separator-label">分隔符</span>
      <div className="ms-dp-separator-options">
        {SEPARATOR_OPTIONS.map(opt => {
          const selected = opt.value === value
          return (
            <button
              key={opt.value}
              type="button"
              className={`ms-dp-separator-btn${selected ? ' selected' : ''}`}
              onClick={() => onChange?.(opt.value)}
              title={opt.desc}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
