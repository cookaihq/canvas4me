import { Field } from './Field.jsx'

export function Stepper({ label, value = 0, min = -Infinity, max = Infinity, onChange }) {
  const set = (next) => onChange && onChange(Math.min(max, Math.max(min, next)))
  return (
    <Field label={label} layout="inline">
      <span className="ac-stepper">
        <button type="button" className="ac-stepper__btn" aria-label="减" onClick={() => set(value - 1)}>−</button>
        <span className="ac-stepper__value">{value}</span>
        <button type="button" className="ac-stepper__btn" aria-label="加" onClick={() => set(value + 1)}>＋</button>
      </span>
    </Field>
  )
}
