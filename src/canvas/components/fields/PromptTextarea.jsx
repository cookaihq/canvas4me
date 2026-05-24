import { Field } from './Field.jsx'

export function PromptTextarea({ label, value = '', onChange, maxLength, placeholder, help }) {
  return (
    <Field label={label} help={help}>
      <div className="ac-prompt">
        <textarea
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(e) => onChange && onChange(e.target.value)}
        />
        {maxLength != null && (
          <span className="ac-prompt__count">{value.length} / {maxLength}</span>
        )}
      </div>
    </Field>
  )
}
