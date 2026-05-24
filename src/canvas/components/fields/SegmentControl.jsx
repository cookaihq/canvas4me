import { Field } from './Field.jsx'
import { resolveSegmentLayout } from './segmentLayout.js'

function ratioStyle(ratio) {
  const [w, h] = String(ratio).split(':').map(Number)
  if (!w || !h) return null
  const base = 16
  return w >= h
    ? { width: base + 'px', height: Math.round((base * h) / w) + 'px' }
    : { width: Math.round((base * w) / h) + 'px', height: base + 'px' }
}

export function SegmentControl({ label, options = [], value, onChange, ratioIcon, fill, help }) {
  const layout = resolveSegmentLayout(options)
  const control = (
    <div className={fill ? 'ac-segment ac-segment--fill' : 'ac-segment'}>
      {options.map((opt) => {
        const o = typeof opt === 'string' ? { label: opt, value: opt } : opt
        const on = o.value === value
        const st = ratioIcon ? ratioStyle(o.label) : null
        return (
          <button
            key={o.value}
            type="button"
            className={['ac-segment__option', on && 'ac-segment__option--on', o.disabled && 'ac-segment__option--disabled'].filter(Boolean).join(' ')}
            disabled={o.disabled}
            onClick={() => { if (!o.disabled) onChange && onChange(o.value) }}
          >
            {st && <span className="ac-ratio-icon" style={st} />}
            {o.label}
            {o.badge && <span className="ac-segment__badge">{o.badge}</span>}
          </button>
        )
      })}
    </div>
  )
  return (
    <Field label={label} help={help} layout={(!fill && layout === 'inline') ? 'inline' : 'block'}>
      {control}
    </Field>
  )
}
