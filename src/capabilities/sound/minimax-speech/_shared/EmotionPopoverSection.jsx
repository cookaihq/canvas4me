import { Tooltip } from 'antd'
import { EMOTION_OPTIONS } from '../voice-presets'

/**
 * EMOTION 段 (popover 内)
 *
 * 控件: chip grid 4 列 × N 行
 * 共 10 项 (1 伪 auto + 9 真 spec). auto 默认; calm/fluent 仅部分渠道支持, 角标 ⚠️.
 */
export default function EmotionPopoverSection({ value, onChange }) {
  return (
    <div className="ms-dp-popover-section">
      <div className="ms-dp-popover-section-label">EMOTION</div>
      <div className="ms-dp-emotion-grid">
        {EMOTION_OPTIONS.map(opt => {
          const selected = opt.value === value
          const chip = (
            <button
              key={opt.value}
              type="button"
              className={`ms-dp-emotion-chip${selected ? ' selected' : ''}${opt.warn ? ' warn' : ''}`}
              onClick={() => onChange?.(opt.value)}
            >
              {opt.label}
              {opt.warn && <span className="ms-dp-emotion-warn-icon" aria-hidden="true">⚠</span>}
            </button>
          )
          return opt.warn
            ? <Tooltip key={opt.value} title={opt.warnText} placement="top">{chip}</Tooltip>
            : chip
        })}
      </div>
    </div>
  )
}
