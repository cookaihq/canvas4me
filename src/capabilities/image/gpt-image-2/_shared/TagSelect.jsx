/**
 * Tag 风格的单选控件（gpt-image-2 专用，结构与 nano-banana 的 TagSelect 一致，
 * 复用全局 .nb-tag-select 样式）。
 *
 * cols 指定每行列数（Resolution 用 4、3；0 表示单行水平铺）
 */
export default function TagSelect({ value, onChange, options, disabled, cols = 0 }) {
  const rows = cols > 0 ? chunk(options, cols) : [options]

  return (
    <div className="nb-tag-select">
      {rows.map((row, i) => (
        <div key={i} className="nb-tag-select-row">
          {row.map(opt => {
            const selected = opt.value === value
            return (
              <button
                type="button"
                key={opt.value}
                className={`nb-tag-select-item${selected ? ' selected' : ''}`}
                onClick={() => !disabled && onChange(opt.value)}
                disabled={disabled}
                title={opt.label}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}
