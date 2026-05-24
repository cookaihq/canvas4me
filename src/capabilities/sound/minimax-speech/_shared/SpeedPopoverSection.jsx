
import { Minus, Plus } from '@/canvas/icons'
import { SPEED_MIN, SPEED_MAX, SPEED_STEP, DEFAULT_SPEED } from '../voice-presets'

/**
 * SPEED 段 (popover 内)
 *
 * 控件: stepper [-] 1.0× [+], 步进 0.1, 范围 0.5 - 2.0
 */
export default function SpeedPopoverSection({ value, onChange }) {
  const v = typeof value === 'number' ? value : DEFAULT_SPEED
  const canDecrease = v - SPEED_STEP >= SPEED_MIN - 1e-6
  const canIncrease = v + SPEED_STEP <= SPEED_MAX + 1e-6

  const dec = () => canDecrease && onChange?.(Number((v - SPEED_STEP).toFixed(1)))
  const inc = () => canIncrease && onChange?.(Number((v + SPEED_STEP).toFixed(1)))

  return (
    <div className="ms-dp-popover-section">
      <div className="ms-dp-popover-section-label">SPEED</div>
      <div className="ms-dp-speed-stepper">
        <button
          type="button"
          className="ms-dp-speed-btn"
          onClick={dec}
          disabled={!canDecrease}
          aria-label="减速"
        >
          <Minus size={14} />
        </button>
        <div className="ms-dp-speed-value">{v.toFixed(1)}×</div>
        <button
          type="button"
          className="ms-dp-speed-btn"
          onClick={inc}
          disabled={!canIncrease}
          aria-label="加速"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}
