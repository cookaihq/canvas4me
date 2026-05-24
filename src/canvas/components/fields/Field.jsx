export function FieldLabel({ label, required, badge }) {
  return (
    <span className="ac-field__label">
      {label}
      {required && <span className="ac-field__required">*</span>}
      {badge && <span className="ac-field__badge">{badge}</span>}
    </span>
  )
}

export function Field({ label, required, badge, help, layout = 'block', full, children }) {
  const cls = ['ac-field', layout === 'inline' && 'ac-field--inline', full && 'ac-field-grid__full']
    .filter(Boolean)
    .join(' ')
  const labelEl = <FieldLabel label={label} required={required} badge={badge} />
  return (
    <div className={cls}>
      {layout === 'inline' ? (
        <div className="ac-field__row">{labelEl}{children}</div>
      ) : (
        <>{labelEl}{children}</>
      )}
      {help && <div className="ac-field__help">{help}</div>}
    </div>
  )
}
