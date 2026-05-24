import { Field } from './Field.jsx'

export function Switch({ label, checked, onChange }) {
  return (
    <Field label={label} layout="inline">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={checked ? 'ac-switch ac-switch--on' : 'ac-switch'}
        onClick={() => onChange && onChange(!checked)}
      />
    </Field>
  )
}
